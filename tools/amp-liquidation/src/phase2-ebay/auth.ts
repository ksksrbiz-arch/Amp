import axios from 'axios';
import fs from 'fs';
import path from 'path';

const TOKEN_CACHE = path.resolve(process.cwd(), 'output', 'ebay-token.json');

interface TokenCache {
  access_token: string;
  expires_at: number;
}

export async function getEbayToken(): Promise<string> {
  // Check cache
  if (fs.existsSync(TOKEN_CACHE)) {
    const cached: TokenCache = JSON.parse(fs.readFileSync(TOKEN_CACHE, 'utf8'));
    if (Date.now() < cached.expires_at - 60_000) {
      return cached.access_token;
    }
  }

  const refreshToken = process.env.EBAY_REFRESH_TOKEN;
  const appId = process.env.EBAY_APP_ID;
  const certId = process.env.EBAY_CERT_ID;
  const runame = process.env.EBAY_RUNAME;

  if (!refreshToken || !appId || !certId || !runame) {
    throw new Error('Missing eBay OAuth env vars (EBAY_REFRESH_TOKEN, EBAY_APP_ID, EBAY_CERT_ID, EBAY_RUNAME)');
  }

  const credentials = Buffer.from(`${appId}:${certId}`).toString('base64');

  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    scope: 'https://api.ebay.com/oauth/api_scope/sell.inventory',
  });

  const response = await axios.post(
    'https://api.ebay.com/identity/v1/oauth2/token',
    params.toString(),
    {
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    }
  );

  const { access_token, expires_in } = response.data as { access_token: string; expires_in: number };

  const cache: TokenCache = {
    access_token,
    expires_at: Date.now() + expires_in * 1000,
  };
  fs.mkdirSync(path.dirname(TOKEN_CACHE), { recursive: true });
  fs.writeFileSync(TOKEN_CACHE, JSON.stringify(cache, null, 2));

  return access_token;
}
