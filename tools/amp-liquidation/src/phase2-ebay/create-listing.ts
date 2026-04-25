import axios, { AxiosError } from 'axios';
import fs from 'fs';
import path from 'path';
import { UNITS } from '../config/units';
import { ChannelCopy } from '../phase1-copy/generate-copy';

const EBAY_API_BASE = 'https://api.ebay.com';

const BANNED_TERMS = [
  'replica', 'counterfeit', 'fake', 'imitation', 'bootleg',
];

interface EbayState {
  sku: string;
  offerId?: string;
  listingId?: string;
  listingUrl?: string;
}

function getFourfrontSerial(): string {
  const unit = UNITS.find((u) => u.slug === 'fourfront');
  return unit?.serial?.slice(-4) ?? '0000';
}

export async function preflightChecks(token: string): Promise<void> {
  console.log('🔍 Running eBay pre-flight checks...');

  // Check fulfillment policy
  const fulfillmentPolicyId = process.env.EBAY_FULFILLMENT_POLICY_ID;
  const paymentPolicyId = process.env.EBAY_PAYMENT_POLICY_ID;
  const returnPolicyId = process.env.EBAY_RETURN_POLICY_ID;
  const merchantLocationKey = process.env.EBAY_MERCHANT_LOCATION_KEY ?? 'canby-or-primary';

  if (!fulfillmentPolicyId) throw new Error('EBAY_FULFILLMENT_POLICY_ID not set');
  if (!paymentPolicyId) throw new Error('EBAY_PAYMENT_POLICY_ID not set');
  if (!returnPolicyId) throw new Error('EBAY_RETURN_POLICY_ID not set');

  // Verify fulfillment policy has LOCAL_PICKUP
  try {
    const resp = await axios.get(
      `${EBAY_API_BASE}/sell/account/v1/fulfillment_policy/${fulfillmentPolicyId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const policy = resp.data as { shippingOptions?: Array<{ optionType?: string }> };
    const hasPickup = policy.shippingOptions?.some(
      (o) => o.optionType === 'LOCAL_PICKUP'
    );
    if (!hasPickup) {
      throw new Error(
        `Fulfillment policy ${fulfillmentPolicyId} does not have LOCAL_PICKUP option. ` +
        'FOURFRONT is too heavy for standard shipping.'
      );
    }
    console.log('  ✅ Fulfillment policy has LOCAL_PICKUP');
  } catch (err) {
    if ((err as AxiosError).response) {
      throw new Error(`Failed to verify fulfillment policy: ${JSON.stringify((err as AxiosError).response?.data)}`);
    }
    throw err;
  }

  // Verify merchant location
  try {
    await axios.get(
      `${EBAY_API_BASE}/sell/inventory/v1/location/${merchantLocationKey}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    console.log(`  ✅ Merchant location '${merchantLocationKey}' configured`);
  } catch (err) {
    if ((err as AxiosError).response?.status === 404) {
      throw new Error(
        `Merchant location '${merchantLocationKey}' not found. ` +
        'Create it in eBay Seller Hub > Shipping > Business policies.'
      );
    }
    throw err;
  }

  // Check images were uploaded
  const imageUrlsPath = path.resolve(process.cwd(), 'output', 'fourfront-image-urls.json');
  if (!fs.existsSync(imageUrlsPath)) {
    throw new Error('No fourfront-image-urls.json found. Run image upload first.');
  }
  const imageUrls: string[] = JSON.parse(fs.readFileSync(imageUrlsPath, 'utf8'));

  const photoDir = path.resolve(process.cwd(), 'photos', 'fourfront');
  if (fs.existsSync(photoDir)) {
    const localCount = fs
      .readdirSync(photoDir)
      .filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f)).length;
    const uploadedCount = Math.min(localCount, 24);
    if (imageUrls.length < uploadedCount) {
      throw new Error(
        `Image count mismatch: ${imageUrls.length} uploaded vs ${uploadedCount} local files.`
      );
    }
  }
  console.log(`  ✅ ${imageUrls.length} images uploaded`);

  // Validate copy
  const copyPath = path.resolve(process.cwd(), 'output', 'fourfront-copy.json');
  if (!fs.existsSync(copyPath)) {
    throw new Error('fourfront-copy.json not found. Run copy generation first.');
  }
  const copy: ChannelCopy = JSON.parse(fs.readFileSync(copyPath, 'utf8'));

  if (copy.ebay.title.length > 80) {
    throw new Error(`eBay title exceeds 80 chars: ${copy.ebay.title.length}`);
  }

  const lowerDesc = copy.ebay.description_html.toLowerCase();
  for (const term of BANNED_TERMS) {
    if (lowerDesc.includes(term)) {
      throw new Error(`Description contains banned term: "${term}"`);
    }
  }
  console.log('  ✅ Title and description validated');

  console.log('✅ All pre-flight checks passed\n');
}

