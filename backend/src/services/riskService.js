/**
 * Weather Risk Score Calculation Engine
 * Calculates a 0-100 Weather Safety/Risk Score based on 7 key weather factors:
 * 1. Rain / precipitation probability (20%)
 * 2. Storm / severe weather probability (20%)
 * 3. Temperature (15%)
 * 4. Wind speed (15%)
 * 5. UV index (10%)
 * 6. Visibility (10%)
 * 7. Air quality / AQI (10%)
 */

// Factor Scoring Thresholds & Utilities

function calculateTemperatureScore(tempC) {
  if (tempC === undefined || tempC === null) return null;
  // Ideal comfortable range: 18°C to 26°C (64°F - 79°F) -> 100
  if (tempC >= 18 && tempC <= 26) return 100;
  if (tempC > 26 && tempC <= 30) return 88;
  if (tempC >= 14 && tempC < 18) return 88;
  if (tempC > 30 && tempC <= 35) return 65;
  if (tempC >= 8 && tempC < 14) return 65;
  if (tempC > 35 && tempC <= 40) return 35;
  if (tempC >= 0 && tempC < 8) return 40;
  if (tempC > 40) return 15; // Extreme Heat
  if (tempC < 0) return 20;  // Freezing Cold
  return 50;
}

function calculateRainScore(pop, rainMm, weatherId) {
  // pop: 0.0 to 1.0 (probability of precipitation)
  let score = 100;

  // Evaluate precipitation probability if provided
  if (pop !== undefined && pop !== null) {
    if (pop <= 0.1) score = 100;
    else if (pop <= 0.3) score = 80;
    else if (pop <= 0.6) score = 50;
    else if (pop <= 0.8) score = 30;
    else score = 15;
  }

  // Check rain volume if available
  if (rainMm !== undefined && rainMm !== null && rainMm > 0) {
    if (rainMm > 10) score = Math.min(score, 15);
    else if (rainMm > 4) score = Math.min(score, 35);
    else if (rainMm > 1) score = Math.min(score, 60);
  }

  // Check weather ID codes (OpenWeather code scheme)
  if (weatherId !== undefined && weatherId !== null) {
    if (weatherId >= 502 && weatherId <= 504) score = Math.min(score, 15); // Heavy rain
    else if (weatherId >= 500 && weatherId <= 501) score = Math.min(score, 50); // Light/Moderate rain
    else if (weatherId >= 300 && weatherId <= 321) score = Math.min(score, 70); // Drizzle
  }

  return score;
}

function calculateWindScore(speedKmh) {
  if (speedKmh === undefined || speedKmh === null) return null;
  if (speedKmh < 15) return 100;      // Calm / light breeze
  if (speedKmh <= 28) return 85;     // Gentle breeze
  if (speedKmh <= 40) return 60;     // Moderate wind
  if (speedKmh <= 55) return 35;     // Strong wind
  if (speedKmh <= 75) return 18;     // Very high wind / gale
  return 5;                          // Storm/Hurricane speed winds
}

function calculateUVScore(uvIndex) {
  if (uvIndex === undefined || uvIndex === null) return null;
  if (uvIndex <= 2) return 100;     // Low risk
  if (uvIndex <= 5) return 80;      // Moderate
  if (uvIndex <= 7) return 60;      // High
  if (uvIndex <= 10) return 30;     // Very High
  return 10;                        // Extreme (11+)
}

function calculateVisibilityScore(visMeters) {
  if (visMeters === undefined || visMeters === null) return null;
  if (visMeters >= 10000) return 100;  // Clear visibility (10km+)
  if (visMeters >= 6000) return 85;   // Good visibility
  if (visMeters >= 3000) return 60;   // Moderate visibility
  if (visMeters >= 1000) return 35;   // Low visibility
  return 15;                          // Severe fog / mist (<1km)
}

function calculateStormScore(weatherId, windKmh = 0, pop = 0) {
  let score = 100;
  if (weatherId !== undefined && weatherId !== null) {
    if (weatherId >= 200 && weatherId <= 232) score = 15; // Thunderstorm
    else if (weatherId === 781 || weatherId === 771) score = 0; // Tornado / Squall
    else if (weatherId >= 95 && weatherId <= 99) score = 10; // Open-Meteo thunderstorm
  }

  // Severe wind + rain pop check
  if (windKmh > 55 && pop > 0.6) {
    score = Math.min(score, 20);
  }
  return score;
}

function calculateAQIScore(aqiVal) {
  if (aqiVal === undefined || aqiVal === null) return null;
  
  // If aqi is US AQI scale (0 - 500)
  if (aqiVal > 5) {
    if (aqiVal <= 50) return 100;   // Good
    if (aqiVal <= 100) return 80;   // Moderate
    if (aqiVal <= 150) return 50;   // Unhealthy for sensitive groups
    if (aqiVal <= 200) return 30;   // Unhealthy
    if (aqiVal <= 300) return 15;   // Very Unhealthy
    return 5;                       // Hazardous
  }

  // If aqi is OpenWeather 1-5 scale
  switch (Math.round(aqiVal)) {
    case 1: return 100; // Good
    case 2: return 82;  // Fair
    case 3: return 60;  // Moderate
    case 4: return 35;  // Poor
    case 5: return 15;  // Very Poor
    default: return 75;
  }
}

