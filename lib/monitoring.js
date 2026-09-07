import { MetricServiceClient } from '@google-cloud/monitoring';

const client = new MetricServiceClient();

function getProjectId() {
  return (
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GCLOUD_PROJECT ||
    process.env.GCP_PROJECT ||
    process.env.PROJECT_ID
  );
}

function toTypedValue(indicator) {
  if (indicator.valueType === 'INT64') {
    return { int64Value: Math.round(indicator.value) };
  }

  return { doubleValue: indicator.value };
}

export async function publishIndicators(indicators) {
  if (!indicators.length) {
    return;
  }

  const projectId = getProjectId();

  if (!projectId) {
    throw new Error('Falta GOOGLE_CLOUD_PROJECT / PROJECT_ID para publicar métricas');
  }

  const nowSeconds = Date.now() / 1000;
  const timeSeries = indicators.map((indicator) => ({
    metric: {
      type: indicator.type,
      labels: indicator.labels,
    },
    resource: {
      type: 'global',
      labels: {
        project_id: projectId,
      },
    },
    metricKind: 'GAUGE',
    valueType: indicator.valueType,
    points: [
      {
        interval: {
          endTime: {
            seconds: nowSeconds,
          },
        },
        value: toTypedValue(indicator),
      },
    ],
  }));

  await client.createTimeSeries({
    name: client.projectPath(projectId),
    timeSeries,
  });
}
