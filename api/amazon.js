// Vercel Serverless Function - Amazon Advertising API Proxy
// Handles token refresh + API calls, bypassing CORS restrictions

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    const { action, refreshToken, clientId, clientSecret, profileId, endpoint, params } = req.body;

    // Step 1: Get access token
    const tokenRes = await fetch('https://api.amazon.com/auth/o2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret
      })
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) return res.status(401).json({ error: 'Token refresh failed', details: tokenData });

    const accessToken = tokenData.access_token;
    const headers = {
      'Authorization': 'Bearer ' + accessToken,
      'Amazon-Advertising-API-ClientId': clientId,
      'Content-Type': 'application/json'
    };
    if (profileId) headers['Amazon-Advertising-API-Scope'] = profileId;

    // Action: get profiles
    if (action === 'profiles') {
      const r = await fetch('https://advertising-api.amazon.com/v2/profiles', { headers });
      const data = await r.json();
      return res.status(200).json(data);
    }

    // Action: get SP campaigns
    if (action === 'sp-campaigns') {
      const body = { maxResults: 100 };
      const r = await fetch('https://advertising-api.amazon.com/sp/campaigns/list', {
        method: 'POST', headers, body: JSON.stringify(body)
      });
      const data = await r.json();
      return res.status(200).json(data);
    }

    // Action: get SB campaigns
    if (action === 'sb-campaigns') {
      const r = await fetch('https://advertising-api.amazon.com/sb/v4/campaigns/list', {
        method: 'POST', headers, body: JSON.stringify({ maxResults: 100 })
      });
      const data = await r.json();
      return res.status(200).json(data);
    }

    // Action: get SD campaigns
    if (action === 'sd-campaigns') {
      const r = await fetch('https://advertising-api.amazon.com/sd/campaigns', { headers });
      const data = await r.json();
      return res.status(200).json(data);
    }

    // Action: generic proxy
    if (action === 'proxy' && endpoint) {
      const method = params?.method || 'GET';
      const opts = { method, headers };
      if (params?.body) opts.body = JSON.stringify(params.body);
      const r = await fetch('https://advertising-api.amazon.com' + endpoint, opts);
      const data = await r.json();
      return res.status(200).json(data);
    }

    return res.status(400).json({ error: 'Invalid action' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
