import Stripe from 'stripe';
import fs from 'fs';
import path from 'path';
import { UNITS } from '../config/units';

interface PaymentLinks {
  [slug: string]: string;
}

export async function createPaymentLinks(): Promise<void> {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

  const outputDir = path.resolve(process.cwd(), 'output');
  fs.mkdirSync(outputDir, { recursive: true });

  const linksPath = path.join(outputDir, 'payment-links.json');
  const existing: PaymentLinks = fs.existsSync(linksPath)
    ? (JSON.parse(fs.readFileSync(linksPath, 'utf8')) as PaymentLinks)
    : {};

  const links: PaymentLinks = { ...existing };

  for (const unit of UNITS) {
    if (links[unit.slug]) {
      console.log(`⏭️  ${unit.slug}: already has payment link ${links[unit.slug]}`);
      continue;
    }

    console.log(`💳 Creating Stripe payment link for ${unit.slug}...`);

    const product = await stripe.products.create({
      name: `${unit.brand} ${unit.modelNumber} — ${unit.model}`,
      description: `Sealed new from factory. Local pickup Canby OR or buyer-arranged freight.`,
      metadata: {
        unit_slug: unit.slug,
        msrp: String(unit.msrp),
        serial: unit.serial ?? '',
      },
    });

    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: unit.targetPrice * 100,
      currency: 'usd',
    });

    const link = await stripe.paymentLinks.create({
      line_items: [{ price: price.id, quantity: 1 }],
      after_completion: {
        type: 'redirect',
        redirect: { url: 'https://1commercesolutions.com/thanks-amp' },
      },
      metadata: { unit_slug: unit.slug },
    });

    links[unit.slug] = link.url;
    console.log(`  ✅ ${unit.slug}: ${link.url}`);

    // Save after each to avoid losing progress
    fs.writeFileSync(linksPath, JSON.stringify(links, null, 2));
  }

  console.log(`\n✅ Payment links saved to ${linksPath}`);
}
