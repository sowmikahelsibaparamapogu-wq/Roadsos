import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import ChatPanel from './components/ChatPanel';
import HospitalPanel from './components/HospitalPanel';
import SOSPanel from './components/SOSPanel';
import NearbyServicesPanel from './components/NearbyServicesPanel';
import LocationBar from './components/LocationBar';
import './App.css';

const API = process.env.REACT_APP_API_URL || 'http://localhost:8000';

function generateSessionId() {
  return 'sess_' + Math.random().toString(36).slice(2) + Date.now();
}

function LocationPermissionPrompt({ onAllow, onDeny }) {
  return (
    <div className="permission-overlay">
      <div className="permission-card">
        <div className="permission-icon">📍</div>
        <h2>Allow Location Access</h2>
        <p>Road SOS needs your location to find <strong>nearby emergency services</strong> and send your <strong>exact position</strong> in SOS alerts.</p>
        <ul className="permission-reasons">
          <li>🏥 Find hospitals, police & services closest to you</li>
          <li>🆘 Include GPS coordinates in SOS messages</li>
          <li>🚔 Nearest police stations instantly</li>
          <li>🚛 Towing & puncture shops near you</li>
        </ul>
        <p className="permission-note">Your location is only used during emergencies and is never stored.</p>
        <div className="permission-btns">
          <button className="perm-allow" onClick={onAllow}>✅ Allow Location Access</button>
          <button className="perm-deny" onClick={onDeny}>Continue Without Location</button>
        </div>
      </div>
    </div>
  );
}

const TABS = [
  { id: 'chat',      label: '💬 AI Chat'   },
  { id: 'hospitals', label: '🏥 Hospitals' },
  { id: 'services',  label: '🚔 Services'  },
];

