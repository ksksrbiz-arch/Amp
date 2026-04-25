# AMP-Kohler Liquidation Tool — Runbook

**Owner:** Keith J. Skaggs Jr. / 1Commerce LLC  
**Goal:** One-shot automation to liquidate 4 sealed AMP-Kohler units via eBay (FOURFRONT only) + copy-paste bundles for FB/CL/OfferUp/Mercari.

---

## Prerequisites

1. Node.js 20+
2. All 4 API keys (Anthropic, eBay, Gmail, Linear, Stripe) — see `.env.example`
3. Photos in `photos/{slug}/` directories (JPG/PNG/WebP)
4. eBay account: fulfillment policy with `LOCAL_PICKUP` option, merchant location set to Canby OR (ZIP 97013)

## Setup

```bash
cd tools/amp-liquidation
npm install
cp .env.example .env
# Fill in all API keys in .env
```

## Phase 1 — Copy Generation (~15 min)

```bash
# Drop photos into photos/{compressor,pump,generator,fourfront}/
npm run analyze   # Vision analysis — fix any missing_shots warnings before continuing
npm run copy      # Generate per-channel copy bundles → output/{slug}.md
```

Open `output/{slug}.md` for each unit and paste into the respective platforms.

**Email aliases to use in each listing:**
| Unit | Channel | Email |
|------|---------|-------|
| compressor | fb | keith+amp-compressor-fb@1commercesolutions.com |
| compressor | cl | keith+amp-compressor-cl@1commercesolutions.com |
| compressor | offerup | keith+amp-compressor-offerup@1commercesolutions.com |
| compressor | mercari | keith+amp-compressor-mercari@1commercesolutions.com |
| pump | fb | keith+amp-pump-fb@1commercesolutions.com |
| pump | cl | keith+amp-pump-cl@1commercesolutions.com |
| pump | offerup | keith+amp-pump-offerup@1commercesolutions.com |
| pump | mercari | keith+amp-pump-mercari@1commercesolutions.com |
| generator | fb | keith+amp-generator-fb@1commercesolutions.com |
| generator | cl | keith+amp-generator-cl@1commercesolutions.com |
| generator | offerup | keith+amp-generator-offerup@1commercesolutions.com |
| generator | mercari | keith+amp-generator-mercari@1commercesolutions.com |
| fourfront | ebay | keith+amp-fourfront-ebay@1commercesolutions.com |
| fourfront | fb | keith+amp-fourfront-fb@1commercesolutions.com |
| fourfront | cl | keith+amp-fourfront-cl@1commercesolutions.com |

## Phase 2 — eBay Listing (FOURFRONT 9250 only, ~10 min)

```bash
npm run ebay:dry      # Creates inventory item + offer, no public listing yet
                      # Verify in eBay Seller Hub > Inventory
npm run ebay:publish  # Goes live — listing URL printed to stdout
```

To end the listing later:
```bash
npm run ebay:end
```

## Phase 3 — Lead Routing (~5 min setup)

### One-time setup

```bash
npm run stripe:links  # Creates 4 Stripe payment links → output/payment-links.json
npm run gmail:filters # Creates Gmail labels + filters (requires Gmail OAuth)
```

### Deploy Netlify Function

The `netlify/functions/amp-lead.ts` function receives lead payloads and creates Linear issues.

Deploy to your existing `1commercesolutions.com` Netlify site:
```bash
# Set these env vars in Netlify dashboard:
# LINEAR_API_KEY, LINEAR_TEAM_ID, LINEAR_PROJECT_ID, STRIPE_SECRET_KEY
```

Set `LEAD_INTAKE_URL=https://1commercesolutions.com/api/amp-lead` in your `.env`.

### Run the Gmail poller (30-day window)

```bash
# In a tmux/screen session:
npm run lead:poll
```

This polls Gmail every 60s for messages tagged `Label_Webhook_Pending` and forwards them to your Netlify function.

**Note:** You must create a Gmail filter (or Apps Script) that adds `Label_Webhook_Pending` to all inbound `keith+amp-*@` mail. The `npm run gmail:filters` command handles the per-unit labels; the pending-label filter must be added manually in Gmail settings or via an Apps Script trigger.

---

## Hard Rules

- **No** browser automation for FB/CL/OfferUp/Mercari. Copy-paste only.
- **No** photo uploads to platforms outside eBay. Upload manually from `photos/{slug}/`.
- All API keys in `.env`, never logged, never committed.
- Stripe payment links stay active until manually deactivated.

## Linear Issue Priorities

| Unit | Priority |
|------|----------|
| FOURFRONT 9250 | Urgent (1) |
| Generator | High (2) |
| Compressor | Medium (3) |
| Pump | Medium (3) |

---

## Troubleshooting

**`analyze` warns about missing shots:** Re-shoot the missing angles and re-run.

**eBay pre-flight fails on fulfillment policy:** In eBay Seller Hub > Shipping > Business policies, create a freight policy with LOCAL_PICKUP option, paste the policy ID into `.env`.

**eBay pre-flight fails on merchant location:** In eBay Seller Hub > Shipping > Business locations, add Canby OR 97013 with key `canby-or-primary`.

**Gmail poller not finding messages:** Ensure `Label_Webhook_Pending` label exists and is applied to inbound `keith+amp-*` mail.
