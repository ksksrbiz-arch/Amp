#!/usr/bin/env ts-node
import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config();

import { UNITS } from './config/units';
import { analyzePhotos } from './phase1-copy/analyze-photos';
import { generateCopy } from './phase1-copy/generate-copy';
import { renderBundle } from './phase1-copy/render-bundle';
import { refreshEbayToken } from './phase2-ebay/auth';
import { uploadImages } from './phase2-ebay/upload-images';
import { createListing } from './phase2-ebay/create-listing';
import { publishOffer } from './phase2-ebay/publish';
import { createStripeLinks } from './phase3-routing/stripe-link';
import { createGmailFilters } from './phase3-routing/gmail-filters';
import { startWebhookServer } from './phase3-routing/linear-webhook';
import * as fs from 'fs';

const PHOTOS_DIR = path.resolve(__dirname, '..', 'photos');
const OUTPUT_DIR = path.resolve(__dirname, '..', 'output');

async function main(): Promise<void> {
  console.log('=== AMP-Kohler Liquidation Automation ===\n');

  // ── Phase 1: AI Copy Generation ──────────────────────────────────────────
  console.log('--- Phase 1: AI Copy Generation ---');
  const copyBundles = [];

  for (const unit of UNITS) {
    console.log(`\nProcessing unit: ${unit.slug}`);

    const photoMeta = await analyzePhotos(unit, PHOTOS_DIR);
    const copyBundle = await generateCopy(unit, photoMeta);
    const outputPath = renderBundle(copyBundle, OUTPUT_DIR);
    copyBundles.push({ unit, copyBundle, outputPath });

    console.log(`✓ Copy bundle written: ${outputPath}`);
  }

  // ── Phase 2: eBay Automation (FOURFRONT only) ────────────────────────────
  console.log('\n--- Phase 2: eBay Automation (FOURFRONT) ---');
  const fourfront = UNITS.find((u) => u.slug === 'fourfront');
  const fourfrontBundle = copyBundles.find((b) => b.unit.slug === 'fourfront');

  if (fourfront && fourfrontBundle) {
    const ebayCopy = fourfrontBundle.copyBundle.channels.find((c) => c.channel === 'ebay');
    if (!ebayCopy) {
      console.warn('No eBay copy found for FOURFRONT — skipping eBay phase.');
    } else {
      const tokens = await refreshEbayToken();

      // Collect photos for FOURFRONT
      const fourfrontPhotoDir = path.join(PHOTOS_DIR, 'fourfront');
      const imageFiles = fs.existsSync(fourfrontPhotoDir)
        ? fs
            .readdirSync(fourfrontPhotoDir)
            .filter((f) => /\.(jpe?g|png|webp)$/i.test(f))
            .map((f) => path.join(fourfrontPhotoDir, f))
        : [];

      let imageUrls: string[] = [];
      if (imageFiles.length > 0) {
        const uploaded = await uploadImages(imageFiles, tokens);
        imageUrls = uploaded.map((u) => u.ebayUrl);
      } else {
        console.warn('[ebay] No photos found for FOURFRONT — listing will have no images.');
      }

      const listingResult = await createListing(fourfront, ebayCopy, imageUrls, tokens);
      const published = await publishOffer(listingResult.offerId, tokens);
      console.log(`✓ FOURFRONT eBay listing live: ${published.listingUrl}`);
    }
  } else {
    console.warn('FOURFRONT unit or copy bundle not found — skipping eBay phase.');
  }

  // ── Phase 3: Lead Routing ────────────────────────────────────────────────
  console.log('\n--- Phase 3: Lead Routing ---');

  // 3a. Generate Stripe payment links
  const stripeLinks = await createStripeLinks(UNITS);
  console.log('\nStripe payment links:');
  for (const link of stripeLinks) {
    console.log(`  ${link.slug}: ${link.url}`);
  }

  // 3b. Create Gmail filters
  await createGmailFilters(UNITS);

  // 3c. Start the Linear webhook server (keeps process alive for polling)
  startWebhookServer();

  console.log('\n=== Setup complete. Webhook server running. ===');
  console.log(`Output bundles: ${OUTPUT_DIR}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
