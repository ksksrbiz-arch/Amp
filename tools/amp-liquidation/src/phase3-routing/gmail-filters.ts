import { google } from 'googleapis';
import { UNITS, Unit } from '../config/units';

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

function channelsForUnit(unit: Unit): string[] {
  return unit.channels;
}

export async function createGmailFilters(): Promise<void> {
  const gmail = getGmailClient();

  // Ensure AMP-Liquidation label exists
  let ampLabelId: string;
  try {
    const labelsResp = await gmail.users.labels.list({ userId: 'me' });
    const existing = labelsResp.data.labels?.find((l) => l.name === 'AMP-Liquidation');
    if (existing?.id) {
      ampLabelId = existing.id;
      console.log(`✅ Found existing label AMP-Liquidation: ${ampLabelId}`);
    } else {
      const created = await gmail.users.labels.create({
        userId: 'me',
        requestBody: { name: 'AMP-Liquidation', labelListVisibility: 'labelShow', messageListVisibility: 'show' },
      });
      ampLabelId = created.data.id!;
      console.log(`✅ Created label AMP-Liquidation: ${ampLabelId}`);
    }
  } catch (err) {
    throw new Error(`Failed to get/create AMP-Liquidation label: ${String(err)}`);
  }

  for (const unit of UNITS) {
    for (const channel of channelsForUnit(unit)) {
      const alias = `keith+amp-${unit.slug}-${channel}@1commercesolutions.com`;
      const labelName = `AMP_${unit.slug}_${channel}`;

      // Create per-channel label
      let channelLabelId: string;
      try {
        const labelsResp = await gmail.users.labels.list({ userId: 'me' });
        const existing = labelsResp.data.labels?.find((l) => l.name === labelName);
        if (existing?.id) {
          channelLabelId = existing.id;
        } else {
          const created = await gmail.users.labels.create({
            userId: 'me',
            requestBody: { name: labelName, labelListVisibility: 'labelShow', messageListVisibility: 'show' },
          });
          channelLabelId = created.data.id!;
        }
      } catch (err) {
        console.warn(`⚠️  Could not create label ${labelName}: ${String(err)}`);
        channelLabelId = ampLabelId;
      }

      // Create filter
      try {
        await gmail.users.settings.filters.create({
          userId: 'me',
          requestBody: {
            criteria: { to: alias },
            action: {
              addLabelIds: [channelLabelId, ampLabelId],
            },
          },
        });
        console.log(`✅ Filter created for ${alias}`);
      } catch (err) {
        console.warn(`⚠️  Filter for ${alias} may already exist: ${String(err)}`);
      }
    }
  }

  console.log('\n✅ All Gmail filters created.');
  console.log('\nEmail aliases to use in listings:');
  for (const unit of UNITS) {
    for (const channel of channelsForUnit(unit)) {
      console.log(`  ${unit.slug}/${channel}: keith+amp-${unit.slug}-${channel}@1commercesolutions.com`);
    }
  }
}
