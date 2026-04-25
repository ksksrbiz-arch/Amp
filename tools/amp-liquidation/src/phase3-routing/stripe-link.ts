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
 */
export async function createStripeLinks(units: Unit[]): Promise<StripePaymentLink[]> {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', {
    apiVersion: '2025-02-24.acacia',
  });

  const links: StripePaymentLink[] = [];

  for (const unit of units) {
    // Create a Stripe product
    const product = await stripe.products.create({
      name: `${unit.brand} ${unit.model}`,
      description: `Model: ${unit.modelNumber} | ${unit.engineSpec} | Local pickup – ${process.env.SELLER_LOCATION_ZIP ?? '97013'}`,
      metadata: { slug: unit.slug, modelNumber: unit.modelNumber },
    });

    // Create a price
    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: unit.targetPrice * 100,
      currency: 'usd',
      metadata: { slug: unit.slug },
    });

    // Create a payment link
    const paymentLink = await stripe.paymentLinks.create({
      line_items: [{ price: price.id, quantity: 1 }],
      metadata: { slug: unit.slug },
    });

    links.push({ slug: unit.slug, url: paymentLink.url, priceId: price.id });
    console.log(`[stripe-link] Created payment link for ${unit.slug}: ${paymentLink.url}`);
  }

  return links;
}
