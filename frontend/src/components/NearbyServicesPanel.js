import React, { useState, useEffect, useCallback } from 'react';

const SERVICE_TYPES = [
  { key: 'police', label: 'Police Stations', icon: '🚔', color: '#3b82f6', bg: '#1e3a5f', emergency: '100', description: 'Nearest police stations', googleKeywords: ['police station'] },
  { key: 'hospital', label: 'Hospitals & Ambulance', icon: '🏥', color: '#ef4444', bg: '#5f1e1e', emergency: '108', description: 'Emergency medical services', googleKeywords: ['hospital', 'clinic'] },
  { key: 'towing', label: 'Towing Services', icon: '🚛', color: '#f59e0b', bg: '#5f3e1e', emergency: null, description: 'Vehicle towing & recovery', googleKeywords: ['towing service', 'car repair garage'] },
  { key: 'puncture', label: 'Puncture / Tyre Shops', icon: '🔧', color: '#10b981', bg: '#1e3d2f', emergency: null, description: 'Tyre puncture repair shops', googleKeywords: ['puncture shop', 'tyre shop', 'tire repair'] },
  { key: 'showroom', label: 'Vehicle Showrooms', icon: '🏢', color: '#8b5cf6', bg: '#2d1e5f', emergency: null, description: 'Nearest car/bike showrooms', googleKeywords: ['car showroom', 'bike showroom', 'automobile dealer'] },
];

const RADIUS_OPTIONS = [
  { label: '5 km', value: 5000 },
  { label: '10 km', value: 10000 },
  { label: '25 km', value: 25000 },
  { label: '50 km', value: 50000 },
  { label: '100 km', value: 100000 },
];

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371, d2r = Math.PI / 180;
  const dLat = (lat2 - lat1) * d2r, dLon = (lon2 - lon1) * d2r;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*d2r)*Math.cos(lat2*d2r)*Math.sin(dLon/2)**2;
  return (R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))).toFixed(2);
}

function openDB() {
  return new Promise((res, rej) => {
    const req = indexedDB.open('roadsos_cache', 1);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('services'))
        db.createObjectStore('services', { keyPath: 'cacheKey' });
    };
    req.onsuccess = e => res(e.target.result);
    req.onerror = () => rej(req.error);
  });
}

async function cacheGet(key) {
  try {
    const db = await openDB();
    return new Promise(res => {
      const req = db.transaction('services','readonly').objectStore('services').get(key);
      req.onsuccess = () => res(req.result || null);
      req.onerror = () => res(null);
    });
  } catch { return null; }
}

async function cacheSet(key, data) {
  try {
    const db = await openDB();
    return new Promise(res => {
      const tx = db.transaction('services','readwrite');
      tx.objectStore('services').put({ cacheKey: key, data, ts: Date.now() });
      tx.oncomplete = () => res();
    });
  } catch {}
}

async function googlePlacesFetch(lat, lon, keyword, radius) {
  const resp = await fetch('/api/places', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lat, lon, keyword, radius: Math.min(radius, 50000) }),
  });
  if (!resp.ok) throw new Error(`Places API error: ${resp.status}`);
  return await resp.json();
}

async function fetchPlaces(lat, lon, type, radius = 10000) {
  const rLat = Math.round(lat*100)/100, rLon = Math.round(lon*100)/100;
  const cacheKey = `gp_${type}_${rLat}_${rLon}_r${radius}`;

  const cached = await cacheGet(cacheKey);
  if (cached && (Date.now() - cached.ts) < 30*60*1000) return cached.data;

  const svc = SERVICE_TYPES.find(s => s.key === type);
  const seen = new Set(), allPlaces = [];

  const results = await Promise.allSettled(
    svc.googleKeywords.map(kw => googlePlacesFetch(lat, lon, kw, radius))
  );

  for (const result of results) {
    if (result.status !== 'fulfilled') continue;
    for (const place of (result.value.results || [])) {
      const plat = place.geometry?.location?.lat;
      const plon = place.geometry?.location?.lng;
      if (!plat || !plon) continue;
      const key = place.place_id || `${Math.round(plat*1000)}_${Math.round(plon*1000)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      allPlaces.push({
        name: place.name || 'Unknown',
        phone: place.formatted_phone_number || '',
        address: place.vicinity || place.formatted_address || '',
        typeLabel: place.types?.[0]?.replace(/_/g,' ') || '',
        dist: parseFloat(haversine(lat, lon, plat, plon)),
        lat: plat, lon: plon,
        rating: place.rating || null,
        mapsUrl: `https://maps.google.com/?q=${plat},${plon}`,
        wazeUrl: `https://waze.com/ul?ll=${plat},${plon}&navigate=yes`,
      });
    }
  }

  allPlaces.sort((a,b) => a.dist - b.dist);
  const top = allPlaces.slice(0, 15);
  await cacheSet(cacheKey, top);
  return top;
}

