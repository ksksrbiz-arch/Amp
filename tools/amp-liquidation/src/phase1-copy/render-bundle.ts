import fs from 'fs';
import path from 'path';
import { UNITS, Unit } from '../config/units';
import { ChannelCopy } from './generate-copy';
import { PhotoAnalysis } from './analyze-photos';

function renderUnit(unit: Unit, copy: ChannelCopy, analysis: PhotoAnalysis | null): string {
  const photos: string[] = [];
  const photoDir = path.resolve(process.cwd(), 'photos', unit.slug);
  if (fs.existsSync(photoDir)) {
    const files = fs.readdirSync(photoDir).filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f)).sort();
    files.forEach((f, i) => {
      const heroTag = analysis && i === analysis.best_hero_index ? ' — **hero**' : '';
      photos.push(`${i + 1}. ${f}${heroTag}`);
    });
  }

  const emailBase = (tag: string) =>
    `keith+amp-${unit.slug}-${tag}@1commercesolutions.com`;

  let md = `# ${unit.brand} ${unit.modelNumber} — Liquidation Listing Bundle\n\n`;
  md += `**Target price:** $${unit.targetPrice.toLocaleString()}  |  **Floor:** $${unit.floorPrice.toLocaleString()}  |  **MSRP:** $${unit.msrp.toLocaleString()}\n\n`;
  md += `---\n\n`;

  if (unit.channels.includes('ebay')) {
    md += `## eBay (auto-posted via Phase 2)\n\n`;
    md += `**Contact email:** ${emailBase('ebay')}\n\n`;
    md += `**Title:** ${copy.ebay.title}\n\n`;
    md += `**Subtitle:** ${copy.ebay.subtitle}\n\n`;
    md += `**Description (HTML):**\n\`\`\`html\n${copy.ebay.description_html}\n\`\`\`\n\n`;
  }

  if (unit.channels.includes('fb')) {
    md += `## Facebook Marketplace\n\n`;
    md += `**Contact email:** ${emailBase('fb')}\n\n`;
    md += `**Title:** ${copy.fb_marketplace.title}\n\n`;
    md += `**Category:** ${copy.fb_marketplace.category}\n\n`;
    md += `**Condition:** ${copy.fb_marketplace.condition}\n\n`;
    md += `**Body:**\n\`\`\`\n${copy.fb_marketplace.description}\n\`\`\`\n\n`;
  }

  if (unit.channels.includes('cl')) {
    md += `## Craigslist Portland\n\n`;
    md += `**Contact email:** ${emailBase('cl')}\n\n`;
    md += `**Section:** for sale > tools\n\n`;
    md += `**Posting URL:** https://post.craigslist.org/c/pdx\n\n`;
    md += `**Title:** ${copy.craigslist.title}\n\n`;
    md += `**Category:** ${copy.craigslist.category}\n\n`;
    md += `**Body (HTML):**\n\`\`\`html\n${copy.craigslist.body_html}\n\`\`\`\n\n`;
  }

  if (unit.channels.includes('offerup')) {
    md += `## OfferUp\n\n`;
    md += `**Contact email:** ${emailBase('offerup')}\n\n`;
    md += `**Title:** ${copy.offerup.title}\n\n`;
    md += `**Condition:** ${copy.offerup.condition}\n\n`;
    md += `**Description:**\n\`\`\`\n${copy.offerup.description}\n\`\`\`\n\n`;
  }

  if (unit.channels.includes('mercari')) {
    md += `## Mercari\n\n`;
    md += `**Contact email:** ${emailBase('mercari')}\n\n`;
    md += `**Title:** ${copy.mercari.title}\n\n`;
    md += `**Description:**\n\`\`\`\n${copy.mercari.description}\n\`\`\`\n\n`;
  }

  if (photos.length > 0) {
    md += `---\n\n## Photos (in order)\n\n`;
    md += photos.join('\n') + '\n';
  }

  return md;
}

export function renderBundles(): void {
  const outputDir = path.resolve(process.cwd(), 'output');
  fs.mkdirSync(outputDir, { recursive: true });

  for (const unit of UNITS) {
    const copyPath = path.join(outputDir, `${unit.slug}-copy.json`);
    if (!fs.existsSync(copyPath)) {
      console.warn(`⚠️  No copy JSON for ${unit.slug}. Run 'npm run copy' first.`);
      continue;
    }
    const copy = JSON.parse(fs.readFileSync(copyPath, 'utf8')) as ChannelCopy;

    let analysis: PhotoAnalysis | null = null;
    const analysisPath = path.join(outputDir, `${unit.slug}-photo-analysis.json`);
    if (fs.existsSync(analysisPath)) {
      analysis = JSON.parse(fs.readFileSync(analysisPath, 'utf8')) as PhotoAnalysis;
    }

    const md = renderUnit(unit, copy, analysis);
    const mdPath = path.join(outputDir, `${unit.slug}.md`);
    fs.writeFileSync(mdPath, md);
    console.log(`✅ Rendered ${mdPath}`);
  }
  console.log('\n✅ All bundles rendered.');
}
