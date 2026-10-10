<p align="center">
  <a href="https://atexpay.com">
    <img src="https://atexpay.com/images/atex-pay-logo.svg" alt="AtexPay" width="360">
  </a>
</p>

<h3 align="center">Sell your digital products and services.</h3>

<p align="center">
  Official AtexPay SDKs — single-file, zero-dependency clients for the AtexPay products and orders API.
</p>

<p align="center">
  <a href="https://atexpay.com">Website</a> ·
  <a href="https://atexpay.com/docs/">API documentation</a> ·
  <a href="https://portal.atexpay.com">Dashboard</a> ·
  <a href="https://atexpay.com/contact/">Support</a>
</p>

<p align="center">
  <img alt="Version" src="https://img.shields.io/badge/version-2.0.0-F0603F">
  <img alt="PHP" src="https://img.shields.io/badge/PHP-8.1%2B-F0603F">
  <img alt="Node.js" src="https://img.shields.io/badge/Node.js-18%2B-F0603F">
  <img alt="Dependencies" src="https://img.shields.io/badge/dependencies-none-1a2232">
</p>

---

[AtexPay](https://atexpay.com) is a web platform for selling digital products and services —
products with their own checkout pages, orders, delivery and buyer support. These SDKs wrap the
[products and orders API](https://atexpay.com/docs/) so an integration is one file and a handful
of method calls: add and update products, send known customers to prefilled checkouts, deliver
orders with files or a link, read sales, and verify the signed webhooks AtexPay sends the moment
a payment changes status.

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

Add a product and send the buyer to its checkout page:

```php
$growthAudit = [
    'name' => 'Growth audit',
    'description' => 'A six-week audit with a prioritised fix list, delivered as a PDF.',
    'category' => 'marketing',
    'delivery_type' => 'downloadable',
    'price_minor' => 45000,                        // $450.00, integer cents
    'return_url' => 'https://yoursite.com/thanks', // buyer comes back here after paying
];
$product = $atexpay->createProduct($growthAudit);
// share $product['checkout_url'] — or do it in one call for a signed-in customer
// (reuses the product with this title):
$atexpay->redirectToCheckout($growthAudit, ['email' => $user->email, 'name' => $user->name]);
```

```js
const url = await atexpay.createCheckoutUrl(growthAudit, { email: user.email, name: user.name });
res.redirect(url);
```

Titles are unique per seller: creating a second product with the same title fails with
`ProductExistsException` / `ProductExistsError`, which carries the existing product's id.

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
if ($event['type'] === 'payment.succeeded') {
    $atexpay->deliverOrder($event['data']['order_id'], ['delivery_url' => $downloadUrl]);
}
```

```js
app.post('/webhooks/atexpay', express.raw({ type: 'application/json' }), (req, res) => {
  let event;
  try { event = verifyWebhook(req.body, req.headers, process.env.ATEXPAY_WEBHOOK_SECRET); }
  catch { return res.sendStatus(400); }
  res.sendStatus(200); // respond fast, process after
  if (event.type === 'payment.succeeded') {
    atexpay.deliverOrder(event.data.order_id, { delivery_url: downloadUrl });
  }
});
```

Events fire on every payment status change: `payment.pending`, `payment.succeeded`,
`payment.failed`, `payment.refunded`, `payment.disputed`. Deliveries retry automatically and
reuse the same event id — deduplicate on `event.id`. Every payment carries its `product_id`
and `order_id`; a paid order waits in progress until you deliver it.

## Every method, at a glance

| Method | Endpoint |
|---|---|
| `ping()` | `GET /v1/ping` — confirm the key works |
| `createProduct(params)` | `POST /v1/products` |
| `products()` / `product(id)` | `GET /v1/products` / `GET /v1/products/{id}` |
| `updateProduct(id, changes)` | `PATCH /v1/products/{id}` |
| `createCheckoutSession(productId, customer)` | `POST /v1/products/{id}/checkout-sessions` |
| `createCheckoutUrl(productParams, customer?)` | product (reused by title) + session → checkout URL |
| `redirectToCheckout(productParams, customer?)` | *(PHP)* same, then redirects and exits |
| `orders(status?)` / `order(id)` | `GET /v1/orders` / `GET /v1/orders/{id}` |
| `deliverOrder(id, delivery, files?)` | `POST /v1/orders/{id}/deliver` |
| `transactions()` | `GET /v1/transactions` |
| `transaction(id)` | `GET /v1/transactions/{id}` |
| `Webhook::verify(...)` / `verifyWebhook(...)` | verify a signed webhook delivery |

Amounts are integers in minor units (cents). Identifiers are opaque and stable:
`prod_…`, `ord_…`, `txn_…`, `evt_…`. All the details live in the
[API reference](https://atexpay.com/docs/).

## The one rule

> The buyer's return redirect (`?status=success`) is **UX only**. Fulfil orders from the
> verified webhook event or `transaction(id)` — never from the redirect — and deliver them with
> `deliverOrder()`.

## Support

Seller and API questions: [sellers@atexpay.com](mailto:sellers@atexpay.com). Security reports:
[security@atexpay.com](mailto:security@atexpay.com). Docs: [atexpay.com/docs](https://atexpay.com/docs/).

<p align="center">
  <a href="https://atexpay.com"><img src="https://atexpay.com/images/atex-pay-mark-256.png" alt="AtexPay" width="40"></a><br>
  <sub>© 2026 AtexPay. A web platform for selling digital products and services.</sub>
</p>
