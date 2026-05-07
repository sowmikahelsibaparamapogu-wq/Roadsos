import os
from datetime import datetime


class NotificationService:
    def __init__(self):
        self._sid   = os.getenv("TWILIO_ACCOUNT_SID", "").strip()
        self._token = os.getenv("TWILIO_AUTH_TOKEN", "").strip()
        self._from  = os.getenv("TWILIO_PHONE_NUMBER", "").strip()
        self._enabled = bool(
            self._sid and self._token and self._from
            and self._sid not in ("your_twilio_sid", "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", "")
            and self._token not in ("your_twilio_token", "")
            and self._from not in ("your_twilio_number", "+1234567890", "")
        )

        if self._enabled:
            print("[NotificationService] Twilio SMS ready ✅")
        else:
            missing = []
            if not self._sid or self._sid in ("ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",):
                missing.append("TWILIO_ACCOUNT_SID")
            if not self._token:
                missing.append("TWILIO_AUTH_TOKEN")
            if not self._from or self._from in ("+1234567890",):
                missing.append("TWILIO_PHONE_NUMBER")
            print(f"[NotificationService] SMS disabled. Missing/invalid: {', '.join(missing) if missing else 'credentials'}")
            print("[NotificationService] Add Twilio credentials to backend/.env to enable SMS")

    def send_sos(self, to_number: str, accident_info: dict) -> bool:
        now = datetime.now().strftime("%d %b %Y %H:%M")
        maps_link = accident_info.get("maps_link", "")
        user_name = accident_info.get("user_name", "Someone")
        address   = accident_info.get("address", "Unknown location")
        hospital  = accident_info.get("hospital", "Nearest hospital")

        msg = (
            f"ROAD SOS ALERT\n"
            f"{user_name} needs emergency help!\n"
            f"Location: {address}\n"
            f"GPS Map: {maps_link}\n"
            f"Nearest Hospital: {hospital}\n"
            f"Time: {now}\n"
            f"PLEASE RESPOND IMMEDIATELY\n"
            f"Emergency: 112 | Ambulance: 102"
        )

        if not self._enabled:
            print(f"[NotificationService] SMS skipped (not configured). "
                  f"Would send to {to_number}:\n{msg}")
            return False

        try:
            from twilio.rest import Client
            client = Client(self._sid, self._token)
            message = client.messages.create(
                body=msg,
                from_=self._from,
                to=to_number
            )
            print(f"[NotificationService] SMS sent to {to_number} (SID: {message.sid})")
            return True
        except Exception as e:
            print(f"[NotificationService] SMS send error to {to_number}: {e}")
            return False

    def send_sos_bulk(self, contacts: list, accident_info: dict) -> dict:
        """Send SOS to multiple contacts. Returns {phone: success} dict."""
        results = {}
        for phone in contacts:
            phone = phone.strip()
            if not phone:
                continue
            results[phone] = self.send_sos(phone, accident_info)
        return results
