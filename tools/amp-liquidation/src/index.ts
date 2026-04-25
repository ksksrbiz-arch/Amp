#!/usr/bin/env ts-node
import * as path from 'path';
import * as fs from 'fs';
import * as dotenv from 'dotenv';
dotenv.config();

import { UNITS } from './config/units';
import { analyzePhotos } from './phase1-copy/analyze-photos';
import { generateCopy, type UnitCopyBundle } from './phase1-copy/generate-copy';
import { renderBundle } from './phase1-copy/render-bundle';
import { refreshEbayToken } from './phase2-ebay/auth';
import { uploadImages } from './phase2-ebay/upload-images';
import { createListing } from './phase2-ebay/create-listing';
import { publishOffer } from './phase2-ebay/publish';
import { createStripeLinks } from './phase3-routing/stripe-link';
import { createGmailFilters } from './phase3-routing/gmail-filters';
import { startWebhookServer } from './phase3-routing/linear-webhook';
import { pollGmail } from './phase3-routing/gmail-poller';

const PHOTOS_DIR = path.resolve(__dirname, '..', 'photos');
const OUTPUT_DIR = path.resolve(__dirname, '..', 'output');

function hasEbayCredentials(): boolean {
  return Boolean(
    process.env.EBAY_APP_ID &&
      process.env.EBAY_DEV_ID &&
      process.env.EBAY_CERT_ID &&
      process.env.EBAY_REFRESH_TOKEN
  );
}

interface CopyRun {
  bundles: Array<{ unit: (typeof UNITS)[number]; copyBundle: UnitCopyBundle; outputPath: string }>;
}

async function runPhase1(): Promise<CopyRun> {
  console.log('--- Phase 1: AI Copy Generation ---');

  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is required for Phase 1.');
  }

  const bundles: CopyRun['bundles'] = [];

  for (const unit of UNITS) {
    console.log(`\nProcessing unit: ${unit.slug}`);
    const photoMeta = await analyzePhotos(unit, PHOTOS_DIR);
    const copyBundle = await generateCopy(unit, photoMeta);
    const outputPath = renderBundle(copyBundle, OUTPUT_DIR);
    bundles.push({ unit, copyBundle, outputPath });
    console.log(`✓ Copy bundle written: ${outputPath}`);
  }

  return { bundles };
}

async function runPhase2(copyRun: CopyRun): Promise<void> {
  console.log('\n--- Phase 2: eBay Automation (FOURFRONT) ---');

  if (!hasEbayCredentials()) {
    console.warn('[ebay] eBay credentials missing — skipping Phase 2.');
    return;
  }

  const fourfront = UNITS.find((u) => u.slug === 'fourfront');
  const fourfrontBundle = copyRun.bundles.find((b) => b.unit.slug === 'fourfront');

  if (!fourfront || !fourfrontBundle) {
    console.warn('FOURFRONT unit or copy bundle not found — skipping Phase 2.');
    return;
  }

  const ebayCopy = fourfrontBundle.copyBundle.channels.find((c) => c.channel === 'ebay');
  if (!ebayCopy) {
    console.warn('No eBay copy found for FOURFRONT — skipping Phase 2.');
    return;
  }

  const tokens = await refreshEbayToken();

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

async function runPhase3(): Promise<void> {
  console.log('\n--- Phase 3: Lead Routing ---');

  // 3a. Generate Stripe payment links
  const stripeLinks = await createStripeLinks(UNITS);
  if (stripeLinks.length > 0) {
    console.log('\nStripe payment links:');
    for (const link of stripeLinks) {
      console.log(`  ${link.slug}: ${link.url}`);
    }
  }

  // 3b. Create Gmail filters
  await createGmailFilters(UNITS);

  // 3c. Start the Linear webhook server (keeps process alive for polling)
  startWebhookServer();
}

async function runAll(): Promise<void> {
  console.log('=== AMP-Kohler Liquidation Automation ===\n');
  const copyRun = await runPhase1();
  await runPhase2(copyRun);
  await runPhase3();
  console.log('\n=== Setup complete. Webhook server running. ===');
  console.log(`Output bundles: ${OUTPUT_DIR}`);
}

async function runPoll(): Promise<void> {
  const webhookUrl = process.env.LINEAR_WEBHOOK_URL ?? 'http://localhost:3001/lead';
  console.log(`[poll] Forwarding new Gmail messages to ${webhookUrl}`);
  await pollGmail(webhookUrl);
}

function printUsage(): void {
  console.log(`Usage: amp-liquidation <command>

Commands:
  all       Run all phases in sequence (default)
  copy      Run Phase 1 only — generate AI copy bundles
  ebay      Run Phase 1 + Phase 2 (eBay listing for FOURFRONT)
  routing   Run Phase 3 — Stripe links, Gmail filters, webhook server
  poll      Poll Gmail once and forward leads to the webhook
  help      Show this help`);
}

async function main(): Promise<void> {
  const command = (process.argv[2] ?? 'all').toLowerCase();

  switch (command) {
    case 'all':
      await runAll();
      break;
    case 'copy':
      await runPhase1();
      break;
    case 'ebay': {
      const copyRun = await runPhase1();
      await runPhase2(copyRun);
      break;
    }
    case 'routing':
      await runPhase3();
      break;
    case 'poll':
      await runPoll();
      break;
    case 'help':
    case '--help':
    case '-h':
      printUsage();
      break;
    default:
      console.error(`Unknown command: ${command}`);
      printUsage();
      process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
