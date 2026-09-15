/**
 * AtexPay JavaScript SDK — worked examples (Node.js 18+, server-side only).
 */

import { AtexPay, verifyWebhook } from './atexpay.js';

const atexpay = new AtexPay(process.env.ATEXPAY_API_KEY);

// ── 1. Smoke test the key ────────────────────────────────────────────────
const pong = await atexpay.ping();
console.log(`Connected as ${pong.merchant}`);

// ── 2. Create a payment link and show it to the buyer ────────────────────
const link = await atexpay.createPaymentLink({
    name: 'Brand audit',
    description: 'Full brand review with a written report.',
    price_minor: 145000, // $1,450.00
    single_use: true,
    return_url: 'https://your-site.example/thanks',
});
console.log(`Pay at: ${link.url}`);

// ── 3. Or: send a logged-in customer straight to a prefilled checkout ────
// Their email arrives prefilled and hidden; name and address arrive
// prefilled but editable. Nothing readable appears in the URL.
const url = await atexpay.createCheckoutUrl(
    {
        name: 'Brand audit',
        price_minor: 145000,
        single_use: true,
        return_url: 'https://your-site.example/thanks',
    },
    {
        email: 'customer@example.com',
        name: 'Jordan Buyer',
        address: {
            country: 'US',
            line1: '123 Main St',
            city: 'Any Town',
            state: 'CA',
            postal_code: '12345',
        },
    },
);
// In Express: res.redirect(url)
console.log(`Prefilled checkout: ${url}`);

// ── 4. Webhook endpoint (Express) ────────────────────────────────────────
// Register the URL in Settings → Developers and store the atxwh_ secret.
/*
import express from 'express';
const app = express();

app.post('/webhooks/atexpay', express.raw({ type: 'application/json' }), (req, res) => {
    let event;
    try {
        event = verifyWebhook(req.body, req.headers, process.env.ATEXPAY_WEBHOOK_SECRET);
    } catch {
        return res.sendStatus(400); // forged or stale — do not process
    }

    res.sendStatus(200); // respond fast, process after

    if (event.type === 'payment.succeeded') {
        // fulfil the order for event.data.id — gross/fee/net are final here.
        // Deduplicate on event.id — retries reuse the same event id.
    }
});
*/

// ── 5. Query a transaction later ─────────────────────────────────────────
// const txn = await atexpay.transaction('txn_XXXXXXXXXXXX');
