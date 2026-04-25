import { LinearClient } from '@linear/sdk';
import Stripe from 'stripe';

interface LeadPayload {
  from: string;
  subject: string;
  body: string;
  toAlias: string;
}

interface PaymentLinkCache {
  [slug: string]: string;
}

// In-memory cache for payment links (persists within warm function instances)
const paymentLinkCache: PaymentLinkCache = {};

async function getOrCreatePaymentLink(stripe: Stripe, unit: string): Promise<{ url: string }> {
  if (paymentLinkCache[unit]) {
    return { url: paymentLinkCache[unit] };
  }

  // Search existing payment links by metadata
  const links = await stripe.paymentLinks.list({ limit: 100 });
  const existing = links.data.find((l) => l.metadata?.unit_slug === unit && l.active);
  if (existing) {
    paymentLinkCache[unit] = existing.url;
    return { url: existing.url };
  }

  // Shouldn't normally reach here if stripe:links was run, but create as fallback
  const products = await stripe.products.search({
    query: `metadata['unit_slug']:'${unit}'`,
  });
  const product = products.data[0];
  if (!product) {
    return { url: 'https://1commercesolutions.com/contact' };
  }

  const prices = await stripe.prices.list({ product: product.id, active: true, limit: 1 });
  const price = prices.data[0];
  if (!price) {
    return { url: 'https://1commercesolutions.com/contact' };
  }

  const link = await stripe.paymentLinks.create({
    line_items: [{ price: price.id, quantity: 1 }],
    after_completion: {
      type: 'redirect',
      redirect: { url: 'https://1commercesolutions.com/thanks-amp' },
    },
    metadata: { unit_slug: unit },
  });

  paymentLinkCache[unit] = link.url;
  return { url: link.url };
}

const priorityMap: Record<string, number> = {
  fourfront: 1,
  generator: 2,
  compressor: 3,
  pump: 3,
};

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  let payload: LeadPayload;
  try {
    payload = (await req.json()) as LeadPayload;
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  const { from, subject, body, toAlias } = payload;

  const match = toAlias?.match(/amp-(\w+)-(\w+)@/);
  if (!match) {
    return new Response(JSON.stringify({ message: 'not an AMP lead' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }
  const [, unit, channel] = match;

  try {
    // 1. Create Linear issue
    const linear = new LinearClient({ apiKey: process.env.LINEAR_API_KEY! });
    const issuePayload = await linear.createIssue({
      teamId: process.env.LINEAR_TEAM_ID!,
      projectId: process.env.LINEAR_PROJECT_ID!,
      title: `[${unit.toUpperCase()}] Lead via ${channel} — ${from}`,
      description: `**Channel:** ${channel}\n**From:** ${from}\n**Subject:** ${subject}\n\n---\n\n${body}`,
      priority: priorityMap[unit] ?? 3,
    });
    const createdIssue = await issuePayload.issue;

    // 2. Stripe payment link
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
    const paymentLink = await getOrCreatePaymentLink(stripe, unit);

    return new Response(
      JSON.stringify({
        issueUrl: createdIssue?.url,
        paymentLink: paymentLink.url,
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
  } catch (err) {
    console.error('amp-lead error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
}
