import axios from 'axios';
import type { EbayTokens } from './auth';

const SELL_OFFER_BASE = 'https://api.ebay.com/sell/inventory/v1/offer';

export interface PublishResult {
  offerId: string;
  listingId: string;
  listingUrl: string;
}

/**
 * Publishes an eBay offer (makes the listing live).
 */
export async function publishOffer(offerId: string, tokens: EbayTokens): Promise<PublishResult> {
  const response = await axios.post<{ listingId: string }>(
    `${SELL_OFFER_BASE}/${offerId}/publish`,
    {},
    {
      headers: {
        Authorization: `Bearer ${tokens.accessToken}`,
        'Content-Type': 'application/json',
      },
    }
  );

  const listingId = response.data.listingId;
  const listingUrl = `https://www.ebay.com/itm/${listingId}`;

  console.log(`[publish] Listing is LIVE: ${listingUrl}`);

  return { offerId, listingId, listingUrl };
}
