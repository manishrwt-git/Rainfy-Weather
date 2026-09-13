# Weather App — Rainfy 3D Earth & Weather Risk Application

A full-stack web application featuring an interactive 3D Globe visualization (Cesium.js with Three.js fallback), real-time weather forecasts, air quality index (AQI), UV index calculation, and proprietary Weather Risk Score computation.

---

## 📁 Directory Structure

```
weather-app/
├── frontend/
│   ├── src/
│   │   ├── index.html       # Single-page user interface
│   │   └── script.js        # Dynamic frontend application logic & 3D Globe rendering
│   └── .gitignore           # Frontend-specific ignore rules
├── backend/
│   ├── src/
│   │   ├── server.js        # Express application entrypoint
│   │   ├── routes/
│   │   │   └── weather.js   # Weather API endpoints (/api/weather, /api/forecast, /api/config)
│   │   └── services/
│   │       ├── weatherService.js # OpenWeather & Open-Meteo data integration
│   │       └── riskService.js    # Weather Risk Score calculation engine
│   ├── .env                 # Local environment variables (API keys & configuration)
│   ├── .env.example         # Environment template
│   ├── package.json         # Node.js dependencies & scripts
│   └── .gitignore           # Backend secret & dependency ignore rules
├── README.md                # Project documentation
└── .gitignore               # Root repository ignore rules
```

---

## 🚀 Getting Started

### 1. Environment Setup

Copy `.env.example` to `.env` inside the `backend` directory:

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env` to configure your API keys:

```env
PORT=3000
OPENWEATHER_API_KEY=your_openweather_api_key_here
CESIUM_ION_TOKEN=your_cesium_ion_token_here
```

---

### 2. Installation & Running

Navigate to the `backend/` directory, install dependencies, and start the server:

```bash
cd backend
npm install
npm start
```

For development mode with automatic restart on change:

```bash
npm run dev
```

---

## 🌐 Application Endpoints

- **Web App**: [http://localhost:3000](http://localhost:3000)
- **API Health Check**: `GET http://localhost:3000/api/health`
- **Weather API**: `GET http://localhost:3000/api/weather?city=London`
- **Forecast API**: `GET http://localhost:3000/api/forecast?city=London`
- **Server Config**: `GET http://localhost:3000/api/config`
