import React, { useState, useEffect, useCallback } from 'react';

const SERVICE_TYPES = [
  {
    key: 'police',
    label: 'Police Stations',
    icon: '🚔',
    color: '#3b82f6',
    bg: '#1e3a5f',
    emergency: '100',
    description: 'Nearest police stations',
  },
  {
    key: 'hospital',
    label: 'Hospitals & Ambulance',
    icon: '🏥',
    color: '#ef4444',
    bg: '#5f1e1e',
    emergency: '108',
    description: 'Emergency medical services',
  },
  {
    key: 'towing',
    label: 'Towing Services',
    icon: '🚛',
    color: '#f59e0b',
    bg: '#5f3e1e',
    emergency: null,
    description: 'Vehicle towing & recovery',
  },
  {
    key: 'puncture',
    label: 'Puncture / Tyre Shops',
    icon: '🔧',
    color: '#10b981',
    bg: '#1e3d2f',
    emergency: null,
    description: 'Tyre puncture repair shops',
  },
  {
    key: 'showroom',
    label: 'Vehicle Showrooms',
    icon: '🏢',
    color: '#8b5cf6',
    bg: '#2d1e5f',
    emergency: null,
    description: 'Nearest car/bike showrooms',
  },
];

// Radius options in metres
const RADIUS_OPTIONS = [
  { label: '5 km',  value: 5000  },
  { label: '10 km', value: 10000 },
  { label: '25 km', value: 25000 },
  { label: '50 km', value: 50000 },
  { label: '100 km',value: 100000},
];

const OSM_QUERIES = {
  police: (lat, lon, r) => `
    [out:json][timeout:30];
    (
      node["amenity"="police"](around:${r},${lat},${lon});
      way["amenity"="police"](around:${r},${lat},${lon});
      relation["amenity"="police"](around:${r},${lat},${lon});
    );
    out center;`,

  hospital: (lat, lon, r) => `
    [out:json][timeout:30];
    (
      node["amenity"="hospital"](around:${r},${lat},${lon});
      way["amenity"="hospital"](around:${r},${lat},${lon});
      node["amenity"="clinic"](around:${Math.floor(r/2)},${lat},${lon});
      node["emergency"="ambulance_station"](around:${r},${lat},${lon});
      node["healthcare"="hospital"](around:${r},${lat},${lon});
      way["healthcare"="hospital"](around:${r},${lat},${lon});
    );
    out center;`,

  // FIXED: Much broader towing query covering all common OSM tagging patterns
  towing: (lat, lon, r) => `
    [out:json][timeout:30];
    (
      node["service"~"towing|vehicle_rescue|breakdown"](around:${r},${lat},${lon});
      way["service"~"towing|vehicle_rescue|breakdown"](around:${r},${lat},${lon});
      node["amenity"="vehicle_rescue"](around:${r},${lat},${lon});
      node["emergency"="towing"](around:${r},${lat},${lon});
      node["shop"="car_repair"]["service:towing"~"yes|emergency"](around:${r},${lat},${lon});
      node["shop"="car_repair"]["towing"="yes"](around:${r},${lat},${lon});
      node["shop"="car_repair"](around:${r},${lat},${lon});
      way["shop"="car_repair"](around:${r},${lat},${lon});
      node["craft"="car_repair"](around:${r},${lat},${lon});
      node["amenity"="car_repair"](around:${r},${lat},${lon});
      node["highway"="services"](around:${r},${lat},${lon});
    );
    out center;`,

  // FIXED: Much broader puncture/tyre query — covers Indian, UK, US OSM tagging
  puncture: (lat, lon, r) => `
    [out:json][timeout:30];
    (
      node["shop"="tyres"](around:${r},${lat},${lon});
      way["shop"="tyres"](around:${r},${lat},${lon});
      node["shop"="tyre"](around:${r},${lat},${lon});
      way["shop"="tyre"](around:${r},${lat},${lon});
      node["shop"="tire"](around:${r},${lat},${lon});
      way["shop"="tire"](around:${r},${lat},${lon});
      node["craft"="tyre_repairer"](around:${r},${lat},${lon});
      node["repair"~"tyres|tyre|tire|tires|puncture"](around:${r},${lat},${lon});
      node["service"~"tyres|tyre|tire|puncture"](around:${r},${lat},${lon});
      node["shop"="car_repair"]["service:tyres"="yes"](around:${r},${lat},${lon});
      node["shop"="car_repair"]["service:tyre_repair"="yes"](around:${r},${lat},${lon});
      node["shop"="car_repair"](around:${r},${lat},${lon});
      way["shop"="car_repair"](around:${r},${lat},${lon});
      node["amenity"="car_repair"](around:${r},${lat},${lon});
      node["craft"="car_repair"](around:${r},${lat},${lon});
    );
    out center;`,

  showroom: (lat, lon, r) => `
    [out:json][timeout:30];
    (
      node["shop"="car"](around:${r},${lat},${lon});
      node["shop"="motorcycle"](around:${r},${lat},${lon});
      node["amenity"="car_rental"](around:${r},${lat},${lon});
      way["shop"="car"](around:${r},${lat},${lon});
      way["shop"="motorcycle"](around:${r},${lat},${lon});
      node["shop"="car_parts"](around:${r},${lat},${lon});
    );
    out center;`,
};

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const d2r = Math.PI / 180;
  const dLat = (lat2 - lat1) * d2r;
  const dLon = (lon2 - lon1) * d2r;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * d2r) * Math.cos(lat2 * d2r) * Math.sin(dLon / 2) ** 2;
  return (R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))).toFixed(2);
}

