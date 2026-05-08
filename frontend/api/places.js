export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { lat, lon, keyword, radius } = req.body;
    const key = process.env.FOURSQUARE_API_KEY;
    if (!key) return res.status(500).json({ error: 'API key not configured' });

    const url = `https://api.foursquare.com/v3/places/search?query=${encodeURIComponent(keyword)}&ll=${lat},${lon}&radius=${Math.min(radius, 100000)}&limit=15&fields=name,location,geocodes,categories,distance,tel`;

    const resp = await fetch(url, {
      headers: {
        'Authorization': key,
        'Accept': 'application/json'
      }
    });

    const data = await resp.json();

    // Convert Foursquare format → Google Places format so NearbyServicesPanel works unchanged
    const results = (data.results || []).map(place => ({
      name: place.name,
      geometry: { location: { lat: place.geocodes?.main?.latitude, lng: place.geocodes?.main?.longitude } },
      vicinity: [place.location?.address, place.location?.locality].filter(Boolean).join(', '),
      formatted_phone_number: place.tel || '',
      types: place.categories?.map(c => c.name.toLowerCase().replace(/ /g, '_')) || [],
      rating: null,
      place_id: place.fsq_id,
    }));

    return res.status(200).json({ results });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
