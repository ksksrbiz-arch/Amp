import Anthropic from '@anthropic-ai/sdk';
import type { Unit } from '../config/units';
import type { PhotoMetadata } from './analyze-photos';
import { extractText, getAnthropicModel, stripCodeFences } from './anthropic-utils';

export interface ChannelCopy {
  channel: string;
  title: string;
  price: number;
  description: string;
  hashtags?: string[];
}

export interface UnitCopyBundle {
  unit: Unit;
  photoMetadata: PhotoMetadata;
  channels: ChannelCopy[];
}

const CHANNEL_INSTRUCTIONS: Record<string, string> = {
  ebay: `Write an eBay listing.
- Title: 80 chars max, keyword-rich (brand, model number, key specs, "New")
- Description: HTML-formatted, 4–6 paragraphs covering features, specs, condition, pickup/shipping, payment
- Include all key specs and features
- End with seller disclaimer and pickup ZIP`,
  fb: `Write a Facebook Marketplace listing.
- Title: 60 chars max, casual and direct
- Description: Conversational, 3–4 short paragraphs, mention condition, price is firm or OBO, local pickup only
- Add 5–8 relevant hashtags at end`,
  cl: `Write a Craigslist listing.
- Title: 60 chars max, plain text
- Description: Plain text, no HTML, 3–4 paragraphs, include specs, condition, price, and contact info placeholder
- Mention cash only or Venmo`,
  offerup: `Write an OfferUp listing.
- Title: 50 chars max
- Description: Short, punchy, 2–3 paragraphs, mobile-friendly
- Add 5 relevant hashtags`,
  mercari: `Write a Mercari listing.
- Title: 40 chars max
- Description: 2–3 short paragraphs, condition, specs, what's included
- No pickup, shipping only (buyer pays)`,
};

/**
 * Calls Anthropic to generate per-channel marketing copy for a unit.
 */
export async function generateCopy(unit: Unit, photoMetadata: PhotoMetadata): Promise<UnitCopyBundle> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const channelBundles: ChannelCopy[] = [];

  for (const channel of unit.channels) {
    const instruction = CHANNEL_INSTRUCTIONS[channel] ?? CHANNEL_INSTRUCTIONS['fb'];

    const prompt = `You are writing a sales listing for a ${unit.brand} ${unit.model}.

Unit details:
- Model number: ${unit.modelNumber}
- MSRP: $${unit.msrp.toLocaleString()}
- Asking price: $${unit.targetPrice.toLocaleString()}
- Weight: ${unit.weightLbs} lbs
- Dimensions: ${unit.dimensionsIn} inches
- Engine: ${unit.engineSpec}
- Key features:
${unit.keyFeatures.map((f) => `  • ${f}`).join('\n')}

Condition from photos: ${photoMetadata.condition}
Notable visual details: ${photoMetadata.notableDetails.join(', ') || 'None'}
Photo descriptions: ${photoMetadata.descriptions.slice(0, 3).join(' | ') || 'No photos analyzed'}

${instruction}

Respond with a JSON object:
{
  "title": "...",
  "description": "...",
  "hashtags": ["...", "..."]   // omit for channels that don't use hashtags
}

Respond ONLY with the JSON object, no markdown or extra text.`;

    const message = await client.messages.create({
      model: getAnthropicModel(),
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    });

    const raw = stripCodeFences(extractText(message));
    try {
      const parsed = JSON.parse(raw) as { title: string; description: string; hashtags?: string[] };
      channelBundles.push({
        channel,
        title: parsed.title,
        price: unit.targetPrice,
        description: parsed.description,
        hashtags: parsed.hashtags,
      });
    } catch (err) {
      console.warn(`[generate-copy] Failed to parse JSON response for ${unit.slug}/${channel}:`, err);
      channelBundles.push({
        channel,
        title: `${unit.brand} ${unit.model} – $${unit.targetPrice}`,
        price: unit.targetPrice,
        description: raw,
      });
    }
  }

  return {
    unit,
    photoMetadata,
    channels: channelBundles,
  };
}
