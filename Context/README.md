# Data402 Agent Instructions

This folder is the single source of truth for any coding agent (Cursor, Claude Code) working on Data402.
Read these files in order before writing any code. Do not skip 01 to 03.

| Order | File | What it gives you | Read when |
|---|---|---|---|
| 1 | `01-CONTEXT.md` | What Data402 is, who it is for, what problem it solves, hackathon context | Always, first |
| 2 | `02-INSTRUCTIONS.md` | Operating rules for the agent: how to work, what never to do | Always, second |
| 3 | `03-ARCHITECTURE.md` | System layers, components, request lifecycle, repo layout | Always, third |
| 4 | `04-BOUNTIES.md` | The 5 targets, prize, where each lives in the code, acceptance criteria | Before touching Mera, Dynamic, Envio |
| 5 | `05-REUSE-MAP.md` | Exact files to port from `midnightx402` and `Rho-AgentLedger` | Before creating any new module |
| 6 | `06-DATA-MODEL.md` | Zod schemas, SQLite tables, onchain events, Envio entities | Before writing storage or schemas |
| 7 | `07-API-SPEC.md` | Every HTTP endpoint, the 402 contract, headers, error codes | Before writing gateway or dashboard API |
| 8 | `08-INTEGRATIONS.md` | How to wire Mera, Dynamic, Envio, ERC-8004, x402 facilitator | When implementing that integration |
| 9 | `09-CLOUDFLARE-REFERENCE.md` | What we borrow from Cloudflare AI Crawl Control and what we do differently | When designing policy or dashboard UX |
| 10 | `10-BUILD-PLAN.md` | Phased plan to Oct 13 with acceptance criteria per phase | At the start of every work session |
| 11 | `11-DEMO-SCRIPT.md` | The exact judged demo flow, second by second | Before any UI work, and before submission |
| 12 | `12-DECISIONS.md` | Locked decisions, open questions, things to verify | When something feels ambiguous |
| 13 | `13-ENV-CONFIG.md` | Env vars, addresses, chain constants | When configuring anything |
| 14 | `14-TESTING.md` | Test strategy and required tests per package | Before marking any phase done |

## One sentence summary

Data402 is a gateway plus analytics layer that lets owners of proprietary data verify ownership, identify AI agents, set per-resource prices, charge agents in USDC on Monad via HTTP 402, and see who paid for what.

## The golden flow (memorize this)

```
Owner signs in with passkey (Mera)
  -> registers property, proves ownership, sets price
AI agent (ERC-8004 identity, Dynamic wallet) requests resource
  -> Gateway returns 402 with x402 payment requirements
  -> Agent signs USDC transferWithAuthorization
  -> Gateway verifies + settles via facilitator on Monad
  -> Gateway returns content + access receipt
  -> Gateway anchors receipt on Data402AccessRegistry
  -> Envio indexes USDC + registry events
  -> Dashboard shows request, payment, agent, revenue
```

If a change does not serve this flow, it is out of scope until the flow works end to end.
