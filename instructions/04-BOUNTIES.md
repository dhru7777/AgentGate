# 04 Bounties

Five targets. Each one owns a real layer of the product. Do not add others without updating `12-DECISIONS.md`.

## Summary

| Priority | Track / Bounty | Prize | Where to use it | What to use it for |
|---|---|---|---|---|
| 1 | Trust, Identity & AI Infrastructure | Track prize (see platform) | Whole product: gateway pipeline, ERC-8004 lookup, policy, receipts | Data ownership proof, agent identity, access control, provable access receipts |
| 2 | Mera: One Passkey, Many Keys | $2,500 | `apps/dashboard/src/mera/` key derivation | Derive separate keys per property and per purpose (payout address, ownership signing key, content key) from one passkey, re-derivable on any device |
| 2 | Best Use of Envio | $1,000 | `indexer/` + `apps/gateway/src/adapters/envio/` + dashboard | Index USDC payments and `AccessRecorded` events on Monad; power all revenue and agent analytics |
| 2 | Best Use of Dynamic | $5,000 | `apps/agent/src/wallet/` | Wallet for the paying AI agent: holds USDC, signs EIP-3009 authorizations when it meets a 402 |
| 3 | Best Mera-Powered UX on Monad | $2,500 | `apps/dashboard` onboarding and sign-in | Passkey-only owner onboarding: no seed phrase, no extension, one tap to sign in |

Total sponsor prize exposure: **$11,000** plus the track prize.

## Role split (locked)

- **Mera = the data owner.** Sign-in, owner account, property keys, payout addresses.
- **Dynamic = the AI agent.** Agent wallet that pays.
- They do not overlap. Do not use Dynamic for owner login. That would weaken the Mera UX submission.

## Per-bounty spec

### 1. Trust, Identity & AI Infrastructure (primary)

**Story:** Before Data402 answers "can this agent read this data," it answers "who is this agent, who owns this data, and can we prove the access happened."

Must show:
- Property ownership verified by signature (see `03-ARCHITECTURE.md`, Ownership verification).
- ERC-8004 agent resolved on Monad, with identity status `verified | claimed | anonymous` shown honestly.
- Policy that treats agents differently by identity (example: unregistered agents pay 2x or are blocked).
- Access receipt hash anchored onchain, linked from the dashboard.

Acceptance: an agent with an ERC-8004 id and an agent without one hit the same resource and get different outcomes, and both outcomes are visible in the dashboard.

### 2. Mera: One Passkey, Many Keys ($2,500)

**Story:** A data owner runs many properties. Each needs its own payout address and its own signing key, isolated from the others. Data402 derives all of them from one passkey and stores none of them.

Must show:
- At least 3 distinct derived keys with distinct purposes (owner account, per-property payout, per-property ownership key). At least one purpose is **not** wallet signing for transfers (ownership proof signing, and optionally content encryption).
- Nothing derived is persisted. Only `credentialId` and public addresses are stored.
- **Cross-device check:** sign in on device B with the synced passkey, re-derive, and show the same payout address and the same ownership address as device A. Build a `/verify` screen that does this and shows a green match.

Acceptance: `/verify` on a second device shows matches for every property. Record a short clip for submission.

**Verify first:** Save the bounty text verbatim to `docs/bounties.md` and map each requirement to a line above. If it requires a specific PRF salt per namespace instead of HKDF from one PRF output, switch to that (see `08-INTEGRATIONS.md`).

### 3. Best Use of Envio ($1,000)

**Story:** Envio is the analytics engine. Without it, the dashboard would poll Monad RPC in 100-block chunks and still not know which resource was paid for.

Must show:
- HyperIndex project indexing: USDC `Transfer` filtered to Data402 payout addresses, USDC `AuthorizationUsed`, `Data402AccessRegistry.AccessRecorded`, ERC-8004 `Registered` (optional).
- Entities: `Payment`, `Access`, `Agent`, `Property`, `Resource`, `DailyStat`.
- Dashboard numbers (revenue, paid requests, top agents, top resources) come from Envio GraphQL, not from gateway memory.

Acceptance: stop the gateway, open the dashboard, paid metrics still load (from Envio). Only unpaid and blocked counts go missing.

### 4. Best Use of Dynamic ($5,000)

**Story:** The paying agent needs a wallet it can use autonomously, without a human approving each 1 cent payment and without a raw private key in an `.env` file.

Must show:
- Agent wallet created and controlled through Dynamic.
- Agent receives a 402, evaluates price against its spend cap, signs EIP-3009 `transferWithAuthorization` typed data with the Dynamic wallet, retries with `PAYMENT-SIGNATURE`, gets content.
- Agent spend cap and per-request max enforced before signing (port policy from Rho).

Acceptance: the live demo agent pays with a Dynamic wallet and the tx appears on the explorer.

**Verify first:** Confirm from Dynamic docs and the bounty text which product fits (server wallets vs embedded wallet) and that it supports Monad testnet and EIP-712 `signTypedData`. If Dynamic cannot sign EIP-712 server side, the fallback is an embedded wallet in a small "agent operator" page that pre-signs within a cap. Record the result in `12-DECISIONS.md`.

### 5. Best Mera-Powered UX on Monad ($2,500)

**Story:** A blogger with no crypto experience monetizes their site in under a minute.

Must show:
- Onboarding: "Create account" -> one passkey prompt -> dashboard. No seed phrase, no extension, no network switch.
- Returning sign-in: one tap.
- Clear handling of `PRF_UNAVAILABLE` (desktop Chrome local profile) with a friendly instruction.
- Optional recovery: offer mnemonic export behind an explicit warning.

Acceptance: a first-time user completes onboarding plus adds a property in under 60 seconds on camera.

## Explicitly out

Privy, Qwen, KIMI, Nansen, Alchemy, CRE, Agora, Aurora, Cleanverse, Kuru, Perpl, Hunyuan, MetaMask Agent Wallet Plugin. Reason for each is in `12-DECISIONS.md`. A real LLM agent consumer is a stretch goal only (see `10-BUILD-PLAN.md`), and it does not target an AI bounty.
