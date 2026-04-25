import Stripe from 'stripe';
import type { Unit } from '../config/units';

export interface StripePaymentLink {
  slug: string;
  url: string;
  priceId: string;
}

/**
 * Creates a Stripe Payment Link for each unit so buyers can pay a deposit
 * or the full amount online before pickup.
 *
 * Idempotency: uses the unit slug as the Stripe `Idempotency-Key` so re-running
 * the script does not create duplicate products / prices / payment links.
 */
export async function createStripeLinks(units: Unit[]): Promise<StripePaymentLink[]> {
  if (!process.env.STRIPE_SECRET_KEY) {
    console.warn('[stripe-link] STRIPE_SECRET_KEY not set — skipping Stripe payment-link creation.');
    return [];
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: '2025-02-24.acacia',
  });

  const links: StripePaymentLink[] = [];

  for (const unit of units) {
    const idempotencyKey = `amp-liquidation-${unit.slug}-v1`;

    // Create a Stripe product (idempotent on slug)
    const product = await stripe.products.create(
      {
        name: `${unit.brand} ${unit.model}`,
        description: `Model: ${unit.modelNumber} | ${unit.engineSpec} | Local pickup – ${process.env.SELLER_LOCATION_ZIP ?? '97013'}`,
        metadata: { slug: unit.slug, modelNumber: unit.modelNumber },
      },
      { idempotencyKey: `${idempotencyKey}-product` }
    );

    // Create a price (idempotent on slug)
    const price = await stripe.prices.create(
      {
        product: product.id,
        unit_amount: unit.targetPrice * 100,
        currency: 'usd',
        metadata: { slug: unit.slug },
      },
      { idempotencyKey: `${idempotencyKey}-price` }
    );

    // Create a payment link (idempotent on slug)
    const paymentLink = await stripe.paymentLinks.create(
      {
        line_items: [{ price: price.id, quantity: 1 }],
        metadata: { slug: unit.slug },
      },
      { idempotencyKey: `${idempotencyKey}-paymentlink` }
    );

    links.push({ slug: unit.slug, url: paymentLink.url, priceId: price.id });
    console.log(`[stripe-link] Payment link for ${unit.slug}: ${paymentLink.url}`);
  }

  return links;
}