export default function App() {
  const [location, setLocation]                 = useState(null);
  const [address, setAddress]                   = useState('Tap to enable location');
  const [locationError, setLocationError]       = useState(null);
  const [hospitals, setHospitals]               = useState([]);
  const [hospitalsLoading, setHospitalsLoading] = useState(false);
  const [activeTab, setActiveTab]               = useState('chat');
  const [sessionId]                             = useState(generateSessionId);
  const [sosOpen, setSosOpen]                   = useState(false);
  const [apiStatus, setApiStatus]               = useState(null);
  const [showPermPrompt, setShowPermPrompt]     = useState(false);
  const [permAsked, setPermAsked]               = useState(false);
  const [isOffline, setIsOffline]               = useState(!navigator.onLine);
  const locationWatchRef                        = useRef(null);

  useEffect(() => {
    const up   = () => setIsOffline(false);
    const down = () => setIsOffline(true);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, []);

  useEffect(() => {
    axios.get(`${API}/health`).then(r => setApiStatus(r.data)).catch(() => {});
  }, []);

  const reverseGeocode = useCallback(async (lat, lon) => {
    try {
      const res = await axios.get(`${API}/api/reverse-geocode`, { 
        params: { lat, lon },
        timeout: 10000 
      });
      setAddress(res.data.address || "Location identified");
    } catch { setAddress("Location identified (offline)"); }
  }, []);

  const fetchHospitals = useCallback(async (lat, lon) => {
    setHospitalsLoading(true);
    try {
      const res = await axios.get(`${API}/api/nearby`, { params: { lat, lon, category: 'trauma_center', limit: 8 } });
      setHospitals(res.data.results || []);
    } catch { setHospitals([]); } finally { setHospitalsLoading(false); }
  }, []);

  const startWatchingLocation = useCallback(() => {
    if (!navigator.geolocation) { setLocationError('Geolocation not supported'); return; }
    
    // Only show "Locating..." if we don't already have an address or location
    if (address === 'Tap to enable location' || address === 'Location unavailable' || !location) {
      setAddress('Locating...');
    }
    setLocationError(null);

    if (locationWatchRef.current) navigator.geolocation.clearWatch(locationWatchRef.current);

    const handleSuccess = (pos) => {
      const { latitude, longitude } = pos.coords;
      setLocation(prev => {
        const hasMoved = !prev || Math.abs(prev.lat - latitude) > 0.0005 || Math.abs(prev.lon - longitude) > 0.0005;
        if (hasMoved) {
          fetchHospitals(latitude, longitude);
          reverseGeocode(latitude, longitude);
        }
        return { lat: latitude, lon: longitude };
      });
    };

    const handleError = (err) => {
      setLocationError(err.message);
      if (!location) setAddress('Location unavailable');
    };

    // Use getCurrentPosition for a fast initial hit (often cached or tower-based)
    navigator.geolocation.getCurrentPosition(handleSuccess, handleError, { enableHighAccuracy: false, timeout: 5000 });
    
    // Then start the persistent watch for high-accuracy updates
    locationWatchRef.current = navigator.geolocation.watchPosition(handleSuccess, handleError, { 
      enableHighAccuracy: true, 
      timeout: 15000, 
      maximumAge: 30000 
    });
  }, [fetchHospitals, reverseGeocode, address, location]);

  useEffect(() => {
    if (!permAsked) {
      // Trigger the browser's native location prompt immediately on entry.
      // Calling startWatchingLocation() invokes navigator.geolocation methods,
      // which forces the browser to ask the user for permission.
      startWatchingLocation();
      setPermAsked(true);
    }
  }, [startWatchingLocation, permAsked]);

  useEffect(() => {
    return () => { if (locationWatchRef.current) navigator.geolocation.clearWatch(locationWatchRef.current); };
  }, []);

  return (
    <div className="app">
      {showPermPrompt && (
        <LocationPermissionPrompt
          onAllow={() => { setShowPermPrompt(false); setPermAsked(true); startWatchingLocation(); }}
          onDeny={() => { setShowPermPrompt(false); setPermAsked(true); setAddress('No location — services unavailable'); setLocationError('Location not enabled'); }}
        />
      )}

      <header className="header">
        <div className="header-left">
          <div className="logo">
            <span className="logo-icon">🚨</span>
            <span className="logo-text">ROAD<span className="logo-sos">SOS</span></span>
          </div>
          <div className="emergency-nums">
            <a href="tel:112">🆘 112</a>
            <a href="tel:108">🚑 108</a>
            <a href="tel:100">🚔 100</a>
          </div>
        </div>
        <div className="header-right">
          {isOffline && <span className="pill pill-warn">📡 Offline</span>}
          {apiStatus && (
            <div className="status-pills">
              <span className={`pill ${apiStatus.ai === 'rule-based' ? 'pill-warn' : 'pill-ok'}`}>AI: {apiStatus.ai}</span>
              <span className={`pill ${apiStatus.sms ? 'pill-ok' : 'pill-warn'}`}>SMS: {apiStatus.sms ? 'on' : 'off'}</span>
            </div>
          )}
          <button className="sos-btn pulse" onClick={() => setSosOpen(true)}>🆘 SOS</button>
        </div>
      </header>

      <LocationBar address={address} location={location} locationError={locationError} onRefresh={startWatchingLocation} />

      <div className="tabs">
        {TABS.map(tab => (
          <button key={tab.id} className={`tab ${activeTab === tab.id ? 'active' : ''}`} onClick={() => setActiveTab(tab.id)}>
            {tab.label}
            {tab.id === 'hospitals' && hospitals.length > 0 && <span className="badge">{hospitals.length}</span>}
          </button>
        ))}
      </div>

      <main className="main">
        {activeTab === 'chat' && <ChatPanel sessionId={sessionId} location={location} hospitals={hospitals} apiUrl={API} />}
        {activeTab === 'hospitals' && <HospitalPanel hospitals={hospitals} loading={hospitalsLoading} location={location} onRefresh={() => location && fetchHospitals(location.lat, location.lon)} />}
        {activeTab === 'services' && <NearbyServicesPanel location={location} />}
      </main>

      {sosOpen && <SOSPanel location={location} address={address} hospitals={hospitals} apiUrl={API} onClose={() => setSosOpen(false)} />}
    </div>
  );
}
