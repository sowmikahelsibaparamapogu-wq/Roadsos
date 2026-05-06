# 🚨 Road SOS v4.0 — Emergency Response App

A full-stack emergency assistance app with AI chat, SOS alerts, and nearby services finder. Works globally via OpenStreetMap.

## ✨ NEW in v4.0
- 🚔 **Nearest Police Stations** — find police with one tap
- 🏥 **Hospitals & Ambulance services** — dedicated panel
- 🚛 **Towing services** — vehicle recovery near you
- 🔧 **Puncture / Tyre shops** — find repair shops globally
- 🏢 **Car & Bike Showrooms** — nearest vehicle dealers
- 📡 **Offline mode** — IndexedDB caching, works in low-network
- 🌍 **Global** — OpenStreetMap data covers every country
- 🧭 **Waze + Google Maps** deep-links for navigation

## 🗂️ Features
| Feature | Description |
|---|---|
| 💬 AI Chat | Context-aware emergency assistant |
| 🆘 SOS Alert | SMS/share your location to contacts |
| 🏥 Hospitals | Nearest hospitals in real-time |
| 🚔 Police | Nearest police stations |
| 🚛 Towing | Vehicle towing/recovery services |
| 🔧 Puncture | Tyre repair shops |
| 🏢 Showrooms | Car/bike showrooms |
| 📡 Offline | Cached data when network is down |

## 🚀 Quick Start

### Windows
```
Double-click: setup.bat
Then: start.bat
```

### Manual
```bash
# Backend
cd backend
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000

# Frontend (new terminal)
cd frontend
npm install
npm start
```

Open http://localhost:3000

## ⚙️ Configuration (backend/.env)
```
GOOGLE_MAPS_API_KEY=your_key_here   # Optional — falls back to OpenStreetMap
TWILIO_ACCOUNT_SID=...               # Optional — for SMS alerts
TWILIO_AUTH_TOKEN=...
TWILIO_FROM_NUMBER=+1...
OPENAI_API_KEY=...                   # Optional — for AI chat
ANTHROPIC_API_KEY=...                # Optional — Claude AI
```

Without any keys, the app works using:
- **OpenStreetMap** for all location services (free, global)
- **Rule-based AI** for chat
- **Native share** (WhatsApp/SMS) for SOS alerts

## 🌍 Global Support
Services are fetched from **OpenStreetMap** which covers all countries.
Results include Waze and Google Maps deeplinks for turn-by-turn navigation.

## 📡 Offline / Low-Network
- Services are cached in browser IndexedDB for 30 minutes
- Works in low-connectivity — shows cached results with a warning
- Offline banner shown when network is unavailable
