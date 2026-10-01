# 05 Reuse Map

Source repos:
- `github.com/dhru7777/midnightx402` (Monad testnet, chain id 10143). **Primary source for chain code.**
- `github.com/dhru7777/Rho-AgentLedger` (Arc testnet for payments, Sepolia for ERC-8004). **Source for patterns, not chain code.**

Clone both into `../_ref/` next to this repo. Never import from them directly; copy and adapt into `packages/` or `apps/`, with a header comment naming the source file.

## Port directly (small edits only)

| Source file | Destination | What it gives us | Edits needed |
|---|---|---|---|
| `midnightx402/src/receipts/hash.ts` | `packages/core/src/receipt-hash.ts` | Canonical JSON + SHA-256 receipt hash | None |
| `midnightx402/src/hardening/sensitive.ts` | `packages/core/src/sensitive.ts` | Blocks secrets in responses | Add `prf`, `seed`, `mnemonic`, `privatekey` to regex |
| `midnightx402/src/wallets/chains.ts` | `packages/chain/src/chains.ts` | Monad testnet + mainnet `defineChain`, USDC address, ERC20 ABI | Prefer `monadTestnet` from `viem/chains` if present; keep USDC constant; add EIP-3009 ABI items |
| `midnightx402/src/identity/constants.ts` | `packages/chain/src/erc8004/constants.ts` | ERC-8004 registry addresses on Monad testnet, explorer URL helpers, 8004scan URL | None. Verify addresses (see `13-ENV-CONFIG.md`) |
| `midnightx402/src/identity/IdentityRegistry.abi.json`, `ReputationRegistry.abi.json`, `abi.ts` | `packages/chain/src/erc8004/` | ABIs | None |
| `midnightx402/src/identity/register.ts` | `apps/agent/scripts/register-agent.ts` | Register agent on Monad ERC-8004, parse `Registered` event, set agent URI | Swap raw private key account for Dynamic wallet account when available; keep gas buffer pattern |
| `midnightx402/src/economics/x402.ts` `createFacilitatorClient` | `apps/gateway/src/adapters/facilitator/live.ts` | Monad x402 facilitator `/verify` and `/settle` client | Make base URL configurable; add zod parse of responses |
| `midnightx402/src/economics/x402.ts` `signExactPayment` | `packages/chain/src/x402/sign-exact.ts` | EIP-3009 typed data for USDC on Monad, x402 v2 `exact` payload | **Reverse direction**: there the merchant pays the agent; here the agent pays the property. Generalize to `signExactPayment({ from, to, value, nonce, validAfter, validBefore, signer })` where `signer` is any viem `LocalAccount` or Dynamic signer |
| `midnightx402/src/economics/contracts.ts` `X402ExactRequest` types | `packages/chain/src/x402/types.ts` | Typed x402 request shape | Merge with Rho types below |
| `midnightx402/contracts/CommerceReceiptRegistry.sol` | `contracts/Data402AccessRegistry.sol` | Operator-gated receipt anchoring, revision chain, events | Rename, replace fields (see `06-DATA-MODEL.md`), add `recordAccessBatch`, drop revision chain (access receipts are single-shot) |
| `midnightx402/scripts/compile-phase9.ts`, `deploy-phase9.ts` | `contracts/scripts/compile.ts`, `deploy.ts` | solc compile + viem deploy, writes deployment JSON | Change contract names and output path |
| `midnightx402/src/identity/history.ts` | reference only | Shows the 100-block `getLogs` limit on Monad | Use as the "why Envio" slide, not as code |
| `Rho-AgentLedger/src/x402.ts` | `packages/chain/src/x402/codec.ts` | `PaymentRequirements`, `PaymentRequiredBody`, base64 encode/decode of `PAYMENT-REQUIRED` and `PAYMENT-SIGNATURE` | Remove Arc/Circle `extra` (GatewayWalletBatched). Use `extra: { name: "USDC", version: "2" }` like midnightx402. Remove `adapterPaymentPayload` from prod path, keep for mock mode |

## Port as a pattern (rewrite, keep the shape)

