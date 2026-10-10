# AtexPay JavaScript SDK

A single-file client for the AtexPay products and orders API (v2.0.0). Node.js 18+ (global
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
| `ping()` | Confirms the key works; resolves to your seller name. |
| `createProduct(params)` | Adds a product. `name`, `description`, `category`, `delivery_type`, `price_minor` required; optional `buyer_email`, `return_url`. Rejects with `ProductExistsError` (carrying `productId`) when the title is taken. |
| `products()` / `product(id)` | Your 100 most recent products / one `prod_` id. |
| `updateProduct(id, changes)` | Changes name, description, category, delivery type, price, status, buyer email or return URL. |
| `createCheckoutSession(productId, customer)` | Mints a prefilled checkout URL for one buyer — details travel as an opaque token, valid 24 h. |
| `createCheckoutUrl(productParams, customer?)` | Uses (or first creates) the product with this title and resolves to the URL to send the buyer to. |
| `orders(status?)` / `order(id)` | Recent orders / one `ord_` id with its delivery timeline. |
| `deliverOrder(id, delivery, files?)` | Delivers an order with files and/or a `delivery_url`; the buyer is emailed a link to collect it. |
| `transactions()` / `transaction(id)` | Recent payments / full detail for one `txn_` id. |
| `verifyWebhook(rawBody, headers, secret)` | Verifies a webhook delivery and returns the event, or throws. |

## Errors

All API failures throw `AtexPayError` (with `.status`, `.type` and, on validation
failures, `.errors`); a duplicate product title throws its subclass `ProductExistsError`. Webhook verification failures throw
`SignatureVerificationError` — respond 400 and do not process.

## The one rule

The buyer's return redirect (`?status=success`) is UX only. Fulfil from the
verified webhook event or `transaction(id)` — never from the redirect — and deliver it with `deliverOrder()`.

See `example.mjs` for a full walkthrough (including the Express webhook
route with a raw body parser), and https://atexpay.com/docs/ for the API
reference.
