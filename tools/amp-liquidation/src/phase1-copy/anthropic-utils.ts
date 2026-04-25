import type Anthropic from '@anthropic-ai/sdk';

/**
 * Default Anthropic model used by Phase 1 copy generation.
 * Override at runtime via the `ANTHROPIC_MODEL` env var.
 */
export const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-4-5';

export function getAnthropicModel(): string {
  return process.env.ANTHROPIC_MODEL || DEFAULT_ANTHROPIC_MODEL;
}

/**
 * Safely extract concatenated text from an Anthropic message response.
 * Returns the empty string if no text blocks are present.
 */
export function extractText(message: Anthropic.Message): string {
  return message.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();
}

/**
 * Strip Markdown code fences (```json ... ``` or ``` ... ```) from a string,
 * returning whatever is inside. Useful when the model wraps JSON in fences
 * despite being asked not to.
 */
export function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  const fenced = /^```(?:json|JSON)?\s*\n([\s\S]*?)\n```$/.exec(trimmed);
  return fenced ? fenced[1].trim() : trimmed;
}
