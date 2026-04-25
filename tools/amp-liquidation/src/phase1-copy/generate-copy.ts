import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';
import { UNITS, Unit } from '../config/units';
import { PhotoAnalysis } from './analyze-photos';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface ChannelCopy {
  ebay: {
    title: string;
    subtitle: string;
    description_html: string;
  };
  fb_marketplace: {
    title: string;
    description: string;
    category: string;
    condition: 'new';
  };
  craigslist: {
    title: string;
    body_html: string;
    category: 'tools' | 'farm+garden' | 'heavy equipment' | 'business';
  };
  offerup: {
    title: string;
    description: string;
    condition: 'new';
  };
  mercari: {
    title: string;
    description: string;
  };
}

function buildPrompt(unit: Unit, analysis: PhotoAnalysis | null): string {
  const isFourfront = unit.slug === 'fourfront';
  const sellerNote = isFourfront ? 'Seller: 1Commerce LLC (licensed dealer).' : '';
  const conditionNote =
    analysis?.condition_visible === 'sealed' ? 'Factory sealed, never opened.' : 'Sealed new in box.';
  const calloutsNote =
    analysis && analysis.honest_callouts.length > 0
      ? `Cosmetic notes: ${analysis.honest_callouts.join('; ')}.`
      : '';

  return `You are writing multi-channel marketplace copy for a liquidation sale. Return ONLY valid JSON matching the schema below. No markdown, no extra text.

Unit details:
- Brand: ${unit.brand}
- Model: ${unit.model}
- Model number: ${unit.modelNumber}
- MSRP: $${unit.msrp.toLocaleString()}
- Asking price: $${unit.targetPrice.toLocaleString()}
- Weight: ${unit.weightLbs} lbs
- Dimensions: ${unit.dimensionsIn} inches
- Engine: ${unit.engineSpec}
- Key features: ${unit.keyFeatures.join('; ')}
- Condition: ${conditionNote} ${calloutsNote}
- ${sellerNote}

Rules:
- eBay title: ≤80 chars. Format: "${unit.brand} ${unit.modelNumber} ${unit.model} [2 power keywords] Sealed". No "NEW", no asterisks, no all-caps.
- All descriptions: include "Serial on file", "No Oregon sales tax (local pickup Canby OR)", and "3 other AMP/Kohler units available — bundle pricing on request".
- For FOURFRONT only: mention escrow.com option for buyers outside Oregon.
- For FOURFRONT only: mention "Sold by 1Commerce LLC".
- OfferUp title ≤50 chars, description ≤1000 chars.
- Mercari title ≤80 chars, description ≤1000 chars.

Return this JSON schema exactly:
{
  "ebay": {
    "title": "string (≤80 chars)",
    "subtitle": "string (≤55 chars)",
    "description_html": "string (full HTML)"
  },
  "fb_marketplace": {
    "title": "string",
    "description": "string (≤8000 chars, plain text)",
    "category": "string",
    "condition": "new"
  },
  "craigslist": {
    "title": "string",
    "body_html": "string (HTML using only <b><i><br><p> tags)",
    "category": "tools"
  },
  "offerup": {
    "title": "string (≤50 chars)",
    "description": "string (≤1000 chars)",
    "condition": "new"
  },
  "mercari": {
    "title": "string (≤80 chars)",
    "description": "string (≤1000 chars)"
  }
}`;
}

function validateCopy(unit: Unit, copy: ChannelCopy): void {
  const errors: string[] = [];

  if (copy.ebay.title.length > 80) {
    errors.push(`eBay title too long: ${copy.ebay.title.length} chars (max 80). Title: "${copy.ebay.title}"`);
  }
  if (copy.ebay.subtitle && copy.ebay.subtitle.length > 55) {
    errors.push(`eBay subtitle too long: ${copy.ebay.subtitle.length} chars (max 55).`);
  }
  if (copy.offerup.title.length > 50) {
    errors.push(`OfferUp title too long: ${copy.offerup.title.length} chars (max 50).`);
  }
  if (copy.offerup.description.length > 1000) {
    errors.push(`OfferUp description too long: ${copy.offerup.description.length} chars (max 1000).`);
  }
  if (copy.mercari.title.length > 80) {
    errors.push(`Mercari title too long: ${copy.mercari.title.length} chars (max 80).`);
  }
  if (copy.mercari.description.length > 1000) {
    errors.push(`Mercari description too long: ${copy.mercari.description.length} chars (max 1000).`);
  }
  if (copy.fb_marketplace.description.length > 8000) {
    errors.push(`FB description too long: ${copy.fb_marketplace.description.length} chars (max 8000).`);
  }

  if (errors.length > 0) {
    throw new Error(`Copy validation failed for ${unit.slug}:\n${errors.join('\n')}`);
  }
}

export async function generateCopy(): Promise<void> {
  const outputDir = path.resolve(process.cwd(), 'output');
  fs.mkdirSync(outputDir, { recursive: true });

  for (const unit of UNITS) {
    console.log(`\n✍️  Generating copy for ${unit.slug}...`);

    let analysis: PhotoAnalysis | null = null;
    const analysisPath = path.join(outputDir, `${unit.slug}-photo-analysis.json`);
    if (fs.existsSync(analysisPath)) {
      analysis = JSON.parse(fs.readFileSync(analysisPath, 'utf8')) as PhotoAnalysis;
    } else {
      console.warn(`⚠️  No photo analysis found for ${unit.slug}. Proceeding without it.`);
    }

    const prompt = buildPrompt(unit, analysis);

    const response = await client.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content.find((b) => b.type === 'text')?.text ?? '{}';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error(`No JSON in response for ${unit.slug}`);

    const copy = JSON.parse(jsonMatch[0]) as ChannelCopy;
    validateCopy(unit, copy);

    const copyPath = path.join(outputDir, `${unit.slug}-copy.json`);
    fs.writeFileSync(copyPath, JSON.stringify(copy, null, 2));
    console.log(`✅ Saved ${copyPath}`);
    console.log(`   eBay title (${copy.ebay.title.length} chars): "${copy.ebay.title}"`);
  }

  console.log('\n✅ All copy generation complete.');
}
