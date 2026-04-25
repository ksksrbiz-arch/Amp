import * as fs from 'fs';
import * as path from 'path';
import type { UnitCopyBundle } from './generate-copy';

/**
 * Renders a per-unit markdown bundle to the output directory.
 * Returns the path to the written file.
 */
export function renderBundle(bundle: UnitCopyBundle, outputDir: string): string {
  const { unit, photoMetadata, channels } = bundle;

  const lines: string[] = [
    `# ${unit.brand} — ${unit.model}`,
    `**Model:** ${unit.modelNumber}  `,
    `**MSRP:** $${unit.msrp.toLocaleString()}  `,
    `**Target Price:** $${unit.targetPrice.toLocaleString()}  `,
    `**Floor Price:** $${unit.floorPrice.toLocaleString()}  `,
    `**Weight:** ${unit.weightLbs} lbs  `,
    `**Dimensions:** ${unit.dimensionsIn} in  `,
    `**Engine:** ${unit.engineSpec}  `,
    '',
    '## Key Features',
    ...unit.keyFeatures.map((f) => `- ${f}`),
    '',
    '## Condition',
    `${photoMetadata.condition}  `,
    '',
    ...(photoMetadata.notableDetails.length > 0
      ? ['**Notable details:**', ...photoMetadata.notableDetails.map((d) => `- ${d}`), '']
      : []),
    '---',
    '',
  ];

  for (const ch of channels) {
    lines.push(`## ${ch.channel.toUpperCase()} — $${ch.price.toLocaleString()}`);
    lines.push('');
    lines.push(`### Title`);
    lines.push(ch.title);
    lines.push('');
    lines.push(`### Description`);
    lines.push(ch.description);
    lines.push('');
    if (ch.hashtags && ch.hashtags.length > 0) {
      lines.push('### Hashtags');
      lines.push(ch.hashtags.join(' '));
      lines.push('');
    }
    lines.push('---');
    lines.push('');
  }

  const outputPath = path.join(outputDir, `${unit.slug}.md`);
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(outputPath, lines.join('\n'), 'utf-8');

  console.log(`[render-bundle] Wrote ${outputPath}`);
  return outputPath;
}
