import { google } from 'googleapis';
import axios from 'axios';

export interface GmailMessage {
  id: string;
  subject: string;
  from: string;
  body: string;
  slug?: string;
}

/**
 * Polls Gmail for unread messages in the AMP-Liquidation labels
 * and forwards each to the Linear webhook.
 */
export async function pollGmail(webhookUrl: string): Promise<void> {
  if (
    !process.env.GMAIL_CLIENT_ID ||
    !process.env.GMAIL_CLIENT_SECRET ||
    !process.env.GMAIL_REFRESH_TOKEN
  ) {
    console.warn('[gmail-poller] Gmail credentials missing — skipping poll.');
    return;
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET
  );
  oauth2Client.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });

  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

  // Cache labelId -> name once so we don't query per-message
  const labelsRes = await gmail.users.labels.list({ userId: 'me' });
  const labelNamesById = new Map<string, string>(
    (labelsRes.data.labels ?? [])
      .filter((l): l is { id: string; name: string } => Boolean(l.id && l.name))
      .map((l) => [l.id, l.name])
  );

  // Fetch unread messages in the AMP-Liquidation/* labels
  const listRes = await gmail.users.messages.list({
    userId: 'me',
    q: 'label:AMP-Liquidation is:unread',
    maxResults: 50,
  });

  const messages = listRes.data.messages ?? [];
  if (messages.length === 0) {
    console.log('[gmail-poller] No new messages.');
    return;
  }

  console.log(`[gmail-poller] Processing ${messages.length} message(s)...`);

  for (const msg of messages) {
    if (!msg.id) continue;

    const full = await gmail.users.messages.get({ userId: 'me', id: msg.id, format: 'full' });
    const headers = full.data.payload?.headers ?? [];
    const subject = headers.find((h) => h.name?.toLowerCase() === 'subject')?.value ?? '(no subject)';
    const from = headers.find((h) => h.name?.toLowerCase() === 'from')?.value ?? '(unknown)';
    const labels = full.data.labelIds ?? [];

    // Detect slug from cached label names
    let slug: string | undefined;
    for (const labelId of labels) {
      const name = labelNamesById.get(labelId) ?? '';
      const match = /AMP-Liquidation\/(\w+)/.exec(name);
      if (match) {
        slug = match[1];
        break;
      }
    }

    // Decode body
    let body = '';
    const parts = full.data.payload?.parts ?? [];
    const textPart = parts.find((p) => p.mimeType === 'text/plain');
    if (textPart?.body?.data) {
      body = Buffer.from(textPart.body.data, 'base64').toString('utf-8');
    } else if (full.data.payload?.body?.data) {
      body = Buffer.from(full.data.payload.body.data, 'base64').toString('utf-8');
    }

    // Forward to webhook
    await axios.post(webhookUrl, { subject, from, body, slug });

    // Mark as read
    await gmail.users.messages.modify({
      userId: 'me',
      id: msg.id,
      requestBody: { removeLabelIds: ['UNREAD'] },
    });

    console.log(`[gmail-poller] Forwarded message from ${from} (slug: ${slug ?? 'unknown'})`);
  }
}
