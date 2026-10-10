/**
 * AtexPay JavaScript SDK — a single-file client for the AtexPay products and
 * orders API.
 *
 * Version 2.0.0 · Node.js 18+ (uses global fetch, FormData and node:crypto) ·
 * ESM · no dependencies. Server-side only: never ship your API key or webhook
 * signing secret to a browser.
 *
 *     import { AtexPay } from './atexpay.js';
 *
 *     const atexpay = new AtexPay(process.env.ATEXPAY_API_KEY);
 *     const product = await atexpay.createProduct({
 *       name: 'Brand audit',
 *       description: 'A written review of your brand, delivered as a PDF.',
 *       category: 'marketing',
 *       delivery_type: 'downloadable',
 *       price_minor: 145000, // $1,450.00 in cents
 *       return_url: 'https://your-site.example/thanks',
 *     });
 *     // Send the buyer to product.checkout_url — or use createCheckoutUrl().
 *
 * Full API reference: https://atexpay.com/docs/
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';

export const VERSION = '2.0.0';

/** Base error for every failed API call. */
export class AtexPayError extends Error {
    /**
     * @param {string} message
     * @param {number} [status] HTTP status, 0 when the API was unreachable
     * @param {Record<string, string[]>} [errors] field => messages on validation failures
     * @param {string | null} [type] the API's error type, e.g. "product_exists"
     */
    constructor(message, status = 0, errors = {}, type = null) {
        super(message);
        this.name = 'AtexPayError';
        this.status = status;
        this.errors = errors;
        this.type = type;
    }
}

/** A product with this title already exists (HTTP 409); `productId` is the existing one. */
export class ProductExistsError extends AtexPayError {
    constructor(message, productId) {
        super(message, 409, {}, 'product_exists');
        this.name = 'ProductExistsError';
        this.productId = productId;
    }
}

/** A webhook payload failed signature or timestamp verification. */
export class SignatureVerificationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'SignatureVerificationError';
    }
}

export class AtexPay {
    /**
     * @param {string} apiKey your atx_ secret API key
     * @param {{baseUrl?: string}} [options]
     */
    constructor(apiKey, { baseUrl = 'https://api.atexpay.com/v1' } = {}) {
        this.apiKey = apiKey;
        this.baseUrl = baseUrl.replace(/\/+$/, '');
    }

    /** Confirms the key works. Resolves to {ok, seller, time}. */
    ping() {
        return this.#request('GET', '/ping');
    }

    /**
     * Create a product; its `checkout_url` is the page for buyers. Required:
     * name, description, category, delivery_type ('downloadable' | 'service')
     * and price_minor (cents). Optional: buyer_email (a custom order) and
     * return_url (https — the buyer comes back with ?status=success&product=…).
     *
     * Rejects with ProductExistsError when the title is already taken.
     *
     * @param {object} params
     */
    createProduct(params) {
        return this.#request('POST', '/products', params);
    }

    /** The 100 most recent products. */
    products() {
        return this.#request('GET', '/products');
    }

    /** One product by its prod_ id. */
    product(id) {
        return this.#request('GET', `/products/${encodeURIComponent(id)}`);
    }

    /**
     * Change a product: any of name, description, category, delivery_type,
     * price_minor, status ('active' | 'paused'), buyer_email, return_url.
     * Orders already placed keep what was bought.
     *
     * @param {string} id
     * @param {object} changes
     */
    updateProduct(id, changes) {
        return this.#request('PATCH', `/products/${encodeURIComponent(id)}`, changes);
    }

    /**
     * Mint a checkout URL carrying the buyer's details as an opaque,
     * expiring token — nothing readable or alterable in the URL. On the
     * checkout page the email arrives prefilled and hidden; name and address
     * arrive prefilled but stay editable.
     *
     * @param {string} productId the prod_ id
     * @param {{email?: string, name?: string, address?: {country?: string, line1?: string, line2?: string, city?: string, state?: string, postal_code?: string}}} customer at least one field
     * @returns {Promise<{url: string, expires_at: string}>} valid for 24 hours
     */
    createCheckoutSession(productId, customer) {
        return this.#request('POST', `/products/${encodeURIComponent(productId)}/checkout-sessions`, customer);
    }

    /**
     * One call from your product page to checkout: uses the product with this
     * title (creating it the first time) and, when customer details are
     * given, a prefilled checkout URL for this buyer. Resolves to the URL to
     * redirect the buyer to (e.g. res.redirect(url)).
     *
     * @param {object} productParams as createProduct
     * @param {object} [customer] as createCheckoutSession
     * @returns {Promise<string>}
     */
    async createCheckoutUrl(productParams, customer = null) {
        let product;

        try {
            product = await this.createProduct(productParams);
        } catch (error) {
            if (!(error instanceof ProductExistsError)) throw error;
            product = await this.product(error.productId);
        }

        if (!customer || Object.keys(customer).length === 0) {
            return product.checkout_url;
        }

        const session = await this.createCheckoutSession(product.id, customer);

        return session.url;
    }

    /**
     * The 100 most recent orders, optionally of one status.
     *
     * @param {'in_progress' | 'delivered' | 'completed' | 'canceled'} [status]
     */
    orders(status) {
        return this.#request('GET', '/orders' + (status ? `?status=${encodeURIComponent(status)}` : ''));
    }

