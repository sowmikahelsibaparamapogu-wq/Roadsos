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
  { label: '5 km',   value: 5000   },
  { label: '10 km',  value: 10000  },
  { label: '25 km',  value: 25000  },
  { label: '50 km',  value: 50000  },
  { label: '100 km', value: 100000 },
];

// ─── TAG-BASED queries (standard OSM tagging) ───────────────────────────────
const OSM_TAG_QUERIES = {
  police: (lat, lon, r) => `
    [out:json][timeout:25];
    (
      node["amenity"="police"](around:${r},${lat},${lon});
      way["amenity"="police"](around:${r},${lat},${lon});
      relation["amenity"="police"](around:${r},${lat},${lon});
    );
    out center;`,

  hospital: (lat, lon, r) => `
    [out:json][timeout:25];
    (
      node["amenity"="hospital"](around:${r},${lat},${lon});
      way["amenity"="hospital"](around:${r},${lat},${lon});
      node["amenity"="clinic"](around:${r},${lat},${lon});
      way["amenity"="clinic"](around:${r},${lat},${lon});
      node["amenity"="doctors"](around:${r},${lat},${lon});
      node["emergency"="ambulance_station"](around:${r},${lat},${lon});
      node["healthcare"="hospital"](around:${r},${lat},${lon});
      way["healthcare"="hospital"](around:${r},${lat},${lon});
      node["healthcare"="clinic"](around:${r},${lat},${lon});
    );
    out center;`,

  towing: (lat, lon, r) => `
    [out:json][timeout:25];
    (
      node["service"~"towing|vehicle_rescue|breakdown"](around:${r},${lat},${lon});
      way["service"~"towing|vehicle_rescue|breakdown"](around:${r},${lat},${lon});
      node["amenity"="vehicle_rescue"](around:${r},${lat},${lon});
      node["emergency"="towing"](around:${r},${lat},${lon});
      node["shop"="car_repair"](around:${r},${lat},${lon});
      way["shop"="car_repair"](around:${r},${lat},${lon});
      node["craft"="car_repair"](around:${r},${lat},${lon});
      node["amenity"="car_repair"](around:${r},${lat},${lon});
      node["highway"="services"](around:${r},${lat},${lon});
    );
    out center;`,

  puncture: (lat, lon, r) => `
    [out:json][timeout:25];
    (
      node["shop"="tyres"](around:${r},${lat},${lon});
      way["shop"="tyres"](around:${r},${lat},${lon});
      node["shop"="tyre"](around:${r},${lat},${lon});
      node["shop"="tire"](around:${r},${lat},${lon});
      node["craft"="tyre_repairer"](around:${r},${lat},${lon});
      node["shop"="car_repair"](around:${r},${lat},${lon});
      way["shop"="car_repair"](around:${r},${lat},${lon});
      node["craft"="car_repair"](around:${r},${lat},${lon});
      node["amenity"="car_repair"](around:${r},${lat},${lon});
    );
    out center;`,

  showroom: (lat, lon, r) => `
    [out:json][timeout:25];
    (
      node["shop"="car"](around:${r},${lat},${lon});
      way["shop"="car"](around:${r},${lat},${lon});
      node["shop"="motorcycle"](around:${r},${lat},${lon});
      way["shop"="motorcycle"](around:${r},${lat},${lon});
      node["shop"="car_parts"](around:${r},${lat},${lon});
      node["amenity"="car_rental"](around:${r},${lat},${lon});
    );
    out center;`,
};

