import axios from 'axios';
import type { Unit } from '../config/units';
import type { ChannelCopy } from '../phase1-copy/generate-copy';
import type { EbayTokens } from './auth';

const SELL_API_BASE = 'https://api.ebay.com/sell/inventory/v1';
const SELL_OFFER_BASE = 'https://api.ebay.com/sell/inventory/v1/offer';

const EBAY_MARKETPLACE_ID = 'EBAY_US';
const EBAY_DEFAULT_CATEGORY_ID = '80'; // Heavy Equipment & Tools fallback; override via EBAY_CATEGORY_ID env var

export interface EbayListingResult {
  inventoryItemKey: string;
  offerId: string;
}

/**
 * Creates an eBay Inventory Item and Offer for the FOURFRONT unit using the
 * Sell Inventory API.
 */
export async function createListing(
  unit: Unit,
  ebayCopy: ChannelCopy,
  imageUrls: string[],
  tokens: EbayTokens
): Promise<EbayListingResult> {
  const sku = `AMP-${unit.modelNumber.replace(/\s+/g, '-').toUpperCase()}`;

  // 1. Create / update inventory item
  await axios.put(
    `${SELL_API_BASE}/inventory_item/${encodeURIComponent(sku)}`,
    {
      availability: {
        shipToLocationAvailability: { quantity: 1 },
        pickupAtLocationAvailability: [
          {
            merchantLocationKey: process.env.SELLER_LOCATION_ZIP ?? '97013',
            quantity: 1,
          },
        ],
      },
      condition: 'NEW',
      conditionDescription: 'New in box / sealed. Local pickup only.',
      description: ebayCopy.description,
      product: {
        title: ebayCopy.title,
        brand: unit.brand,
        mpn: unit.modelNumber,
        imageUrls,
        aspects: {
          'Engine Displacement': [unit.engineSpec],
          'Item Weight': [`${unit.weightLbs} lbs`],
        },
      },
    },
    {
      headers: {
        Authorization: `Bearer ${tokens.accessToken}`,
        'Content-Type': 'application/json',
        'Content-Language': 'en-US',
      },
    }
  );

  console.log(`[create-listing] Inventory item created for SKU: ${sku}`);

  // 2. Create offer
  const offerResponse = await axios.post<{ offerId: string }>(
    SELL_OFFER_BASE,
    {
      sku,
      marketplaceId: EBAY_MARKETPLACE_ID,
      format: 'FIXED_PRICE',
      availableQuantity: 1,
      categoryId: process.env.EBAY_CATEGORY_ID ?? EBAY_DEFAULT_CATEGORY_ID,
      listingDescription: ebayCopy.description,
      listingPolicies: {
        fulfillmentPolicyId: process.env.EBAY_FULFILLMENT_POLICY_ID ?? '',
        paymentPolicyId: process.env.EBAY_PAYMENT_POLICY_ID ?? '',
        returnPolicyId: process.env.EBAY_RETURN_POLICY_ID ?? '',
      },
      pricingSummary: {
        price: { value: String(unit.targetPrice), currency: 'USD' },
      },
      merchantLocationKey: process.env.SELLER_LOCATION_ZIP ?? '97013',
    },
    {
      headers: {
        Authorization: `Bearer ${tokens.accessToken}`,
        'Content-Type': 'application/json',
      },
    }
  );

  const offerId = offerResponse.data.offerId;
  console.log(`[create-listing] Offer created: ${offerId}`);

  return { inventoryItemKey: sku, offerId };
}
