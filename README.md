<p align="center">
  <a href="https://atexpay.com">
    <img src="https://atexpay.com/images/atex-pay-logo.svg" alt="AtexPay" width="360">
  </a>
</p>

<h3 align="center">Take payments under your own brand.</h3>

<p align="center">
  Official AtexPay SDKs — single-file, zero-dependency clients for the AtexPay merchant API.
</p>

<p align="center">
  <a href="https://atexpay.com">Website</a> ·
  <a href="https://atexpay.com/docs/">API documentation</a> ·
  <a href="https://portal.atexpay.com">Dashboard</a> ·
  <a href="https://atexpay.com/contact/">Support</a>
</p>

<p align="center">
  <img alt="Version" src="https://img.shields.io/badge/version-1.0.0-F0603F">
  <img alt="PHP" src="https://img.shields.io/badge/PHP-8.1%2B-F0603F">
  <img alt="Node.js" src="https://img.shields.io/badge/Node.js-18%2B-F0603F">
  <img alt="Dependencies" src="https://img.shields.io/badge/dependencies-none-1a2232">
</p>

---

[AtexPay](https://atexpay.com) lets freelancers and businesses accept card payments under their
own brand — branded payment links, branded checkout, your name on the card statement. These SDKs
wrap the [merchant API](https://atexpay.com/docs/) so an integration is one file and a handful of
method calls: create payment links, send known customers to prefilled checkouts, read
transactions, and verify the signed webhooks AtexPay sends the moment a payment changes status.

Both SDKs are **server-side** libraries. Your API key and webhook signing secret must never
reach a browser or mobile app.

## What's in this repository

| Directory | SDK | Requirements |
|---|---|---|
| [`php/`](php/) | `AtexPay.php` — single-file PHP client | PHP 8.1+, `ext-curl` |
| [`js/`](js/) | `atexpay.js` — single-file JavaScript client (ESM) | Node.js 18+ |

Each directory carries the client, its own README, and a worked example
(`example.php` / `example.mjs`). The [API docs](https://atexpay.com/docs/#sdks) link straight
to the raw files in this repository.

## Install

No package manager needed — copy the file into your project:

```php
// PHP
require __DIR__.'/AtexPay.php';

$atexpay = new \AtexPay\Client('atx_your_api_key');
```

```js
// JavaScript (Node.js, ESM)
import { AtexPay, verifyWebhook } from './atexpay.js';

const atexpay = new AtexPay(process.env.ATEXPAY_API_KEY);
```

Create your API key in the dashboard under **Settings → Developers**.

## Quickstart

Create a payment link and send the buyer to it:

```php
$link = $atexpay->createPaymentLink([
    'name' => 'Growth audit',
    'price_minor' => 45000,                        // $450.00, integer cents
    'return_url' => 'https://yoursite.com/thanks', // buyer comes back here after paying
]);
// share $link['url'] — or do it in one call for a signed-in customer:
$atexpay->redirectToCheckout(
    ['name' => 'Growth audit', 'price_minor' => 45000, 'return_url' => 'https://yoursite.com/thanks'],
    ['email' => $user->email, 'name' => $user->name],   // arrives prefilled at checkout
);
```

```js
const url = await atexpay.createCheckoutUrl(
  { name: 'Growth audit', price_minor: 45000, return_url: 'https://yoursite.com/thanks' },
  { email: user.email, name: user.name },
);
res.redirect(url);
```

When customer details are passed, the checkout URL carries them as an opaque encrypted token —
the buyer's email arrives prefilled and hidden, name and address prefilled but editable, and
nothing readable appears in the URL.

## Webhooks

Register your endpoint URL in **Settings → Developers**, store the `atxwh_` signing secret, and
verify every delivery — one call returns the parsed event or throws:

```php
$event = \AtexPay\Webhook::verify(
    file_get_contents('php://input'),
    getallheaders(),
    getenv('ATEXPAY_WEBHOOK_SECRET'),
);
if ($event['type'] === 'payment.succeeded') { /* fulfil $event['data'] */ }
```

```js
app.post('/webhooks/atexpay', express.raw({ type: 'application/json' }), (req, res) => {
  let event;
  try { event = verifyWebhook(req.body, req.headers, process.env.ATEXPAY_WEBHOOK_SECRET); }
  catch { return res.sendStatus(400); }
  res.sendStatus(200); // respond fast, process after
  if (event.type === 'payment.succeeded') { /* fulfil event.data */ }
});
```

Events fire on every payment status change: `payment.pending`, `payment.succeeded`,
`payment.failed`, `payment.refunded`, `payment.disputed`. Deliveries retry automatically and
reuse the same event id — deduplicate on `event.id`.

## Every method, at a glance

| Method | Endpoint |
|---|---|
| `ping()` | `GET /v1/ping` — confirm the key works |
| `createPaymentLink(params)` | `POST /v1/payment-links` |
| `paymentLinks()` | `GET /v1/payment-links` |
| `createCheckoutSession(linkId, customer)` | `POST /v1/payment-links/{id}/checkout-sessions` |
| `createCheckoutUrl(linkParams, customer?)` | link + session in one call → checkout URL |
| `redirectToCheckout(linkParams, customer?)` | *(PHP)* same, then redirects and exits |
| `transactions()` | `GET /v1/transactions` |
| `transaction(id)` | `GET /v1/transactions/{id}` |
| `Webhook::verify(...)` / `verifyWebhook(...)` | verify a signed webhook delivery |

Amounts are integers in minor units (cents). Identifiers are opaque and stable:
`link_…`, `prod_…`, `txn_…`, `evt_…`. All the details live in the
[API reference](https://atexpay.com/docs/).

## The one rule

> The buyer's return redirect (`?status=success`) is **UX only**. Fulfil orders from the
> verified webhook event or `transaction(id)` — never from the redirect.

## Support

Questions, keys, or account help: [atexpay.com/contact](https://atexpay.com/contact/) — or the
docs at [atexpay.com/docs](https://atexpay.com/docs/).

<p align="center">
  <a href="https://atexpay.com"><img src="https://atexpay.com/images/atex-pay-mark-256.png" alt="AtexPay" width="40"></a><br>
  <sub>© 2026 AtexPay. Take payments under your own brand.</sub>
</p>
