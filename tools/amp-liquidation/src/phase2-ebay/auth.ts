import axios from 'axios';
import * as dotenv from 'dotenv';
dotenv.config();

const EBAY_TOKEN_URL = 'https://api.ebay.com/identity/v1/oauth2/token';

export interface EbayTokens {
  accessToken: string;
  expiresAt: number; // unix ms
}

/**
 * Refreshes the eBay OAuth2 user access token using the stored refresh token.
 */
export async function refreshEbayToken(): Promise<EbayTokens> {
  const { EBAY_APP_ID, EBAY_CERT_ID, EBAY_REFRESH_TOKEN } = process.env;

  if (!EBAY_APP_ID || !EBAY_CERT_ID || !EBAY_REFRESH_TOKEN) {
    throw new Error('Missing EBAY_APP_ID, EBAY_CERT_ID, or EBAY_REFRESH_TOKEN env vars');
  }

  const credentials = Buffer.from(`${EBAY_APP_ID}:${EBAY_CERT_ID}`).toString('base64');

  const response = await axios.post<{ access_token: string; expires_in: number }>(
    EBAY_TOKEN_URL,
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: EBAY_REFRESH_TOKEN,
      scope: 'https://api.ebay.com/oauth/api_scope/sell.inventory',
    }).toString(),
    {
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    }
  );

  return {
    accessToken: response.data.access_token,
    expiresAt: Date.now() + response.data.expires_in * 1000,
  };
}
