import { http } from '@google-cloud/functions-framework';
import dotenv from 'dotenv';

import { closeDb } from './lib/db.js';
import { fetchIndicators } from './lib/indicators.js';
import { publishIndicators } from './lib/monitoring.js';

dotenv.config();

http('publishIndicators', async (req, res) => {
  if (req.method === 'GET') {
    return res.status(200).json({ status: 'ready' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const indicators = await fetchIndicators();
    await publishIndicators(indicators);

    res.status(200).json({
      message: 'Indicadores publicados',
      count: indicators.length,
      indicators,
    });
  } catch (error) {
    console.error('publishIndicators failed', error);
    res.status(500).json({ error: 'Error al publicar indicadores' });
  } finally {
    await closeDb();
  }
});
