const riskService = require('./riskService');

const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY;
if (!OPENWEATHER_API_KEY) {
  console.warn('[WeatherService] WARNING: OPENWEATHER_API_KEY is not set in process.env. Set it in your .env file.');
}
const WEATHER_URL = 'https://api.openweathermap.org/data/2.5/weather';
const FORECAST_URL = 'https://api.openweathermap.org/data/2.5/forecast';

// Simple In-Memory TTL Cache (10 minutes cache)
const cache = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000;

function getCachedData(key) {
  const cached = cache.get(key);
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
    return cached.data;
  }
  if (cached) {
    cache.delete(key);
  }
  return null;
}

function setCachedData(key, data) {
  cache.set(key, { timestamp: Date.now(), data });
}

// Fetch Air Quality Index (AQI) with fallback
async function fetchAirQuality(lat, lon) {
  if (lat === undefined || lon === undefined) return null;
  try {
    const owUrl = `http://api.openweathermap.org/data/2.5/air_pollution?lat=${lat}&lon=${lon}&appid=${OPENWEATHER_API_KEY}`;
    const res = await fetch(owUrl);
    if (res.ok) {
      const data = await res.json();
      if (data.list && data.list[0] && data.list[0].main) {
        return data.list[0].main.aqi; // 1 to 5 index
      }
    }

    const omUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=us_aqi`;
    const omRes = await fetch(omUrl);
    if (omRes.ok) {
      const omData = await omRes.json();
      if (omData.current && omData.current.us_aqi !== undefined) {
        return omData.current.us_aqi; // US AQI scale (0-500)
      }
    }
  } catch (err) {
    console.warn('[WeatherService] Failed to fetch AQI:', err.message);
  }
  return null;
}

// Fetch UV Index with fallback
async function fetchUvIndex(lat, lon) {
  if (lat === undefined || lon === undefined) return null;
  try {
    const omUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=uv_index&daily=uv_index_max&timezone=auto`;
    const res = await fetch(omUrl);
    if (res.ok) {
      const data = await res.json();
      if (data.current && data.current.uv_index !== undefined) {
        return data.current.uv_index;
      }
      if (data.daily && data.daily.uv_index_max && data.daily.uv_index_max[0] !== undefined) {
        return data.daily.uv_index_max[0];
      }
    }
  } catch (err) {
    console.warn('[WeatherService] Failed to fetch UV Index:', err.message);
  }
  return null;
}

// Enrich weather dataset with risk score
async function enrichWithRiskScore(data, forecastData, unit = 'metric') {
  if (!data || !data.main) return data;
  const lat = data.coord ? data.coord.lat : undefined;
  const lon = data.coord ? data.coord.lon : undefined;

  let aqi = data.aqi;
  let uvIndex = data.uv_index;

  if (lat !== undefined && lon !== undefined) {
    const [aqiRes, uvRes] = await Promise.all([
      aqi === undefined ? fetchAirQuality(lat, lon) : Promise.resolve(aqi),
      uvIndex === undefined ? fetchUvIndex(lat, lon) : Promise.resolve(uvIndex)
    ]);
    aqi = aqiRes;
    uvIndex = uvRes;
  }

  // Convert temperature to °C if imperial
  const tempC = unit === 'imperial' && data.main.temp !== undefined ? (data.main.temp - 32) * 5 / 9 : data.main.temp;

  // Calculate wind speed in km/h
  let windKmh = 0;
  if (data.wind && data.wind.speed !== undefined) {
    if (unit === 'imperial') {
      windKmh = data.wind.speed * 1.60934;
    } else {
      windKmh = data.wind.speed > 50 ? data.wind.speed : data.wind.speed * 3.6;
    }
  }

  // Extract precipitation probability
  let pop = 0;
  if (forecastData && forecastData.list && forecastData.list[0] && forecastData.list[0].pop !== undefined) {
    pop = forecastData.list[0].pop;
  }

  const rainMm = data.rain ? (data.rain['1h'] || data.rain['3h']) : undefined;
  const weatherId = data.weather && data.weather[0] ? data.weather[0].id : undefined;

  const riskScore = riskService.calculateWeatherRisk({
    tempC,
    pop,
    rainMm,
    windKmh,
    uvIndex,
    visibilityMeters: data.visibility,
    weatherId,
    aqi
  });

  return {
    ...data,
    aqi,
    uv_index: uvIndex,
    riskScore
  };
}