| Source | Destination | Pattern to keep |
|---|---|---|
| `Rho-AgentLedger/src/seller/server.ts` | `apps/gateway/src/routes/protected.ts` | 402 when no `PAYMENT-SIGNATURE`; settle then serve; CORS exposing `PAYMENT-REQUIRED`, allowing `PAYMENT-SIGNATURE`; `/health` and `/catalog` routes. Rewrite on Hono; replace Circle nanopayment settle with facilitator adapter |
| `Rho-AgentLedger/src/seller/catalog.ts` | `apps/gateway/src/policy/catalog.ts` | Route table with `path`, `priceUsd`, `x402` flag. Becomes DB-backed resource prices per property |
| `Rho-AgentLedger/src/policy.ts` | `packages/core/src/policy/evaluate.ts` | First matching rule wins; fail closed on missing identity; human-readable `reasons[]`. Flip perspective: gateway evaluates the **agent**, and the agent CLI evaluates the **price** (spend cap) |
| `Rho-AgentLedger/src/trust.ts` `characterFrom8004` | `apps/gateway/src/pipeline/identify.ts` | Map ERC-8004 signals to a trust tier (`missing | thin | watch | good`). Replace 8004scan HTTP lookup with direct Monad registry reads, keep 8004scan only as a UI link |
| `Rho-AgentLedger/src/ledger/reconcile.ts` | `apps/gateway/src/analytics/reconcile.ts` | Reference match first (their `order:` memo tag, our `nonce` / `requestId`), fuzzy match second (amount + time window + payer), then `unmatched`. Joins `request_log` with Envio `Payment` rows |
| `Rho-AgentLedger/src/ledger/attribution.ts` | `apps/gateway/src/analytics/attribution.ts` | Resolve which agent caused a payment. Ours: payer wallet -> ERC-8004 agent id via registry lookup cache |
| `Rho-AgentLedger/src/ledger/scorecard.ts` | `apps/gateway/src/analytics/agent-scorecard.ts` | Per-agent rollup. Ours: requests, paid, blocked, spend, first seen, last seen, identity tier |
| `midnightx402/src/orchestrator/run.ts` | `apps/gateway/src/pipeline/run.ts` | Staged pipeline with `complete | denied | failed | blocked`, idempotent `store.get` first, `runId` from receipt hash |
| `midnightx402/src/orchestrator/auth.ts` `DecisionAuthenticator` | `apps/gateway/src/owner-auth/` (optional) | HMAC plus replay set. We mainly need owner request signature verification (EIP-191) with a consumed nonce set; reuse the replay-set idea |
| `midnightx402/src/reputation/indexer.ts` | reference for Envio handlers | Idempotent ingest keyed by receipt hash; monotonic checks |
| `midnightx402/src/phases/phaseX/pipeline.ts` | reference | `idempotencyKey` naming like `payout:${eventId}`. Use `settle:${nonce}`, `record:${receiptHash}` |
| `Rho-AgentLedger/ui/ledger.html` and `ui/architecture.html` | `apps/dashboard` inspiration | Scorecard table layout and live architecture page. Rebuild in React; keep the idea of a live architecture page for judges |

## Do not reuse

| Source | Why |
|---|---|
| `Rho-AgentLedger/src/circle/*`, `src/stripe/*`, `src/rho/*`, `src/explorer/arcscan.ts` | Arc, Circle, Stripe, Rho banking. Not our chain or rails |
| `Rho-AgentLedger/contracts/AgentJobEscrow.sol` | Escrow is not in scope |
| `midnightx402/src/rain/*`, `src/cashback/*`, `CashbackCreditVault.sol` | Card rails and cashback. Not in scope |
| `midnightx402/src/capacity/*`, `AgentCapacityRegistry.sol` | Credit capacity. Out of scope; mention as future work only |
| `midnightx402/src/phases/phase4/*` (UCP, auction) | Commerce discovery. Not in scope |
| Any `ui*/` vanilla JS from either repo | Rebuild in React; copy only CSS tokens if useful |

## Mapping of concepts

| Old concept | Data402 concept |
|---|---|
| x402 seller (Rho) | Protected property gateway |
| Merchant incentive payment (midnight) | Agent pays property (direction reversed) |
| Commerce receipt | Access receipt |
| `commerceEventId` | `requestId` |
| `CommerceReceiptRegistry` | `Data402AccessRegistry` |
| Guardrails (budget, merchant risk, domain) | Access policy (identity, blocklist, price tier) |
| Order to settlement reconciliation | Request log to onchain payment reconciliation |
| Agent scorecard (4Cs) | Agent access scorecard |
