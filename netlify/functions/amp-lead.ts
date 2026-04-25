import { Handler } from '@netlify/functions';
import { LinearClient } from '@linear/sdk';

/**
 * Netlify Function: amp-lead
 *
 * Receives lead intake form submissions (from eBay/FB/CL/OfferUp/Mercari
 * copy pages or a custom landing page) and creates Linear issues.
 *
 * Expected POST body (JSON):
 *   { name, email, phone, message, slug, channel, stripeLink }
 */
export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let payload: {
    name?: string;
    email?: string;
    phone?: string;
    message?: string;
    slug?: string;
    channel?: string;
    stripeLink?: string;
  };

  try {
    payload = JSON.parse(event.body ?? '{}');
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const { name, email, phone, message, slug, channel } = payload;

  if (!email && !phone) {
    return { statusCode: 400, body: JSON.stringify({ error: 'email or phone is required' }) };
  }

  try {
    const linear = new LinearClient({ apiKey: process.env.LINEAR_API_KEY ?? '' });

    const title = `[${slug ?? 'amp'}] Lead via ${channel ?? 'web'}: ${name ?? email ?? phone}`;
    const description = `**Name:** ${name ?? 'N/A'}
**Email:** ${email ?? 'N/A'}
**Phone:** ${phone ?? 'N/A'}
**Channel:** ${channel ?? 'web'}
**Unit:** ${slug ?? 'unknown'}

---

${message ?? '(no message)'}`;

    const issue = await linear.createIssue({
      teamId: process.env.LINEAR_TEAM_ID ?? '',
      projectId: process.env.LINEAR_PROJECT_ID || undefined,
      title,
      description,
    });

    const createdIssue = await issue.issue;

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, issueId: createdIssue?.id }),
    };
  } catch (err) {
    console.error('[amp-lead] Error creating Linear issue:', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Internal server error' }) };
  }
};
