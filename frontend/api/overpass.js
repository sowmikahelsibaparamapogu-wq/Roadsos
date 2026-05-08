export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { query } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    // Cap radius to 25km to prevent timeouts
    const safeQuery = query.replace(/\(around:(\d+)/g, (match, radius) => {
      return `(around:${Math.min(parseInt(radius), 25000)}`;
    });

    const endpoints = [
      'https://overpass-api.de/api/interpreter',
      'https://overpass.kumi.systems/api/interpreter',
      'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
      'https://overpass.openstreetmap.ru/api/interpreter',
    ];

    for (const url of endpoints) {
      try {
        const resp = await fetch(url, {
          method: 'POST',
          body: `data=${encodeURIComponent(safeQuery)}`,
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          signal: AbortSignal.timeout(12000),
        });

        if (!resp.ok) continue;

        const json = await resp.json();
        return res.status(200).json(json);
      } catch {
        continue;
      }
    }

    return res.status(503).json({ error: 'Overpass API unavailable. Check internet connection.' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
