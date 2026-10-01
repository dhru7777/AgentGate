# 01 Context

## What we are building

**Data402: a monetization gateway for AI agents that access proprietary data.**

Owners of proprietary content (blogs, research, APIs, datasets) put Data402 in front of their origin. Humans pass through as usual. AI agents that request protected resources receive `HTTP 402 Payment Required` with an x402 payment requirement. The agent pays in USDC on Monad, Data402 verifies and settles the payment, and returns the content with a signed access receipt. The owner sees every request, every agent, and every cent in a dashboard powered by onchain data.

Positioning line for judges:

> Cloudflare controls AI crawler access. Data402 makes AI agent access programmable, identifiable, and economically settled onchain.

## The problem

1. AI agents consume proprietary data at scale, and owners get nothing. `robots.txt` is a request, not enforcement. Blocking loses the upside; allowing gives value away.
2. Existing agent paywalls are commoditizing. "Put a 402 in front of a URL" is no longer a product by itself (see CrawlPay, Agent402 Tollbooth, Cloudflare Pay Per Crawl, Cloudflare x402 proxy template).
3. Owners cannot answer basic questions: which agents read my data, did they pay, which resources earn money, which agents should I trust or block.

## Our differentiation (the layer above the 402)

```
Identity -> Pricing -> Authorization -> Payment -> Delivery -> Receipt -> Analytics
```

- **Owner identity and property ownership** via passkey derived keys (Mera). One passkey, many isolated keys: one per property, one per purpose.
- **Agent identity** via ERC-8004 on Monad. Policy can differ for registered vs unregistered agents.
- **Per-resource pricing and access policy** set by the owner, not by us.
- **Settlement** in USDC on Monad through the x402 `exact` scheme.
- **Access receipts** hashed and anchored onchain, so access is provable.
- **Analytics** built from indexed onchain events (Envio) joined with gateway request logs.

## Users

| User | Goal | Primary surface |
|---|---|---|
| Data owner | Get paid when agents consume their data, see who consumes it | Dashboard (web) |
| AI agent (and its operator) | Access data programmatically without accounts, API keys, or cards | Gateway (HTTP) |
| Hackathon judge | Understand the product in 3 minutes, see real onchain proof | Demo |

## Hackathon context

- Event: **Metropolis, a Monad hackathon**. Build window Sep 1 to **Oct 13, 2026**.
- Today (plan baseline): Sep 28, 2026. About 15 days remain. Plan accordingly (see `10-BUILD-PLAN.md`).
- Primary track: **Trust, Identity & AI Infrastructure**.
- Sponsor bounties targeted: Mera One Passkey Many Keys, Best Mera-Powered UX on Monad, Best Use of Dynamic, Best Use of Envio. Details in `04-BOUNTIES.md`.

## Builder background (why reuse matters)

The builder already shipped two relevant projects. Reuse them; do not rebuild from scratch.

- `midnightx402` (Monad testnet): ERC-8004 registration on Monad, x402 `exact` USDC signing via EIP-3009 `transferWithAuthorization`, Monad x402 facilitator client, canonical receipt hashing, onchain receipt registry contract, fail-closed orchestrator, sensitive-field guard, idempotent runs.
- `Rho-AgentLedger` (Arc testnet + Sepolia identity): x402 seller server that returns 402 and settles, ERC-8004 trust scoring via 8004scan, first-match fail-closed policy engine, order-to-settlement reconciliation (reference match then fuzzy match), per-agent attribution and scorecards.

Important: `Rho-AgentLedger` is **not** on Monad. Its chain code (Circle, Arc) is not reusable. Its **patterns** (402 server shape, policy, trust scoring, reconciliation) are. See `05-REUSE-MAP.md`.

## What success looks like on Oct 13

1. A live demo where a real AI agent pays real (testnet) USDC on Monad to read a real protected article, and the dashboard updates from Envio indexed data.
2. Owner onboarding with a passkey only. No seed phrase, no extension.
3. A cross-device moment: same passkey on a second device re-derives the same property keys and the same payout address.
4. Every onchain claim in the demo links to a Monad explorer transaction.

## Non-goals (do not build)

- Bot detection by fingerprinting or ML. We identify agents by what they present (ERC-8004 id, signed headers, wallet), not by guessing.
- Claiming an agent "is Claude" or "is GPTBot" from a User-Agent string. User-Agent is shown as `claimed`, never `verified`.
- Cross-chain, bridging, trading, fiat rails, subscriptions, refunds.
- A CDN or reverse proxy for arbitrary sites at production scale. The demo protects one origin we control.
- Multiple wallet providers. Mera for owners, Dynamic for agents. Not Privy.