/**
 * Main Weather Risk Score Calculator
 * Accepts raw or formatted weather metrics and computes a comprehensive risk report.
 */
function calculateWeatherRisk({
  tempC,
  pop,
  rainMm,
  windKmh,
  uvIndex,
  visibilityMeters,
  weatherId,
  aqi
}) {
  const factorDefinitions = [
    {
      key: 'rain',
      name: 'Rain',
      icon: '🌧️',
      weight: 20,
      score: calculateRainScore(pop, rainMm, weatherId)
    },
    {
      key: 'storm',
      name: 'Storm',
      icon: '⛈️',
      weight: 20,
      score: calculateStormScore(weatherId, windKmh, pop)
    },
    {
      key: 'temperature',
      name: 'Temperature',
      icon: '🌡️',
      weight: 15,
      score: calculateTemperatureScore(tempC)
    },
    {
      key: 'wind',
      name: 'Wind',
      icon: '💨',
      weight: 15,
      score: calculateWindScore(windKmh)
    },
    {
      key: 'uv',
      name: 'UV Index',
      icon: '☀️',
      weight: 10,
      score: calculateUVScore(uvIndex)
    },
    {
      key: 'visibility',
      name: 'Visibility',
      icon: '👁️',
      weight: 10,
      score: calculateVisibilityScore(visibilityMeters)
    },
    {
      key: 'airQuality',
      name: 'Air Quality',
      icon: '🫁',
      weight: 10,
      score: calculateAQIScore(aqi)
    }
  ];

  // Weight normalization for available factors
  let totalActiveWeight = 0;
  let weightedSum = 0;
  const activeFactors = {};
  const factorsList = [];
  let availableCount = 0;

  factorDefinitions.forEach(factor => {
    if (factor.score !== null && factor.score !== undefined && !isNaN(factor.score)) {
      totalActiveWeight += factor.weight;
      weightedSum += factor.score * factor.weight;
      activeFactors[factor.key] = Math.round(factor.score);
      availableCount++;
      factorsList.push({
        key: factor.key,
        name: factor.name,
        icon: factor.icon,
        score: Math.round(factor.score)
      });
    } else {
      activeFactors[factor.key] = null;
    }
  });

  // Calculate final normalized score
  const finalScore = totalActiveWeight > 0 
    ? Math.min(100, Math.max(0, Math.round(weightedSum / totalActiveWeight))) 
    : 75;

  // Determine Risk Category & Color Badges
  let level = 'Low Risk';
  let badgeColor = 'green';
  let badgeIcon = '🟢';
  let recommendation = 'Good outdoor conditions. Normal precautions are recommended.';

  if (finalScore >= 90) {
    level = 'Excellent / Very Low Risk';
    badgeColor = 'green';
    badgeIcon = '🟢';
    recommendation = 'Excellent conditions for outdoor activities.';
  } else if (finalScore >= 75) {
    level = 'Low Risk';
    badgeColor = 'green';
    badgeIcon = '🟢';
    recommendation = 'Good outdoor conditions. Normal precautions are recommended.';
  } else if (finalScore >= 50) {
    level = 'Moderate Risk';
    badgeColor = 'yellow';
    badgeIcon = '🟡';
    recommendation = 'Conditions are acceptable, but check the weather before extended outdoor activities.';
  } else if (finalScore >= 25) {
    level = 'High Risk';
    badgeColor = 'orange';
    badgeIcon = '🟠';
    recommendation = 'Outdoor conditions may be uncomfortable or risky. Consider postponing outdoor activities.';
  } else {
    level = 'Severe Risk';
    badgeColor = 'red';
    badgeIcon = '🔴';
    recommendation = 'Severe weather conditions detected. Avoid unnecessary outdoor activities and follow local weather warnings.';
  }

  // Generate Dynamic Explanations (Reasons) matching weather data
  const reasons = [];

  // Rain explanation
  if (activeFactors.rain !== null) {
    if (activeFactors.rain >= 80) {
      reasons.push({ type: 'good', text: 'Low rainfall probability', icon: '🟢' });
    } else if (activeFactors.rain >= 50) {
      const pStr = pop !== undefined ? ` (${Math.round(pop * 100)}%)` : '';
      reasons.push({ type: 'moderate', text: `Moderate chance of rain${pStr}`, icon: '🟡' });
    } else {
      reasons.push({ type: 'bad', text: 'Heavy rain expected', icon: '🔴' });
    }
  }

  // Wind explanation
  if (activeFactors.wind !== null) {
    if (activeFactors.wind >= 80) {
      reasons.push({ type: 'good', text: 'Normal wind conditions', icon: '🟢' });
    } else if (activeFactors.wind >= 50) {
      reasons.push({ type: 'moderate', text: `Moderate breeze: ${Math.round(windKmh)} km/h`, icon: '🟡' });
    } else {
      reasons.push({ type: 'bad', text: `Strong winds: ${Math.round(windKmh)} km/h`, icon: '🔴' });
    }
  }

  // Temp explanation
  if (activeFactors.temperature !== null) {
    if (activeFactors.temperature >= 80) {
      reasons.push({ type: 'good', text: 'Temperature is comfortable', icon: '🟢' });
    } else if (activeFactors.temperature >= 50) {
      const desc = tempC > 26 ? 'Warm' : 'Cool';
      reasons.push({ type: 'moderate', text: `${desc} temperature: ${Math.round(tempC)}°C`, icon: '🟡' });
    } else {
      const desc = tempC > 35 ? 'Extreme heat' : (tempC < 0 ? 'Freezing cold' : 'Uncomfortable temp');
      reasons.push({ type: 'bad', text: `${desc}: ${Math.round(tempC)}°C`, icon: '🔴' });
    }
  }

  // UV explanation
  if (activeFactors.uv !== null) {
    if (activeFactors.uv >= 80) {
      reasons.push({ type: 'good', text: 'UV index is low', icon: '🟢' });
    } else if (activeFactors.uv >= 50) {
      reasons.push({ type: 'moderate', text: `Moderate UV index: ${uvIndex}`, icon: '🟡' });
    } else {
      reasons.push({ type: 'bad', text: `High UV index: ${uvIndex}`, icon: '🔴' });
    }
  }

  // Visibility explanation
  if (activeFactors.visibility !== null) {
    if (activeFactors.visibility >= 80) {
      reasons.push({ type: 'good', text: 'Good visibility', icon: '🟢' });
    } else if (activeFactors.visibility >= 50) {
      const visKm = (visibilityMeters / 1000).toFixed(1);
      reasons.push({ type: 'moderate', text: `Moderate visibility: ${visKm} km`, icon: '🟡' });
    } else {
      const visKm = (visibilityMeters / 1000).toFixed(1);
      reasons.push({ type: 'bad', text: `Poor visibility: ${visKm} km`, icon: '🔴' });
    }
  }

  // Storm explanation
  if (activeFactors.storm !== null && activeFactors.storm < 70) {
    reasons.push({ type: 'bad', text: 'Severe storm / thunderstorm risk detected', icon: '🔴' });
  }

  // AQI explanation
  if (activeFactors.airQuality !== null) {
    if (activeFactors.airQuality >= 80) {
      reasons.push({ type: 'good', text: 'Air quality is good', icon: '🟢' });
    } else if (activeFactors.airQuality >= 50) {
      reasons.push({ type: 'moderate', text: 'Air quality is moderate', icon: '🟡' });
    } else {
      reasons.push({ type: 'bad', text: 'Poor air quality detected', icon: '🔴' });
    }
  }

  // Determine Main Concern (the lowest scoring factor)
  let lowestFactor = null;
  let lowestScore = 999;

  factorsList.forEach(f => {
    if (f.score < lowestScore) {
      lowestScore = f.score;
      lowestFactor = f;
    }
  });

  let mainConcern = 'None (Safe Weather)';
  if (lowestFactor && lowestScore < 75) {
    switch (lowestFactor.key) {
      case 'rain':
        mainConcern = lowestScore < 40 ? '🌧️ Heavy Rain' : '🌧️ Moderate Rain Chance';
        break;
      case 'storm':
        mainConcern = '⛈️ Severe Storm Conditions';
        break;
      case 'temperature':
        mainConcern = tempC > 30 ? (lowestScore < 40 ? '🌡️ Extreme Heat' : '🌡️ High Temperature') : (lowestScore < 40 ? '🌡️ Freezing Cold' : '🌡️ Low Temperature');
        break;
      case 'wind':
        mainConcern = lowestScore < 40 ? '💨 Strong Winds' : '💨 Moderate Breeze';
        break;
      case 'uv':
        mainConcern = lowestScore < 40 ? '☀️ Extreme UV Index' : '☀️ Moderate UV';
        break;
      case 'visibility':
        mainConcern = lowestScore < 40 ? '👁️ Low Visibility / Fog' : '👁️ Moderate Visibility';
        break;
      case 'airQuality':
        mainConcern = lowestScore < 40 ? '🫁 Poor Air Quality' : '🫁 Moderate Air Quality';
        break;
      default:
        mainConcern = `${lowestFactor.icon} ${lowestFactor.name}`;
    }
  }

  return {
    score: finalScore,
    level,
    badgeColor,
    badgeIcon,
    factors: activeFactors,
    factorsList,
    mainConcern,
    reasons,
    recommendation,
    availableFactorsCount: availableCount,
    totalFactorsCount: 7,
    factorNote: availableCount < 7 ? `Score calculated from ${availableCount} of 7 available weather factors.` : 'Calculated from all 7 weather safety factors.'
  };
}

module.exports = {
  calculateWeatherRisk,
  calculateTemperatureScore,
  calculateRainScore,
  calculateWindScore,
  calculateUVScore,
  calculateVisibilityScore,
  calculateStormScore,
  calculateAQIScore
};
