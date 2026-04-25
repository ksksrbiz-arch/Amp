import axios from 'axios';
import fs from 'fs';
import path from 'path';

const EBAY_API_BASE = 'https://api.ebay.com';

interface EbayState {
  sku: string;
  offerId?: string;
  listingId?: string;
  listingUrl?: string;
}

function loadState(): EbayState {
  const statePath = path.resolve(process.cwd(), 'output', 'ebay-state.json');
  if (!fs.existsSync(statePath)) {
    throw new Error('ebay-state.json not found. Run ebay:dry first.');
  }
  return JSON.parse(fs.readFileSync(statePath, 'utf8')) as EbayState;
}

function saveState(state: EbayState): void {
  const statePath = path.resolve(process.cwd(), 'output', 'ebay-state.json');
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
}

export async function publishOffer(token: string): Promise<string> {
  const state = loadState();
  if (!state.offerId) throw new Error('No offerId in ebay-state.json');

  const response = await axios.post(
    `${EBAY_API_BASE}/sell/inventory/v1/offer/${state.offerId}/publish`,
    {},
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
  );

  const listingId = (response.data as { listingId: string }).listingId;
  const listingUrl = `https://www.ebay.com/itm/${listingId}`;

  state.listingId = listingId;
  state.listingUrl = listingUrl;
  saveState(state);

  // Append to fourfront.md
  const mdPath = path.resolve(process.cwd(), 'output', 'fourfront.md');
  if (fs.existsSync(mdPath)) {
    const existing = fs.readFileSync(mdPath, 'utf8');
    const updated = existing.replace(
      /## eBay \(auto-posted via Phase 2\)/,
      `## eBay (auto-posted via Phase 2)\n\n✅ LIVE: ${listingUrl}\n`
    );
    fs.writeFileSync(mdPath, updated);
  }

  console.log(`\n🎉 Listing is LIVE: ${listingUrl}`);
  console.log(`   Listing ID: ${listingId}`);
  console.log(`   Offer ID: ${state.offerId}`);

  return listingUrl;
}

export async function endListing(token: string): Promise<void> {
  const state = loadState();
  if (!state.listingId) throw new Error('No listingId in ebay-state.json. Was it published?');

  await axios.delete(
    `${EBAY_API_BASE}/sell/inventory/v1/offer/${state.offerId}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  console.log(`✅ Listing ${state.listingId} ended and offer deleted.`);
}
