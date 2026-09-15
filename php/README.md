# AtexPay PHP SDK

A single-file client for the AtexPay merchant API. PHP 8.1+, no dependencies
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
| `ping()` | Confirms the key works; returns your merchant name. |
| `createPaymentLink($params)` | Creates a link. `name` + `price_minor` required; optional `description`, `buyer_email`, `single_use`, `return_url`. |
| `paymentLinks()` | Your 100 most recent links. |
| `createCheckoutSession($linkId, $customer)` | Mints a prefilled checkout URL for one buyer — details travel as an opaque token, valid 24 h. |
| `createCheckoutUrl($linkParams, $customer = [])` | Creates a link and returns the URL to send the buyer to (prefilled when `$customer` given). |
| `redirectToCheckout($linkParams, $customer = [])` | Same, then redirects the browser and exits. |
| `transactions()` / `transaction($id)` | Recent payments / full detail for one `txn_` id. |
| `\AtexPay\Webhook::verify($rawBody, $headers, $secret)` | Verifies a webhook delivery and returns the event, or throws. |

## Errors

All API failures throw `\AtexPay\ApiException` (with `->status` and, on
validation failures, `->errors`); `AuthenticationException` and
`ValidationException` are subclasses. Webhook verification failures throw
`\AtexPay\SignatureVerificationException` — respond 400 and do not process.

## The one rule

The buyer's return redirect (`?status=success`) is UX only. Fulfil from the
verified webhook event or `transaction($id)` — never from the redirect.

See `example.php` for a full walkthrough, and https://atexpay.com/docs/ for
the API reference.
