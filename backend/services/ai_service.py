import json
import re
import os
import asyncio
import aiohttp
from .geo_service import GeoService
from .notificaton_service import NotificationService

SYSTEM_PROMPT = """You are Road SOS, a highly intelligent AI assistant specializing in road accident emergency response in India. You can answer ANY question on ANY topic — just like ChatGPT or Gemini.

EMERGENCY CAPABILITIES:
1. Road accidents: calmly acknowledge, provide nearest hospitals from the geo context given, give first-aid steps.
2. Always mention Indian emergency numbers: 112 (national), 102 (ambulance), 108 (medical), 101 (fire), 100 (police).
3. Complete first-aid knowledge:
   - Bleeding: firm direct pressure, elevate above heart, never remove embedded objects
   - Fractures: immobilise limb, never move patient unless danger, splint with available objects
   - Burns: 20 min cool running water, no ice/butter/toothpaste, cover loosely
   - Head injury: keep still, check pupils, no food/water, watch for confusion/vomiting
   - Unconscious + breathing: recovery position (on side)
   - Unconscious + not breathing: CPR — 30 chest compressions + 2 rescue breaths, 100-120/min
   - Choking: 5 back blows + 5 abdominal thrusts (Heimlich maneuver)
   - Shock: lay flat, raise legs 30cm, keep warm, do not give food/water
   - Spinal injury: never move, keep head still, call 112
   - Eye injury: cover, never rub, seek immediate care
   - Drowning: rescue breathing, CPR if no pulse
   - Electric shock: do not touch victim, cut power, call 112, CPR if needed
4. Self-treatment for minor injuries: cuts, bruises, sprains (RICE method), minor burns.
5. SOS assistance: help users compose location-sharing messages for contacts.
6. Vehicle advice: car fire (escape first, then 20m away), tyre blowouts, brake failure.

GENERAL KNOWLEDGE (answer ANY question helpfully like ChatGPT/Gemini):
- Science, technology, mathematics, physics, chemistry, biology, astronomy
- History, geography, politics, economics, law, finance, investment
- Health, medicine, nutrition, fitness, mental health, relationships
- Programming, software, AI, cybersecurity, gadgets
- Sports, entertainment, movies, music, books, cooking, travel
- Language, grammar, writing, poetry, translations
- Creative writing, brainstorming, problem-solving, jokes, riddles
- Philosophy, current events, news, general trivia
- Any other topic — never refuse a general knowledge question

RULES:
- Always respond in the user's language (Hindi, Telugu, Tamil, Kannada, etc. if user writes in those)
- Keep emergency responses concise and action-oriented — numbered steps when possible
- When geo context with hospitals is provided, LIST the hospitals with name, phone, distance and maps link
- Never say "use Google Maps" — give the actual information
- Be warm, empathetic, professional
- For ANY non-emergency question, be a fully knowledgeable helpful assistant like ChatGPT
- Never say "I can only answer emergency questions" — answer everything
- Give varied, thoughtful, accurate responses — never repeat the same canned reply"""

_memory_sessions: dict = {}


