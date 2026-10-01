# 03 Architecture

## Layers

| Layer | Job | Tech | Sponsor |
|---|---|---|---|
| Owner identity | Passkey sign-in, derive property keys and payout addresses | `@category-labs/mera`, WebAuthn PRF, BIP-44, HKDF | Mera |
| Property registry | Register a property, prove ownership, store policy and prices | Gateway API + SQLite | Track |
| Agent identity | Resolve who the agent is | ERC-8004 Identity + Reputation registries on Monad | Track |
| Access policy | Decide allow / charge / block per request | Policy engine (ported, first match wins) | Track |
| Payment | 402 challenge, verify, settle USDC | x402 v2 `exact` scheme, EIP-3009, Monad facilitator | Monad |
| Agent wallet | Hold USDC and sign payments for the agent | Dynamic wallet (server or embedded) | Dynamic |
| Receipts | Hash access receipt, anchor onchain | Canonical SHA-256, `Data402AccessRegistry.sol` | Track |
| Indexing | Turn onchain events into queryable data | Envio HyperIndex (GraphQL) | Envio |
| Analytics | Join request log with indexed payments, show dashboard | Reconciler (ported) + React dashboard | Envio, Track |

## Component diagram

```
                           DATA OWNER (browser)
                                  |
                        passkey (WebAuthn PRF)
                                  |
                        +---------v----------+
                        |   apps/dashboard   |  React + Vite
                        |  Mera session      |  derives keys client side
                        +---------+----------+
                                  | owner API (signed requests)
                                  v
+-------------+   HTTP   +-----------------------+   proxy   +------------------+
| apps/agent  | -------> |     apps/gateway      | --------> | apps/demo-origin |
| AI agent    | <------- |  Hono server          | <-------- | protected blog   |
| ERC-8004 id |   402 /  |  identify -> policy   |           | + llms.txt       |
| Dynamic     |   200    |  -> 402 -> verify     |           +------------------+
| wallet      |          |  -> settle -> deliver |
+------+------+          |  -> receipt -> log    |
       |                 +-----+-----------+-----+
       | signs EIP-3009        |           |
       | authorization         | verify /  | recordAccess()
       |                       | settle    |
       |                 +-----v-----+     |
       |                 | x402      |     |
       |                 |facilitator|     |
       |                 +-----+-----+     |
       |                       |           |
       v                       v           v
+--------------------------------------------------------------+
|                        MONAD TESTNET                          |
|  USDC (EIP-3009)   ERC-8004 registries   Data402AccessRegistry|
+-----------------------------+--------------------------------+
                              | events
                        +-----v------+
                        |  indexer/  |  Envio HyperIndex
                        |  GraphQL   |
                        +-----+------+
                              |
                  +-----------v------------+
                  | gateway analytics API  |  joins request_log + Envio
                  +-----------+------------+
                              v
                        apps/dashboard
```

## Request lifecycle (gateway)

This is the core. Implement it as an ordered pipeline of pure-ish stages, like `midnightx402/src/orchestrator/run.ts`, where each stage returns `complete | denied | failed` and later stages are `blocked` after a denial.

```
1. RECEIVE      GET /p/:propertySlug/*path
                assign requestId (uuid v7), timestamp, capture headers
2. CLASSIFY     human | agent | unknown
                agent if: X-Agent-Id header, or PAYMENT-SIGNATURE present,
                or Accept: application/x-data402, or known agent UA (claimed only)
                humans pass straight through to origin (no charge)
3. IDENTIFY     if X-Agent-Id present: resolve ERC-8004 agent on Monad
                -> { agentId, owner, agentWallet, uri, reputation } or IDENTITY_UNAVAILABLE
                verify the request's payer wallet matches the agent's registered wallet
                -> identity.status = verified | claimed | anonymous
4. POLICY       load property policy + resource price
                first-match rules: block list, require-identity, free allow, price
                -> ALLOW_FREE | CHARGE(amountMicros) | DENY(reason)
5. CHALLENGE    CHARGE and no PAYMENT-SIGNATURE -> 402
                body + PAYMENT-REQUIRED header (base64 JSON), log request as UNPAID
6. VERIFY       decode PAYMENT-SIGNATURE, check accepted matches our requirement
                (network, asset, amount >= price, payTo == property payout address,
                validBefore in future, nonce unused) then facilitator /verify
7. SETTLE       facilitator /settle -> txHash. On failure: 402, log FAILED
8. DELIVER      fetch origin content, return 200 + content
                + PAYMENT-RESPONSE header + X-Data402-Receipt header
9. RECEIPT      build AccessReceipt, canonical hash, store
                enqueue recordAccess(receiptHash, ...) to registry (async, batched)
10. LOG         write request_log row with final status
```