// IndexedDB offline cache
const DB_NAME = 'roadsos_cache';
const DB_VER = 1;

function openDB() {
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('services')) {
        db.createObjectStore('services', { keyPath: 'cacheKey' });
      }
    };
    req.onsuccess = e => res(e.target.result);
    req.onerror = () => rej(req.error);
  });
}

async function cacheGet(key) {
  try {
    const db = await openDB();
    return new Promise((res) => {
      const tx = db.transaction('services', 'readonly');
      const req = tx.objectStore('services').get(key);
      req.onsuccess = () => res(req.result || null);
      req.onerror = () => res(null);
    });
  } catch { return null; }
}

async function cacheSet(key, data) {
  try {
    const db = await openDB();
    return new Promise((res) => {
      const tx = db.transaction('services', 'readwrite');
      tx.objectStore('services').put({ cacheKey: key, data, ts: Date.now() });
      tx.oncomplete = () => res();
    });
  } catch { }
}

// FIX: Cache key now includes radius so expanding search always fetches fresh
async function fetchOSM(lat, lon, type, radius = 10000) {
  const roundedLat = Math.round(lat * 100) / 100;
  const roundedLon = Math.round(lon * 100) / 100;
  const cacheKey = `${type}_${roundedLat}_${roundedLon}_r${radius}`;
  const cached = await cacheGet(cacheKey);
  const CACHE_TTL = 30 * 60 * 1000; // 30 min

  if (cached && (Date.now() - cached.ts) < CACHE_TTL) {
    return cached.data;
  }

  const query = OSM_QUERIES[type](lat, lon, radius);
  const resp = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    body: `data=${encodeURIComponent(query)}`,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  if (!resp.ok) throw new Error(`Overpass API error: ${resp.status}`);

  const json = await resp.json();

  const places = [];
  const seen = new Set();

  for (const el of (json.elements || [])) {
    const elat = el.lat ?? el.center?.lat;
    const elon = el.lon ?? el.center?.lon;
    if (!elat || !elon) continue;

    // Deduplicate by rounded coordinates
    const dedupeKey = `${Math.round(elat * 1000)}_${Math.round(elon * 1000)}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const tags = el.tags || {};
    const name = tags.name
      || tags['name:en']
      || tags['name:te']
      || tags['name:hi']
      || tags['name:ar']
      || tags['operator']
      || `${type.charAt(0).toUpperCase() + type.slice(1)} Service`;

    const phone = tags.phone
      || tags.telephone
      || tags['contact:phone']
      || tags['contact:mobile']
      || tags['contact:telephone']
      || tags['phone:mobile']
      || '';

    const address = [
      tags['addr:housenumber'],
      tags['addr:street'],
      tags['addr:city'],
      tags['addr:state'],
    ].filter(Boolean).join(', ');

    const dist = haversine(lat, lon, elat, elon);

    // Determine a label describing the type of place
    const shopType = tags.shop || tags.amenity || tags.craft || tags.service || '';
    const typeLabel = shopType
      ? shopType.replace(/_/g, ' ')
      : '';

    places.push({
      name,
      phone,
      address,
      typeLabel,
      dist: parseFloat(dist),
      lat: elat,
      lon: elon,
      mapsUrl: `https://maps.google.com/?q=${elat},${elon}`,
      wazeUrl: `https://waze.com/ul?ll=${elat},${elon}&navigate=yes`,
    });
  }

  places.sort((a, b) => a.dist - b.dist);
  const top = places.slice(0, 10);
  await cacheSet(cacheKey, top);
  return top;
}

