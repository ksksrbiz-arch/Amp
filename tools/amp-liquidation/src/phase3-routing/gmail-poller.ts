import { google } from 'googleapis';
import axios from 'axios';

const POLL_INTERVAL_MS = 60_000;
const WEBHOOK_LABEL = 'Label_Webhook_Pending';

function getGmailClient() {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    'https://developers.google.com/oauthplayground'
  );
  oauth2Client.setCredentials({
    refresh_token: process.env.GMAIL_REFRESH_TOKEN,
  });
  return google.gmail({ version: 'v1', auth: oauth2Client });
}

async function getLabelId(gmail: ReturnType<typeof google.gmail>, labelName: string): Promise<string | null> {
  const resp = await gmail.users.labels.list({ userId: 'me' });
  return resp.data.labels?.find((l) => l.name === labelName)?.id ?? null;
}

async function processMessage(
  gmail: ReturnType<typeof google.gmail>,
  messageId: string,
  labelId: string,
  webhookUrl: string
): Promise<void> {
  const msg = await gmail.users.messages.get({ userId: 'me', id: messageId, format: 'full' });
  const headers = msg.data.payload?.headers ?? [];

  const from = headers.find((h) => h.name === 'From')?.value ?? '';
  const subject = headers.find((h) => h.name === 'Subject')?.value ?? '';
  const toHeader = headers.find((h) => h.name === 'To')?.value ?? '';

  // Decode body
  let body = '';
  const parts = msg.data.payload?.parts ?? [];
  const textPart = parts.find((p) => p.mimeType === 'text/plain');
  if (textPart?.body?.data) {
    body = Buffer.from(textPart.body.data, 'base64').toString('utf8');
  }

  // Find AMP alias in To/Delivered-To headers
  const allHeaders = headers.map((h) => h.value ?? '').join(' ');
  const aliasMatch = allHeaders.match(/keith\+amp-[a-z]+-[a-z]+@1commercesolutions\.com/);
  const toAlias = aliasMatch ? aliasMatch[0] : toHeader;

  try {
    await axios.post(webhookUrl, { from, subject, body, toAlias });
    console.log(`✅ Forwarded message ${messageId} (${subject}) to webhook`);
  } catch (err) {
    console.error(`❌ Failed to forward message ${messageId}:`, err);
    return;
  }

  // Remove the pending label
  await gmail.users.messages.modify({
    userId: 'me',
    id: messageId,
    requestBody: { removeLabelIds: [labelId] },
  });
}

export async function startPoller(): Promise<void> {
  const webhookUrl = process.env.LEAD_INTAKE_URL ?? 'http://localhost:3001/lead';
  const gmail = getGmailClient();

  console.log(`🔄 Starting Gmail poller (interval: ${POLL_INTERVAL_MS / 1000}s)`);
  console.log(`   Webhook URL: ${webhookUrl}`);

  const poll = async () => {
    try {
      const labelId = await getLabelId(gmail, WEBHOOK_LABEL);
      if (!labelId) {
        console.warn(`⚠️  Label '${WEBHOOK_LABEL}' not found in Gmail. Skipping poll.`);
        return;
      }

      const resp = await gmail.users.messages.list({
        userId: 'me',
        labelIds: [labelId],
        maxResults: 20,
      });

      const messages = resp.data.messages ?? [];
      if (messages.length === 0) return;

      console.log(`📬 Found ${messages.length} message(s) to process`);
      for (const msg of messages) {
        if (msg.id) {
          await processMessage(gmail, msg.id, labelId, webhookUrl);
        }
      }
    } catch (err) {
      console.error('Poll error:', err);
    }
  };

  await poll();
  setInterval(() => { void poll(); }, POLL_INTERVAL_MS);
}
