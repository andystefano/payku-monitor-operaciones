import { getDb } from './db.js';

const SANTIAGO_NOW = `CONVERT_TZ(UTC_TIMESTAMP(), 'UTC', 'America/Santiago')`;
const WINDOW_FROM = `(${SANTIAGO_NOW} - INTERVAL 6 MINUTE)`;
const WINDOW_TO = `(${SANTIAGO_NOW} - INTERVAL 1 MINUTE)`;

// mpmo_id → moneda (catálogo SLA).
const MONEDAS = [
  { mpmoId: 1, code: 'CLP' },
  { mpmoId: 8, code: 'VES' },
  { mpmoId: 10, code: 'PEN' },
];

// mopr_id → slug + moneda (catálogo SLA payout §10.2).
const PROVEEDORES = [
  { moprId: 1, slug: 'radar', mpmoId: 1, moneda: 'CLP' },
  { moprId: 2, slug: 'defered_todos', mpmoId: 1, moneda: 'CLP' },
  { moprId: 3, slug: 'security', mpmoId: 1, moneda: 'CLP' },
  { moprId: 4, slug: 'shinkansen', mpmoId: 1, moneda: 'CLP' },
  { moprId: 7, slug: 'bci', mpmoId: 1, moneda: 'CLP' },
  { moprId: 5, slug: 'vepuy_1xbet', mpmoId: 8, moneda: 'VES' },
  { moprId: 6, slug: 'vepuy_predeterminado', mpmoId: 8, moneda: 'VES' },
  { moprId: 8, slug: 'shinkansen_peru', mpmoId: 10, moneda: 'PEN' },
  { moprId: 9, slug: 'gmoney_peru', mpmoId: 10, moneda: 'PEN' },
  { moprId: 10, slug: 'ligopay_peru', mpmoId: 10, moneda: 'PEN' },
];

function successRateSql(extraWhere) {
  return `
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
        AND ${extraWhere}
  `;
}

function buildSuccessRateIndicator({ alcance, slug, moneda, mpmoId, moprId = null }) {
  const extraWhere =
    moprId == null
      ? `r.mpmo_id = ${mpmoId}`
      : `r.mpmo_id = ${mpmoId} AND r.mopr_id = ${moprId}`;

  return {
    // % de retiros de la ventana realizados correctamente y confirmados (more_status = 2).
    name: `payku.sli.payout.${alcance}.${slug}.${moneda}.success_rate`,
    type: 'custom.googleapis.com/payku/sli',
    valueType: 'DOUBLE',
    unit: '%',
    valueColumn: 'success_rate_pct',
    samplesColumn: 'total',
    labels: {
      dominio: 'payout',
      alcance,
      slug,
      moneda,
      sli: 'success_rate',
    },
    sql: successRateSql(extraWhere),
  };
}

const INDICATOR_QUERIES = [
  ...MONEDAS.map(({ mpmoId, code }) =>
    buildSuccessRateIndicator({
      alcance: 'service',
      slug: 'all',
      moneda: code,
      mpmoId,
    }),
  ),
  ...PROVEEDORES.map(({ moprId, slug, mpmoId, moneda }) =>
    buildSuccessRateIndicator({
      alcance: 'provider',
      slug,
      moneda,
      mpmoId,
      moprId,
    }),
  ),
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
