// ---------- API ENDPOINTS & CONFIG ----------
const API_BASE_URL = '/api';
const WEATHER_URL = `${API_BASE_URL}/weather`;
const FORECAST_URL = `${API_BASE_URL}/forecast`;
const CONFIG_URL = `${API_BASE_URL}/config`;
let cesiumIonToken = "";


// State
let currentUnit = 'metric'; // 'metric' (°C) or 'imperial' (°F)
let currentWeatherData = null;
let currentForecastData = null;
let currentEntity = null;
let lastCoord = null;
let viewer = null;

// Three.js fallback state
let threeScene = null, threeCamera = null, threeRenderer = null, threeGlobe = null;

function showWebGLErrorBanner(errorMsg) {
  const banner = document.getElementById("webgl-error-banner");
  if (banner) banner.hidden = false;
}

document.getElementById("close-webgl-banner")?.addEventListener("click", () => {
  const banner = document.getElementById("webgl-error-banner");
  if (banner) banner.hidden = true;
});

// ---------- 1. THREE.JS 3D GLOBE FALLBACK ----------
function initThreeJsFallback() {
  const container = document.getElementById("cesiumContainer");
  if (!container || typeof THREE === 'undefined') return;
  container.innerHTML = "";

  try {
    const width = window.innerWidth;
    const height = window.innerHeight;

    threeScene = new THREE.Scene();
    threeCamera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    threeCamera.position.z = 220;

    threeRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    threeRenderer.setSize(width, height);
    threeRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(threeRenderer.domElement);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
    threeScene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(5, 3, 5);
    threeScene.add(dirLight);

    const geometry = new THREE.SphereGeometry(60, 64, 64);
    const textureLoader = new THREE.TextureLoader();

    const earthTexture = textureLoader.load(
      'https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg',
      () => { if (threeRenderer && threeScene && threeCamera) threeRenderer.render(threeScene, threeCamera); }
    );

    const material = new THREE.MeshPhongMaterial({
      map: earthTexture,
      shininess: 12
    });

    threeGlobe = new THREE.Mesh(geometry, material);
    threeScene.add(threeGlobe);

    const atmosGeom = new THREE.SphereGeometry(62.5, 64, 64);
    const atmosMat = new THREE.MeshBasicMaterial({
      color: 0x3b82f6,
      transparent: true,
      opacity: 0.18,
      side: THREE.BackSide
    });
    threeScene.add(new THREE.Mesh(atmosGeom, atmosMat));

    let isDragging = false;
    let previousMousePosition = { x: 0, y: 0 };
    let velocityX = 0;
    let velocityY = 0;
    const domEl = threeRenderer.domElement;

    function handleStart(x, y) {
      isDragging = true;
      previousMousePosition = { x, y };
      velocityX = 0;
      velocityY = 0;
    }

    function handleMove(x, y) {
      if (!isDragging || !threeGlobe) return;
      const deltaX = x - previousMousePosition.x;
      const deltaY = y - previousMousePosition.y;

      velocityX = deltaX * 0.0045;
      velocityY = deltaY * 0.0045;

      threeGlobe.rotation.y += velocityX;
      threeGlobe.rotation.x += velocityY;

      // Soft clamp vertical pitch so drag in any direction feels natural
      threeGlobe.rotation.x = Math.max(-Math.PI / 2.15, Math.min(Math.PI / 2.15, threeGlobe.rotation.x));

      previousMousePosition = { x, y };
    }

    function handleEnd() {
      isDragging = false;
    }

    domEl.addEventListener('mousedown', e => handleStart(e.clientX, e.clientY));
    domEl.addEventListener('mousemove', e => handleMove(e.clientX, e.clientY));
    domEl.addEventListener('mouseup', handleEnd);
    domEl.addEventListener('mouseleave', handleEnd);

    // Full Mobile & Touchscreen Drag Support
    domEl.addEventListener('touchstart', e => {
      if (e.touches.length === 1) handleStart(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });

    domEl.addEventListener('touchmove', e => {
      if (e.touches.length === 1) handleMove(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });

    domEl.addEventListener('touchend', handleEnd, { passive: true });

    domEl.addEventListener('wheel', e => {
      if (!threeCamera) return;
      e.preventDefault();
      const delta = e.deltaY > 0 ? 25 : -25;
      threeCamera.position.z = Math.max(70, Math.min(480, threeCamera.position.z + delta));
    }, { passive: false });

    window.addEventListener('resize', () => {
      if (!threeCamera || !threeRenderer) return;
      threeCamera.aspect = window.innerWidth / window.innerHeight;
      threeCamera.updateProjectionMatrix();
      threeRenderer.setSize(window.innerWidth, window.innerHeight);
    });

    function animate() {
      requestAnimationFrame(animate);
      if (threeGlobe) {
        if (!isDragging) {
          // Multi-directional momentum inertia in WHICHEVER direction the user dragged
          threeGlobe.rotation.y += velocityX;
          threeGlobe.rotation.x += velocityY;
          threeGlobe.rotation.x = Math.max(-Math.PI / 2.15, Math.min(Math.PI / 2.15, threeGlobe.rotation.x));

          velocityX *= 0.94;
          velocityY *= 0.94;
        }
      }
      if (threeRenderer && threeScene && threeCamera) {
        threeRenderer.render(threeScene, threeCamera);
      }
    }
    animate();
  } catch (e) {
    console.error("Three.js fallback failed:", e);
    showWebGLErrorBanner(e.message);
  }
}

function rotateThreeGlobeTo(lat, lon) {
  if (!threeGlobe) return;
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  const targetX = phi - Math.PI / 2;
  const targetY = -theta;

  const startX = threeGlobe.rotation.x;
  const startY = threeGlobe.rotation.y;
  let step = 0;

  function anim() {
    step += 0.04;
    if (step <= 1) {
      threeGlobe.rotation.x = startX + (targetX - startX) * step;
      threeGlobe.rotation.y = startY + (targetY - startY) * step;
      requestAnimationFrame(anim);
    } else {
      threeGlobe.rotation.x = targetX;
      threeGlobe.rotation.y = targetY;
    }
  }
  anim();
}

// Helper functions for safe touch/mouse coordinate checks
function isValidPosition(pos) {
  return pos && typeof pos.x === 'number' && typeof pos.y === 'number' && !isNaN(pos.x) && !isNaN(pos.y);
}

function isValidMovement(movement) {
  return movement && isValidPosition(movement.startPosition) && isValidPosition(movement.endPosition);
}

// ---------- 2. CESIUM GLOBE INITIALIZATION ----------
async function initCesiumViewer() {
  if (typeof Cesium === 'undefined') {
    initThreeJsFallback();
    return;
  }

  try {
    if (!cesiumIonToken) {
      try {
        const configRes = await fetch(CONFIG_URL);
        if (configRes.ok) {
          const configData = await configRes.json();
          if (configData.cesiumToken) {
            cesiumIonToken = configData.cesiumToken;
          }
        }
      } catch (cfgErr) {
        console.warn("Failed to load server config for Cesium token:", cfgErr);
      }
    }

    if (cesiumIonToken) {
      Cesium.Ion.defaultAccessToken = cesiumIonToken;
    }

    // Google Earth / Maps style photorealistic satellite imagery provider
    const satelliteProvider = new Cesium.UrlTemplateImageryProvider({
      url: 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      maximumLevel: 19,
      credit: 'Esri, Maxar, Earthstar Geographics'
    });

    const satelliteLayer = new Cesium.ImageryLayer(satelliteProvider);

    viewer = new Cesium.Viewer("cesiumContainer", {
      baseLayer: satelliteLayer,
      baseLayerPicker: false,
      geocoder: false,
      timeline: false,
      animation: false,
      navigationHelpButton: false,
      homeButton: false,
      sceneModePicker: false,
      fullscreenButton: false,
      infoBox: false,
      selectionIndicator: false,
      useBrowserRecommendedResolution: false,
      contextOptions: {
        webgl: {
          alpha: false,
          depth: true,
          stencil: false,
          antialias: true,
          failIfMajorPerformanceCaveat: false
        }
      }
    });

    // Disable default two-finger tilt/inertia that frequently crashes on mobile WebGL
    viewer.scene.screenSpaceCameraController.enableTilt = true;
    viewer.scene.screenSpaceCameraController.inertiaZoom = 0;
    viewer.scene.screenSpaceCameraController.inertiaSpin = 0;
    viewer.scene.screenSpaceCameraController.inertiaTranslate = 0;

    // Set safe minimum and maximum zoom distances to prevent camera clipping
    viewer.scene.screenSpaceCameraController.minimumZoomDistance = 500;
    viewer.scene.screenSpaceCameraController.maximumZoomDistance = 30000000;

    // Mobile resolution & FPS adjustments to prevent high-DPI projection errors and GPU memory overload
    viewer.useBrowserRecommendedResolution = false;
    if (window.devicePixelRatio && window.devicePixelRatio > 1) {
      viewer.resolutionScale = 1.0;
    } else {
      viewer.resolutionScale = 1.0;
    }
    viewer.targetFrameRate = 30;

    // Add crisp Google Maps style boundaries and place labels overlay
    try {
      const labelsProvider = new Cesium.UrlTemplateImageryProvider({
        url: 'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
        maximumLevel: 19
      });
      viewer.imageryLayers.add(new Cesium.ImageryLayer(labelsProvider));
    } catch (lblErr) {
      console.warn("Labels overlay failed:", lblErr);
    }

    if (viewer && viewer.scene) {
      if (viewer.scene.globe) {
        viewer.scene.globe.enableLighting = true;
        viewer.scene.globe.showGroundAtmosphere = true;
        viewer.scene.globe.depthTestAgainstTerrain = false;
        viewer.scene.globe.maximumScreenSpaceError = 1.2;
      }
      if (viewer.scene.skyAtmosphere) {
        viewer.scene.skyAtmosphere.show = true;
      }
      if (viewer.scene.fog) {
        viewer.scene.fog.enabled = true;
        viewer.scene.fog.density = 0.0001;
      }
    }

    // Safe Touch & Mouse Event Handling with null-checks for position coordinates
    if (viewer && viewer.scene && viewer.scene.canvas) {
      const screenHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);

      // Safe LEFT_CLICK handling for picking coordinates on globe
      screenHandler.setInputAction((click) => {
        if (!click || !isValidPosition(click.position)) return;
        try {
          const ray = viewer.camera.getPickRay(click.position);
          if (!ray) return;
          const cartesian = viewer.scene.globe.pick(ray, viewer.scene);
          if (!cartesian) return;

          const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
          if (!cartographic) return;

          const lat = Cesium.Math.toDegrees(cartographic.latitude);
          const lon = Cesium.Math.toDegrees(cartographic.longitude);
          if (!isNaN(lat) && !isNaN(lon)) {
            fetchWeatherData({ lat, lon });
          }
        } catch (pickErr) {
          console.warn("Safe pick handler caught click coordinate error:", pickErr);
        }
      }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

      // Safe MOUSE_MOVE handling
      screenHandler.setInputAction((movement) => {
        if (!isValidMovement(movement)) return;
      }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

      // Safe LEFT_DOWN handling
      screenHandler.setInputAction((movement) => {
        if (!movement || !isValidPosition(movement.position)) return;
      }, Cesium.ScreenSpaceEventType.LEFT_DOWN);

      // Safe PINCH_START handling
      screenHandler.setInputAction((movement) => {
        if (!movement || !isValidPosition(movement.position1) || !isValidPosition(movement.position2)) return;
      }, Cesium.ScreenSpaceEventType.PINCH_START);

      // Safe PINCH_MOVE handling
      screenHandler.setInputAction((movement) => {
        if (!movement || !movement.distance || !isValidPosition(movement.distance.startPosition) || !isValidPosition(movement.distance.endPosition)) return;
      }, Cesium.ScreenSpaceEventType.PINCH_MOVE);
    }

    if (viewer && viewer.scene && viewer.scene.screenSpaceCameraController) {
      const scc = viewer.scene.screenSpaceCameraController;
      scc.enableRotate = true;
      scc.enableTranslate = true;
      scc.enableZoom = true;
      scc.enableTilt = true;
      scc.enableLook = true;
      scc.minimumZoomDistance = 500;
      scc.maximumZoomDistance = 30000000;
      scc.inertiaSpin = 0;
      scc.inertiaTranslate = 0;
      scc.inertiaZoom = 0;
      scc.bounceAnimationTime = 1.0;

      scc.rotateEventTypes = [
        Cesium.CameraEventType.LEFT_DRAG,
        Cesium.CameraEventType.PINCH
      ];
      scc.tiltEventTypes = [
        Cesium.CameraEventType.RIGHT_DRAG,
        Cesium.CameraEventType.MIDDLE_DRAG,
        {
          eventType: Cesium.CameraEventType.LEFT_DRAG,
          modifier: Cesium.KeyboardEventModifier.CTRL
        }
      ];
    }
  } catch (error) {
    console.warn("Cesium initialization failed, switching to Three.js 3D Earth:", error);
    viewer = null;
    initThreeJsFallback();
  }
}

initCesiumViewer();

// ---------- DOM ELEMENTS ----------
const searchForm = document.getElementById("search-form");
const cityInput = document.getElementById("city-input");
const locateBtn = document.getElementById("locate-btn");
const statusEl = document.getElementById("status");
const weatherDisplay = document.getElementById("weather-display");

const cityNameEl = document.getElementById("city-name");
const cityMetaEl = document.getElementById("city-meta");
const unitCEl = document.getElementById("unit-c");
const unitFEl = document.getElementById("unit-f");

const mainTempEl = document.getElementById("main-temp");
const weatherDescEl = document.getElementById("weather-desc");
const feelsLikeEl = document.getElementById("feels-like");
const tempRangeEl = document.getElementById("temp-range");
const weatherIconEl = document.getElementById("weather-icon");

// Risk Score DOM Elements
const riskCardEl = document.getElementById("risk-card");
const riskBadgeEl = document.getElementById("risk-badge");
const gaugeRingEl = document.getElementById("gauge-ring");
const riskScoreValEl = document.getElementById("risk-score-val");
const riskLevelTagEl = document.getElementById("risk-level-tag");
const riskRecommendationEl = document.getElementById("risk-recommendation");
const mainConcernPillEl = document.getElementById("main-concern-pill");
const riskReasonsListEl = document.getElementById("risk-reasons-list");
const riskBreakdownListEl = document.getElementById("risk-breakdown-list");
const factorsCountTagEl = document.getElementById("factors-count-tag");

const humidityEl = document.getElementById("humidity");
const dewPointEl = document.getElementById("dew-point");
const windEl = document.getElementById("wind");
const windDirEl = document.getElementById("wind-dir");
const pressureEl = document.getElementById("pressure");
const visibilityEl = document.getElementById("visibility");
const cloudinessEl = document.getElementById("cloudiness");
const sunriseEl = document.getElementById("sunrise");
const sunsetEl = document.getElementById("sunset");

const hourlyContainer = document.getElementById("hourly-container");
const dailyContainer = document.getElementById("daily-container");

const recenterBtn = document.getElementById("recenter-btn");
const globeViewBtn = document.getElementById("globe-view-btn");

// ---------- HELPERS ----------
function setStatus(msg, type = "info") {
  statusEl.textContent = msg;
  statusEl.className = "status";
  if (type === "error") statusEl.classList.add("error");
  if (type === "loading") statusEl.classList.add("loading");
}

function getWindDirection(deg) {
  if (deg === undefined) return '';
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round(deg / 45) % 8];
}

function formatTime(unixSec, tzOffsetSec) {
  const date = new Date((unixSec + (tzOffsetSec || 0)) * 1000);
  const hours = date.getUTCHours().toString().padStart(2, "0");
  const mins = date.getUTCMinutes().toString().padStart(2, "0");
  return `${hours}:${mins}`;
}

function formatDayName(unixSec) {
  const date = new Date(unixSec * 1000);
  return date.toLocaleDateString('en-US', { weekday: 'short' });
}

function calculateDewPoint(tempC, humidity) {
  const a = 17.27;
  const b = 237.7;
  const alpha = ((a * tempC) / (b + tempC)) + Math.log(humidity / 100);
  return Math.round((b * alpha) / (a - alpha));
}

function getCountryFlag(countryCode) {
  if (!countryCode) return '';
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map(char => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

function isIndianLocation(countryCode, lat, lon) {
  if (countryCode && countryCode.toUpperCase() === 'IN') return true;
  if (lat !== undefined && lon !== undefined) {
    if (lat >= 6.0 && lat <= 37.5 && lon >= 68.0 && lon <= 97.5) {
      return true;
    }
  }
  return false;
}

function hasNonLatinScript(str) {
  if (!str) return false;
  return /[^\u0000-\u024F\u1E00-\u1EFF\s\-\.',\(\)\/0-9]/.test(str);
}

async function ensureEnglishCityName(name, countryCode, lat, lon) {
  if (!name) return 'Unknown Location';
  // Exception: Indian locations permit local/regional script as requested
  if (isIndianLocation(countryCode, lat, lon)) {
    return name;
  }
  // Return if already in English / Latin script
  if (!hasNonLatinScript(name)) {
    return name;
  }
  // Fetch English fallback from Open-Meteo for non-Indian locations
  try {
    const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=5&language=en&format=json`;
    const res = await fetch(geoUrl);
    if (res.ok) {
      const data = await res.json();
      if (data.results && data.results.length > 0) {
        const latinMatch = data.results.find(r => !hasNonLatinScript(r.name));
        if (latinMatch) return latinMatch.name;
        if (data.results[0].name && !hasNonLatinScript(data.results[0].name)) {
          return data.results[0].name;
        }
      }
    }
  } catch (e) {
    console.warn("Failed to fetch English city name fallback:", e);
  }
  return name;
}

// ---------- 3D CAMERA & CITY MARKER PIN ----------
function flyAndPointCity(lat, lon, cityName, tempStr) {
  lastCoord = { lat, lon };

  if (viewer) {
    try {
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(lon, lat, 1800),
        orientation: {
          heading: Cesium.Math.toRadians(18.0),
          pitch: Cesium.Math.toRadians(-38.0),
          roll: 0.0
        },
        duration: 3.0,
        easingFunction: Cesium.EasingFunction.QUADRATIC_IN_OUT
      });

      const pinCanvas = document.createElement('canvas');
      pinCanvas.width = 64;
      pinCanvas.height = 64;
      const ctx = pinCanvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#3b82f6';
        ctx.beginPath(); ctx.arc(32, 22, 18, 0, Math.PI * 2); ctx.fill();
        ctx.lineWidth = 4; ctx.strokeStyle = '#ffffff'; ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(32, 22, 7, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#3b82f6';
        ctx.beginPath(); ctx.moveTo(22, 32); ctx.lineTo(32, 58); ctx.lineTo(42, 32); ctx.closePath(); ctx.fill();
      }

      if (currentEntity) viewer.entities.remove(currentEntity);

      currentEntity = viewer.entities.add({
        name: cityName,
        position: Cesium.Cartesian3.fromDegrees(lon, lat, 40),
        billboard: {
          image: pinCanvas.toDataURL(),
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          scale: 1.0,
          disableDepthTestDistance: Number.POSITIVE_INFINITY
        },
        label: {
          text: `📍 ${cityName} • ${tempStr}`,
          font: '700 14px "Space Grotesk", sans-serif',
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          fillColor: Cesium.Color.WHITE,
          outlineColor: Cesium.Color.fromCssColorString('#0f172a'),
          outlineWidth: 4,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          pixelOffset: new Cesium.Cartesian2(0, -66),
          backgroundColor: Cesium.Color.fromCssColorString('rgba(15, 23, 42, 0.9)'),
          showBackground: true,
          backgroundPadding: new Cesium.Cartesian2(12, 6),
          disableDepthTestDistance: Number.POSITIVE_INFINITY
        }
      });
    } catch (err) {
      console.warn("Cesium camera flight error:", err);
    }
  } else if (threeGlobe) {
    rotateThreeGlobeTo(lat, lon);
  }
}

// ---------- WEATHER RISK SCORE CALCULATOR & RENDERER ----------
function computeClientRiskScore(data, forecast) {
  if (data && data.riskScore) return data.riskScore;
  if (!data || !data.main) return null;

  const tempC = currentUnit === 'metric' ? data.main.temp : (data.main.temp - 32) * 5 / 9;
  let windKmh = data.wind && data.wind.speed ? (currentUnit === 'metric' ? data.wind.speed * 3.6 : data.wind.speed * 1.60934) : 0;
  let pop = (forecast && forecast.list && forecast.list[0] && forecast.list[0].pop !== undefined) ? forecast.list[0].pop : 0;
  let weatherId = data.weather && data.weather[0] ? data.weather[0].id : undefined;
  let visibilityMeters = data.visibility;
  let uvIndex = data.uv_index;
  let aqi = data.aqi;
  let rainMm = data.rain ? (data.rain['1h'] || data.rain['3h']) : undefined;

  function calcTemp(t) {
    if (t === undefined || t === null) return null;
    if (t >= 18 && t <= 26) return 100;
    if (t > 26 && t <= 30) return 88;
    if (t >= 14 && t < 18) return 88;
    if (t > 30 && t <= 35) return 65;
    if (t >= 8 && t < 14) return 65;
    if (t > 35 && t <= 40) return 35;
    if (t >= 0 && t < 8) return 40;
    if (t > 40) return 15;
    if (t < 0) return 20;
    return 50;
  }
  function calcRain(p, r, id) {
    let s = 100;
    if (p !== undefined && p !== null) {
      if (p <= 0.1) s = 100;
      else if (p <= 0.3) s = 80;
      else if (p <= 0.6) s = 50;
      else if (p <= 0.8) s = 30;
      else s = 15;
    }
    if (r > 10) s = Math.min(s, 15);
    else if (r > 1) s = Math.min(s, 60);
    if (id >= 502 && id <= 504) s = Math.min(s, 15);
    else if (id >= 500 && id <= 501) s = Math.min(s, 50);
    return s;
  }
  function calcWind(w) {
    if (w === undefined || w === null) return null;
    if (w < 15) return 100;
    if (w <= 28) return 85;
    if (w <= 40) return 60;
    if (w <= 55) return 35;
    if (w <= 75) return 18;
    return 5;
  }
  function calcUV(u) {
    if (u === undefined || u === null) return null;
    if (u <= 2) return 100;
    if (u <= 5) return 80;
    if (u <= 7) return 60;
    if (u <= 10) return 30;
    return 10;
  }
  function calcVis(v) {
    if (v === undefined || v === null) return null;
    if (v >= 10000) return 100;
    if (v >= 6000) return 85;
    if (v >= 3000) return 60;
    if (v >= 1000) return 35;
    return 15;
  }
  function calcStorm(id, w, p) {
    let s = 100;
    if (id >= 200 && id <= 232) s = 15;
    if (w > 55 && p > 0.6) s = Math.min(s, 20);
    return s;
  }
  function calcAQI(a) {
    if (a === undefined || a === null) return null;
    if (a > 5) {
      if (a <= 50) return 100;
      if (a <= 100) return 80;
      if (a <= 150) return 50;
      if (a <= 200) return 30;
      return 15;
    }
    switch (Math.round(a)) {
      case 1: return 100;
      case 2: return 82;
      case 3: return 60;
      case 4: return 35;
      case 5: return 15;
      default: return 75;
    }
  }

  const factorDefs = [
    { key: 'rain', name: 'Rain', icon: '🌧️', weight: 20, score: calcRain(pop, rainMm, weatherId) },
    { key: 'storm', name: 'Storm', icon: '⛈️', weight: 20, score: calcStorm(weatherId, windKmh, pop) },
    { key: 'temperature', name: 'Temperature', icon: '🌡️', weight: 15, score: calcTemp(tempC) },
    { key: 'wind', name: 'Wind', icon: '💨', weight: 15, score: calcWind(windKmh) },
    { key: 'uv', name: 'UV Index', icon: '☀️', weight: 10, score: calcUV(uvIndex) },
    { key: 'visibility', name: 'Visibility', icon: '👁️', weight: 10, score: calcVis(visibilityMeters) },
    { key: 'airQuality', name: 'Air Quality', icon: '🫁', weight: 10, score: calcAQI(aqi) }
  ];

  let activeW = 0, sum = 0, count = 0;
  const factorsList = [];
  const activeFactors = {};

  factorDefs.forEach(f => {
    if (f.score !== null && f.score !== undefined && !isNaN(f.score)) {
      activeW += f.weight;
      sum += f.score * f.weight;
      const rounded = Math.round(f.score);
      activeFactors[f.key] = rounded;
      count++;
      factorsList.push({ key: f.key, name: f.name, icon: f.icon, score: rounded });
    } else {
      activeFactors[f.key] = null;
    }
  });

  const finalScore = activeW > 0 ? Math.min(100, Math.max(0, Math.round(sum / activeW))) : 75;

  let level = 'Low Risk', badgeColor = 'green', badgeIcon = '🟢', rec = 'Good outdoor conditions. Normal precautions are recommended.';
  if (finalScore >= 90) { level = 'Excellent / Very Low Risk'; rec = 'Excellent conditions for outdoor activities.'; }
  else if (finalScore >= 75) { level = 'Low Risk'; rec = 'Good outdoor conditions. Normal precautions are recommended.'; }
  else if (finalScore >= 50) { level = 'Moderate Risk'; badgeColor = 'yellow'; badgeIcon = '🟡'; rec = 'Conditions are acceptable, but check the weather before extended outdoor activities.'; }
  else if (finalScore >= 25) { level = 'High Risk'; badgeColor = 'orange'; badgeIcon = '🟠'; rec = 'Outdoor conditions may be uncomfortable or risky. Consider postponing outdoor activities.'; }
  else { level = 'Severe Risk'; badgeColor = 'red'; badgeIcon = '🔴'; rec = 'Severe weather conditions detected. Avoid unnecessary outdoor activities and follow local weather warnings.'; }

  const reasons = [];
  if (activeFactors.rain !== null) {
    if (activeFactors.rain >= 80) reasons.push({ type: 'good', text: 'Low rainfall probability', icon: '🟢' });
    else if (activeFactors.rain >= 50) reasons.push({ type: 'moderate', text: `Moderate chance of rain (${Math.round(pop * 100)}%)`, icon: '🟡' });
    else reasons.push({ type: 'bad', text: 'Heavy rain expected', icon: '🔴' });
  }
  if (activeFactors.wind !== null) {
    if (activeFactors.wind >= 80) reasons.push({ type: 'good', text: 'Normal wind conditions', icon: '🟢' });
    else if (activeFactors.wind >= 50) reasons.push({ type: 'moderate', text: `Moderate breeze: ${Math.round(windKmh)} km/h`, icon: '🟡' });
    else reasons.push({ type: 'bad', text: `Strong winds: ${Math.round(windKmh)} km/h`, icon: '🔴' });
  }
  if (activeFactors.temperature !== null) {
    if (activeFactors.temperature >= 80) reasons.push({ type: 'good', text: 'Temperature is comfortable', icon: '🟢' });
    else if (activeFactors.temperature >= 50) reasons.push({ type: 'moderate', text: `Warm/Cool temperature: ${Math.round(tempC)}°C`, icon: '🟡' });
    else reasons.push({ type: 'bad', text: `Extreme temperature: ${Math.round(tempC)}°C`, icon: '🔴' });
  }

  let lowestFactor = null, lowestScore = 999;
  factorsList.forEach(f => { if (f.score < lowestScore) { lowestScore = f.score; lowestFactor = f; } });
  let mainConcern = 'None (Safe Weather)';
  if (lowestFactor && lowestScore < 75) {
    switch (lowestFactor.key) {
      case 'rain': mainConcern = lowestScore < 40 ? '🌧️ Heavy Rain' : '🌧️ Moderate Rain Chance'; break;
      case 'storm': mainConcern = '⛈️ Severe Storm Conditions'; break;
      case 'temperature': mainConcern = tempC > 30 ? (lowestScore < 40 ? '🌡️ Extreme Heat' : '🌡️ High Temperature') : (lowestScore < 40 ? '🌡️ Freezing Cold' : '🌡️ Low Temperature'); break;
      case 'wind': mainConcern = lowestScore < 40 ? '💨 Strong Winds' : '💨 Moderate Breeze'; break;
      case 'uv': mainConcern = lowestScore < 40 ? '☀️ Extreme UV Index' : '☀️ Moderate UV'; break;
      case 'visibility': mainConcern = lowestScore < 40 ? '👁️ Low Visibility / Fog' : '👁️ Moderate Visibility'; break;
      case 'airQuality': mainConcern = lowestScore < 40 ? '🫁 Poor Air Quality' : '🫁 Moderate Air Quality'; break;
      default: mainConcern = `${lowestFactor.icon} ${lowestFactor.name}`;
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
    recommendation: rec,
    availableFactorsCount: count,
    totalFactorsCount: 7,
    factorNote: count < 7 ? `Score calculated from ${count} of 7 available weather factors.` : 'Calculated from all 7 weather safety factors.'
  };
}

function renderWeatherRiskScore(riskData) {
  if (!riskData || riskData.score === undefined) return;

  const score = Math.round(riskData.score);
  
  if (riskScoreValEl) riskScoreValEl.textContent = score;

  const offset = 314.15 * (1 - score / 100);
  if (gaugeRingEl) {
    gaugeRingEl.style.strokeDashoffset = offset;
    let ringColor = '#22c55e';
    if (score < 25) ringColor = '#ef4444';
    else if (score < 50) ringColor = '#f97316';
    else if (score < 75) ringColor = '#eab308';
    gaugeRingEl.style.stroke = ringColor;
  }

  const badgeClass = riskData.badgeColor ? `badge-${riskData.badgeColor}` : (score >= 75 ? 'badge-green' : (score >= 50 ? 'badge-yellow' : (score >= 25 ? 'badge-orange' : 'badge-red')));
  if (riskBadgeEl) {
    riskBadgeEl.className = `risk-badge ${badgeClass}`;
    riskBadgeEl.textContent = `${riskData.badgeIcon || '🟢'} ${riskData.level ? riskData.level.toUpperCase() : 'RISK EVALUATED'}`;
  }

  if (riskLevelTagEl) {
    riskLevelTagEl.textContent = `${riskData.badgeIcon || ''} ${riskData.level || 'Weather Risk'}`;
  }

  if (riskRecommendationEl) {
    riskRecommendationEl.textContent = riskData.recommendation || 'Conditions evaluated based on live weather parameters.';
  }

  if (mainConcernPillEl) {
    mainConcernPillEl.textContent = `Main Concern: ${riskData.mainConcern || 'None'}`;
    if (score >= 85) {
      mainConcernPillEl.style.color = '#4ade80';
      mainConcernPillEl.style.borderColor = 'rgba(34, 197, 94, 0.3)';
      mainConcernPillEl.style.background = 'rgba(34, 197, 94, 0.12)';
    } else {
      mainConcernPillEl.style.color = '#facc15';
      mainConcernPillEl.style.borderColor = 'rgba(234, 179, 8, 0.25)';
      mainConcernPillEl.style.background = 'rgba(234, 179, 8, 0.12)';
    }
  }

  if (factorsCountTagEl) {
    factorsCountTagEl.textContent = riskData.factorNote || `${riskData.availableFactorsCount || 7} Factors`;
  }

  if (riskReasonsListEl) {
    riskReasonsListEl.innerHTML = '';
    const reasons = riskData.reasons && riskData.reasons.length > 0 ? riskData.reasons : [
      { type: 'good', text: 'Weather parameters are within normal thresholds', icon: '🟢' }
    ];

    reasons.forEach(r => {
      const item = document.createElement('div');
      item.className = 'reason-item';
      item.innerHTML = `<span>${r.icon || '🟢'}</span> <span>${r.text}</span>`;
      riskReasonsListEl.appendChild(item);
    });
  }

  if (riskBreakdownListEl) {
    riskBreakdownListEl.innerHTML = '';
    const factorsList = riskData.factorsList || (riskData.factors ? [
      { name: 'Rain', icon: '🌧️', score: riskData.factors.rain ?? 100 },
      { name: 'Wind', icon: '💨', score: riskData.factors.wind ?? 100 },
      { name: 'Temperature', icon: '🌡️', score: riskData.factors.temperature ?? 100 },
      { name: 'UV Index', icon: '☀️', score: riskData.factors.uv ?? 100 },
      { name: 'Visibility', icon: '👁️', score: riskData.factors.visibility ?? 100 },
      { name: 'Storm', icon: '⛈️', score: riskData.factors.storm ?? 100 },
      { name: 'Air Quality', icon: '🫁', score: riskData.factors.airQuality ?? 100 }
    ] : []);

    factorsList.forEach(f => {
      const fScore = f.score !== null && f.score !== undefined ? Math.round(f.score) : 'N/A';
      const isNum = typeof fScore === 'number';
      const widthPct = isNum ? fScore : 100;
      let barColor = '#22c55e';
      if (isNum) {
        if (fScore < 30) barColor = '#ef4444';
        else if (fScore < 60) barColor = '#f97316';
        else if (fScore < 80) barColor = '#eab308';
      } else {
        barColor = '#64748b';
      }

      const row = document.createElement('div');
      row.className = 'breakdown-row';
      row.innerHTML = `
        <span class="factor-label"><span>${f.icon}</span> <span>${f.name}</span></span>
        <div class="factor-bar-wrapper">
          <div class="factor-bar-fill" style="width: ${widthPct}%; background-color: ${barColor};"></div>
        </div>
        <span class="factor-val">${isNum ? fScore + '/100' : 'N/A'}</span>
      `;
      riskBreakdownListEl.appendChild(row);
    });
  }
}

// ---------- RENDER WEATHER DATA ----------
function renderWeather(data, forecast) {
  if (!data || !data.main || !data.weather || !data.weather[0]) return;

  weatherDisplay.hidden = false;
  setStatus("");

  try {
    // Render Risk Score Component
    const riskData = data.riskScore || computeClientRiskScore(data, forecast);
    if (riskData) {
      renderWeatherRiskScore(riskData);
    }

    const { name, sys, main, weather, wind, clouds, visibility, timezone = 0, coord } = data;
    const condition = weather[0] || { description: '--', icon: '01d' };
    const flag = sys ? getCountryFlag(sys.country) : '';
    const tempSymbol = currentUnit === 'metric' ? '°C' : '°F';
    const speedUnit = currentUnit === 'metric' ? 'km/h' : 'mph';
    const speedVal = wind && wind.speed ? (currentUnit === 'metric' ? Math.round(wind.speed * 3.6) : Math.round(wind.speed)) : 0;

    cityNameEl.textContent = `${flag} ${name || 'Unknown Location'}${sys && sys.country ? ', ' + sys.country : ''}`;
    const nowSec = Math.floor(Date.now() / 1000);
    const localTimeStr = formatTime(nowSec, timezone);
    cityMetaEl.textContent = coord ? `Lat: ${coord.lat.toFixed(2)}°, Lon: ${coord.lon.toFixed(2)}° • Local Time: ${localTimeStr}` : `Local Time: ${localTimeStr}`;

    const currentTempStr = main.temp !== undefined ? `${Math.round(main.temp)}${tempSymbol}` : '--°';
    mainTempEl.textContent = currentTempStr;
    weatherDescEl.textContent = condition.description || '--';
    feelsLikeEl.textContent = main.feels_like !== undefined ? `Feels like ${Math.round(main.feels_like)}${tempSymbol}` : '--';
    tempRangeEl.textContent = (main.temp_max !== undefined && main.temp_min !== undefined) ? `H: ${Math.round(main.temp_max)}° L: ${Math.round(main.temp_min)}°` : 'H: --° L: --°';
    
    if (condition.icon) {
      if (condition.icon.startsWith('http')) {
        weatherIconEl.src = condition.icon;
      } else {
        weatherIconEl.src = `https://openweathermap.org/img/wn/${condition.icon}@4x.png`;
      }
    }

    humidityEl.textContent = main.humidity !== undefined ? `${main.humidity}%` : '--%';
    
    if (main.temp !== undefined && main.humidity !== undefined) {
      const tempC = currentUnit === 'metric' ? main.temp : (main.temp - 32) * 5/9;
      const dewC = calculateDewPoint(tempC, main.humidity);
      const dewDisp = currentUnit === 'metric' ? `${dewC}°C` : `${Math.round(dewC * 9/5 + 32)}°F`;
      dewPointEl.textContent = `Dew: ${dewDisp}`;
    } else {
      dewPointEl.textContent = `Dew: --`;
    }

    windEl.textContent = `${speedVal} ${speedUnit}`;
    const dirStr = wind ? getWindDirection(wind.deg) : '';
    const gustStr = (wind && wind.gust) ? ` (Gust ${currentUnit === 'metric' ? Math.round(wind.gust * 3.6) : Math.round(wind.gust)})` : '';
    windDirEl.textContent = `Dir: ${dirStr}${gustStr}`;

    pressureEl.textContent = main.pressure !== undefined ? `${main.pressure}` : '--';
    
    const visKm = visibility ? (visibility / 1000).toFixed(1) : 'N/A';
    visibilityEl.textContent = visKm !== 'N/A' ? `${visKm} km` : 'N/A';
    cloudinessEl.textContent = `Clouds: ${clouds ? clouds.all : 0}%`;

    sunriseEl.textContent = sys && sys.sunrise ? formatTime(sys.sunrise, timezone) : '--:--';
    sunsetEl.textContent = sys && sys.sunset ? formatTime(sys.sunset, timezone) : '--:--';

    // Render Hourly Forecast
    hourlyContainer.innerHTML = '';
    if (forecast && Array.isArray(forecast.list) && forecast.list.length > 0) {
      const hourlyItems = forecast.list.slice(0, 8);
      hourlyItems.forEach(item => {
        if (!item || !item.main) return;
        const timeStr = formatTime(item.dt || nowSec, timezone);
        const popPercent = Math.round((item.pop || 0) * 100);
        const iconCode = item.weather && item.weather[0] ? item.weather[0].icon : '01d';
        const card = document.createElement('div');
        card.className = 'hourly-card';
        card.innerHTML = `
          <span class="hourly-time">${timeStr}</span>
          <img class="hourly-icon" src="${iconCode.startsWith('http') ? iconCode : 'https://openweathermap.org/img/wn/' + iconCode + '.png'}" alt="">
          <span class="hourly-temp">${Math.round(item.main.temp)}°</span>
          <span class="hourly-pop">${popPercent > 0 ? popPercent + '%' : ''}</span>
        `;
        hourlyContainer.appendChild(card);
      });
    }

    // Render 5-Day Daily Forecast
    dailyContainer.innerHTML = '';
    if (forecast && Array.isArray(forecast.list) && forecast.list.length > 0) {
      const dailyMap = {};
      forecast.list.forEach(item => {
        if (!item || !item.dt || !item.main) return;
        let dayKey = '';
        try {
          const date = new Date(item.dt * 1000);
          dayKey = date.toISOString().split('T')[0];
        } catch (e) {
          dayKey = 'day-' + item.dt;
        }
        if (!dailyMap[dayKey]) {
          dailyMap[dayKey] = {
            dt: item.dt,
            temps: [],
            weather: (item.weather && item.weather[0]) ? item.weather[0] : { main: 'Clear', icon: '01d' }
          };
        }
        dailyMap[dayKey].temps.push(item.main.temp);
      });

      const days = Object.values(dailyMap).slice(0, 5);
      days.forEach(day => {
        if (!day.temps.length) return;
        const minTemp = Math.round(Math.min(...day.temps));
        const maxTemp = Math.round(Math.max(...day.temps));
        const dayName = formatDayName(day.dt);

        const row = document.createElement('div');
        row.className = 'daily-row';
        row.innerHTML = `
          <span class="daily-day">${dayName}</span>
          <div class="daily-cond">
            <img class="daily-icon" src="${day.weather.icon.startsWith('http') ? day.weather.icon : 'https://openweathermap.org/img/wn/' + day.weather.icon + '.png'}" alt="">
            <span>${day.weather.main}</span>
          </div>
          <span class="daily-range">${maxTemp}° / ${minTemp}°</span>
        `;
        dailyContainer.appendChild(row);
      });
    }

    if (coord && coord.lat !== undefined && coord.lon !== undefined) {
      flyAndPointCity(coord.lat, coord.lon, name, currentTempStr);
    }
  } catch (err) {
    console.error("Error rendering weather data:", err);
  }
}

// ---------- OPEN-METEO FREE WEATHER & GEOCODING FALLBACK ----------
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

async function fetchFromOpenMeteo(lat, lon, cityNameStr, countryCodeStr = "") {
  const tempUnitParam = currentUnit === 'imperial' ? '&temperature_unit=fahrenheit&wind_speed_unit=mph' : '';
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,cloud_cover,surface_pressure,wind_speed_10m,wind_direction_10m&hourly=temperature_2m,weather_code,precipitation_probability&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset&timezone=auto${tempUnitParam}`;
  
  const res = await fetch(url);
  if (!res.ok) throw new Error("Weather data service unavailable.");
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
      speed: current.wind_speed_10m ? (currentUnit === 'metric' ? current.wind_speed_10m / 3.6 : current.wind_speed_10m) : 0,
      deg: current.wind_direction_10m || 0
    },
    clouds: { all: current.cloud_cover || 20 },
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
    let finalName = item.name;
    const country = item.country_code || item.country || "";
    if (!isIndianLocation(country, item.latitude, item.longitude) && hasNonLatinScript(finalName)) {
      const latinMatch = data.results.find(r => !hasNonLatinScript(r.name));
      if (latinMatch) finalName = latinMatch.name;
    }
    return {
      name: finalName,
      country: country,
      lat: item.latitude,
      lon: item.longitude
    };
  }
  return null;
}

// ---------- FETCH WEATHER CONTROLLER WITH DUAL FALLBACK ----------
async function fetchWeatherData(cityOrCoords) {
  setStatus("Fetching live weather...", "loading");
  if (riskLevelTagEl) riskLevelTagEl.textContent = "Calculating weather risk...";

  try {
    let wUrl = "", fUrl = "";
    if (typeof cityOrCoords === "string") {
      const q = encodeURIComponent(cityOrCoords);
      wUrl = `${WEATHER_URL}?city=${q}&unit=${currentUnit}`;
      fUrl = `${FORECAST_URL}?city=${q}&unit=${currentUnit}`;
    } else {
      const { lat, lon } = cityOrCoords;
      wUrl = `${WEATHER_URL}?lat=${lat}&lon=${lon}&unit=${currentUnit}`;
      fUrl = `${FORECAST_URL}?lat=${lat}&lon=${lon}&unit=${currentUnit}`;
    }

    const [wRes, fRes] = await Promise.all([
      fetch(wUrl).catch(() => null),
      fetch(fUrl).catch(() => null)
    ]);

    if (wRes && wRes.ok) {
      currentWeatherData = await wRes.json();
      currentForecastData = fRes && fRes.ok ? await fRes.json() : null;
      if (currentWeatherData && currentWeatherData.name) {
        const sysCountry = currentWeatherData.sys ? currentWeatherData.sys.country : '';
        const coordLat = currentWeatherData.coord ? currentWeatherData.coord.lat : undefined;
        const coordLon = currentWeatherData.coord ? currentWeatherData.coord.lon : undefined;
        currentWeatherData.name = await ensureEnglishCityName(currentWeatherData.name, sysCountry, coordLat, coordLon);
      }
      renderWeather(currentWeatherData, currentForecastData);
      return;
    }

    // OpenWeather failed or returned error: Fallback to Open-Meteo
    console.warn("OpenWeather API unavailable, switching to Open-Meteo fallback...");
    if (typeof cityOrCoords === "string") {
      const geo = await geocodeOpenMeteo(cityOrCoords);
      if (!geo) throw new Error(`Location "${cityOrCoords}" not found.`);
      const omRes = await fetchFromOpenMeteo(geo.lat, geo.lon, geo.name, geo.country);
      currentWeatherData = omRes.weatherData;
      currentForecastData = omRes.forecastData;
    } else {
      const omRes = await fetchFromOpenMeteo(cityOrCoords.lat, cityOrCoords.lon, "Your Location");
      currentWeatherData = omRes.weatherData;
      currentForecastData = omRes.forecastData;
    }

    if (currentWeatherData && currentWeatherData.name) {
      const sysCountry = currentWeatherData.sys ? currentWeatherData.sys.country : '';
      const coordLat = currentWeatherData.coord ? currentWeatherData.coord.lat : undefined;
      const coordLon = currentWeatherData.coord ? currentWeatherData.coord.lon : undefined;
      currentWeatherData.name = await ensureEnglishCityName(currentWeatherData.name, sysCountry, coordLat, coordLon);
    }

    renderWeather(currentWeatherData, currentForecastData);
  } catch (err) {
    setStatus(err.message || "Failed to load weather data.", "error");
  }
}

// ---------- EVENT LISTENERS ----------
searchForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const query = cityInput.value.trim();
  if (!query) {
    setStatus("Please enter a city name.", "error");
    return;
  }
  fetchWeatherData(query);
});

locateBtn.addEventListener("click", () => {
  if (!("geolocation" in navigator)) {
    setStatus("GPS location is not supported by your browser.", "error");
    return;
  }
  setStatus("Acquiring GPS location...", "loading");
  navigator.geolocation.getCurrentPosition(
    (pos) => fetchWeatherData({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
    () => setStatus("Location access denied.", "error")
  );
});

document.querySelectorAll(".city-pill").forEach(pill => {
  pill.addEventListener("click", () => {
    const city = pill.getAttribute("data-city");
    cityInput.value = city;
    fetchWeatherData(city);
  });
});

unitCEl.addEventListener("click", () => {
  if (currentUnit === 'metric') return;
  currentUnit = 'metric';
  unitCEl.classList.add("active");
  unitFEl.classList.remove("active");
  if (currentWeatherData) fetchWeatherData(currentWeatherData.name);
});

unitFEl.addEventListener("click", () => {
  if (currentUnit === 'imperial') return;
  currentUnit = 'imperial';
  unitFEl.classList.add("active");
  unitCEl.classList.remove("active");
  if (currentWeatherData) fetchWeatherData(currentWeatherData.name);
});

// ---------- WEATHER INFO BAR HIDE & UNHIDE EYE TOGGLE ----------
const toggleInfoBtn = document.getElementById("toggle-info-btn");
const hideInfoHeaderBtn = document.getElementById("hide-info-header-btn");
const uiContainerEl = document.querySelector(".ui-container");

function toggleWeatherInfoBar() {
  if (!uiContainerEl) return;
  const isHidden = uiContainerEl.classList.toggle("hidden");
  if (toggleInfoBtn) {
    toggleInfoBtn.title = isHidden ? "Show Weather Info Bar" : "Hide Weather Info Bar";
    toggleInfoBtn.style.background = isHidden ? "rgba(59, 130, 246, 0.4)" : "var(--card-bg)";
  }
}

toggleInfoBtn?.addEventListener("click", toggleWeatherInfoBar);
hideInfoHeaderBtn?.addEventListener("click", toggleWeatherInfoBar);

recenterBtn?.addEventListener("click", () => {
  if (lastCoord && currentWeatherData) {
    flyAndPointCity(lastCoord.lat, lastCoord.lon, currentWeatherData.name, `${Math.round(currentWeatherData.main.temp)}${currentUnit === 'metric' ? '°C' : '°F'}`);
  }
});

globeViewBtn?.addEventListener("click", () => {
  if (viewer) {
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(0, 20, 20000000),
      duration: 3.0
    });
  } else if (threeGlobe) {
    rotateThreeGlobeTo(20, 0);
  }
});

// Startup render with London default
fetchWeatherData("London");
