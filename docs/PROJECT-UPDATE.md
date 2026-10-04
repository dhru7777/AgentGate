# Agent Gate project update

Three tracks: the problem, what is built, and what comes next.

The product name in the plan is Data402. The app in this repo is Agent Gate, the owner dashboard.

## 1. Ideation: the problem

AI agents read proprietary sites at scale. The owner gets nothing.

`robots.txt` asks crawlers to stay out. It does not enforce that, and it cannot charge them. Blocking the agent throws away the demand. Leaving the page open gives the content away.

A paywall that only returns HTTP 402 is no longer enough. CrawlPay, Agent402, and Cloudflare Pay Per Crawl already do a version of that. The owner still cannot answer the questions that matter: which agent asked, did it pay, which page earned the money, and which agents should be allowed, priced, or blocked.

Agent Gate is the layer above the 402:

```
Identity -> Pricing -> Authorization -> Payment -> Delivery -> Receipt -> Analytics
```

- The owner signs in with one passkey. That passkey derives a separate payout address and a separate ownership key for each site. No seed phrase, no browser extension.
- The agent has an onchain identity (ERC-8004 on Monad), so policy can tell a registered agent from an anonymous client.
- The owner sets the price and the allow or block rules per site.
- The agent pays in USDC. The visit is receipted, and the dashboard shows who came and what they paid.

The live proof of the problem is the builder’s own blog. Humans and agents already hit `dheeraj-work.netlify.app`. Agents that are not allowed receive 402. The dashboard is the place the owner watches that traffic and, next, settles it on Monad.

Positioning line:

> Cloudflare controls AI crawler access. Agent Gate makes AI agent access programmable, identifiable, and economically settled onchain.

## 2. What is implemented

This repo is the owner dashboard (`apps/dashboard`). The paying gateway, the Monad settlement path, and the Envio indexer are not in this repo yet. The blog gate that produces the live numbers already runs on Netlify.

### Owner identity (Mera)

- One passkey, created in the browser with `@category-labs/mera`.
- The authenticator returns a PRF output. The dashboard stretches it with HKDF into three keys: owner account, per-site payout, per-site ownership.
- Private key bytes are wiped after use. `localStorage` keeps the credential id only.
- Wallet tab: create or unlock the passkey, then show the owner address. Lock hides balances again.
- Adding a site can require an ownership signature. The recovered signer must match the derived ownership address for that site (`ServiceGate`).

### Services and live blog analytics

- Services tab lists sites. The built-in site is `dheeraj.blog` (`https://dheeraj-work.netlify.app`).
- After the blog is verified, the dashboard loads live request analytics from that site’s own `/api/analytics`, plus bot allow and block rules from `/api/bot-rules`.
- Charts, request map, top agents, and top pages for the blog come from that live feed.
- Other sites added in the UI are stored in the browser. Their charts are not on that live feed.

### Agent identity (ERC-8004)

- Identity tab can connect a Monad wallet, register an agent on the Monad testnet ERC-8004 identity registry, set the agent URI, and look an agent up by id.
- Registration uses explicit gas with a 20 percent buffer, matching the Monad pattern from `midnightx402`.
- A known onchain agent, id 1810, is shown as the invoice agent for a service. Link: `https://testnet.8004scan.io/agents/monad-testnet/1810`.

### Wallet balances

- After the passkey unlocks, MON and USDC balances and recent transactions load from Monad testnet through Etherscan’s API (`/api/monad-account`). That key is the builder’s Etherscan key. The free tier covers normal use.
- A Stripe card view is a visual demo. It is not a live Stripe account.

### Already running outside this repo

The blog gate on `dheeraj-work.netlify.app` (see `Context/15-EXISTING-NETLIFY-GATE.md`):

- Every URL hits an edge function first.
- Humans solve a small proof of work and receive a reader cookie.
- Agents that are not allowed get HTTP 402.
- A paid path exists for 0.01 USDC on Base, then an access token.
- Search crawlers on the allow list can read posts. That allow list still trusts User-Agent.

### What is on screen but not live chain data

- The Invoices tab is built from sample visits in `apps/dashboard/src/data.ts`. Transaction hashes there are derived locally. The copy mentions Envio, but Envio is not connected.
- There is no gateway in this repo, no x402 payment on Monad, no `Data402AccessRegistry`, and no Envio indexer.

## 3. Future scope

Deadline for the hackathon demo is 13 Oct 2026. Do these in order. Each one should leave a path a judge can click or a transaction a judge can open.

1. **Settle on Monad, not only on Base.** An agent that is blocked with 402 pays USDC on Monad testnet inside the retry (x402 exact, EIP-3009), and the gateway returns the page plus a receipt. The current blog payment is pay on Base, then redeem a token. That stays as the prototype. The demo payment is Monad.
2. **Anchor the receipt.** Deploy `Data402AccessRegistry` so a paid read emits `AccessRecorded` with agent, site, resource, payer, and amount. Every demo claim links to a Monad explorer transaction.
3. **Index with Envio.** Index USDC transfers and `AccessRecorded`. Point the Invoices tab and revenue numbers at that index instead of the sample visits. The blog’s Netlify analytics can keep showing requests, including unpaid 402s, which the chain never sees.
4. **Finish the owner loop.** Second device, same passkey, same payout and ownership addresses. Wire the existing blog’s verify button through the ownership signature, not only newly added sites. Freeze the dashboard hostname before recording, because the passkey is bound to that host.
5. **Agent wallet.** The paying agent holds testnet USDC in a Dynamic wallet and signs the payment. Mera stays the owner’s passkey. It is not the agent’s wallet.
6. **Policy that matches identity.** Allow, price, or block from the dashboard, with a different price for a registered ERC-8004 agent than for an anonymous client. User-Agent stays labeled claimed, never verified.

Only after that path works end to end:

- A real model with a tool that fetches a paid URL and summarizes the article.
- Reputation written back to ERC-8004 after a paid read.
- Search-crawler checks by DNS or published IP ranges, not User-Agent alone.
- Short-lived access after one payment so one license can cover several pages.

Out of scope until the Monad payment and the dashboard proof exist: cross-chain bridges, subscriptions, refunds, fiat rails, bot detection by fingerprinting, and a CDN in front of arbitrary sites.
