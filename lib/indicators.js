import { getDb } from './db.js';

const SANTIAGO_NOW = `CONVERT_TZ(UTC_TIMESTAMP(), 'UTC', 'America/Santiago')`;
const WINDOW_FROM = `(${SANTIAGO_NOW} - INTERVAL 6 MINUTE)`;
const WINDOW_TO = `(${SANTIAGO_NOW} - INTERVAL 1 MINUTE)`;

const INDICATOR_QUERIES = [
  {
    // Entre retiros ya resueltos (aprobado=2 o rechazado=3), % que quedaron aprobados.
    name: 'payku.sli.payout.service.all.CLP.approval_rate',
    type: 'custom.googleapis.com/payku/sli',
    valueType: 'DOUBLE',
    unit: '%',
    valueColumn: 'approval_rate_pct',
    samplesColumn: 'total_terminales',
    labels: {
      dominio: 'payout',
      alcance: 'service',
      slug: 'all',
      moneda: 'CLP',
      sli: 'approval_rate',
    },
    sql: `
      SELECT
        COUNT(*) AS total_terminales,
        SUM(CASE WHEN r.more_status = 2 THEN 1 ELSE 0 END) AS aprobados,
        SUM(CASE WHEN r.more_status = 3 THEN 1 ELSE 0 END) AS rechazados,
        ROUND(
          100 * SUM(CASE WHEN r.more_status = 2 THEN 1 ELSE 0 END)
              / NULLIF(COUNT(*), 0)
        , 2) AS approval_rate_pct
      FROM mo_retiros r
      WHERE r.more_create_at >= ${WINDOW_FROM}
        AND r.more_create_at < ${WINDOW_TO}
        AND r.more_status IN (2, 3)
        AND r.mpmo_id = 1
    `,
  },
  {
    // Sobre todos los retiros de la ventana, % que terminaron bien (more_status = 2).
    name: 'payku.sli.payout.service.all.CLP.success_rate',
    type: 'custom.googleapis.com/payku/sli',
    valueType: 'DOUBLE',
    unit: '%',
    valueColumn: 'success_rate_pct',
    samplesColumn: 'total',
    labels: {
      dominio: 'payout',
      alcance: 'service',
      slug: 'all',
      moneda: 'CLP',
      sli: 'success_rate',
    },
    sql: `
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN r.more_status = 2 THEN 1 ELSE 0 END) AS success,
        ROUND(
          100 * SUM(CASE WHEN r.more_status = 2 THEN 1 ELSE 0 END)
              / NULLIF(COUNT(*), 0)
        , 2) AS success_rate_pct
      FROM mo_retiros r
      WHERE r.more_create_at >= ${WINDOW_FROM}
        AND r.more_create_at < ${WINDOW_TO}
        AND r.mpmo_id = 1
    `,
  },
];

export async function fetchIndicators() {
  const db = getDb();
  const indicators = [];

  for (const query of INDICATOR_QUERIES) {
    const [rows] = await db.query(query.sql);
    const row = rows?.[0];
    const samples = Number(row?.[query.samplesColumn] ?? 0);
    const rawValue = row?.[query.valueColumn];

    if (!samples || rawValue == null) {
      console.log(`Sin tráfico para ${query.name}; no se publica valor`);
      continue;
    }

    indicators.push({
      name: query.name,
      type: query.type,
      valueType: query.valueType,
      unit: query.unit,
      labels: query.labels,
      value: Number(rawValue),
      samples,
    });
  }

  return indicators;
}
