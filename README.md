# payku-monitor-operaciones

Cloud Function HTTP (2ª generación) que consulta indicadores operacionales en MySQL y los publica en Cloud Monitoring.

- **Función:** `publishIndicators`
- **Región:** `southamerica-east1`
- **Trigger:** HTTP (`POST` publica; `GET` solo responde `ready`)
- **Auth:** no admite llamadas anónimas (`--no-allow-unauthenticated`)

La consulta usa una ventana de 5 minutos en hora de Santiago (`now - 6 min` → `now - 1 min`). El scheduler debe disparar **cada 5 minutos**.

## Invocar con Cloud Scheduler

Cloud Scheduler debe pegarle un `POST` a la URL de la función, con un token OIDC de una cuenta de servicio que tenga permiso de invocador.

### 1. Cuenta de servicio

```bash
PROJECT_ID="$(gcloud config get-value project)"

gcloud iam service-accounts create scheduler-monitor-ops \
  --display-name="Cloud Scheduler - Monitor Operaciones"
```

En 2ª generación la función corre sobre Cloud Run. Otorgá `roles/run.invoker`:

```bash
gcloud functions add-invoker-policy-binding publishIndicators \
  --region=southamerica-east1 \
  --member="serviceAccount:scheduler-monitor-ops@${PROJECT_ID}.iam.gserviceaccount.com"
```

El agente de Cloud Scheduler necesita poder mintar el token OIDC:

```bash
PROJECT_NUMBER="$(gcloud projects describe ${PROJECT_ID} --format='value(projectNumber)')"

gcloud iam service-accounts add-iam-policy-binding \
  "scheduler-monitor-ops@${PROJECT_ID}.iam.gserviceaccount.com" \
  --member="serviceAccount:service-${PROJECT_NUMBER}@gcp-sa-cloudscheduler.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountTokenCreator"
```

### 2. URL de la función

```bash
FUNCTION_URL="$(gcloud functions describe publishIndicators \
  --gen2 \
  --region=southamerica-east1 \
  --format='value(serviceConfig.uri)')"
```

Esa URL es la del servicio Cloud Run (por ejemplo `https://publishindicators-xxxxx-rj.a.run.app`). Usala tanto en `--uri` como en `--oidc-token-audience`.

### 3. Crear el job

```bash
gcloud scheduler jobs create http publish-indicators \
  --location=southamerica-east1 \
  --schedule="*/5 * * * *" \
  --time-zone="America/Santiago" \
  --uri="${FUNCTION_URL}" \
  --http-method=POST \
  --oidc-service-account-email="scheduler-monitor-ops@${PROJECT_ID}.iam.gserviceaccount.com" \
  --oidc-token-audience="${FUNCTION_URL}" \
  --attempt-deadline=120s \
  --description="Publica SLI de payout en Cloud Monitoring"
```

No hace falta body ni headers extra: un `POST` vacío alcanza.

| Campo | Valor |
| --- | --- |
| Método | `POST` (`GET` no publica indicadores) |
| Frecuencia | `*/5 * * * *` |
| Zona horaria | `America/Santiago` |
| Deadline | `120s` (igual al timeout de la función) |
| Auth | OIDC, audience = URL de la función |

### 4. Probar el job

```bash
gcloud scheduler jobs run publish-indicators --location=southamerica-east1
```

Una ejecución correcta responde `200` con `{ "message": "Indicadores publicados", "count": N, "indicators": [...] }`. Si no hubo tráfico en la ventana, `count` puede ser `0` y no se publica métrica.

Para ver el job:

```bash
gcloud scheduler jobs describe publish-indicators --location=southamerica-east1
```

## Consola de GCP

1. **Cloud Scheduler** → **Crear job**
2. Región: `southamerica-east1`
3. Frecuencia: `*/5 * * * *`, zona `America/Santiago`
4. Destino: **HTTP**
   - URL: URI de `publishIndicators`
   - Método: `POST`
5. Auth: **Agregar token OIDC**
   - Cuenta de servicio: `scheduler-monitor-ops@PROJECT_ID.iam.gserviceaccount.com`
   - Audience: la misma URL de la función
6. Crear y ejecutar una vez a mano para validar

## Errores frecuentes

- **401 / 403:** falta `roles/run.invoker` o el audience no coincide con la URL de Cloud Run.
- **405:** el job está mandando `GET` u otro método. Tiene que ser `POST`.
- **Timeout:** el deadline del job debe ser ≥ timeout de la función (`120s`).
