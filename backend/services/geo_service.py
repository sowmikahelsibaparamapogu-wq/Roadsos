import asyncio
import aiohttp
from functools import partial
import math
import os

class GeoService:
    def __init__(self):
        key = os.getenv("GOOGLE_MAPS_API_KEY", "")
        self.api_key = key
        self.gmaps = None
        self.has_gmaps = False

        if key and key not in ("your_google_maps_api_key_here", ""):
            try:
                import googlemaps
                self.gmaps = googlemaps.Client(key=key)
                self.has_gmaps = True
                print("[GeoService] Using Google Maps API")
            except ImportError:
                print("[GeoService] googlemaps package not installed — using OSM fallback")
            except Exception as e:
                print(f"[GeoService] Google Maps init failed: {e}")

        if not self.has_gmaps:
            print("[GeoService] Using OpenStreetMap Overpass API (free, global fallback)")

    def _haversine(self, lat1, lon1, lat2, lon2):
        R = 6371
        d2r = math.pi / 180
        dLat = (lat2 - lat1) * d2r
        dLon = (lon2 - lon1) * d2r
        a = (math.sin(dLat/2)**2 +
             math.cos(lat1*d2r) * math.cos(lat2*d2r) * math.sin(dLon/2)**2)
        return round(R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a)), 2)

    # OSM queries for each service category — globally applicable
    def _build_osm_query(self, lat, lon, category, radius=50000):
        queries = {
            "trauma_center": f"""
                [out:json][timeout:30];
                (
                  node["amenity"="hospital"](around:{radius},{lat},{lon});
                  way["amenity"="hospital"](around:{radius},{lat},{lon});
                  relation["amenity"="hospital"](around:{radius},{lat},{lon});
                  node["amenity"="clinic"](around:{radius//2},{lat},{lon});
                  way["amenity"="clinic"](around:{radius//2},{lat},{lon});
                  node["healthcare"="hospital"](around:{radius},{lat},{lon});
                  way["healthcare"="hospital"](around:{radius},{lat},{lon});
                  node["emergency"="ambulance_station"](around:{radius},{lat},{lon});
                );
                out center;""",

            "police": f"""
                [out:json][timeout:30];
                (
                  node["amenity"="police"](around:{radius},{lat},{lon});
                  way["amenity"="police"](around:{radius},{lat},{lon});
                  relation["amenity"="police"](around:{radius},{lat},{lon});
                );
                out center;""",

            "ambulance": f"""
                [out:json][timeout:30];
                (
                  node["emergency"="ambulance_station"](around:{radius},{lat},{lon});
                  way["emergency"="ambulance_station"](around:{radius},{lat},{lon});
                  node["amenity"="hospital"]["emergency"="yes"](around:{radius},{lat},{lon});
                );
                out center;""",

            "towing": f"""
                [out:json][timeout:30];
                (
                  node["service"~"towing|vehicle_rescue"](around:{radius},{lat},{lon});
                  way["service"~"towing|vehicle_rescue"](around:{radius},{lat},{lon});
                  node["amenity"="vehicle_rescue"](around:{radius},{lat},{lon});
                  node["shop"="car_repair"]["service:towing"~"yes|emergency"](around:{radius},{lat},{lon});
                  node["emergency"="towing"](around:{radius},{lat},{lon});
                );
                out center;""",

            "puncture": f"""
                [out:json][timeout:30];
                (
                  node["shop"~"tyre|tyres"](around:{radius},{lat},{lon});
                  way["shop"~"tyre|tyres"](around:{radius},{lat},{lon});
                  node["service"~"tyre|tyres"](around:{radius},{lat},{lon});
                  node["repair"~"tyre|tyres"](around:{radius},{lat},{lon});
                  node["amenity"="car_repair"](around:{radius//2},{lat},{lon});
                );
                out center;""",

            "showroom": f"""
                [out:json][timeout:30];
                (
                  node["shop"="car"](around:{radius},{lat},{lon});
                  node["shop"="motorcycle"](around:{radius},{lat},{lon});
                  node["amenity"="car_rental"](around:{radius},{lat},{lon});
                  way["shop"="car"](around:{radius},{lat},{lon});
                  way["shop"="motorcycle"](around:{radius},{lat},{lon});
                );
                out center;""",
        }
        return queries.get(category, queries["trauma_center"])

    def _default_phone(self, category):
        defaults = {
            "trauma_center": "108",
            "police": "100",
            "ambulance": "108",
            "towing": "",
            "puncture": "",
            "showroom": "",
        }
        return defaults.get(category, "112")

    async def find_nearby(self, lat, lon, category="trauma_center", limit=8):
        if self.has_gmaps:
            try:
                gm_res = await self._find_gmaps(lat, lon, category, limit)
                if gm_res and isinstance(gm_res, list):
                    return gm_res
                print("[GeoService] Google Maps returned no usable results, falling back to OSM")
            except Exception as e:
                print(f"[GeoService] Google Maps error, falling back to OSM: {e}")
        return await self._find_osm(lat, lon, category, limit)

    async def _find_osm(self, lat, lon, category="trauma_center", limit=8):
        query = self._build_osm_query(lat, lon, category)
        default_phone = self._default_phone(category)
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    "https://overpass-api.de/api/interpreter",
                    data={"data": query},
                    timeout=aiohttp.ClientTimeout(total=30)
                ) as resp:
                    data = await resp.json()

            places = []
            for el in data.get("elements", []):
                elat = el.get("lat") or el.get("center", {}).get("lat")
                elon = el.get("lon") or el.get("center", {}).get("lon")
                if not elat or not elon:
                    continue
                tags = el.get("tags", {})
                name = (tags.get("name") or tags.get("name:en")
                        or tags.get("name:te") or tags.get("name:hi")
                        or tags.get("name:ar") or category.replace("_", " ").title())
                phone = (tags.get("phone") or tags.get("telephone") or tags.get("contact:phone")
                         or tags.get("contact:telephone") or tags.get("contact:mobile")
                         or tags.get("phone:mobile") or default_phone)
                address = ", ".join(filter(None, [
                    tags.get("addr:housenumber"),
                    tags.get("addr:street"),
                    tags.get("addr:city"),
                    tags.get("addr:state"),
                    tags.get("addr:country"),
                ]))
                dist = self._haversine(lat, lon, float(elat), float(elon))
                maps_url = f"https://maps.google.com/?q={elat},{elon}"
                waze_url = f"https://waze.com/ul?ll={elat},{elon}&navigate=yes"
                places.append({
                    "name": name,
                    "address": address,
                    "phone": phone,
                    "lat": elat,
                    "lon": elon,
                    "distance_km": dist,
                    "maps_url": maps_url,
                    "waze_url": waze_url,
                    "category": category,
                })

            places.sort(key=lambda x: x["distance_km"])
            return places[:limit]
        except Exception as e:
            print(f"[GeoService] OSM error: {e}")
            return []

    async def _find_gmaps(self, lat, lon, category, limit):
        keywords = {
            "trauma_center": "hospital emergency",
            "hospital":      "hospital",
            "ambulance":     "ambulance service",
            "police":        "police station",
            "towing":        "vehicle towing service",
            "puncture":      "tyre puncture repair shop",
            "showroom":      "car showroom dealer",
        }
        gmaps_types = {
            "trauma_center": "hospital",
            "hospital":      "hospital",
            "ambulance":     "hospital",
            "police":        "police",
            "towing":        "car_repair",
            "puncture":      "car_repair",
            "showroom":      "car_dealer",
        }
        keyword = keywords.get(category, category)
        gtype   = gmaps_types.get(category, "establishment")
        loop    = asyncio.get_event_loop()

        fn = partial(
            self.gmaps.places_nearby,
            location=(lat, lon),
            radius=50000,
            keyword=keyword,
            type=gtype,
        )
        try:
            result = await loop.run_in_executor(None, fn)
        except Exception as e:
            print(f"[GeoService] Google Places API call failed: {e}")
            return []

        if isinstance(result, dict) and (result.get('status') not in (None, 'OK') or result.get('error_message')):
            return []

        places = []
        for p in (result.get("results", []) if isinstance(result, dict) else [])[:limit + 3]:
            try:
                details_fn = partial(
                    self.gmaps.place,
                    p["place_id"],
                    fields=["name", "formatted_address", "formatted_phone_number",
                            "geometry", "rating", "opening_hours"]
                )
                details = await loop.run_in_executor(None, details_fn)
                d = details.get("result", {})
                plat = d["geometry"]["location"]["lat"]
                plon = d["geometry"]["location"]["lng"]
                dist = self._haversine(lat, lon, plat, plon)
                places.append({
                    "name": d.get("name", "Unknown"),
                    "address": d.get("formatted_address", ""),
                    "phone": d.get("formatted_phone_number", self._default_phone(category)),
                    "lat": plat,
                    "lon": plon,
                    "distance_km": dist,
                    "maps_url": f"https://maps.google.com/?q={plat},{plon}",
                    "waze_url": f"https://waze.com/ul?ll={plat},{plon}&navigate=yes",
                    "rating": d.get("rating"),
                    "open_now": d.get("opening_hours", {}).get("open_now"),
                    "category": category,
                })
            except Exception as ex:
                print(f"[GeoService] Place detail error: {ex}")
                continue

        places.sort(key=lambda x: x["distance_km"])
        return places[:limit]

    async def geocode_address(self, address: str):
        if self.has_gmaps:
            try:
                loop = asyncio.get_event_loop()
                results = await loop.run_in_executor(None, partial(self.gmaps.geocode, address))
                if results:
                    loc = results[0]["geometry"]["location"]
                    return {"lat": loc["lat"], "lon": loc["lng"],
                            "formatted_address": results[0].get("formatted_address", address)}
            except Exception as e:
                print(f"[GeoService] Geocode error: {e}")

        try:
            url = "https://nominatim.openstreetmap.org/search"
            params = {"q": address, "format": "json", "limit": 1}
            headers = {"User-Agent": "RoadSOS/4.0"}
            async with aiohttp.ClientSession() as session:
                async with session.get(url, params=params, headers=headers,
                                       timeout=aiohttp.ClientTimeout(total=10)) as resp:
                    data = await resp.json()
            if data:
                return {"lat": float(data[0]["lat"]), "lon": float(data[0]["lon"]),
                        "formatted_address": data[0].get("display_name", address)}
        except Exception as e:
            print(f"[GeoService] OSM geocode error: {e}")

        return {"error": "Could not geocode address"}

    async def reverse_geocode(self, lat: float, lon: float):
        if self.has_gmaps:
            try:
                loop = asyncio.get_event_loop()
                results = await loop.run_in_executor(None, partial(self.gmaps.reverse_geocode, (lat, lon)))
                if results:
                    return {"address": results[0]["formatted_address"], "lat": lat, "lon": lon}
            except Exception as e:
                print(f"[GeoService] Reverse geocode error: {e}")

        try:
            url = "https://nominatim.openstreetmap.org/reverse"
            params = {"lat": lat, "lon": lon, "format": "json", "zoom": 18, "addressdetails": 1}
            headers = {"User-Agent": "RoadSOS/4.0"}
            async with aiohttp.ClientSession() as session:
                async with session.get(url, params=params, headers=headers,
                                       timeout=aiohttp.ClientTimeout(total=10)) as resp:
                    data = await resp.json()
            return {"address": data.get("display_name", f"{lat}, {lon}"), "lat": lat, "lon": lon}
        except Exception as e:
            print(f"[GeoService] OSM reverse geocode error: {e}")

        return {"address": f"{lat:.5f}, {lon:.5f}", "lat": lat, "lon": lon}
