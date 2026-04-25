import 'dotenv/config';
import { analyzeAllPhotos } from './phase1-copy/analyze-photos';
import { generateCopy } from './phase1-copy/generate-copy';
import { renderBundles } from './phase1-copy/render-bundle';
import { getEbayToken } from './phase2-ebay/auth';
import { uploadFourfrontImages } from './phase2-ebay/upload-images';
import { preflightChecks, createInventoryItem, createOffer } from './phase2-ebay/create-listing';
import { publishOffer, endListing } from './phase2-ebay/publish';
import { createPaymentLinks } from './phase3-routing/stripe-link';
import { createGmailFilters } from './phase3-routing/gmail-filters';
import { startWebhookServer } from './phase3-routing/linear-webhook';
import { startPoller } from './phase3-routing/gmail-poller';

const command = process.argv[2];

async function main(): Promise<void> {
  switch (command) {
    case 'analyze':
      await analyzeAllPhotos();
      break;

    case 'copy':
      await generateCopy();
      renderBundles();
      break;

    case 'ebay:dry': {
      const token = await getEbayToken();
      await preflightChecks(token);
      await uploadFourfrontImages(token);
      const sku = await createInventoryItem(token);
      await createOffer(token, sku);
      console.log('\n✅ Dry run complete. Inventory item and offer created in eBay Seller Hub.');
      console.log('   Run "npm run ebay:publish" to go live.');
      break;
    }

    case 'ebay:publish': {
      const token = await getEbayToken();
      await publishOffer(token);
      break;
    }

    case 'ebay:end': {
      const token = await getEbayToken();
      await endListing(token);
      break;
    }

    case 'stripe:links':
      await createPaymentLinks();
      break;

    case 'gmail:filters':
      await createGmailFilters();
      break;

    case 'lead:webhook':
      startWebhookServer(3001);
      break;

    case 'lead:poll':
      await startPoller();
      break;

    default:
      console.log(`
AMP-Kohler Liquidation Tool

Usage: npm run <command>

Commands:
  analyze         Vision pass on all photos (Phase 1)
  copy            Generate per-channel copy bundles (Phase 1)
  ebay:dry        Create eBay inventory item + offer, no publish (Phase 2)
  ebay:publish    Publish the eBay offer (goes live) (Phase 2)
  ebay:end        End/delete the eBay listing (Phase 2)
  stripe:links    Create 4 Stripe payment links (Phase 3)
  gmail:filters   Create Gmail filters for lead routing (Phase 3)
  lead:webhook    Start local Express webhook server (Phase 3, local only)
  lead:poll       Start Gmail poller (run in tmux for 30 days) (Phase 3)
`);
  }
}

main().catch((err) => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
