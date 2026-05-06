import React, { useState } from 'react';
import axios from 'axios';

export default function SOSPanel({ location, address, hospitals, apiUrl, onClose }) {
  const [contacts, setContacts] = useState(['']);
  const [userName, setUserName] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);

  const addContact = () => setContacts(prev => [...prev, '']);
  const removeContact = (i) => setContacts(prev => prev.filter((_, idx) => idx !== i));
  const updateContact = (i, val) => setContacts(prev => prev.map((c, idx) => idx === i ? val : c));

  const nearestHospital = hospitals[0]?.name || 'Nearest hospital';
  const mapsLink = location
    ? `https://maps.google.com/?q=${location.lat},${location.lon}`
    : '';

  const sendSOS = async () => {
    const validContacts = contacts
      .map(c => c.trim())
      .filter(c => c.replace(/\D/g, '').length >= 10);

    if (!validContacts.length) {
      alert('Please enter at least one valid phone number (10+ digits, e.g. +919876543210)');
      return;
    }
    if (!location) {
      alert('Location not available. Please enable GPS first, then try again.');
      return;
    }

    setSending(true);
    setResult(null);

    try {
      const res = await axios.post(`${apiUrl}/api/sos`, {
        contacts: validContacts,
        latitude: location.lat,
        longitude: location.lon,
        address: address,
        hospital: nearestHospital,
        user_name: userName || 'Someone',
      });

      if (res.data.sms_enabled) {
        setResult({
          type: 'success',
          message: `✅ SOS SMS sent to ${res.data.sent} of ${res.data.total} contact(s)!`,
          details: res.data.results
        });
      } else {
        // SMS not configured — guide user to use share/WhatsApp
        setResult({
          type: 'warn',
          message: `📱 SMS not configured on server yet.\nUse the Share button below to send via WhatsApp or native SMS — it's just as fast!`,
        });
      }
    } catch (err) {
      setResult({
        type: 'error',
        message: '❌ Server error. Use the Share button below to send manually.'
      });
    } finally {
      setSending(false);
    }
  };

  const shareLocation = () => {
    const hospLines = hospitals.slice(0, 2)
      .map(h => `${h.name} (${h.distance_km}km, ${h.phone || '112'})`)
      .join('\n  ');

    const shareText =
      `🚨 ROAD SOS EMERGENCY ALERT 🚨\n` +
      `${userName || 'I'} need immediate help!\n\n` +
      `📍 Location: ${address}\n` +
      `🗺️ GPS Map: ${mapsLink}\n\n` +
      `🏥 Nearest Hospitals:\n  ${hospLines || nearestHospital}\n\n` +
      `⏰ Time: ${new Date().toLocaleTimeString()}\n\n` +
      `PLEASE RESPOND IMMEDIATELY\n` +
      `📞 Emergency: 112 | Ambulance: 102`;

    if (navigator.share) {
      navigator.share({
        title: '🚨 Road SOS Emergency Alert',
        text: shareText,
      }).catch(() => {});
    } else {
      // Fallback: open native SMS app
      window.open(`sms:?body=${encodeURIComponent(shareText)}`, '_blank');
    }
  };

  const callEmergency = () => {
    window.location.href = 'tel:112';
  };

  return (
    <div className="sos-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="sos-modal">
        <button className="sos-close" onClick={onClose}>✕</button>
        <h2>🆘 Send SOS Alert</h2>
        <p className="sos-sub">Send your location and nearest hospital to emergency contacts.</p>

        {/* Emergency call button */}
        <button className="sos-call-btn" onClick={callEmergency}>
          📞 Call 112 Emergency NOW
        </button>

        {/* Location preview */}
        <div className="sos-section">
          <label>Your Current Location</label>
          <div className="sos-location-info">
            <div>📍 <strong>{address}</strong></div>
            {location && (
              <div>GPS: {location.lat.toFixed(5)}, {location.lon.toFixed(5)}</div>
            )}
            {hospitals[0] && (
              <div>🏥 Nearest: {hospitals[0].name} ({hospitals[0].distance_km} km)</div>
            )}
            {mapsLink && (
              <a href={mapsLink} target="_blank" rel="noreferrer" className="sos-maps-link">
                View on Google Maps →
              </a>
            )}
          </div>
        </div>

        {/* Name */}
        <div className="sos-section">
          <label>Your Name (optional)</label>
          <input
            type="text"
            placeholder="Enter your name"
            value={userName}
            onChange={e => setUserName(e.target.value)}
          />
        </div>

        {/* Contacts */}
        <div className="sos-section">
          <label>Emergency Contacts (phone numbers)</label>
          <div className="contacts-list">
            {contacts.map((c, i) => (
              <div key={i} className="contact-row">
                <input
                  type="tel"
                  placeholder="+91 9876543210"
                  value={c}
                  onChange={e => updateContact(i, e.target.value)}
                />
                {contacts.length > 1 && (
                  <button className="contact-remove" onClick={() => removeContact(i)}>✕</button>
                )}
              </div>
            ))}
          </div>
          <button className="add-contact-btn" onClick={addContact}>+ Add Another Contact</button>
          <p className="contact-hint">Include country code: +91 for India. Trial Twilio accounts need verified numbers.</p>
        </div>

        {/* Send buttons */}
        <button
          className="sos-send-btn pulse"
          onClick={sendSOS}
          disabled={sending}
        >
          {sending ? '⏳ Sending SMS...' : '🆘 SEND SOS SMS NOW'}
        </button>

        <button className="sos-share-btn" onClick={shareLocation}>
          📤 Share via WhatsApp / SMS / Email
        </button>

        {/* Result */}
        {result && (
          <div className={`sos-result ${result.type}`}>
            <div style={{ whiteSpace: 'pre-line' }}>{result.message}</div>
            {result.type !== 'success' && (
              <button className="sos-share-btn" style={{ marginTop: 10 }} onClick={shareLocation}>
                📤 Share Now via WhatsApp / SMS
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