// ─── NAME-KEYWORD queries (catches Indian shops tagged only with a name) ─────
// These find nodes/ways whose "name" tag contains common keywords.
// Critically important for Indian cities where OSM tagging is sparse.
const OSM_NAME_QUERIES = {
  police: (lat, lon, r) => `
    [out:json][timeout:25];
    (
      node["name"~"police|Police|POLICE|thana|Thana|chowki|Chowki",i](around:${r},${lat},${lon});
      way["name"~"police|Police|POLICE|thana|Thana|chowki|Chowki",i](around:${r},${lat},${lon});
    );
    out center;`,

  hospital: (lat, lon, r) => `
    [out:json][timeout:25];
    (
      node["name"~"hospital|Hospital|clinic|Clinic|nursing|Nursing|medical|Medical|health|Health|PHC|CHC|dispensary|Dispensary|maternity|Maternity",i](around:${r},${lat},${lon});
      way["name"~"hospital|Hospital|clinic|Clinic|nursing|Nursing|medical|Medical|health|Health|PHC|CHC|dispensary|Dispensary|maternity|Maternity",i](around:${r},${lat},${lon});
    );
    out center;`,

  towing: (lat, lon, r) => `
    [out:json][timeout:25];
    (
      node["name"~"towing|Towing|crane|Crane|recovery|Recovery|breakdown|Breakdown|vehicle rescue|garage|Garage|auto repair|Auto Repair|workshop|Workshop|mechanic|Mechanic",i](around:${r},${lat},${lon});
      way["name"~"towing|Towing|crane|Crane|recovery|Recovery|breakdown|Breakdown|vehicle rescue|garage|Garage|auto repair|Auto Repair|workshop|Workshop|mechanic|Mechanic",i](around:${r},${lat},${lon});
    );
    out center;`,

  puncture: (lat, lon, r) => `
    [out:json][timeout:25];
    (
      node["name"~"puncture|Puncture|tyre|Tyre|tire|Tire|wheel|Wheel|tube|Tube|vulcanizing|Vulcanizing|tires|Tires",i](around:${r},${lat},${lon});
      way["name"~"puncture|Puncture|tyre|Tyre|tire|Tire|wheel|Wheel|tube|Tube|vulcanizing|Vulcanizing|tires|Tires",i](around:${r},${lat},${lon});
    );
    out center;`,

  showroom: (lat, lon, r) => `
    [out:json][timeout:25];
    (
      node["name"~"showroom|Showroom|motors|Motors|automobile|Automobile|auto|Auto|dealer|Dealer|Hero|Honda|Bajaj|TVS|Suzuki|Yamaha|Royal Enfield|Maruti|Hyundai|Tata|Mahindra|KIA|Toyota|Ford|Volkswagen",i](around:${r},${lat},${lon});
      way["name"~"showroom|Showroom|motors|Motors|automobile|Automobile|auto|Auto|dealer|Dealer|Hero|Honda|Bajaj|TVS|Suzuki|Yamaha|Royal Enfield|Maruti|Hyundai|Tata|Mahindra|KIA|Toyota|Ford|Volkswagen",i](around:${r},${lat},${lon});
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

// ─── IndexedDB cache ─────────────────────────────────────────────────────────
const DB_NAME = 'roadsos_cache';
const DB_VER  = 1;

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
    req.onerror   = () => rej(req.error);
  });
}

async function cacheGet(key) {
  try {
    const db = await openDB();
    return new Promise(res => {
      const tx  = db.transaction('services', 'readonly');
      const req = tx.objectStore('services').get(key);
      req.onsuccess = () => res(req.result || null);
      req.onerror   = () => res(null);
    });
  } catch { return null; }
}

async function cacheSet(key, data) {
  try {
    const db = await openDB();
    return new Promise(res => {
      const tx = db.transaction('services', 'readwrite');
      tx.objectStore('services').put({ cacheKey: key, data, ts: Date.now() });
      tx.oncomplete = () => res();
    });
  } catch { }
}

// ─── Parse raw Overpass elements into place objects ──────────────────────────
function parseElements(elements, type, userLat, userLon) {
  const seen   = new Set();
  const places = [];

  for (const el of (elements || [])) {
    const elat = el.lat ?? el.center?.lat;
    const elon = el.lon ?? el.center?.lon;
    if (!elat || !elon) continue;

    const dedupeKey = `${Math.round(elat * 1000)}_${Math.round(elon * 1000)}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const tags = el.tags || {};
    const name = tags.name
      || tags['name:en']
      || tags['name:te']
      || tags['name:hi']
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

    const shopType = tags.shop || tags.amenity || tags.craft || tags.service || tags.healthcare || '';
    const typeLabel = shopType ? shopType.replace(/_/g, ' ') : '';

    places.push({
      name,
      phone,
      address,
      typeLabel,
      dist: parseFloat(haversine(userLat, userLon, elat, elon)),
      lat: elat,
      lon: elon,
      mapsUrl: `https://maps.google.com/?q=${elat},${elon}`,
      wazeUrl: `https://waze.com/ul?ll=${elat},${elon}&navigate=yes`,
    });
  }

  return places;
}