export async function createInventoryItem(token: string): Promise<string> {
  const serial = getFourfrontSerial();
  const sku = `AMP-FOURFRONT-9250-${serial}`;

  const copyPath = path.resolve(process.cwd(), 'output', 'fourfront-copy.json');
  const copy: ChannelCopy = JSON.parse(fs.readFileSync(copyPath, 'utf8'));

  const imageUrlsPath = path.resolve(process.cwd(), 'output', 'fourfront-image-urls.json');
  const imageUrls: string[] = JSON.parse(fs.readFileSync(imageUrlsPath, 'utf8'));

  const body = {
    sku,
    product: {
      title: copy.ebay.title,
      description: copy.ebay.description_html,
      imageUrls,
      aspects: {
        Brand: ['AMP'],
        Model: ['FOURFRONT 9250'],
        'Power Source': ['Gasoline'],
        'Engine Type': ['Kohler Command PRO 14HP'],
        Type: ['Generator', 'Welder', 'Air Compressor', 'Plasma Cutter'],
      },
      mpn: 'FOURFRONT 9250',
    },
    condition: 'NEW',
    packageWeightAndSize: {
      weight: { value: 650, unit: 'POUND' },
      dimensions: { length: 48, width: 32, height: 40, unit: 'INCH' },
      packageType: 'INDUSTRY_STANDARD_PALLET',
    },
    availability: {
      shipToLocationAvailability: { quantity: 1 },
    },
  };

  await axios.put(
    `${EBAY_API_BASE}/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`,
    body,
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
  );

  console.log(`✅ Inventory item created: SKU=${sku}`);
  return sku;
}

export async function createOffer(token: string, sku: string): Promise<string> {
  const fulfillmentPolicyId = process.env.EBAY_FULFILLMENT_POLICY_ID!;
  const paymentPolicyId = process.env.EBAY_PAYMENT_POLICY_ID!;
  const returnPolicyId = process.env.EBAY_RETURN_POLICY_ID!;
  const merchantLocationKey = process.env.EBAY_MERCHANT_LOCATION_KEY ?? 'canby-or-primary';

  const copyPath = path.resolve(process.cwd(), 'output', 'fourfront-copy.json');
  const copy: ChannelCopy = JSON.parse(fs.readFileSync(copyPath, 'utf8'));

  const body = {
    sku,
    marketplaceId: 'EBAY_US',
    format: 'FIXED_PRICE',
    availableQuantity: 1,
    categoryId: '11700',
    listingDescription: copy.ebay.description_html,
    listingPolicies: {
      fulfillmentPolicyId,
      paymentPolicyId,
      returnPolicyId,
      bestOfferTerms: {
        bestOfferEnabled: true,
        autoAcceptPrice: { value: '7000', currency: 'USD' },
        autoDeclinePrice: { value: '5500', currency: 'USD' },
      },
    },
    pricingSummary: {
      price: { value: '7495', currency: 'USD' },
    },
    merchantLocationKey,
  };

  const response = await axios.post(
    `${EBAY_API_BASE}/sell/inventory/v1/offer`,
    body,
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
  );

  const offerId = (response.data as { offerId: string }).offerId;

  // Save state
  const state: EbayState = { sku, offerId };
  const statePath = path.resolve(process.cwd(), 'output', 'ebay-state.json');
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));

  console.log(`✅ Offer created: offerId=${offerId}`);
  return offerId;
}
