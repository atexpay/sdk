<?php

/**
 * AtexPay PHP SDK — a single-file client for the AtexPay products and orders API.
 *
 * Version 2.0.0 · PHP 8.1+ · no dependencies beyond ext-curl.
 *
 * Drop this file into your project and require it:
 *
 *     require __DIR__.'/AtexPay.php';
 *
 *     $atexpay = new \AtexPay\Client('atx_your_api_key');
 *     $product = $atexpay->createProduct([
 *         'name' => 'Brand audit',
 *         'description' => 'A written review of your brand, delivered as a PDF.',
 *         'category' => 'marketing',
 *         'delivery_type' => 'downloadable',
 *         'price_minor' => 145000,               // $1,450.00 in cents
 *         'return_url' => 'https://your-site.example/thanks',
 *     ]);
 *     // Send the buyer to $product['checkout_url'] — or use redirectToCheckout().
 *
 * Full API reference: https://atexpay.com/docs/
 */

namespace AtexPay;

/** Base error for every failed API call. */
class ApiException extends \Exception
{
    /** @param array<string, array<int, string>> $errors field => messages, when the API returned any */
    public function __construct(
        string $message,
        public readonly int $status = 0,
        public readonly array $errors = [],
        public readonly ?string $type = null,
    ) {
        parent::__construct($message);
    }
}

/** The API key is missing, wrong, or revoked (HTTP 401). */
class AuthenticationException extends ApiException {}

/** The request body failed validation (HTTP 422). Inspect ->errors. */
class ValidationException extends ApiException {}

/** A product with this title already exists (HTTP 409). Its id is ->productId. */
class ProductExistsException extends ApiException
{
    public function __construct(string $message, public readonly string $productId)
    {
        parent::__construct($message, 409, [], 'product_exists');
    }
}

/** A webhook payload failed signature or timestamp verification. */
class SignatureVerificationException extends \Exception {}

class Client
{
    public const VERSION = '2.0.0';

    private string $baseUrl;

    public function __construct(
        private string $apiKey,
        string $baseUrl = 'https://api.atexpay.com/v1',
    ) {
        $this->baseUrl = rtrim($baseUrl, '/');
    }

    /** Confirms the key works. Returns ['ok' => true, 'seller' => …, 'time' => …]. */
    public function ping(): array
    {
        return $this->request('GET', '/ping');
    }

    /**
     * Create a product. Its 'checkout_url' is the page to send buyers to.
     *
     * $params: name, description, category, delivery_type ('downloadable' |
     * 'service') and price_minor (cents) are required; optional buyer_email
     * (prefilled for every buyer — a custom order) and return_url (https —
     * where the buyer is sent after paying, with ?status=success&product=…).
     *
     * Throws ProductExistsException when a product with the same title
     * already exists; its ->productId is the existing product.
     */
    public function createProduct(array $params): array
    {
        return $this->request('POST', '/products', $params);
    }

    /** The 100 most recent products. */
    public function products(): array
    {
        return $this->request('GET', '/products');
    }

    /** One product by its prod_ id. */
    public function product(string $id): array
    {
        return $this->request('GET', '/products/'.rawurlencode($id));
    }

    /**
     * Change a product: any of name, description, category, delivery_type,
     * price_minor, status ('active' | 'paused'), buyer_email, return_url.
     * Orders already placed keep what was bought.
     */
    public function updateProduct(string $id, array $changes): array
    {
        return $this->request('PATCH', '/products/'.rawurlencode($id), $changes);
    }

    /**
     * Mint a checkout URL that carries the buyer's details as an opaque,
     * expiring token — nothing readable or alterable in the URL. On the
     * checkout page the email arrives prefilled and hidden; name and address
     * arrive prefilled but stay editable.
     *
     * $customer: email, name, address{country, line1, line2, city, state,
     * postal_code} — pass at least one.
     *
     * Returns ['url' => …, 'expires_at' => …] (the URL is valid for 24 hours).
     */
    public function createCheckoutSession(string $productId, array $customer): array
    {
        return $this->request('POST', '/products/'.rawurlencode($productId).'/checkout-sessions', $customer);
    }

    /**
     * One call from your product page to checkout: uses the product with
     * this title (creating it the first time) and, when customer details
     * are given, mints a prefilled checkout URL for this buyer. Returns the
     * URL to send the buyer to.
     */
    public function createCheckoutUrl(array $productParams, array $customer = []): string
    {
        try {
            $product = $this->createProduct($productParams);
        } catch (ProductExistsException $e) {
            $product = $this->product($e->productId);
        }

        if ($customer === []) {
            return $product['checkout_url'];
        }

        return $this->createCheckoutSession($product['id'], $customer)['url'];
    }

    /**
     * createCheckoutUrl(), then immediately redirect the browser there and
     * stop the script. Call before any output has been sent.
     */
    public function redirectToCheckout(array $productParams, array $customer = []): never
    {
        $url = $this->createCheckoutUrl($productParams, $customer);

        header('Location: '.$url, true, 303);
        exit;
    }

    /** The 100 most recent orders, optionally of one status (in_progress, delivered, completed, canceled). */
    public function orders(?string $status = null): array
    {
        return $this->request('GET', '/orders'.($status !== null ? '?status='.rawurlencode($status) : ''));
    }

    /** One order by its ord_ id, with its delivery timeline. */
    public function order(string $id): array
    {
        return $this->request('GET', '/orders/'.rawurlencode($id));
    }

    /**
     * Deliver an in-progress order: files (paths on this server) and/or a
     * delivery_url, plus an optional delivery_note. The buyer is emailed a
     * link to collect it; the order completes when they download or open it.
     *
     * @param  array{delivery_note?: string, delivery_url?: string}  $delivery
     * @param  list<string>  $files  local file paths
     */
    public function deliverOrder(string $id, array $delivery, array $files = []): array
    {
        $fields = array_filter($delivery, fn ($v) => $v !== null && $v !== '');

        foreach (array_values($files) as $i => $path) {
            $fields["files[{$i}]"] = new \CURLFile($path, mime_content_type($path) ?: 'application/octet-stream', basename($path));
        }

        return $this->request('POST', '/orders/'.rawurlencode($id).'/deliver', $fields, multipart: $files !== []);
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

    private function request(string $method, string $path, ?array $body = null, bool $multipart = false): array
    {
        $ch = curl_init($this->baseUrl.$path);

        $headers = [
            'Authorization: Bearer '.$this->apiKey,
            'Accept: application/json',
            'User-Agent: atexpay-php/'.self::VERSION,
        ];

        if ($body !== null && $multipart) {
            // cURL sets the multipart boundary itself.
            curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
        } elseif ($body !== null) {
            $headers[] = 'Content-Type: application/json';
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
        }

        curl_setopt_array($ch, [
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_TIMEOUT => $multipart ? 120 : 15,
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
        $type = $json['error']['type'] ?? null;

        throw match (true) {
            $status === 401 => new AuthenticationException($message, $status, [], $type),
            $status === 409 && $type === 'product_exists' => new ProductExistsException($message, (string) $json['error']['product_id']),
            $status === 422 => new ValidationException($message, $status, $errors, $type),
            default => new ApiException($message, $status, $errors, $type),
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
     *     // $event['type'] is e.g. "payment.succeeded"; $event['data'] is the transaction,
     *     // with its product_id and order_id.
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
