import sys
import os

current_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.append(current_dir)

try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(current_dir, '.env'))
except Exception:
    env_path = os.path.join(current_dir, '.env')
    if os.path.exists(env_path):
        try:
            with open(env_path, 'r', encoding='utf-8') as _f:
                for _line in _f:
                    line = _line.strip()
                    if not line or line.startswith('#') or '=' not in line:
                        continue
                    k, v = line.split('=', 1)
                    k = k.strip(); v = v.strip().strip('"').strip("'")
                    if k and v: os.environ.setdefault(k, v)
        except Exception:
            pass

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
from services.ai_service import RoadSOSAgent
from services.geo_service import GeoService
from services.notificaton_service import NotificationService

app = FastAPI(title="Road SOS API", version="4.0.0")
agent   = RoadSOSAgent()
geo_svc = GeoService()
notifier = NotificationService()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
)

VALID_CATEGORIES = {"trauma_center", "hospital", "ambulance", "police", "towing", "puncture", "showroom"}

class ChatRequest(BaseModel):
    session_id: str
    message: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None

class SOSRequest(BaseModel):
    contacts: List[str]
    latitude: float
    longitude: float
    address: Optional[str] = None
    hospital: Optional[str] = None
    user_name: Optional[str] = None

@app.get("/")
async def root():
    return {"status": "Road SOS API running", "version": "4.0.0"}

@app.get("/health")
async def health():
    return {
        "status": "ok",
        "ai": agent._ai_mode or "rule-based",
        "geo": "google_maps" if geo_svc.has_gmaps else "openstreetmap",
        "sms": notifier._enabled,
        "categories": list(VALID_CATEGORIES),
    }

@app.post("/api/chat")
async def chat(req: ChatRequest):
    try:
        ctx = {"lat": req.latitude, "lon": req.longitude}
        response = await agent.respond(req.session_id, req.message, ctx)
        return {"response": response["text"], "resources": response.get("resources", [])}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/nearby")
async def nearby(lat: float, lon: float, category: str = "trauma_center", limit: int = 8):
    """
    Find nearby services.
    category: trauma_center | hospital | ambulance | police | towing | puncture | showroom
    Works globally via OpenStreetMap (or Google Maps if key configured).
    """
    if category not in VALID_CATEGORIES:
        raise HTTPException(status_code=400, detail=f"Invalid category. Valid: {VALID_CATEGORIES}")
    try:
        results = await geo_svc.find_nearby(lat, lon, category, limit=limit)
        return {"results": results, "count": len(results), "category": category}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/sos")
async def send_sos(req: SOSRequest):
    results = []
    hospital_name = req.hospital or "nearest hospital"
    address = req.address or f"GPS: {req.latitude:.5f}, {req.longitude:.5f}"
    maps_link = f"https://maps.google.com/?q={req.latitude},{req.longitude}"

    for phone in req.contacts:
        accident_info = {
            "address": address,
            "hospital": hospital_name,
            "maps_link": maps_link,
            "user_name": req.user_name or "Someone",
            "time": "NOW",
        }
        success = notifier.send_sos(phone, accident_info)
        results.append({"phone": phone, "sent": success})

    sent_count = sum(1 for r in results if r["sent"])
    return {
        "success": sent_count > 0,
        "sent": sent_count,
        "total": len(req.contacts),
        "sms_enabled": notifier._enabled,
        "results": results,
        "maps_link": maps_link,
    }

@app.get("/api/geocode")
async def geocode(address: str):
    try:
        return await geo_svc.geocode_address(address)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/reverse-geocode")
async def reverse_geocode(lat: float, lon: float):
    try:
        return await geo_svc.reverse_geocode(lat, lon)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)