// WMO weather code mapping for Open-Meteo fallback
function getWmoWeatherInfo(code, isDay = 1) {
  const d = isDay ? 'd' : 'n';
  switch (code) {
    case 0: return { description: 'Clear sky', icon: `01${d}` };
    case 1: return { description: 'Mainly clear', icon: `01${d}` };
    case 2: return { description: 'Partly cloudy', icon: `02${d}` };
    case 3: return { description: 'Overcast', icon: `04${d}` };
    case 45: case 48: return { description: 'Foggy', icon: `50${d}` };
    case 51: case 53: case 55: return { description: 'Drizzle', icon: `09${d}` };
    case 61: case 63: case 65: return { description: 'Rain', icon: `10${d}` };
    case 71: case 73: case 75: return { description: 'Snow', icon: `13${d}` };
    case 80: case 81: case 82: return { description: 'Rain showers', icon: `09${d}` };
    case 95: case 96: case 99: return { description: 'Thunderstorm', icon: `11${d}` };
    default: return { description: 'Cloudy', icon: `03${d}` };
  }
}

async function fetchFromOpenMeteo(lat, lon, cityNameStr, countryCodeStr = '', unit = 'metric') {
  const tempUnitParam = unit === 'imperial' ? '&temperature_unit=fahrenheit&wind_speed_unit=mph' : '';
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,cloud_cover,surface_pressure,wind_speed_10m,wind_direction_10m,uv_index&hourly=temperature_2m,weather_code,precipitation_probability&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max&timezone=auto${tempUnitParam}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error('Weather service unavailable.');
  const om = await res.json();

  const current = om.current || {};
  const daily = om.daily || {};
  const hourly = om.hourly || {};
  const wInfo = getWmoWeatherInfo(current.weather_code || 0, current.is_day !== undefined ? current.is_day : 1);
  const nowSec = Math.floor(Date.now() / 1000);

  const weatherObj = {
    coord: { lat, lon },
    weather: [{ id: current.weather_code, main: wInfo.description, description: wInfo.description, icon: wInfo.icon }],
    main: {
      temp: current.temperature_2m,
      feels_like: current.apparent_temperature !== undefined ? current.apparent_temperature : current.temperature_2m,
      temp_min: daily.temperature_2m_min ? daily.temperature_2m_min[0] : current.temperature_2m - 2,
      temp_max: daily.temperature_2m_max ? daily.temperature_2m_max[0] : current.temperature_2m + 2,
      pressure: current.surface_pressure ? Math.round(current.surface_pressure) : 1013,
      humidity: current.relative_humidity_2m || 50
    },
    visibility: 10000,
    wind: {
      speed: current.wind_speed_10m ? (unit === 'metric' ? current.wind_speed_10m / 3.6 : current.wind_speed_10m) : 0,
      deg: current.wind_direction_10m || 0
    },
    clouds: { all: current.cloud_cover || 20 },
    uv_index: current.uv_index !== undefined ? current.uv_index : (daily.uv_index_max ? daily.uv_index_max[0] : undefined),
    dt: nowSec,
    sys: {
      country: countryCodeStr,
      sunrise: daily.sunrise && daily.sunrise[0] ? Math.floor(new Date(daily.sunrise[0]).getTime() / 1000) : nowSec - 18000,
      sunset: daily.sunset && daily.sunset[0] ? Math.floor(new Date(daily.sunset[0]).getTime() / 1000) : nowSec + 18000
    },
    timezone: om.utc_offset_seconds || 0,
    name: cityNameStr
  };

  const forecastList = [];
  if (hourly.time && hourly.temperature_2m) {
    for (let i = 0; i < Math.min(40, hourly.time.length); i++) {
      const itemDt = Math.floor(new Date(hourly.time[i]).getTime() / 1000);
      const itemInfo = getWmoWeatherInfo(hourly.weather_code ? hourly.weather_code[i] : 0, 1);
      forecastList.push({
        dt: itemDt,
        main: { temp: hourly.temperature_2m[i] },
        weather: [{ main: itemInfo.description, icon: itemInfo.icon }],
        pop: hourly.precipitation_probability ? hourly.precipitation_probability[i] / 100 : 0
      });
    }
  }

  return { weatherData: weatherObj, forecastData: { list: forecastList } };
}

