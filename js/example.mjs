/**
 * AtexPay JavaScript SDK — worked examples (Node.js 18+, server-side only).
 */

import { AtexPay, ProductExistsError, verifyWebhook } from './atexpay.js';

const atexpay = new AtexPay(process.env.ATEXPAY_API_KEY);

// ── 1. Smoke test the key ────────────────────────────────────────────────
const pong = await atexpay.ping();
console.log(`Connected as ${pong.seller}`);

// ── 2. Add a product and share its checkout page ─────────────────────────
const brandAudit = {
    name: 'Brand audit',
    description: 'Full brand review with a written report, delivered as a PDF.',
    category: 'marketing',
    delivery_type: 'downloadable',
    price_minor: 145000, // $1,450.00
    return_url: 'https://your-site.example/thanks',
};

let product;
try {
    product = await atexpay.createProduct(brandAudit);
} catch (error) {
    if (!(error instanceof ProductExistsError)) throw error;
    // Titles are unique per seller: reuse the product you already have.
    product = await atexpay.product(error.productId);
}
console.log(`Buy at: ${product.checkout_url}`);

// ── 3. Change it later — wording, price, or take it off sale ─────────────
await atexpay.updateProduct(product.id, { price_minor: 155000 });

// ── 4. Or: send a logged-in customer straight to a prefilled checkout ────
// Reuses the product with this title. Their email arrives prefilled and
// hidden; name and address arrive prefilled but editable.
const url = await atexpay.createCheckoutUrl(brandAudit, {
    email: 'customer@example.com',
    name: 'Jordan Buyer',
    address: { country: 'US', line1: '123 Main St', city: 'Any Town', state: 'CA', postal_code: '12345' },
});
// In Express: res.redirect(url)
console.log(`Prefilled checkout: ${url}`);

// ── 5. Webhook endpoint (Express) ────────────────────────────────────────
// Register the URL in Settings → Developers and store the atxwh_ secret.
/*
import express from 'express';
const app = express();

app.post('/webhooks/atexpay', express.raw({ type: 'application/json' }), async (req, res) => {
    let event;
    try {
        event = verifyWebhook(req.body, req.headers, process.env.ATEXPAY_WEBHOOK_SECRET);
    } catch {
        return res.sendStatus(400); // forged or stale — do not process
    }

    res.sendStatus(200); // respond fast, process after

    if (event.type === 'payment.succeeded') {
        // Deduplicate on event.id — retries reuse the same event id.
        const orderId = event.data.order_id; // the order to deliver
        // ... prepare the files, then:
        await atexpay.deliverOrder(orderId, { delivery_note: 'Your report is attached.' }, ['/path/to/report.pdf']);
    }
});
*/

// ── 6. Orders waiting for you ────────────────────────────────────────────
// for (const order of await atexpay.orders('in_progress')) console.log(order.id);
