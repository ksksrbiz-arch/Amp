/**
 * linear-webhook.ts
 * Express server stub — used only if not deploying to Netlify.
 * Normally replaced by netlify/functions/amp-lead.ts.
 */
import express from 'express';
import { LinearClient } from '@linear/sdk';

export function startWebhookServer(port = 3001): void {
  const app = express();
  app.use(express.json());

  app.post('/lead', async (req, res) => {
    const { from, subject, body, toAlias } = req.body as {
      from?: string;
      subject?: string;
      body?: string;
      toAlias?: string;
    };

    if (!toAlias) {
      res.status(400).json({ error: 'toAlias required' });
      return;
    }

    const match = toAlias.match(/amp-(\w+)-(\w+)@/);
    if (!match) {
      res.status(200).json({ message: 'not an AMP lead' });
      return;
    }
    const [, unit, channel] = match;

    try {
      const linear = new LinearClient({ apiKey: process.env.LINEAR_API_KEY! });

      const priorityMap: Record<string, number> = {
        fourfront: 1,
        generator: 2,
        compressor: 3,
        pump: 3,
      };

      const issuePayload = await linear.createIssue({
        teamId: process.env.LINEAR_TEAM_ID!,
        projectId: process.env.LINEAR_PROJECT_ID!,
        title: `[${unit.toUpperCase()}] Lead via ${channel} — ${from ?? 'unknown'}`,
        description: `**Channel:** ${channel}\n**From:** ${from ?? ''}\n**Subject:** ${subject ?? ''}\n\n---\n\n${body ?? ''}`,
        priority: priorityMap[unit] ?? 3,
      });

      const createdIssue = await issuePayload.issue;
      res.json({ issueUrl: createdIssue?.url });
    } catch (err) {
      console.error('Linear error:', err);
      res.status(500).json({ error: String(err) });
    }
  });

  app.listen(port, () => {
    console.log(`🚀 Webhook server listening on port ${port}`);
  });
}