function ServiceCard({ place, svcType, index }) {
  const svc = SERVICE_TYPES.find(s => s.key === svcType);
  return (
    <div
      className={`svc-card ${index === 0 ? 'svc-card-nearest' : ''}`}
      style={{ borderColor: index === 0 ? svc.color + '88' : '#2a2d3a' }}
    >
      {index === 0 && (
        <div className="svc-nearest-badge" style={{ background: svc.color }}>📍 Nearest</div>
      )}
      <div className="svc-card-top">
        <div className="svc-card-name">{place.name}</div>
        <div className="svc-card-dist" style={{ color: svc.color }}>{place.dist} km</div>
      </div>
      {place.typeLabel && (
        <div className="svc-card-type" style={{ color: svc.color + 'aa', fontSize: '0.72rem', marginBottom: 2 }}>
          {place.typeLabel}
        </div>
      )}
      {place.address && <div className="svc-card-addr">📍 {place.address}</div>}
      <div className="svc-card-actions">
        {place.phone ? (
          <a
            className="svc-btn svc-btn-call"
            href={`tel:${place.phone}`}
            style={{ background: svc.color + '22', borderColor: svc.color + '55', color: svc.color }}
          >
            📞 Call
          </a>
        ) : svc.emergency ? (
          <a
            className="svc-btn svc-btn-call"
            href={`tel:${svc.emergency}`}
            style={{ background: svc.color + '22', borderColor: svc.color + '55', color: svc.color }}
          >
            📞 {svc.emergency}
          </a>
        ) : null}
        <a className="svc-btn svc-btn-maps" href={place.mapsUrl} target="_blank" rel="noreferrer">
          🗺️ Maps
        </a>
        <a className="svc-btn svc-btn-waze" href={place.wazeUrl} target="_blank" rel="noreferrer">
          🧭 Waze
        </a>
      </div>
    </div>
  );
}

