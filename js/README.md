# AtexPay JavaScript SDK

A single-file client for the AtexPay merchant API. Node.js 18+ (global
`fetch`), ESM, no dependencies. **Server-side only** — never ship your API
key or webhook signing secret to a browser.

## Install

Copy `atexpay.js` anywhere into your project and import it:

```js
import { AtexPay, verifyWebhook } from './atexpay.js';

const atexpay = new AtexPay(process.env.ATEXPAY_API_KEY);
```

## Methods

| Method | What it does |
|---|---|
| `ping()` | Confirms the key works; resolves to your merchant name. |
| `createPaymentLink(params)` | Creates a link. `name` + `price_minor` required; optional `description`, `buyer_email`, `single_use`, `return_url`. |
| `paymentLinks()` | Your 100 most recent links. |
| `createCheckoutSession(linkId, customer)` | Mints a prefilled checkout URL for one buyer — details travel as an opaque token, valid 24 h. |
| `createCheckoutUrl(linkParams, customer?)` | Creates a link and resolves to the URL to send the buyer to (prefilled when `customer` given). |
| `transactions()` / `transaction(id)` | Recent payments / full detail for one `txn_` id. |
| `verifyWebhook(rawBody, headers, secret)` | Verifies a webhook delivery and returns the event, or throws. |

## Errors

All API failures throw `AtexPayError` (with `.status` and, on validation
failures, `.errors`). Webhook verification failures throw
`SignatureVerificationError` — respond 400 and do not process.

## The one rule

The buyer's return redirect (`?status=success`) is UX only. Fulfil from the
verified webhook event or `transaction(id)` — never from the redirect.

See `example.mjs` for a full walkthrough (including the Express webhook
route with a raw body parser), and https://atexpay.com/docs/ for the API
reference.
