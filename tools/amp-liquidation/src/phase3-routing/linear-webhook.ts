import express from 'express';
import { LinearClient } from '@linear/sdk';

const app = express();
app.use(express.json());

/**
 * POST /lead
 * Body: { subject, from, body, slug }
 *
 * Creates a Linear issue for each inbound lead email.
 * This endpoint is called by the gmail-poller or a Netlify Function.
 */
app.post('/lead', async (req, res) => {
  const { subject, from, body: emailBody, slug } = req.body as {
    subject?: string;
    from?: string;
    body?: string;
    slug?: string;
  };

  if (!subject || !from) {
    res.status(400).json({ error: 'subject and from are required' });
    return;
  }

  try {
    const linear = new LinearClient({ apiKey: process.env.LINEAR_API_KEY ?? '' });

    const issueTitle = `[${slug ?? 'amp'}] Lead: ${from} — ${subject}`;
    const issueDescription = `**From:** ${from}
**Subject:** ${subject}
**Unit:** ${slug ?? 'unknown'}

---

${emailBody ?? '(no body)'}`;

    const issue = await linear.createIssue({
      teamId: process.env.LINEAR_TEAM_ID ?? '',
      projectId: process.env.LINEAR_PROJECT_ID || undefined,
      title: issueTitle,
      description: issueDescription,
      labelIds: [],
    });

    const createdIssue = await issue.issue;
    console.log(`[linear-webhook] Issue created: ${createdIssue?.identifier} – ${issueTitle}`);

    res.json({ ok: true, issueId: createdIssue?.id, identifier: createdIssue?.identifier });
  } catch (err) {
    console.error('[linear-webhook] Error creating Linear issue:', err);
    res.status(500).json({ error: 'Failed to create Linear issue' });
  }
});

const PORT = process.env.PORT ?? 3001;

export function startWebhookServer(): void {
  app.listen(PORT, () => {
    console.log(`[linear-webhook] Server listening on port ${PORT}`);
  });
}

export { app };
