export default function handler(req, res) {
  // Only allow GET
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  res.status(200).json({
    jsonbinId:     process.env.JSONBIN_BIN_ID,
    jsonbinKey:    process.env.JSONBIN_MASTER_KEY,
    imgbbKey:      process.env.IMGBB_KEY,
    mapboxToken:   process.env.MAPBOX_TOKEN,
    adminPassword: process.env.ADMIN_PASSWORD,
  });
}