function ServiceCard({ place, svcType, index }) {
  const svc = SERVICE_TYPES.find(s => s.key === svcType);
  return (
    <div className={`svc-card ${index === 0 ? 'svc-card-nearest' : ''}`}
      style={{ borderColor: index === 0 ? svc.color + '88' : '#2a2d3a' }}>
      {index === 0 && <div className="svc-nearest-badge" style={{ background: svc.color }}>📍 Nearest</div>}
      <div className="svc-card-top">
        <div className="svc-card-name">{place.name}</div>
        <div className="svc-card-dist" style={{ color: svc.color }}>{place.dist} km</div>
      </div>
      {place.typeLabel && <div className="svc-card-type" style={{ color: svc.color+'aa', fontSize:'0.72rem', marginBottom:2 }}>{place.typeLabel}</div>}
      {place.rating && <div className="svc-card-type" style={{ color:'#f59e0b', fontSize:'0.72rem', marginBottom:2 }}>⭐ {place.rating}</div>}
      {place.address && <div className="svc-card-addr">📍 {place.address}</div>}
      <div className="svc-card-actions">
        {place.phone ? (
          <a className="svc-btn svc-btn-call" href={`tel:${place.phone}`}
            style={{ background: svc.color+'22', borderColor: svc.color+'55', color: svc.color }}>
            📞 Call
          </a>
        ) : svc.emergency ? (
          <a className="svc-btn svc-btn-call" href={`tel:${svc.emergency}`}
            style={{ background: svc.color+'22', borderColor: svc.color+'55', color: svc.color }}>
            📞 {svc.emergency}
          </a>
        ) : null}
        <a className="svc-btn svc-btn-maps" href={place.mapsUrl} target="_blank" rel="noreferrer">🗺️ Maps</a>
        <a className="svc-btn svc-btn-waze" href={place.wazeUrl} target="_blank" rel="noreferrer">🧭 Waze</a>
      </div>
    </div>
  );
}