    /** One order by its ord_ id, with its delivery timeline. */
    order(id) {
        return this.#request('GET', `/orders/${encodeURIComponent(id)}`);
    }

    /**
     * Deliver an in-progress order: files (local paths) and/or a delivery_url,
     * plus an optional delivery_note. The buyer is emailed a link to collect
     * it; the order completes when they download or open it.
     *
     * @param {string} id
     * @param {{delivery_note?: string, delivery_url?: string}} delivery
     * @param {string[]} [files] local file paths
     */
    async deliverOrder(id, delivery, files = []) {
        const form = new FormData();

        for (const [key, value] of Object.entries(delivery ?? {})) {
            if (value !== undefined && value !== null && value !== '') form.append(key, String(value));
        }

        for (const path of files) {
            form.append('files[]', new Blob([await readFile(path)]), basename(path));
        }

        return this.#request('POST', `/orders/${encodeURIComponent(id)}/deliver`, form);
    }

    /** The 100 most recent transactions (newest first). */
    transactions() {
        return this.#request('GET', '/transactions');
    }

    /**
     * Full detail for one transaction by its txn_ id — the same shape your
     * webhook endpoint receives in the event's `data` object, with its
     * product_id and order_id. Use this (or the webhook) as the source of
     * truth before fulfilling; never the buyer's return redirect.
     *
     * @param {string} id
     */
    transaction(id) {
        return this.#request('GET', `/transactions/${encodeURIComponent(id)}`);
    }

    async #request(method, path, body = null) {
        let response;

        try {
            response = await fetch(this.baseUrl + path, {
                method,
                headers: {
                    authorization: `Bearer ${this.apiKey}`,
                    accept: 'application/json',
                    'user-agent': `atexpay-js/${VERSION}`,
                    // FormData sets its own multipart boundary.
                    ...(body && !(body instanceof FormData) ? { 'content-type': 'application/json' } : {}),
                },
                body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
            });
        } catch (cause) {
            throw new AtexPayError(`Could not reach the AtexPay API: ${cause.message}`);
        }

        const json = await response.json().catch(() => null);

        if (response.ok) {
            return json?.data ?? json ?? {};
        }

        const message = json?.error?.message ?? json?.message ?? `AtexPay API error (HTTP ${response.status}).`;

        if (response.status === 409 && json?.error?.type === 'product_exists') {
            throw new ProductExistsError(message, json.error.product_id);
        }

        throw new AtexPayError(message, response.status, json?.errors ?? {}, json?.error?.type ?? null);
    }
}

/**
 * Verify a webhook delivery and return the decoded event.
 *
 * Call with the RAW request body (a string or Buffer, before any JSON
 * parsing), the request headers, and your endpoint's signing secret (atxwh_…)
 * from Settings → Developers. Throws SignatureVerificationError when the
 * signature is wrong or the timestamp is outside the tolerance — treat that
 * as a forged request and respond 400.
 *
 * With Express, mount the route with a raw body parser:
 *
 *     app.post('/webhooks/atexpay', express.raw({ type: 'application/json' }), (req, res) => {
 *       const event = verifyWebhook(req.body, req.headers, process.env.ATEXPAY_WEBHOOK_SECRET);
 *       res.sendStatus(200); // respond fast, process after
 *       if (event.type === 'payment.succeeded') {
 *         // event.data.order_id is the order to deliver — gross/fee/net are final here.
 *         // Deduplicate on event.id — retries reuse the same event id.
 *       }
 *     });
 *
 * @param {string | Uint8Array} rawBody
 * @param {Record<string, string | string[] | undefined> | Headers} headers
 * @param {string} secret
 * @param {{toleranceSeconds?: number}} [options]
 * @returns {{id: string, type: string, created_at: string, data: object}}
 */
export function verifyWebhook(rawBody, headers, secret, { toleranceSeconds = 300 } = {}) {
    const get = (name) => {
        if (typeof headers?.get === 'function') return headers.get(name) ?? '';
        const value = headers?.[name] ?? headers?.[name.toLowerCase()] ?? '';
        return Array.isArray(value) ? (value[0] ?? '') : value;
    };

    const id = get('webhook-id');
    const timestamp = get('webhook-timestamp');
    const signatures = get('webhook-signature');

    if (!id || !timestamp || !signatures) {
        throw new SignatureVerificationError('Missing webhook signature headers.');
    }

    if (Math.abs(Date.now() / 1000 - Number(timestamp)) > toleranceSeconds) {
        throw new SignatureVerificationError('Webhook timestamp outside of tolerance.');
    }

    const payload = typeof rawBody === 'string' ? rawBody : new TextDecoder().decode(rawBody);
    const expected = createHmac('sha256', secret).update(`${id}.${timestamp}.${payload}`).digest();

    // The header may carry several space-separated signatures (e.g. after a
    // secret roll) — any one valid v1 signature accepts the delivery.
    const valid = signatures.split(' ').some((candidate) => {
        if (!candidate.startsWith('v1,')) return false;
        const given = Buffer.from(candidate.slice(3), 'base64');
        return given.length === expected.length && timingSafeEqual(given, expected);
    });

    if (!valid) {
        throw new SignatureVerificationError('No matching webhook signature.');
    }

    try {
        return JSON.parse(payload);
    } catch {
        throw new SignatureVerificationError('Webhook payload is not valid JSON.');
    }
}
