import Anthropic from '@anthropic-ai/sdk';
import * as fs from 'fs';
import * as path from 'path';
import type { Unit } from '../config/units';
import { extractText, getAnthropicModel, stripCodeFences } from './anthropic-utils';

export interface PhotoMetadata {
  slug: string;
  photoCount: number;
  descriptions: string[];
  condition: string;
  notableDetails: string[];
}

/**
 * Uses Anthropic vision to analyze photos for a given unit and return
 * structured metadata about the item's condition and appearance.
 */
export async function analyzePhotos(unit: Unit, photosDir: string): Promise<PhotoMetadata> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const unitPhotoDir = path.join(photosDir, unit.slug);

  if (!fs.existsSync(unitPhotoDir)) {
    console.warn(`[analyze-photos] No photos directory found for ${unit.slug}, skipping vision analysis.`);
    return {
      slug: unit.slug,
      photoCount: 0,
      descriptions: [],
      condition: 'New/Sealed (no photos analyzed)',
      notableDetails: ['Unit is sealed in original packaging'],
    };
  }

  const imageFiles = fs
    .readdirSync(unitPhotoDir)
    .filter((f) => /\.(jpe?g|png|webp)$/i.test(f))
    .map((f) => path.join(unitPhotoDir, f));

  if (imageFiles.length === 0) {
    console.warn(`[analyze-photos] No images found for ${unit.slug}, skipping vision analysis.`);
    return {
      slug: unit.slug,
      photoCount: 0,
      descriptions: [],
      condition: 'New/Sealed (no photos analyzed)',
      notableDetails: ['Unit is sealed in original packaging'],
    };
  }

  const imageContent: Anthropic.ImageBlockParam[] = imageFiles.slice(0, 10).map((filePath) => {
    const ext = path.extname(filePath).toLowerCase().replace('.', '');
    const mediaType = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'png' ? 'image/png' : 'image/webp';
    const base64 = fs.readFileSync(filePath).toString('base64');
    return {
      type: 'image',
      source: {
        type: 'base64',
        media_type: mediaType as 'image/jpeg' | 'image/png' | 'image/webp',
        data: base64,
      },
    };
  });

  const message = await client.messages.create({
    model: getAnthropicModel(),
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: [
          ...imageContent,
          {
            type: 'text',
            text: `These are photos of a ${unit.brand} ${unit.model} (model ${unit.modelNumber}).
Please analyze the photos and respond with a JSON object containing:
- "descriptions": array of 1–2 sentence descriptions per photo
- "condition": overall condition assessment (e.g. "New in box", "Open box – unused", "Used – excellent condition")
- "notableDetails": array of notable visual details (scratches, missing parts, sealed packaging, etc.)

Respond ONLY with the JSON object, no markdown or extra text.`,
          },
        ],
      },
    ],
  });

  const raw = stripCodeFences(extractText(message));
  try {
    const parsed = JSON.parse(raw) as {
      descriptions: string[];
      condition: string;
      notableDetails: string[];
    };
    return {
      slug: unit.slug,
      photoCount: imageFiles.length,
      ...parsed,
    };
  } catch (err) {
    console.warn(`[analyze-photos] Failed to parse JSON response for ${unit.slug}:`, err);
    return {
      slug: unit.slug,
      photoCount: imageFiles.length,
      descriptions: [raw],
      condition: 'See photos',
      notableDetails: [],
    };
  }
}
