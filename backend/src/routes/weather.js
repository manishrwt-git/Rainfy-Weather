const express = require('express');
const router = express.Router();
const weatherService = require('../services/weatherService');

/**
 * GET /api/weather
 * Query params: city, lat, lon, unit ('metric' | 'imperial')
 */
router.get('/weather', async (req, res) => {
  try {
    const { city, lat, lon, unit } = req.query;

    if (!city && (lat === undefined || lon === undefined)) {
      return res.status(400).json({ error: 'Please provide either a "city" parameter or both "lat" and "lon" parameters.' });
    }

    const weatherData = await weatherService.getWeather({
      city,
      lat: lat !== undefined ? parseFloat(lat) : undefined,
      lon: lon !== undefined ? parseFloat(lon) : undefined,
      unit: unit || 'metric'
    });

    return res.json(weatherData);
  } catch (error) {
    console.error('Error handling /api/weather:', error.message);
    return res.status(500).json({ error: error.message || 'Internal server error while fetching weather.' });
  }
});

/**
 * GET /api/forecast
 * Query params: city, lat, lon, unit ('metric' | 'imperial')
 */
router.get('/forecast', async (req, res) => {
  try {
    const { city, lat, lon, unit } = req.query;

    if (!city && (lat === undefined || lon === undefined)) {
      return res.status(400).json({ error: 'Please provide either a "city" parameter or both "lat" and "lon" parameters.' });
    }

    const forecastData = await weatherService.getForecast({
      city,
      lat: lat !== undefined ? parseFloat(lat) : undefined,
      lon: lon !== undefined ? parseFloat(lon) : undefined,
      unit: unit || 'metric'
    });

    return res.json(forecastData);
  } catch (error) {
    console.error('Error handling /api/forecast:', error.message);
    return res.status(500).json({ error: error.message || 'Internal server error while fetching forecast.' });
  }
});

/**
 * GET /api/config
 * Returns public configuration like Cesium token if required by client
 */
router.get('/config', (req, res) => {
  res.json({
    cesiumToken: process.env.CESIUM_ION_TOKEN || ''
  });
});

/**
 * GET /api/health
 * Server health check endpoint
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
