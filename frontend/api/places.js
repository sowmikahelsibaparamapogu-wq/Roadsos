function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371, d2r = Math.PI / 180;
  const dLat = (lat2 - lat1) * d2r, dLon = (lon2 - lon1) * d2r;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*d2r)*Math.cos(lat2*d2r)*Math.sin(dLon/2)**2;
  return parseFloat((R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))).toFixed(2));
}

// Map keywords to OSM amenity/shop tags
function buildOverpassQuery(lat, lon, keyword, radius) {
  const kw = keyword.toLowerCase();
  const r = Math.min(radius, 100000);
  const around = `(around:${r},${lat},${lon})`;

  if (kw.includes('police')) {
    return `[out:json][timeout:25];(node["amenity"="police"]${around};way["amenity"="police"]${around};);out center 20;`;
  } else if (kw.includes('hospital') || kw.includes('clinic')) {
    return `[out:json][timeout:25];(node["amenity"~"hospital|clinic|doctors"]${around};way["amenity"~"hospital|clinic|doctors"]${around};);out center 20;`;
  } else if (kw.includes('tow') || kw.includes('car repair') || kw.includes('garage')) {
    return `[out:json][timeout:25];(node["shop"~"car_repair|tyres|vehicle"]${around};way["shop"~"car_repair|tyres|vehicle"]${around};node["amenity"="car_repair"]${around};);out center 20;`;
  } else if (kw.includes('puncture') || kw.includes('tyre') || kw.includes('tire')) {
    return `[out:json][timeout:25];(node["shop"~"tyres|car_repair"]${around};way["shop"~"tyres|car_repair"]${around};);out center 20;`;
  } else if (kw.includes('showroom') || kw.includes('dealer') || kw.includes('automobile')) {
    return `[out:json][timeout:25];(node["shop"~"car|motorcycle|vehicle"]${around};way["shop"~"car|motorcycle|vehicle"]${around};);out center 20;`;
  } else {
    return `[out:json][timeout:25];(node["name"~"${keyword}",i]${around};);out center 15;`;
  }
}

async function fetchOverpass(query) {
  const servers = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  ];
  for (const server of servers) {
    try {
      const resp = await fetch(server, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(20000),
      });
      if (!resp.ok) continue;
      const data = await resp.json();
      if (data.elements) return data.elements;
    } catch { continue; }
  }
  throw new Error('All Overpass servers failed');
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { lat, lon, keyword, radius } = req.body;

    const query = buildOverpassQuery(lat, lon, keyword, radius);
    const elements = await fetchOverpass(query);

    const results = elements
      .map(el => {
        const elat = el.lat ?? el.center?.lat;
        const elon = el.lon ?? el.center?.lon;
        if (!elat || !elon) return null;
        const tags = el.tags || {};
        const name = tags.name || tags['name:en'] || tags.amenity || tags.shop || 'Unknown';
        const phone = tags.phone || tags['contact:phone'] || tags['contact:mobile'] || '';
        const address = [tags['addr:housenumber'], tags['addr:street'], tags['addr:city']]
          .filter(Boolean).join(', ') || tags['addr:full'] || '';
        return {
          name,
          geometry: { location: { lat: elat, lng: elon } },
          vicinity: address,
          formatted_phone_number: phone,
          types: [tags.amenity || tags.shop || ''],
          rating: null,
          place_id: `osm_${el.type}_${el.id}`,
          dist: haversine(lat, lon, elat, elon),
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 15);

    return res.status(200).json({ results });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
