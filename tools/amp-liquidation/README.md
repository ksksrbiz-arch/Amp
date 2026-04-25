# AMP-Kohler Liquidation — Runbook

**Owner:** Keith J. Skaggs Jr. / 1Commerce LLC  
**Goal:** One-shot automation to liquidate 4 sealed AMP-Kohler units:  
- eBay (FOURFRONT 9250 only) + manual-paste copy for FB/CL/OfferUp/Mercari (all 4 units)  
- Lead routing into Linear via Gmail filters + Netlify Function  
**Target:** Listings live within 90 minutes of photos being available.

---

## Pre-flight checklist

- [ ] Copy `.env.example` → `.env` and fill in all values
- [ ] Obtain eBay OAuth2 tokens (see [eBay token instructions](#ebay-tokens))
- [ ] Set up Gmail OAuth2 credentials (Google Cloud Console)
- [ ] Create Linear project "AMP Liquidation" and paste the project ID into `.env`
- [ ] Create Stripe account + secret key
- [ ] Drop photos into `photos/<slug>/` directories (JPEG or PNG, max 10 per unit)

---

## Setup

```bash
cd tools/amp-liquidation
cp .env.example .env
# fill in .env

npm install
```

---

## Running the automation

```bash
npm start            # run all phases (default: copy + ebay + routing)
npm run copy         # Phase 1 only — generate AI copy bundles
npm run ebay         # Phase 1 + Phase 2 (eBay listing for FOURFRONT)
npm run routing      # Phase 3 — Stripe links, Gmail filters, webhook server
npm run poll         # Poll Gmail once and forward leads to the webhook
npm run typecheck    # TypeScript type-check (no build output)
```

Each phase will skip itself with a warning if its required env vars are missing,
so you can run partial workflows safely.

### Phase 1 — AI Copy Generation
- Analyzes photos in `photos/<slug>/` using Anthropic Claude vision
- Generates per-channel marketing copy for each unit
- Writes markdown bundles to `output/<slug>.md`

### Phase 2 — eBay Automation (FOURFRONT only)
- Refreshes eBay OAuth2 token
- Uploads photos to eBay EPS (eBay Picture Services)
- Creates an eBay Sell API inventory item + offer
- Publishes the offer (listing goes live)

### Phase 3 — Lead Routing
- Creates Stripe payment links for all 4 units (idempotent on slug — safe to re-run)
- Creates Gmail filters to label inbound inquiries by unit (idempotent — won't duplicate)
- Starts an Express webhook server on port 3001 for Linear issue creation
- Run `npm run poll` on a cron (e.g. every 5 min) to forward Gmail leads to the webhook

---

## Manual paste channels (FB / CL / OfferUp / Mercari)

After Phase 1 completes, open `output/<slug>.md` for each unit and copy the
per-channel section into the respective platform's listing form.

---

## eBay tokens

1. Register an eBay developer account at https://developer.ebay.com
2. Create a production application and note `EBAY_APP_ID`, `EBAY_DEV_ID`, `EBAY_CERT_ID`
3. Set `EBAY_RUNAME` to the RuName for your OAuth2 redirect URI
4. Complete the OAuth2 Authorization Code flow to obtain `EBAY_USER_TOKEN` and `EBAY_REFRESH_TOKEN`
5. Required scope: `https://api.ebay.com/oauth/api_scope/sell.inventory`

The tool automatically refreshes the access token at runtime via `phase2-ebay/auth.ts`.

---

## Gmail OAuth2

1. Go to Google Cloud Console → APIs & Services → Credentials
2. Create an OAuth2 client (Desktop app type)
3. Enable the Gmail API
4. Complete the OAuth2 flow once to obtain `GMAIL_REFRESH_TOKEN`
5. Paste `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN` into `.env`

---

## Netlify Function — `amp-lead`

`tools/amp-liquidation/netlify/functions/amp-lead.ts` receives lead payloads
forwarded from Gmail (alias-based routing) and:
1. Creates a Linear issue with the appropriate priority for the unit
2. Looks up (or creates) a Stripe payment link for the unit
3. Returns `{ issueUrl, paymentLink }`

Set the following environment variables in Netlify:
- `LINEAR_API_KEY`
- `LINEAR_TEAM_ID`
- `LINEAR_PROJECT_ID`
- `STRIPE_SECRET_KEY`

The function endpoint will be:
```
POST https://<your-site>.netlify.app/.netlify/functions/amp-lead
```

Body (JSON):
```json
{
  "from": "buyer@example.com",
  "subject": "Is the generator still available?",
  "body": "Hi — I'd like to come pick this up this weekend.",
  "toAlias": "amp-generator-fb@1commercesolutions.com"
}
```

The function parses `toAlias` to extract `<unit>` and `<channel>` from
`amp-<unit>-<channel>@…`, so set up Gmail aliases or `+`-tags accordingly.

---

## Unit reference

| Slug | Model | MSRP | Target | Floor | eBay? |
|------|-------|------|--------|-------|-------|
| compressor | AKAC120 – 8-Gal Twin Tank Gas Compressor | $1,599 | $899 | $640 | No |
| pump | AKWP30 – 3" Semi-Trash Water Pump | $975 | $599 | $390 | No |
| generator | AK10KRS – 10,000W Portable Gas Generator | $3,250 | $1,895 | $1,300 | No |
| fourfront | FOURFRONT 9250 – 4-in-1 | $13,795 | $6,500 | $4,800 | **Yes** |

---

## Directory layout

```
tools/amp-liquidation/
├── .env.example
├── .gitignore
├── package.json
├── tsconfig.json
├── README.md
└── src/
    ├── config/
    │   └── units.ts
    ├── phase1-copy/
    │   ├── analyze-photos.ts
    │   ├── generate-copy.ts
    │   └── render-bundle.ts
    ├── phase2-ebay/
    │   ├── auth.ts
    │   ├── upload-images.ts
    │   ├── create-listing.ts
    │   └── publish.ts
    ├── phase3-routing/
    │   ├── stripe-link.ts
    │   ├── gmail-filters.ts
    │   ├── linear-webhook.ts
    │   └── gmail-poller.ts
    └── index.ts
```
