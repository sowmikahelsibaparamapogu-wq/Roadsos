export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { lat, lon, keyword, radius } = req.body;
    const key = process.env.FOURSQUARE_API_KEY;
    if (!key) return res.status(500).json({ error: 'API key not configured' });

    // Map keywords to Foursquare category IDs for better results in India
    const categoryMap = {
      'police station': '19050',        // Police Station
      'hospital': '15014',              // Hospital
      'clinic': '15014',
      'towing service': '11134',        // Automotive Shop
      'car repair garage': '11134',
      'puncture shop': '11134',
      'tyre shop': '11134',
      'tire repair': '11134',
      'car showroom': '11100',          // Car Dealership
      'bike showroom': '11100',
      'automobile dealer': '11100',
    };

    const categoryId = categoryMap[keyword.toLowerCase()];
    
    let url;
    if (categoryId) {
      url = `https://api.foursquare.com/v3/places/search?categories=${categoryId}&ll=${lat},${lon}&radius=${Math.min(radius, 100000)}&limit=15&fields=name,location,geocodes,categories,distance,tel,fsq_id`;
    } else {
      url = `https://api.foursquare.com/v3/places/search?query=${encodeURIComponent(keyword)}&ll=${lat},${lon}&radius=${Math.min(radius, 100000)}&limit=15&fields=name,location,geocodes,categories,distance,tel,fsq_id`;
    }

    const resp = await fetch(url, {
      headers: {
        'Authorization': key,
        'Accept': 'application/json'
      }
    });

    const data = await resp.json();

    const results = (data.results || []).map(place => ({
      name: place.name,
      geometry: {
        location: {
          lat: place.geocodes?.main?.latitude,
          lng: place.geocodes?.main?.longitude
        }
      },
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
