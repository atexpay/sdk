<?php

/**
 * AtexPay PHP SDK — worked examples.
 *
 * Everything below runs server-side. Never ship your API key or webhook
 * signing secret to a browser.
 */

require __DIR__.'/AtexPay.php';

$atexpay = new \AtexPay\Client(getenv('ATEXPAY_API_KEY'));

// ── 1. Smoke test the key ────────────────────────────────────────────────
$pong = $atexpay->ping();
echo "Connected as {$pong['merchant']}\n";

// ── 2. Create a payment link and show it to the buyer ────────────────────
$link = $atexpay->createPaymentLink([
    'name' => 'Brand audit',
    'description' => 'Full brand review with a written report.',
    'price_minor' => 145000,                     // $1,450.00
    'single_use' => true,
    'return_url' => 'https://your-site.example/thanks',
]);
echo "Pay at: {$link['url']}\n";

// ── 3. Or: send a logged-in customer straight to a prefilled checkout ────
// Their email arrives prefilled and hidden; name and address arrive
// prefilled but editable. Nothing readable appears in the URL.
$atexpay->redirectToCheckout([
    'name' => 'Brand audit',
    'price_minor' => 145000,
    'single_use' => true,
    'return_url' => 'https://your-site.example/thanks',
], [
    'email' => 'customer@example.com',
    'name' => 'Jordan Buyer',
    'address' => [
        'country' => 'US',
        'line1' => '123 Main St',
        'city' => 'Any Town',
        'state' => 'CA',
        'postal_code' => '12345',
    ],
]);

// ── 4. Webhook endpoint (its own route/file) ─────────────────────────────
// Register the URL in Settings → Developers and store the atxwh_ secret.
/*
$event = \AtexPay\Webhook::verify(
    file_get_contents('php://input'),
    getallheaders(),
    getenv('ATEXPAY_WEBHOOK_SECRET'),
);

// Respond fast, process after. Deduplicate on $event['id'] — retries
// reuse the same event id.
http_response_code(200);

if ($event['type'] === 'payment.succeeded') {
    $txn = $event['data'];
    // fulfil the order for $txn['id'] — gross/fee/net are final here
}
*/

// ── 5. Query a transaction later ─────────────────────────────────────────
// $txn = $atexpay->transaction('txn_XXXXXXXXXXXX');