Stages 6 to 8 must be idempotent on `nonce`. Replay of a settled nonce returns the stored receipt and content only if the original requestId matches; otherwise `REPLAY` 402.

## Why an onchain access registry, not only USDC transfers

A USDC `Transfer` event carries `from, to, value` and nothing about which resource or which agent id. Envio can index it, but analytics would then depend on offchain joins only. `Data402AccessRegistry` emits `AccessRecorded(requestId, receiptHash, agentId, propertyId, resourceHash, payer, amountMicros, paymentTxHash)` so Envio can produce per-agent, per-property, per-resource revenue from chain data alone. The gateway request log adds what the chain cannot see (unpaid 402s, blocked requests, humans).

Cost control: the registry supports `recordAccessBatch`. The gateway flushes every N receipts or T seconds. For the demo, flush immediately so the dashboard updates live.

## Key derivation (Mera, client side)

```
passkey --PRF--> prfOutput (32 bytes, never leaves browser memory)
   |
   +-- BIP-44 m/44'/60'/0'/0/0            -> owner account (EOA): signs owner API requests
   +-- BIP-44 m/44'/60'/0'/0/{1+propIdx}  -> property payout address (EOA): payTo for that property
   +-- HKDF(prfOutput, info="data402/v1/property/{slug}/ownership")
   |                                      -> secp256k1 key: signs ownership proof
   +-- HKDF(prfOutput, info="data402/v1/property/{slug}/content")
                                          -> AES-256-GCM key: encrypts premium payloads at rest (stretch)
```

`propIdx` is the property's index in the owner's property list (stored server side, not secret). Same passkey on any device re-derives every key and address. That is the Mera "many keys" story. Details in `08-INTEGRATIONS.md`.

## Ownership verification

1. Owner adds `https://site.example`. Dashboard derives the property ownership key and payout address.
2. Server issues a challenge `{ propertyId, origin, nonce, issuedAt }`.
3. Owner signs the challenge with the ownership key (EIP-191).
4. Owner publishes `/.well-known/data402.json` on the origin containing `{ propertyId, ownershipAddress, payoutAddress, signature }` (or a DNS TXT record, stretch).
5. Server fetches it, recovers the signer, checks it equals `ownershipAddress`. Property becomes `verified`.
For the demo origin we control, the file is written by a script.

## Repository layout

```
data402/
  instructions/              <- this folder
  .cursor/rules/data402.mdc
  apps/
    gateway/                 Hono server: pipeline, owner API, analytics API
      src/pipeline/          one file per stage (classify, identify, policy, challenge, verify, settle, deliver, receipt, log)
      src/routes/            protected.ts, owner.ts, analytics.ts, well-known.ts
      src/adapters/          facilitator, erc8004, envio, registry (live + mock each)
    dashboard/               React + Vite + Tailwind; Mera client; 3 screens
    agent/                   demo agent CLI: discovers llms.txt, handles 402, pays with Dynamic wallet
    demo-origin/             tiny static blog + llms.txt + /.well-known/data402.json
  packages/
    core/                    zod schemas, receipt hashing, policy engine, errors, money utils
    chain/                   monad chain defs, USDC, ERC-8004 ABIs + lookup, EIP-3009 helpers, x402 codec
  contracts/
    Data402AccessRegistry.sol
    scripts/                 compile (solc) + deploy (viem), ported from midnightx402/scripts
  indexer/                   Envio HyperIndex project: config.yaml, schema.graphql, src/EventHandlers.ts
  docs/
    evidence.md              every live tx hash with explorer link
    submission.md
```

## Runtime topology for the demo

| Process | Port | Notes |
|---|---|---|
| gateway | 8402 | public URL via tunnel or Railway (both repos already deploy to Railway) |
| demo-origin | 8403 | only reachable through gateway in the demo |
| dashboard | 5173 | must be HTTPS or localhost for WebAuthn PRF |
| indexer | Envio hosted or local `envio dev` | GraphQL endpoint in env |
| agent | CLI | run live on stage |

Passkeys are bound to `rpId` (the hostname). Pick the final dashboard domain early and never change it, or every derived key and payout address changes.
