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
    const baseHeaders = {
      'Authorization': 'Bearer ' + accessToken,
      'Amazon-Advertising-API-ClientId': clientId
    };
    if (profileId) baseHeaders['Amazon-Advertising-API-Scope'] = profileId;

    // Action: get profiles
    if (action === 'profiles') {
      const r = await fetch('https://advertising-api.amazon.com/v2/profiles', { headers: { ...baseHeaders, 'Content-Type': 'application/json' } });
      const data = await r.json();
      return res.status(200).json(data);
    }

    // Action: get SP campaigns (v3)
    if (action === 'sp-campaigns') {
      const spHeaders = { ...baseHeaders, 'Accept': 'application/vnd.spcampaign.v3+json', 'Content-Type': 'application/vnd.spcampaign.v3+json' };
      const r = await fetch('https://advertising-api.amazon.com/sp/campaigns/list', {
        method: 'POST', headers: spHeaders, body: JSON.stringify({ maxResults: 100 })
      });
      const data = await r.json();
      return res.status(200).json(data);
    }

    // Action: get SB campaigns (v4)
    if (action === 'sb-campaigns') {
      const sbHeaders = { ...baseHeaders, 'Accept': 'application/vnd.sbcampaignresource.v4+json', 'Content-Type': 'application/vnd.sbcampaignresource.v4+json' };
      const r = await fetch('https://advertising-api.amazon.com/sb/v4/campaigns/list', {
        method: 'POST', headers: sbHeaders, body: JSON.stringify({ maxResults: 100 })
      });
      const data = await r.json();
      return res.status(200).json(data);
    }

    // Action: get SD campaigns
    if (action === 'sd-campaigns') {
      const sdHeaders = { ...baseHeaders, 'Accept': 'application/json', 'Content-Type': 'application/json' };
      const r = await fetch('https://advertising-api.amazon.com/sd/campaigns', { headers: sdHeaders });
      const data = await r.json();
      return res.status(200).json(data);
    }

    // Action: SP campaign report (performance data)
    if (action === 'sp-report') {
      const rpHeaders = { ...baseHeaders, 'Accept': 'application/vnd.createasyncreportrequest.v3+json', 'Content-Type': 'application/vnd.createasyncreportrequest.v3+json' };
      const startDate = params?.startDate || new Date(Date.now() - 7*24*60*60*1000).toISOString().split('T')[0];
      const endDate = params?.endDate || new Date().toISOString().split('T')[0];
      const body = {
        name: 'SP Campaign Report',
        startDate, endDate,
        configuration: {
          adProduct: 'SPONSORED_PRODUCTS',
          groupBy: ['campaign'],
          columns: ['campaignName','campaignId','campaignStatus','campaignBudgetAmount','impressions','clicks','cost','purchases1d','sales1d'],
          reportTypeId: 'spCampaigns',
          timeUnit: 'SUMMARY',
          format: 'GZIP_JSON'
        }
      };
      const r = await fetch('https://advertising-api.amazon.com/reporting/reports', {
        method: 'POST', headers: rpHeaders, body: JSON.stringify(body)
      });
      const data = await r.json();
      return res.status(200).json(data);
    }

    // Action: check report status
    if (action === 'report-status') {
      const rsHeaders = { ...baseHeaders, 'Accept': 'application/vnd.createasyncreportrequest.v3+json', 'Content-Type': 'application/json' };
      const r = await fetch('https://advertising-api.amazon.com/reporting/reports/' + params.reportId, { headers: rsHeaders });
      const data = await r.json();
      return res.status(200).json(data);
    }

    // Action: download report
    if (action === 'report-download') {
      const dlHeaders = { ...baseHeaders, 'Accept': '*/*' };
      const r = await fetch(params.url, { headers: dlHeaders });
      const buffer = await r.arrayBuffer();
      const ds = new DecompressionStream('gzip');
      const decompressed = new Response(new Blob([buffer]).stream().pipeThrough(ds));
      const text = await decompressed.text();
      const data = JSON.parse(text);
      return res.status(200).json(data);
    }

    // Action: generic proxy
    if (action === 'proxy' && endpoint) {
      const method = params?.method || 'GET';
      const hdrs = { ...baseHeaders, 'Content-Type': 'application/json', 'Accept': 'application/json' };
      if (params?.accept) hdrs['Accept'] = params.accept;
      if (params?.contentType) hdrs['Content-Type'] = params.contentType;
      const opts = { method, headers: hdrs };
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