// ─── Single Overpass fetch helper ────────────────────────────────────────────
async function overpassFetch(query) {
  // Try primary, fall back to mirror if it fails
  const endpoints = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
  ];

  for (const url of endpoints) {
    try {
      const resp = await fetch(url, {
        method:  'POST',
        body:    `data=${encodeURIComponent(query)}`,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
      if (!resp.ok) continue;
      const json = await resp.json();
      return json.elements || [];
    } catch {
      // try next endpoint
    }
  }
  throw new Error('Overpass API unavailable. Check internet connection.');
}

// ─── Main fetch: runs TAG query + NAME query in parallel, merges results ─────
async function fetchOSM(lat, lon, type, radius = 10000) {
  const roundedLat = Math.round(lat * 100) / 100;
  const roundedLon = Math.round(lon * 100) / 100;
  const cacheKey   = `${type}_${roundedLat}_${roundedLon}_r${radius}`;
  const CACHE_TTL  = 30 * 60 * 1000; // 30 min

  const cached = await cacheGet(cacheKey);
  if (cached && (Date.now() - cached.ts) < CACHE_TTL) {
    return cached.data;
  }

  // Run both tag-based and name-based queries in parallel
  const [tagElements, nameElements] = await Promise.all([
    overpassFetch(OSM_TAG_QUERIES[type](lat, lon, radius)),
    overpassFetch(OSM_NAME_QUERIES[type](lat, lon, radius)),
  ]);

  // Merge & parse, deduplication handled inside parseElements
  const allElements = [...tagElements, ...nameElements];
  const places = parseElements(allElements, type, lat, lon);

  // Sort by distance, take top 15
  places.sort((a, b) => a.dist - b.dist);
  const top = places.slice(0, 15);

  await cacheSet(cacheKey, top);
  return top;
}

// ─── ServiceCard component ────────────────────────────────────────────────────
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

// ─── Main Panel ───────────────────────────────────────────────────────────────
export default function NearbyServicesPanel({ location, apiUrl }) {
  const [activeType, setActiveType] = useState('police');
  const [results,    setResults]    = useState({});
  const [loading,    setLoading]    = useState({});
  const [errors,     setErrors]     = useState({});
  const [isOffline,  setIsOffline]  = useState(!navigator.onLine);
  const [radius,     setRadius]     = useState(10000);

  useEffect(() => {
    const onOnline  = () => setIsOffline(false);
    const onOffline = () => setIsOffline(true);
    window.addEventListener('online',  onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online',  onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  const fetchServices = useCallback(async (type, r) => {
    if (!location) return;

    setLoading(prev => ({ ...prev, [type]: true }));
    setErrors( prev => ({ ...prev, [type]: null }));

    try {
      const data = await fetchOSM(location.lat, location.lon, type, r);
      setResults(prev => ({ ...prev, [type]: data }));
    } catch (e) {
      // Try serving stale cache on error
      const roundedLat = Math.round(location.lat * 100) / 100;
      const roundedLon = Math.round(location.lon * 100) / 100;
      const cacheKey   = `${type}_${roundedLat}_${roundedLon}_r${r}`;
      const cached     = await cacheGet(cacheKey);
      if (cached) {
        setResults(prev => ({ ...prev, [type]: cached.data }));
        setErrors( prev => ({ ...prev, [type]: '⚠️ Showing cached data (offline)' }));
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
    setResults(prev => ({ ...prev, [activeType]: undefined }));
  };

  const activeSvc     = SERVICE_TYPES.find(s => s.key === activeType);
  const activeResults = results[activeType] || [];
  const isLoading     = loading[activeType];
  const error         = errors[activeType];

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
