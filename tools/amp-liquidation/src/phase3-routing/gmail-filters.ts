import { google } from 'googleapis';
import type { Unit } from '../config/units';

/**
 * Creates Gmail filters so that inbound inquiries for each unit are
 * automatically labeled and forwarded as needed.
 */
export async function createGmailFilters(units: Unit[]): Promise<void> {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET
  );

  oauth2Client.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });

  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

  for (const unit of units) {
    const labelName = `AMP-Liquidation/${unit.slug}`;

    // Create a label for the unit (ignore error if it already exists)
    let labelId: string | null = null;
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
    } catch {
      // Label may already exist — fetch its ID
      const list = await gmail.users.labels.list({ userId: 'me' });
      const existing = list.data.labels?.find((l) => l.name === labelName);
      labelId = existing?.id ?? null;
      if (labelId) {
        console.log(`[gmail-filters] Using existing label: ${labelName} (${labelId})`);
      }
    }

    if (!labelId) {
      console.warn(`[gmail-filters] Could not create or find label for ${unit.slug}, skipping filter.`);
      continue;
    }

    // Create a filter matching subject keywords
    const keywords = [unit.model, unit.modelNumber].map((k) => `"${k}"`).join(' OR ');
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