export default function NearbyServicesPanel({ location }) {
  const [activeType, setActiveType]   = useState('police');
  const [results, setResults]         = useState({});
  const [loading, setLoading]         = useState({});
  const [errors, setErrors]           = useState({});
  const [isOffline, setIsOffline]     = useState(!navigator.onLine);
  // Radius state — default 10 km, user can increase
  const [radius, setRadius]           = useState(10000);

  useEffect(() => {
    const onOnline  = () => setIsOffline(false);
    const onOffline = () => setIsOffline(true);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  const fetchServices = useCallback(async (type, r) => {
    if (!location) return;

    setLoading(prev => ({ ...prev, [type]: true }));
    setErrors(prev => ({ ...prev, [type]: null }));

    try {
      const data = await fetchOSM(location.lat, location.lon, type, r);
      setResults(prev => ({ ...prev, [type]: data }));
    } catch (e) {
      const roundedLat = Math.round(location.lat * 100) / 100;
      const roundedLon = Math.round(location.lon * 100) / 100;
      const cacheKey = `${type}_${roundedLat}_${roundedLon}_r${r}`;
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

  // Fetch when tab or radius changes
  useEffect(() => {
    if (location) {
      // Clear current results so fresh fetch runs
      setResults(prev => ({ ...prev, [activeType]: undefined }));
      fetchServices(activeType, radius);
    }
    // eslint-disable-next-line
  }, [activeType, radius, location?.lat, location?.lon]);

  const handleRefresh = () => {
    setResults(prev => ({ ...prev, [activeType]: undefined }));
    fetchServices(activeType, radius);
  };

  const handleRadiusChange = (newRadius) => {
    setRadius(newRadius);
    // Clear result for active type so it re-fetches with new radius
    setResults(prev => ({ ...prev, [activeType]: undefined }));
  };

  const activeSvc      = SERVICE_TYPES.find(s => s.key === activeType);
  const activeResults  = results[activeType] || [];
  const isLoading      = loading[activeType];
  const error          = errors[activeType];

  return (
    <div className="nearby-services-panel">
      {/* Offline Banner */}
      {isOffline && (
        <div className="offline-banner">
          📡 You're offline — showing cached data where available
        </div>
      )}

      {/* Service Type Tabs */}
      <div className="svc-type-tabs">
        {SERVICE_TYPES.map(svc => (
          <button
            key={svc.key}
            className={`svc-type-tab ${activeType === svc.key ? 'active' : ''}`}
            style={activeType === svc.key
              ? { borderColor: svc.color, color: svc.color, background: svc.bg }
              : {}}
            onClick={() => setActiveType(svc.key)}
          >
            <span className="svc-tab-icon">{svc.icon}</span>
            <span className="svc-tab-label">{svc.label}</span>
          </button>
        ))}
      </div>

      {/* Panel Header */}
      <div className="svc-panel-header" style={{ borderColor: activeSvc.color + '44' }}>
        <div>
          <h2 style={{ color: activeSvc.color }}>{activeSvc.icon} {activeSvc.label}</h2>
          <p>{activeSvc.description} near you</p>
        </div>
        <button className="refresh-icon-btn" onClick={handleRefresh} title="Refresh">🔄</button>
      </div>

      {/* Radius Selector */}
      <div className="svc-radius-bar">
        <span className="svc-radius-label">🔍 Search radius:</span>
        <div className="svc-radius-btns">
          {RADIUS_OPTIONS.map(opt => (
            <button
              key={opt.value}
              className={`svc-radius-btn ${radius === opt.value ? 'active' : ''}`}
              style={radius === opt.value
                ? { background: activeSvc.color + '33', borderColor: activeSvc.color, color: activeSvc.color }
                : {}}
              onClick={() => handleRadiusChange(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Emergency Quick Call */}
      {activeSvc.emergency && (
        <div className="svc-emergency-bar"
          style={{ background: activeSvc.color + '22', borderColor: activeSvc.color + '55' }}>
          <span>Emergency: </span>
          <a href={`tel:${activeSvc.emergency}`} style={{ color: activeSvc.color }}>
            📞 Call {activeSvc.emergency} Now
          </a>
        </div>
      )}

      {/* No Location */}
      {!location && (
        <div className="svc-empty">
          <div className="svc-empty-icon">📍</div>
          <h3>Location Required</h3>
          <p>Enable GPS to find nearby {activeSvc.label.toLowerCase()}</p>
        </div>
      )}

      {/* Loading */}
      {location && isLoading && (
        <div className="loading-spinner">
          <div className="spinner" style={{ borderTopColor: activeSvc.color }} />
          <span>Finding {activeSvc.label.toLowerCase()} within {RADIUS_OPTIONS.find(o => o.value === radius)?.label}...</span>
        </div>
      )}

      {/* Error */}
      {error && <div className="svc-error">{error}</div>}

      {/* Results */}
      {location && !isLoading && activeResults.length > 0 && (
        <div className="svc-results">
          <div className="svc-results-count" style={{ color: activeSvc.color + 'cc' }}>
            Found {activeResults.length} {activeSvc.label.toLowerCase()} within {RADIUS_OPTIONS.find(o => o.value === radius)?.label}
          </div>
          {activeResults.map((place, i) => (
            <ServiceCard key={i} place={place} svcType={activeType} index={i} />
          ))}
          <div className="svc-footer">
            <span>📡 Data from OpenStreetMap · Works globally</span>
          </div>
        </div>
      )}

      {/* No Results */}
      {location && !isLoading && !error && activeResults.length === 0 && (
        <div className="svc-empty">
          <div className="svc-empty-icon">{activeSvc.icon}</div>
          <h3>No {activeSvc.label} found within {RADIUS_OPTIONS.find(o => o.value === radius)?.label}</h3>
          <p>Try increasing the search radius above.</p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginTop: 12 }}>
            {RADIUS_OPTIONS.filter(o => o.value > radius).slice(0, 2).map(opt => (
              <button
                key={opt.value}
                className="svc-radius-btn"
                style={{ background: activeSvc.color + '33', borderColor: activeSvc.color, color: activeSvc.color }}
                onClick={() => handleRadiusChange(opt.value)}
              >
                Try {opt.label}
              </button>
            ))}
          </div>
          <button className="refresh-icon-btn" style={{ marginTop: 12 }} onClick={handleRefresh}>🔄 Try Again</button>
          {activeSvc.emergency && (
            <a href={`tel:${activeSvc.emergency}`} className="emergency-link" style={{ marginTop: 12 }}>
              📞 Call {activeSvc.emergency} Emergency
            </a>
          )}
        </div>
      )}
    </div>
  );
}