async function geocodeOpenMeteo(cityName) {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityName)}&count=5&language=en&format=json`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  if (data.results && data.results.length > 0) {
    const item = data.results[0];
    return {
      name: item.name,
      country: item.country_code || item.country || '',
      lat: item.latitude,
      lon: item.longitude
    };
  }
  return null;
}

/**
 * Get current weather data for city or coordinates
 */
async function getWeather({ city, lat, lon, unit = 'metric' }) {
  const cacheKey = `weather:${city || `${lat},${lon}`}:${unit}`;
  const cached = getCachedData(cacheKey);
  if (cached) {
    return { ...cached, cached: true };
  }

  let wUrl = '';
  if (city) {
    wUrl = `${WEATHER_URL}?q=${encodeURIComponent(city)}&units=${unit}&lang=en&appid=${OPENWEATHER_API_KEY}`;
  } else if (lat !== undefined && lon !== undefined) {
    wUrl = `${WEATHER_URL}?lat=${lat}&lon=${lon}&units=${unit}&lang=en&appid=${OPENWEATHER_API_KEY}`;
  } else {
    throw new Error('City or lat/lon parameters are required.');
  }

  try {
    let resultData = null;
    const res = await fetch(wUrl);
    if (res.ok) {
      resultData = await res.json();
    } else {
      console.warn(`[WeatherService] OpenWeather API response not ok (${res.status}), trying Open-Meteo fallback...`);
      if (city) {
        const geo = await geocodeOpenMeteo(city);
        if (!geo) throw new Error(`Location "${city}" not found.`);
        const omRes = await fetchFromOpenMeteo(geo.lat, geo.lon, geo.name, geo.country, unit);
        resultData = omRes.weatherData;
      } else {
        const omRes = await fetchFromOpenMeteo(lat, lon, 'Location', '', unit);
        resultData = omRes.weatherData;
      }
    }

    let forecastData = null;
    try {
      forecastData = await getForecast({ city, lat: resultData.coord?.lat || lat, lon: resultData.coord?.lon || lon, unit });
    } catch (e) {
      // Ignore forecast error
    }

    const enriched = await enrichWithRiskScore(resultData, forecastData, unit);
    setCachedData(cacheKey, enriched);
    return { ...enriched, cached: false };
  } catch (err) {
    console.error('[WeatherService] Error in getWeather:', err.message);
    throw err;
  }
}

/**
 * Get forecast data for city or coordinates
 */
async function getForecast({ city, lat, lon, unit = 'metric' }) {
  const cacheKey = `forecast:${city || `${lat},${lon}`}:${unit}`;
  const cached = getCachedData(cacheKey);
  if (cached) {
    return { ...cached, cached: true };
  }

  let fUrl = '';
  if (city) {
    fUrl = `${FORECAST_URL}?q=${encodeURIComponent(city)}&units=${unit}&lang=en&appid=${OPENWEATHER_API_KEY}`;
  } else if (lat !== undefined && lon !== undefined) {
    fUrl = `${FORECAST_URL}?lat=${lat}&lon=${lon}&units=${unit}&lang=en&appid=${OPENWEATHER_API_KEY}`;
  } else {
    throw new Error('City or lat/lon parameters are required.');
  }

  try {
    const res = await fetch(fUrl);
    if (res.ok) {
      const data = await res.json();
      setCachedData(cacheKey, data);
      return { ...data, cached: false };
    }

    // Fallback to Open-Meteo if OpenWeather returns an error
    console.warn(`[WeatherService] OpenWeather Forecast API response not ok (${res.status}), trying Open-Meteo fallback...`);
    let latVal = lat, lonVal = lon, cityName = 'Location', country = '';
    if (city) {
      const geo = await geocodeOpenMeteo(city);
      if (geo) {
        latVal = geo.lat; lonVal = geo.lon; cityName = geo.name; country = geo.country;
      }
    }
    if (latVal !== undefined && lonVal !== undefined) {
      const omRes = await fetchFromOpenMeteo(latVal, lonVal, cityName, country, unit);
      setCachedData(cacheKey, omRes.forecastData);
      return { ...omRes.forecastData, cached: false };
    }

    throw new Error('Failed to retrieve forecast data.');
  } catch (err) {
    console.error('[WeatherService] Error in getForecast:', err.message);
    throw err;
  }
}

module.exports = {
  getWeather,
  getForecast
};
