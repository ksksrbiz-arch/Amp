import { google } from 'googleapis';
import type { Unit } from '../config/units';

/**
 * Creates Gmail filters so that inbound inquiries for each unit are
 * automatically labeled and forwarded as needed.
 *
 * Idempotent: skips creating filters that already match the same query +
 * label, so re-running the script does not create duplicates.
 */
export async function createGmailFilters(units: Unit[]): Promise<void> {
  if (
    !process.env.GMAIL_CLIENT_ID ||
    !process.env.GMAIL_CLIENT_SECRET ||
    !process.env.GMAIL_REFRESH_TOKEN
  ) {
    console.warn('[gmail-filters] Gmail credentials missing — skipping filter creation.');
    return;
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET
  );

  oauth2Client.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });

  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

  // Fetch existing filters once so we can de-dupe by criteria
  const existingFilters = (await gmail.users.settings.filters.list({ userId: 'me' })).data.filter ?? [];
  const existingLabels = (await gmail.users.labels.list({ userId: 'me' })).data.labels ?? [];

  for (const unit of units) {
    const labelName = `AMP-Liquidation/${unit.slug}`;

    // Find or create the label
    let labelId: string | null = existingLabels.find((l) => l.name === labelName)?.id ?? null;

    if (!labelId) {
      try {
        const labelRes = await gmail.users.labels.create({
          userId: 'me',
          requestBody: {
            name: labelName,
            labelListVisibility: 'labelShow',
            messageListVisibility: 'show',
          },
        });
        labelId = labelRes.data.id ?? null;
        console.log(`[gmail-filters] Created label: ${labelName} (${labelId})`);
      } catch (err) {
        console.warn(`[gmail-filters] Failed to create label for ${unit.slug}:`, err);
      }
    } else {
      console.log(`[gmail-filters] Using existing label: ${labelName} (${labelId})`);
    }

    if (!labelId) {
      console.warn(`[gmail-filters] No label id for ${unit.slug}, skipping filter.`);
      continue;
    }

    // Create a filter matching subject keywords (de-duped)
    const keywords = [unit.model, unit.modelNumber].map((k) => `"${k}"`).join(' OR ');

    const alreadyExists = existingFilters.some(
      (f) =>
        f.criteria?.query === keywords &&
        f.action?.addLabelIds?.includes(labelId as string)
    );

    if (alreadyExists) {
      console.log(`[gmail-filters] Filter already exists for ${unit.slug}, skipping.`);
      continue;
    }

    await gmail.users.settings.filters.create({
      userId: 'me',
      requestBody: {
        criteria: {
          query: keywords,
          to: process.env.GMAIL_USER,
        },
        action: {
          addLabelIds: [labelId],
          removeLabelIds: ['INBOX'],
        },
      },
    });

    console.log(`[gmail-filters] Filter created for ${unit.slug} matching: ${keywords}`);
  }
}
