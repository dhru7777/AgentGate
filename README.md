# AgentGate

AgentGate lets a site owner charge AI agents for reading their content, instead of hoping they honor `robots.txt`.
An unpaid agent gets an HTTP 402 with a price. A paying agent gets the page and a receipt. The owner sees who read
what, what they paid, and what was blocked.

Payments settle in **USDC on Monad testnet**. Agent identity comes from the ERC-8004 identity registry on Monad.

- Dashboard: https://agentgate.santboblabs.com
- Crawl Sandbox (demo bot): https://bot.agentgate.santboblabs.com

## What is in the repo

| Path | What it is |
|---|---|
| `apps/dashboard` | Owner dashboard: observability deck, services, per-agent rules (Free, Charge, Block), wallet opened with a Mera passkey, ERC-8004 identity, invoices |
| `apps/maplelabs-bot` | MapleLabsBot, a test crawler with Search and Train modes. It hits a gated blog, reads the 402, and pays from a buyer wallet after a person clicks Approve |

## Run it

```bash
# dashboard
cd apps/dashboard && npm install && npm run dev      # http://localhost:5173

# demo crawler
cd apps/maplelabs-bot && node server.mjs             # http://localhost:5180
```

Without any keys both apps still run: the dashboard reads public chain data and the bot uses its own scripted brain.

## Configuration

Dashboard:

| Variable | Purpose |
|---|---|
| `ETHERSCAN_API_KEY` | Server side. Reads Monad testnet balances and transfers for the wallet view |
| `VITE_MONAD_RPC_URL` | Optional custom Monad testnet RPC |
| `VITE_BLOG_ANALYTICS_KEY` | Key for the blog analytics endpoint |

Demo crawler (`apps/maplelabs-bot/.env.local`, gitignored):

| Variable | Purpose |
|---|---|
| `BUYER_WALLET_PRIVATE_KEY`, `BUYER_WALLET_ADDRESS` | Wallet that pays after Approve. The key never leaves the server |
| `SELLER_WALLET_ADDRESS` | Receives the USDC |
| `MONAD_RPC_URL` | Optional custom Monad testnet RPC |
| `ANALYTICS_KEY` | Read-only access to the blog's analytics, for the globe and the gate log. Falls back to `ADMIN_KEY` |
| `ADMIN_KEY` | Only needed to switch Free, Charge or Block from the demo |
| `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` | Optional brains for the bot |

## How a paid read works

1. An agent requests a gated post and gets HTTP 402 with the price and the pay-to address.
2. After a person clicks Approve, the buyer wallet sends USDC to the seller on Monad testnet.
3. The blog verifies the transaction and returns an access token, and the post opens with it.
4. The dashboard shows the paid agent, the amount and a MonadVision link.

## Pre-existing work

- The Netlify blog gate (a proof-of-work check for people, HTTP 402 for agents) existed before this hackathon.
- Payment and identity code was ported from our earlier midnightx402 and Rho-AgentLedger projects.
- The dashboard, Mera key derivation, the ERC-8004 integration and MapleLabsBot were built during the hackathon.
  The first commit in this repository is dated 2026-10-01.

## AI tool disclosure

Built with Claude Code (Anthropic) for drafting and refactoring, reviewed by the team. MapleLabsBot can use Claude
(Anthropic Messages API) or OpenAI as its brain. Payments in the demo are real testnet transfers, sent only after a
person clicks Approve.

## License

MIT, see `LICENSE`.
