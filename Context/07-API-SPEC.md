# 07 API Spec

Base URL (gateway): `GATEWAY_PUBLIC_URL`, default `http://localhost:8402`.
All JSON responses pass through `assertNoSensitiveFields`.

## A. Protected resource (agent facing)

### `GET /p/:slug/*path`

Request headers (all optional):

| Header | Meaning |
|---|---|
| `X-Agent-Id` | ERC-8004 agent id on Monad testnet (decimal) |
| `PAYMENT-SIGNATURE` | base64 JSON x402 v2 payment payload |
| `User-Agent` | Recorded as `claimed` only |
| `Accept` | `application/x-data402` marks the caller as an agent |

Responses:

**200 (free or paid)**
```
Content-Type: <origin content type>
PAYMENT-RESPONSE: base64({ success, transaction, network, payer })   (paid only)
X-Data402-Receipt: <receiptHash>
X-Data402-Request-Id: <requestId>
Link: </receipts/<receiptHash>>; rel="receipt"
```

**402 Payment Required**
```
PAYMENT-REQUIRED: base64(PaymentRequiredBody)
X-Data402-Request-Id: <requestId>
Content-Type: application/json
```
```json
{
  "error": "Payment Required",
  "x402Version": 2,
  "resource": {
    "url": "https://gw.example/p/dheeraj-blog/articles/agentic-payments",
    "description": "Data402: Agentic payments deep dive",
    "mimeType": "text/html"
  },
  "accepts": [{
    "scheme": "exact",
    "network": "eip155:10143",
    "asset": "<MONAD_TESTNET_USDC>",
    "amount": "10000",
    "payTo": "<property payoutAddress>",
    "maxTimeoutSeconds": 300,
    "extra": { "name": "USDC", "version": "2" }
  }],
  "data402": {
    "requestId": "...",
    "propertyId": "...",
    "identity": { "status": "anonymous", "tier": "missing" },
    "priceReason": "Default price 0.01 USDC. Unregistered agents pay 2x.",
    "license": "single-use"
  }
}
```

The `data402` block is an extension. Clients that ignore it still work with plain x402.

**403 Forbidden** (policy DENY): `{ "error": "Forbidden", "code": "POLICY_DENIED", "reasons": [...] }`

**402 with error** (bad payment): `{ "error": "...", "code": "PAYMENT_INVALID" | "SETTLEMENT_FAILED" | "REPLAY" }` plus a fresh `PAYMENT-REQUIRED` header so the agent can retry.

Verification checks before calling the facilitator (all must pass):
- `accepted.scheme == "exact"`, `network == "eip155:10143"`, `asset == USDC`
- `payload.authorization.to == property.payoutAddress`
- `BigInt(payload.authorization.value) >= priceMicros`
- `validBefore > now + 5s`, `validAfter <= now`
- `nonce` not in `receipts.payment_nonce`
- if `X-Agent-Id` present and identity verified: `authorization.from` equals registered agent wallet, else identity downgrades to `claimed`

### `GET /p/:slug/llms.txt` and `GET /p/:slug/robots.txt`
Always free. `llms.txt` lists resources with prices and a line: `Payment: x402 on Monad, see /.well-known/data402.json`.

### `GET /.well-known/data402.json` (gateway level)
Machine readable catalog: properties, resources, prices, network, asset, facilitator URL.

### `GET /receipts/:receiptHash`
Public receipt JSON (no content). Includes explorer links for `payment.txHash` and registry anchor tx if anchored.

## B. Owner API (dashboard facing)

Auth: every mutating request carries headers
```
X-Owner-Address: <owner EOA>
X-Owner-Nonce: <uuid>
X-Owner-Timestamp: <unix seconds>
X-Owner-Signature: EIP-191 sig over sha256(method + path + nonce + timestamp + sha256(body))
```
Signed client side with the Mera derived owner account (BIP-44 index 0). Server checks recovery, 60s timestamp window, nonce unused.

| Method | Path | Body | Result |
|---|---|---|---|
| POST | `/api/owners` | `{ ownerAddress, credentialId }` | create owner (signature proves control) |
| GET | `/api/properties` | | list owner properties |
| POST | `/api/properties` | `{ slug, origin, propIndex, payoutAddress, ownershipAddress }` | create property, returns `challenge` |
| POST | `/api/properties/:id/verify` | `{ signature }` or `{ method: "well-known" }` | runs ownership check, sets status |
| GET | `/api/properties/:id/policy` | | policy |
| PUT | `/api/properties/:id/policy` | `propertyPolicySchema` | replace policy |
| POST | `/api/properties/:id/register-onchain` | | operator calls `registerProperty` |

## C. Analytics API (dashboard facing, owner auth on GET via signed query or session token)

| Method | Path | Returns | Source |
|---|---|---|---|
| GET | `/api/analytics/:propertyId/summary` | totalRequests, agentRequests, challenged, paid, denied, uniqueAgents, revenueMicros | request_log + Envio |
| GET | `/api/analytics/:propertyId/agents` | agent scorecards | Envio `Agent` + request_log |
| GET | `/api/analytics/:propertyId/resources` | per resource paid count + revenue | Envio `Access` + request_log |
| GET | `/api/analytics/:propertyId/feed?since=` | last N requests with reconciliation status | request_log + Envio |
| GET | `/api/analytics/:propertyId/stream` | SSE stream of new request_log rows | gateway |

Summary rule: revenue and paid counts come from Envio. Challenged, denied, human, and unknown counts come from `request_log`. Response includes `sources: { envio: "ok" | "stale" | "down", gateway: "ok" }`.

## D. Health

`GET /health` -> `{ ok, mode, network, usdc, facilitator: "ok|down", envio: "ok|down", registry: <address> }`

## Error code to status map

| Code | Status |
|---|---|
| `POLICY_DENIED` | 403 |
| `PAYMENT_REQUIRED` | 402 |
| `PAYMENT_INVALID` | 402 |
| `SETTLEMENT_FAILED` | 402 |
| `REPLAY` | 402 |
| `IDENTITY_UNAVAILABLE` | treated as anonymous, never 500 |
| `ORIGIN_UNAVAILABLE` | 502 (payment already settled: store receipt with `delivery: "failed"`, allow free retry with same nonce for 10 minutes) |
| `OWNER_AUTH_FAILED` | 401 |