class RoadSOSAgent:
    def __init__(self):
        self.notifier = NotificationService()
        self.geo_svc = GeoService()
        self._redis = None
        self._redis_url = os.getenv("REDIS_URL", "")
        self._ai_mode = None  # "claude", "gemini_v2", "gemini_v1", "openai", or None
        self._client = None
        self._init_ai()

    def _init_ai(self):
        # Try Gemini new SDK
        gemini_key = os.getenv("GEMINI_API_KEY", "").strip()
        if gemini_key and gemini_key not in ("your_gemini_api_key_here", ""):
            try:
                from google import genai as genai2
                self._client = genai2.Client(api_key=gemini_key)
                self._ai_mode = "gemini_v2"
                print("\n" + "="*70)
                print("[✅ Road SOS] Using Google Gemini - ChatGPT-level intelligence ENABLED")
                print("="*70 + "\n")
                return
            except Exception:
                pass
            # Old Gemini SDK fallback
            try:
                import warnings
                import google.generativeai as genai
                with warnings.catch_warnings():
                    warnings.simplefilter("ignore")
                    genai.configure(api_key=gemini_key)
                    self._client = genai.GenerativeModel(
                        model_name="gemini-1.5-flash",
                        system_instruction=SYSTEM_PROMPT
                    )
                self._ai_mode = "gemini_v1"
                print("[Road SOS] Using Gemini 1.5 Flash (legacy SDK)")
                return
            except Exception as e:
                print(f"[Road SOS] Gemini init failed: {e}")

        # Try Claude (Anthropic) as fallback
        claude_key = os.getenv("ANTHROPIC_API_KEY", "").strip()
        if claude_key and claude_key not in ("your_anthropic_api_key_here", ""):
            try:
                import anthropic
                self._client = anthropic.Anthropic(api_key=claude_key)
                self._ai_mode = "claude"
                print("\n" + "="*70)
                print("[✅ Road SOS] Using Claude (Anthropic) - ChatGPT-level intelligence ENABLED")
                print("="*70 + "\n")
                return
            except ImportError:
                print("[⚠️ Road SOS] anthropic package not installed. Run: pip install anthropic")
            except Exception as e:
                print(f"[⚠️ Road SOS] Claude init failed: {e}")

        # OpenAI fallback
        openai_key = os.getenv("OPENAI_API_KEY", "").strip()
        if openai_key and openai_key not in ("your_openai_api_key_here", ""):
            try:
                import openai
                self._client = openai.AsyncOpenAI(api_key=openai_key)
                self._ai_mode = "openai"
                print("[Road SOS] Using OpenAI")
                return
            except Exception as e:
                print(f"[Road SOS] OpenAI init failed: {e}")

        print("\n" + "="*70)
        print("[❌ Road SOS] No AI API configured - using rule-based responses only")
        print("="*70)
        print("TO ENABLE FULL CHATGPT-LIKE RESPONSES:")
        print("1. Get free API key: https://aistudio.google.com/app/apikey")
        print("2. Add to backend/.env: GEMINI_API_KEY=AIzaSy...")
        print("3. Restart backend server")
        print("="*70 + "\n")

    # Session storage
    async def _get_redis(self):
        if self._redis is not None:
            return self._redis
        if not self._redis_url:
            return None
        try:
            import redis.asyncio as aioredis
            r = aioredis.from_url(self._redis_url, socket_connect_timeout=2)
            await r.ping()
            self._redis = r
            return r
        except Exception:
            return None

    async def _get_history(self, sid):
        r = await self._get_redis()
        if r:
            try:
                raw = await r.get(f"session:{sid}")
                return json.loads(raw) if raw else []
            except Exception:
                pass
        return list(_memory_sessions.get(sid, []))

    async def _save_history(self, sid, history):
        r = await self._get_redis()
        if r:
            try:
                await r.setex(f"session:{sid}", 3600, json.dumps(history))
                return
            except Exception:
                pass
        _memory_sessions[sid] = history

    # AI call helpers
    async def _call_claude(self, history: list) -> str:
        loop = asyncio.get_event_loop()
        messages = []
        for msg in history:
            role = "assistant" if msg["role"] == "assistant" else "user"
            messages.append({"role": role, "content": msg["content"]})
        response = await loop.run_in_executor(
            None,
            lambda: self._client.messages.create(
                model="claude-opus-4-5",
                max_tokens=1024,
                system=SYSTEM_PROMPT,
                messages=messages
            )
        )
        return response.content[0].text

    async def _call_gemini_v2(self, history: list) -> str:
        loop = asyncio.get_event_loop()
        contents = [
            {"role": "model" if m["role"] == "assistant" else "user",
             "parts": [{"text": m["content"]}]}
            for m in history
        ]
        response = await loop.run_in_executor(
            None,
            lambda: self._client.models.generate_content(
                model="gemini-1.5-flash",
                contents=contents,
                config={"system_instruction": SYSTEM_PROMPT, "max_output_tokens": 900}
            )
        )
        return response.text

    async def _call_gemini_v1(self, history: list) -> str:
        loop = asyncio.get_event_loop()
        chat_history = []
        for msg in history[:-1]:
            role = "model" if msg["role"] == "assistant" else "user"
            chat_history.append({"role": role, "parts": [{"text": msg["content"]}]})
        last_msg = history[-1]["content"]
        chat = self._client.start_chat(history=chat_history)
        response = await loop.run_in_executor(None, lambda: chat.send_message(last_msg))
        return response.text

    async def _call_openai(self, history: list) -> str:
        messages = [{"role": "system", "content": SYSTEM_PROMPT}]
        for msg in history:
            messages.append({"role": msg["role"], "content": msg["content"]})
        response = await self._client.chat.completions.create(
            model="gpt-3.5-turbo", messages=messages, max_tokens=800
        )
        return response.choices[0].message.content

    async def _call_ai(self, history: list) -> str:
        if self._ai_mode == "claude":
            return await self._call_claude(history)
        elif self._ai_mode == "gemini_v2":
            return await self._call_gemini_v2(history)
        elif self._ai_mode == "gemini_v1":
            return await self._call_gemini_v1(history)
        elif self._ai_mode == "openai":
            return await self._call_openai(history)
        else:
            raise ValueError("No AI configured")

    def _rule_based_response(self, user_msg: str, resources: list) -> str:
        msg = user_msg.lower()
        if any(w in msg for w in ["accident", "crash", "collision", "hit", "injured", "emergency"]):
            resp = ("EMERGENCY PROTOCOL:\n"
                    "1. Call 112 immediately\n"
                    "2. Do NOT move injured persons\n"
                    "3. Apply firm pressure to bleeding wounds\n"
                    "4. Keep person warm and calm\n"
                    "5. Stay on the line with emergency services\n\n")
            if resources:
                resp += "Nearest hospitals:\n"
                for r in resources[:3]:
                    resp += (f"- {r['name']} - {r.get('phone','112')} "
                             f"({r.get('distance_km','?')} km)\n"
                             f"  {r.get('maps_url', '')}\n")
            else:
                resp += "Enable GPS to find nearest hospitals automatically."
            return resp
        if any(w in msg for w in ["hospital", "clinic", "doctor", "trauma"]):
            if resources:
                resp = "Nearest emergency facilities:\n"
                for r in resources:
                    resp += (f"- {r['name']} - {r.get('phone','112')} "
                             f"({r.get('distance_km','?')} km)\n"
                             f"  {r.get('maps_url', '')}\n")
                return resp
            return "Enable GPS to find nearest hospitals, or call 112 for emergency services."
        if "ambulance" in msg:
            return ("Call 102 for ambulance immediately. Alternatively call 112.\n\n"
                    "While waiting:\n- Keep injured person still\n"
                    "- Do not give food or water\n- Apply pressure to wounds\n- Keep them warm")
        if any(w in msg for w in ["bleed", "first aid", "fracture", "burn",
                                   "unconscious", "shock", "cpr", "choking"]):
            return ("FIRST AID GUIDE:\n\n"
                    "Bleeding: Press firmly with clean cloth. Elevate limb.\n"
                    "Fracture: Immobilise. Do not move. Splint if possible.\n"
                    "Burns: Cool under running water 20 min. No ice or butter.\n"
                    "Unconscious+breathing: Recovery position (on side).\n"
                    "CPR: 30 compressions + 2 breaths, 100-120/min.\n"
                    "Shock: Lay flat, raise legs, keep warm.\n"
                    "Choking: 5 back blows + 5 abdominal thrusts.\n\n"
                    "Call 112 for all serious injuries.")
        return ("I am currently running in **Emergency Basic Mode**.\n\n"
                "I can help with accidents, first aid, and finding hospitals. For full conversational AI (like ChatGPT) to answer any topic:\n\n"
                "1. Get a free API key at **aistudio.google.com**\n"
                "2. Add it to `backend/.env` as `GEMINI_API_KEY=AIzaSy...`\n"
                "3. Restart this server.\n\n"
                "**Emergency Contacts:**\n- National: 112\n- Ambulance: 102\n- Medical: 108")

    # Main respond entry point
    async def respond(self, session_id: str, user_msg: str, ctx: dict) -> dict:
        history = await self._get_history(session_id)
        resources = []

        if ctx.get("lat") and ctx.get("lon"):
            try:
                facilities = await self.geo_svc.find_nearby(
                    ctx["lat"], ctx["lon"], "trauma_center", limit=5
                )
                resources = facilities
                if facilities:
                    geo_lines = "\n".join(
                        f"- {f['name']} | Phone: {f.get('phone','112')} | "
                        f"Distance: {f.get('distance_km','?')} km | "
                        f"Address: {f.get('address','')} | "
                        f"Maps: {f.get('maps_url','')}"
                        for f in facilities
                    )
                    enriched = f"{user_msg}\n\n[GPS Context - Nearby hospitals:\n{geo_lines}]"
                else:
                    enriched = user_msg
            except Exception as e:
                print(f"[AI] Geo fetch error: {e}")
                enriched = user_msg
        else:
            enriched = user_msg

        history.append({"role": "user", "content": enriched})

        assistant_text = ""
        try:
            if self._ai_mode:
                assistant_text = await self._call_ai(history)
            else:
                assistant_text = self._rule_based_response(user_msg, resources)
        except Exception as e:
            print(f"[AI error]: {e}")
            assistant_text = self._rule_based_response(user_msg, resources)

        # SMS trigger
        if any(k in user_msg.lower() for k in
               ["sms", "alert", "notify", "contact", "family",
                "message", "send sos", "whatsapp"]):
            phone_match = re.search(r'(\+?\d{10,15})', user_msg)
            if phone_match and ctx.get("lat"):
                target_phone = phone_match.group(0)
                hospital_name = resources[0]["name"] if resources else "nearest hospital"
                success = self.notifier.send_sos(target_phone, {
                    "address": ctx.get("addr") or f"GPS: {ctx.get('lat')}, {ctx.get('lon')}",
                    "hospital": hospital_name,
                    "maps_link": f"https://maps.google.com/?q={ctx.get('lat')},{ctx.get('lon')}",
                    "time": "NOW"
                })
                if success:
                    assistant_text += f"\n\nSMS alert sent to {target_phone}."
                else:
                    assistant_text += (
                        "\n\nSMS not configured. Use the SOS button to share location via WhatsApp/SMS."
                    )

        history[-1] = {"role": "user", "content": user_msg}
        history.append({"role": "assistant", "content": assistant_text})
        history = history[-40:]
        await self._save_history(session_id, history)

        return {"text": assistant_text, "resources": resources}
