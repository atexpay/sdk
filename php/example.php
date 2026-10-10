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
echo "Connected as {$pong['seller']}\n";

// ── 2. Add a product and share its checkout page ─────────────────────────
$brandAudit = [
    'name' => 'Brand audit',
    'description' => 'Full brand review with a written report, delivered as a PDF.',
    'category' => 'marketing',
    'delivery_type' => 'downloadable',
    'price_minor' => 145000,                     // $1,450.00
    'return_url' => 'https://your-site.example/thanks',
];

try {
    $product = $atexpay->createProduct($brandAudit);
} catch (\AtexPay\ProductExistsException $e) {
    // Titles are unique per seller: reuse the product you already have.
    $product = $atexpay->product($e->productId);
}
echo "Buy at: {$product['checkout_url']}\n";

// ── 3. Change it later — wording, price, or take it off sale ─────────────
$atexpay->updateProduct($product['id'], ['price_minor' => 155000]);

// ── 4. Or: send a logged-in customer straight to a prefilled checkout ────
// Reuses the product with this title. Their email arrives prefilled and
// hidden; name and address arrive prefilled but editable.
$atexpay->redirectToCheckout($brandAudit, [
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

// ── 5. Webhook endpoint (its own route/file) ─────────────────────────────
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
    $orderId = $event['data']['order_id'];   // the order to deliver
    // ... prepare the files, then:
    $atexpay->deliverOrder($orderId, ['delivery_note' => 'Your report is attached.'], ['/path/to/report.pdf']);
}
*/

// ── 6. Orders waiting for you ────────────────────────────────────────────
// foreach ($atexpay->orders('in_progress') as $order) { echo $order['id'], "\n"; }
