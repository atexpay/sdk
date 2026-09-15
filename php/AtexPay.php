<?php

/**
 * AtexPay PHP SDK — a single-file client for the AtexPay merchant API.
 *
 * Version 1.0.0 · PHP 8.1+ · no dependencies beyond ext-curl.
 *
 * Drop this file into your project and require it:
 *
 *     require __DIR__.'/AtexPay.php';
 *
 *     $atexpay = new \AtexPay\Client('atx_your_api_key');
 *     $link = $atexpay->createPaymentLink([
 *         'name' => 'Brand audit',
 *         'price_minor' => 145000,               // $1,450.00 in cents
 *         'return_url' => 'https://your-site.example/thanks',
 *     ]);
 *     // Send the buyer to $link['url'] — or use redirectToCheckout().
 *
 * Full API reference: https://atexpay.com/docs/
 */

namespace AtexPay;

/** Base error for every failed API call. */
class ApiException extends \Exception
{
    /** @param array<string, array<int, string>> $errors field => messages, when the API returned any */
    public function __construct(string $message, public readonly int $status = 0, public readonly array $errors = [])
    {
        parent::__construct($message);
    }
}

/** The API key is missing, wrong, or revoked (HTTP 401). */
class AuthenticationException extends ApiException {}

/** The request body failed validation (HTTP 422). Inspect ->errors. */
class ValidationException extends ApiException {}

/** A webhook payload failed signature or timestamp verification. */
class SignatureVerificationException extends \Exception {}

class Client
{
    public const VERSION = '1.0.0';

    private string $baseUrl;

    public function __construct(
        private string $apiKey,
        string $baseUrl = 'https://api.atexpay.com/v1',
    ) {
        $this->baseUrl = rtrim($baseUrl, '/');
    }

    /** Confirms the key works. Returns ['ok' => true, 'merchant' => …, 'time' => …]. */
    public function ping(): array
    {
        return $this->request('GET', '/ping');
    }

    /**
     * Create a payment link.
     *
     * $params: name (required), price_minor (required, cents), description,
     * buyer_email, single_use (bool), return_url (https — where the buyer is
     * sent after paying, with ?status=success&link=… appended).
     *
     * Returns the link object; its 'url' is the page to send buyers to.
     */
    public function createPaymentLink(array $params): array
    {
        return $this->request('POST', '/payment-links', $params);
    }

    /** The 100 most recent payment links. */
    public function paymentLinks(): array
    {
        return $this->request('GET', '/payment-links');
    }

    /**
     * Mint a checkout URL that carries the buyer's details as an opaque,
     * expiring token — nothing readable or alterable in the URL. On the
     * payment page the email arrives prefilled and hidden; name and address
     * arrive prefilled but stay editable.
     *
     * $customer: email, name, address{country, line1, line2, city, state,
     * postal_code} — pass at least one.
     *
     * Returns ['url' => …, 'expires_at' => …] (the URL is valid for 24 hours).
     */
    public function createCheckoutSession(string $linkId, array $customer): array
    {
        return $this->request('POST', '/payment-links/'.rawurlencode($linkId).'/checkout-sessions', $customer);
    }

    /**
     * One call from product page to payment page: creates the link and, when
     * customer details are given, a prefilled checkout URL for this buyer.
     * Returns the URL to send the buyer to.
     */
    public function createCheckoutUrl(array $linkParams, array $customer = []): string
    {
        $link = $this->createPaymentLink($linkParams);

        if ($customer === []) {
            return $link['url'];
        }

        return $this->createCheckoutSession($link['id'], $customer)['url'];
    }

    /**
     * createCheckoutUrl(), then immediately redirect the browser there and
     * stop the script. Call before any output has been sent.
     */
    public function redirectToCheckout(array $linkParams, array $customer = []): never
    {
        $url = $this->createCheckoutUrl($linkParams, $customer);

        header('Location: '.$url, true, 303);
        exit;
    }

    /** The 100 most recent transactions (newest first). */
    public function transactions(): array
    {
        return $this->request('GET', '/transactions');
    }

    /**
     * Full detail for one transaction by its txn_ id — the same shape your
     * webhook endpoint receives in the event's `data` object. Use this (or
     * the webhook) as the source of truth before fulfilling; never the
     * buyer's return redirect.
     */
    public function transaction(string $id): array
    {
        return $this->request('GET', '/transactions/'.rawurlencode($id));
    }

    private function request(string $method, string $path, ?array $body = null): array
    {
        $ch = curl_init($this->baseUrl.$path);

        $headers = [
            'Authorization: Bearer '.$this->apiKey,
            'Accept: application/json',
            'User-Agent: atexpay-php/'.self::VERSION,
        ];

        if ($body !== null) {
            $headers[] = 'Content-Type: application/json';
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
        }

        curl_setopt_array($ch, [
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_TIMEOUT => 15,
            CURLOPT_FOLLOWLOCATION => false,
        ]);

        $raw = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $error = curl_error($ch);
        curl_close($ch);

        if ($raw === false) {
            throw new ApiException('Could not reach the AtexPay API: '.$error);
        }

        $json = json_decode((string) $raw, true);

        if ($status >= 200 && $status < 300) {
            return is_array($json) ? ($json['data'] ?? $json) : [];
        }

        $message = $json['error']['message'] ?? $json['message'] ?? 'AtexPay API error (HTTP '.$status.').';
        $errors = is_array($json['errors'] ?? null) ? $json['errors'] : [];

        throw match (true) {
            $status === 401 => new AuthenticationException($message, $status),
            $status === 422 => new ValidationException($message, $status, $errors),
            default => new ApiException($message, $status, $errors),
        };
    }
}

class Webhook
{
    /**
     * Verify a webhook delivery and return the decoded event.
     *
     * Call with the RAW request body (before any JSON parsing), the request
     * headers, and your endpoint's signing secret (atxwh_…) from
     * Settings → Developers. Throws SignatureVerificationException when the
     * signature is wrong or the timestamp is outside the tolerance — treat
     * that as a forged request and respond 400.
     *
     *     $event = \AtexPay\Webhook::verify(
     *         file_get_contents('php://input'),
     *         getallheaders(),
     *         $signingSecret,
     *     );
     *     // $event['type'] is e.g. "payment.succeeded"; $event['data'] is the transaction.
     *
     * @param  array<string, string>  $headers
     */
    public static function verify(string $payload, array $headers, string $secret, int $toleranceSeconds = 300): array
    {
        $lower = array_change_key_case($headers, CASE_LOWER);

        $id = $lower['webhook-id'] ?? '';
        $timestamp = $lower['webhook-timestamp'] ?? '';
        $signatures = $lower['webhook-signature'] ?? '';

        if ($id === '' || $timestamp === '' || $signatures === '') {
            throw new SignatureVerificationException('Missing webhook signature headers.');
        }

        if (abs(time() - (int) $timestamp) > $toleranceSeconds) {
            throw new SignatureVerificationException('Webhook timestamp outside of tolerance.');
        }

        $expected = base64_encode(hash_hmac('sha256', $id.'.'.$timestamp.'.'.$payload, $secret, true));

        // The header may carry several space-separated signatures (e.g. after
        // a secret roll) — any one valid v1 signature accepts the delivery.
        foreach (explode(' ', $signatures) as $candidate) {
            if (str_starts_with($candidate, 'v1,') && hash_equals($expected, substr($candidate, 3))) {
                $event = json_decode($payload, true);

                if (! is_array($event)) {
                    throw new SignatureVerificationException('Webhook payload is not valid JSON.');
                }

                return $event;
            }
        }

        throw new SignatureVerificationException('No matching webhook signature.');
    }
}
