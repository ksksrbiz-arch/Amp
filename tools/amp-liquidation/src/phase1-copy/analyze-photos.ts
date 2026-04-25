import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';
import { UNITS, Unit } from '../config/units';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface PhotoAnalysis {
  image_count: number;
  best_hero_index: number;
  shows_serial: boolean;
  shows_factory_seal: boolean;
  condition_visible: 'sealed' | 'open-box' | 'used' | 'unclear';
  missing_shots: string[];
  honest_callouts: string[];
}

async function analyzeUnit(unit: Unit): Promise<PhotoAnalysis> {
  const photoDir = path.resolve(process.cwd(), 'photos', unit.slug);
  if (!fs.existsSync(photoDir)) {
    console.warn(`⚠️  No photos directory found for ${unit.slug}: ${photoDir}`);
    return {
      image_count: 0,
      best_hero_index: 0,
      shows_serial: false,
      shows_factory_seal: false,
      condition_visible: 'unclear',
      missing_shots: ['all photos'],
      honest_callouts: [],
    };
  }

  const imageFiles = fs
    .readdirSync(photoDir)
    .filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f))
    .sort();

  if (imageFiles.length === 0) {
    console.warn(`⚠️  No image files found for ${unit.slug}`);
    return {
      image_count: 0,
      best_hero_index: 0,
      shows_serial: false,
      shows_factory_seal: false,
      condition_visible: 'unclear',
      missing_shots: ['all photos'],
      honest_callouts: [],
    };
  }

  const imageContent: Anthropic.ImageBlockParam[] = imageFiles.map((file) => {
    const filePath = path.join(photoDir, file);
    const data = fs.readFileSync(filePath);
    const ext = path.extname(file).toLowerCase().replace('.', '');
    const mediaType =
      ext === 'jpg' || ext === 'jpeg'
        ? 'image/jpeg'
        : ext === 'png'
        ? 'image/png'
        : 'image/webp';
    return {
      type: 'image',
      source: {
        type: 'base64',
        media_type: mediaType as 'image/jpeg' | 'image/png' | 'image/webp',
        data: data.toString('base64'),
      },
    };
  });

  const promptText: Anthropic.TextBlockParam = {
    type: 'text',
    text: `You are inspecting product photos for a liquidation listing of a ${unit.brand} ${unit.model}. Return JSON only:

{
  "image_count": number,
  "best_hero_index": number,
  "shows_serial": boolean,
  "shows_factory_seal": boolean,
  "condition_visible": "sealed" | "open-box" | "used" | "unclear",
  "missing_shots": string[],
  "honest_callouts": string[]
}`,
  };

  const response = await client.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: [...imageContent, promptText],
      },
    ],
  });

  const text = response.content.find((b) => b.type === 'text')?.text ?? '{}';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`No JSON in response for ${unit.slug}`);
  return JSON.parse(jsonMatch[0]) as PhotoAnalysis;
}

export async function analyzeAllPhotos(): Promise<void> {
  const outputDir = path.resolve(process.cwd(), 'output');
  fs.mkdirSync(outputDir, { recursive: true });

  let allOk = true;

  for (const unit of UNITS) {
    console.log(`\n📸 Analyzing photos for ${unit.slug}...`);
    const analysis = await analyzeUnit(unit);

    const outPath = path.join(outputDir, `${unit.slug}-photo-analysis.json`);
    fs.writeFileSync(outPath, JSON.stringify(analysis, null, 2));
    console.log(`✅ Saved ${outPath}`);

    if (analysis.missing_shots.length > 0) {
      console.warn(`⚠️  Missing shots for ${unit.slug}: ${analysis.missing_shots.join(', ')}`);
      allOk = false;
    }
    if (analysis.honest_callouts.length > 0) {
      console.log(`ℹ️  Callouts for ${unit.slug}: ${analysis.honest_callouts.join('; ')}`);
    }
  }

  if (!allOk) {
    console.warn('\n⚠️  Some units have missing shots. Re-shoot before continuing to copy generation.');
  } else {
    console.log('\n✅ All photo analyses complete. No missing shots.');
  }
}
