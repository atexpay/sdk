# AtexPay PHP SDK

A single-file client for the AtexPay products and orders API (v2.0.0). PHP 8.1+, no dependencies
beyond `ext-curl`.

## Install

Copy `AtexPay.php` anywhere into your project and require it:

```php
require __DIR__.'/AtexPay.php';

$atexpay = new \AtexPay\Client('atx_your_api_key');
```

Keep the API key server-side — never in a browser or mobile app.

## Methods

| Method | What it does |
|---|---|
| `ping()` | Confirms the key works; returns your seller name. |
| `createProduct($params)` | Adds a product. `name`, `description`, `category`, `delivery_type`, `price_minor` required; optional `buyer_email`, `return_url`. Throws `ProductExistsException` (with `->productId`) when the title is taken. |
| `products()` / `product($id)` | Your 100 most recent products / one `prod_` id. |
| `updateProduct($id, $changes)` | Changes name, description, category, delivery type, price, status, buyer email or return URL. |
| `createCheckoutSession($productId, $customer)` | Mints a prefilled checkout URL for one buyer — details travel as an opaque token, valid 24 h. |
| `createCheckoutUrl($productParams, $customer = [])` | Uses (or first creates) the product with this title and returns the URL to send the buyer to. |
| `redirectToCheckout($productParams, $customer = [])` | Same, then redirects the browser and exits. |
| `orders($status = null)` / `order($id)` | Recent orders / one `ord_` id with its delivery timeline. |
| `deliverOrder($id, $delivery, $files = [])` | Delivers an order with files (local paths) and/or a `delivery_url`; the buyer is emailed a link to collect it. |
| `transactions()` / `transaction($id)` | Recent payments / full detail for one `txn_` id. |
| `\AtexPay\Webhook::verify($rawBody, $headers, $secret)` | Verifies a webhook delivery and returns the event, or throws. |

## Errors

All API failures throw `\AtexPay\ApiException` (with `->status`, `->type` and,
on validation failures, `->errors`); `AuthenticationException`,
`ValidationException` and `ProductExistsException` are subclasses. Webhook verification failures throw
`\AtexPay\SignatureVerificationException` — respond 400 and do not process.

## The one rule

The buyer's return redirect (`?status=success`) is UX only. Fulfil from the
verified webhook event or `transaction($id)` — never from the redirect — and
deliver it with `deliverOrder()`.

See `example.php` for a full walkthrough, and https://atexpay.com/docs/ for
the API reference.