export default function NearbyServicesPanel({ location }) {
  const [activeType, setActiveType] = useState('police');
  const [results, setResults] = useState({});
  const [loading, setLoading] = useState({});
  const [errors, setErrors] = useState({});
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [radius, setRadius] = useState(10000);

  useEffect(() => {
    const onOnline = () => setIsOffline(false);
    const onOffline = () => setIsOffline(true);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => { window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline); };
  }, []);

  const fetchServices = useCallback(async (type, r) => {
    if (!location) return;
    setLoading(prev => ({ ...prev, [type]: true }));
    setErrors(prev => ({ ...prev, [type]: null }));
    try {
      const data = await fetchPlaces(location.lat, location.lon, type, r);
      setResults(prev => ({ ...prev, [type]: data }));
    } catch (e) {
      const cacheKey = `gp_${type}_${Math.round(location.lat*100)/100}_${Math.round(location.lon*100)/100}_r${r}`;
      const cached = await cacheGet(cacheKey);
      if (cached) {
        setResults(prev => ({ ...prev, [type]: cached.data }));
        setErrors(prev => ({ ...prev, [type]: '⚠️ Showing cached data (offline)' }));
      } else {
        setErrors(prev => ({ ...prev, [type]: `Failed to load. ${e.message || 'Check internet connection.'}` }));
      }
    } finally {
      setLoading(prev => ({ ...prev, [type]: false }));
    }
  }, [location]);

  useEffect(() => {
    if (location) { setResults(prev => ({ ...prev, [activeType]: undefined })); fetchServices(activeType, radius); }
    // eslint-disable-next-line
  }, [activeType, radius, location?.lat, location?.lon]);

  const handleRefresh = () => { setResults(prev => ({ ...prev, [activeType]: undefined })); fetchServices(activeType, radius); };
  const handleRadiusChange = (r) => { setRadius(r); setResults(prev => ({ ...prev, [activeType]: undefined })); };

  const activeSvc = SERVICE_TYPES.find(s => s.key === activeType);
  const activeResults = results[activeType] || [];
  const isLoading = loading[activeType];
  const error = errors[activeType];

  return (
    <div className="nearby-services-panel">
      {isOffline && <div className="offline-banner">📡 You're offline — showing cached data where available</div>}

      <div className="svc-type-tabs">
        {SERVICE_TYPES.map(svc => (
          <button key={svc.key} className={`svc-type-tab ${activeType === svc.key ? 'active' : ''}`}
            style={activeType === svc.key ? { borderColor: svc.color, color: svc.color, background: svc.bg } : {}}
            onClick={() => setActiveType(svc.key)}>
            <span className="svc-tab-icon">{svc.icon}</span>
            <span className="svc-tab-label">{svc.label}</span>
          </button>
        ))}
      </div>

      <div className="svc-panel-header" style={{ borderColor: activeSvc.color+'44' }}>
        <div>
          <h2 style={{ color: activeSvc.color }}>{activeSvc.icon} {activeSvc.label}</h2>
          <p>{activeSvc.description} near you</p>
        </div>
        <button className="refresh-icon-btn" onClick={handleRefresh} title="Refresh">🔄</button>
      </div>

      <div className="svc-radius-bar">
        <span className="svc-radius-label">🔍 Search radius:</span>
        <div className="svc-radius-btns">
          {RADIUS_OPTIONS.map(opt => (
            <button key={opt.value} className={`svc-radius-btn ${radius === opt.value ? 'active' : ''}`}
              style={radius === opt.value ? { background: activeSvc.color+'33', borderColor: activeSvc.color, color: activeSvc.color } : {}}
              onClick={() => handleRadiusChange(opt.value)}>
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {activeSvc.emergency && (
        <div className="svc-emergency-bar" style={{ background: activeSvc.color+'22', borderColor: activeSvc.color+'55' }}>
          <span>Emergency: </span>
          <a href={`tel:${activeSvc.emergency}`} style={{ color: activeSvc.color }}>📞 Call {activeSvc.emergency} Now</a>
        </div>
      )}

      {!location && (
        <div className="svc-empty">
          <div className="svc-empty-icon">📍</div>
          <h3>Location Required</h3>
          <p>Enable GPS to find nearby {activeSvc.label.toLowerCase()}</p>
        </div>
      )}

      {location && isLoading && (
        <div className="loading-spinner">
          <div className="spinner" style={{ borderTopColor: activeSvc.color }} />
          <span>Finding {activeSvc.label.toLowerCase()} within {RADIUS_OPTIONS.find(o => o.value === radius)?.label}...</span>
        </div>
      )}

      {error && <div className="svc-error">{error}</div>}

      {location && !isLoading && activeResults.length > 0 && (
        <div className="svc-results">
          <div className="svc-results-count" style={{ color: activeSvc.color+'cc' }}>
            Found {activeResults.length} {activeSvc.label.toLowerCase()} within {RADIUS_OPTIONS.find(o => o.value === radius)?.label}
          </div>
          {activeResults.map((place, i) => <ServiceCard key={i} place={place} svcType={activeType} index={i} />)}
          <div className="svc-footer"><span>📡 Data from Google Places · Works in India</span></div>
        </div>
      )}

      {location && !isLoading && !error && activeResults.length === 0 && (
        <div className="svc-empty">
          <div className="svc-empty-icon">{activeSvc.icon}</div>
          <h3>No {activeSvc.label} found within {RADIUS_OPTIONS.find(o => o.value === radius)?.label}</h3>
          <p>Try increasing the search radius above.</p>
          <div style={{ display:'flex', gap:8, justifyContent:'center', flexWrap:'wrap', marginTop:12 }}>
            {RADIUS_OPTIONS.filter(o => o.value > radius).slice(0,2).map(opt => (
              <button key={opt.value} className="svc-radius-btn"
                style={{ background: activeSvc.color+'33', borderColor: activeSvc.color, color: activeSvc.color }}
                onClick={() => handleRadiusChange(opt.value)}>
                Try {opt.label}
              </button>
            ))}
          </div>
          <button className="refresh-icon-btn" style={{ marginTop:12 }} onClick={handleRefresh}>🔄 Try Again</button>
          {activeSvc.emergency && (
            <a href={`tel:${activeSvc.emergency}`} className="emergency-link" style={{ marginTop:12 }}>
              📞 Call {activeSvc.emergency} Emergency
            </a>
          )}
        </div>
      )}
    </div>
  );
}
