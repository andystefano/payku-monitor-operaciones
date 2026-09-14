# payku-monitor-operaciones

Cloud Function HTTP (2ª generación) que consulta indicadores operacionales en MySQL y los publica en Cloud Monitoring.

- **Función:** `publishIndicators`
- **Región:** `us-central1`
- **Trigger:** HTTP (`POST` publica; `GET` solo responde `ready`)
- **Auth:** pública (`--allow-unauthenticated`)

La consulta usa una ventana de 5 minutos en hora de Santiago (`now - 6 min` → `now - 1 min`). El scheduler debe disparar **cada 5 minutos**.

## Invocar con Cloud Scheduler

Cloud Scheduler debe pegarle un `POST` a la URL de la función. No hace falta token: la función admite llamadas anónimas.

### 1. URL de la función

```bash
FUNCTION_URL="$(gcloud functions describe publishIndicators \
  --gen2 \
  --region=us-central1 \
  --format='value(serviceConfig.uri)')"
```

También sirve la URL de Cloud Functions:

`https://us-central1-PROJECT_ID.cloudfunctions.net/publishIndicators`

### 2. Crear el job

```bash
gcloud scheduler jobs create http publish-indicators \
  --location=us-central1 \
  --schedule="*/5 * * * *" \
  --time-zone="America/Santiago" \
  --uri="${FUNCTION_URL}" \
  --http-method=POST \
  --attempt-deadline=120s \
  --description="Publica SLI de payout en Cloud Monitoring"
```

No hace falta body, headers ni OIDC: un `POST` vacío alcanza.

| Campo | Valor |
| --- | --- |
| Método | `POST` (`GET` no publica indicadores) |
| Frecuencia | `*/5 * * * *` |
| Zona horaria | `America/Santiago` |
| Deadline | `120s` (igual al timeout de la función) |
| Auth | ninguna |

### 3. Probar el job

```bash
gcloud scheduler jobs run publish-indicators --location=us-central1
```

Una ejecución correcta responde `200` con `{ "message": "Indicadores publicados", "count": N, "indicators": [...] }`. Si no hubo tráfico en la ventana, `count` puede ser `0` y no se publica métrica.

Para ver el job:

```bash
gcloud scheduler jobs describe publish-indicators --location=us-central1
```

## Consola de GCP

1. **Cloud Scheduler** → **Crear job**
2. Región: `us-central1`
3. Frecuencia: `*/5 * * * *`, zona `America/Santiago`
4. Destino: **HTTP**
   - URL: URI de `publishIndicators`
   - Método: `POST`
5. Auth: **ninguna**
6. Crear y ejecutar una vez a mano para validar

## Errores frecuentes

- **403:** el deploy todavía tiene `--no-allow-unauthenticated`. Hay que redesplegar con este yaml o dar `allUsers` como invocador.
- **405:** el job está mandando `GET` u otro método. Tiene que ser `POST`.
- **Timeout:** el deadline del job debe ser ≥ timeout de la función (`120s`).
