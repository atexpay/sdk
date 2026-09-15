/**
 * AtexPay JavaScript SDK — a single-file client for the AtexPay merchant API.
 *
 * Version 1.0.0 · Node.js 18+ (uses global fetch and node:crypto) · ESM · no
 * dependencies. Server-side only: never ship your API key or webhook signing
 * secret to a browser.
 *
 *     import { AtexPay } from './atexpay.js';
 *
 *     const atexpay = new AtexPay(process.env.ATEXPAY_API_KEY);
 *     const link = await atexpay.createPaymentLink({
 *       name: 'Brand audit',
 *       price_minor: 145000, // $1,450.00 in cents
 *       return_url: 'https://your-site.example/thanks',
 *     });
 *     // Send the buyer to link.url — or use createCheckoutUrl().
 *
 * Full API reference: https://atexpay.com/docs/
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

export const VERSION = '1.0.0';

/** Base error for every failed API call. */
export class AtexPayError extends Error {
    /**
     * @param {string} message
     * @param {number} [status] HTTP status, 0 when the API was unreachable
     * @param {Record<string, string[]>} [errors] field => messages on validation failures
     */
    constructor(message, status = 0, errors = {}) {
        super(message);
        this.name = 'AtexPayError';
        this.status = status;
        this.errors = errors;
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

    /** Confirms the key works. Resolves to {ok, merchant, time}. */
    ping() {
        return this.#request('GET', '/ping');
    }

    /**
     * Create a payment link. `name` and `price_minor` (cents) are required;
     * optional: description, buyer_email, single_use, return_url (https —
     * where the buyer is sent after paying, with ?status=success&link=…).
     * Resolves to the link object; its `url` is the page for buyers.
     *
     * @param {object} params
     */
    createPaymentLink(params) {
        return this.#request('POST', '/payment-links', params);
    }

    /** The 100 most recent payment links. */
    paymentLinks() {
        return this.#request('GET', '/payment-links');
    }

    /**
     * Mint a checkout URL carrying the buyer's details as an opaque,
     * expiring token — nothing readable or alterable in the URL. On the
     * payment page the email arrives prefilled and hidden; name and address
     * arrive prefilled but stay editable.
     *
     * @param {string} linkId the link_ id
     * @param {{email?: string, name?: string, address?: {country?: string, line1?: string, line2?: string, city?: string, state?: string, postal_code?: string}}} customer at least one field
     * @returns {Promise<{url: string, expires_at: string}>} valid for 24 hours
     */
    createCheckoutSession(linkId, customer) {
        return this.#request('POST', `/payment-links/${encodeURIComponent(linkId)}/checkout-sessions`, customer);
    }

    /**
     * One call from product page to payment page: creates the link and, when
     * customer details are given, a prefilled checkout URL for this buyer.
     * Resolves to the URL to redirect the buyer to (e.g. res.redirect(url)).
     *
     * @param {object} linkParams as createPaymentLink
     * @param {object} [customer] as createCheckoutSession
     * @returns {Promise<string>}
     */
    async createCheckoutUrl(linkParams, customer = null) {
        const link = await this.createPaymentLink(linkParams);

        if (!customer || Object.keys(customer).length === 0) {
            return link.url;
        }

        const session = await this.createCheckoutSession(link.id, customer);

        return session.url;
    }

    /** The 100 most recent transactions (newest first). */
    transactions() {
        return this.#request('GET', '/transactions');
    }

    /**
     * Full detail for one transaction by its txn_ id — the same shape your
     * webhook endpoint receives in the event's `data` object. Use this (or
     * the webhook) as the source of truth before fulfilling; never the
     * buyer's return redirect.
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
                    ...(body ? { 'content-type': 'application/json' } : {}),
                },
                body: body ? JSON.stringify(body) : undefined,
            });
        } catch (cause) {
            throw new AtexPayError(`Could not reach the AtexPay API: ${cause.message}`);
        }

        const json = await response.json().catch(() => null);

        if (response.ok) {
            return json?.data ?? json ?? {};
        }

        const message = json?.error?.message ?? json?.message ?? `AtexPay API error (HTTP ${response.status}).`;

        throw new AtexPayError(message, response.status, json?.errors ?? {});
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
 *         // fulfil the order for event.data.id — gross/fee/net are final here.
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
