# 10 Build Plan

Baseline: Mon Sep 28, 2026. Submission deadline: **Tue Oct 13, 2026**. 15 days.
Rule: at the end of every phase, the golden flow runs end to end in `mock` mode. Live integrations replace mocks one at a time.

## Phase 0: Scaffold and verify externals (Sep 28 to Sep 29)

Tasks
- Monorepo: `apps/{gateway,dashboard,agent,demo-origin}`, `packages/{core,chain}`, `contracts`, `indexer`, `docs`.
- Port files marked "Port directly" in `05-REUSE-MAP.md`.
- Save verbatim bounty texts to `docs/bounties.md`.
- Verify on Monad testnet, record in `docs/evidence.md`:
  1. USDC address and that it supports EIP-3009 (`transferWithAuthorization`, `AuthorizationUsed`).
  2. Facilitator `/verify` and `/settle` work with a 0.001 USDC payment.
  3. ERC-8004 registries respond at the listed addresses.
  4. Mera demo works on the two devices you will use on stage.
  5. Dynamic: product choice and EIP-712 support (see `08-INTEGRATIONS.md`).
  6. Envio supports Monad testnet (HyperSync or RPC mode).

Acceptance: `docs/evidence.md` has 1 facilitator tx hash and a yes/no for each item. `12-DECISIONS.md` updated with any fallback.

## Phase 1: Gateway core in mock mode (Sep 30 to Oct 2)

Tasks
- `packages/core`: schemas, receipt hash, policy engine, errors, money.
- `packages/chain`: x402 codec, EIP-3009 signing helper, chains.
- `apps/gateway`: pipeline stages 1 to 10, SQLite, protected route, llms.txt, well-known, receipts route, health.
- `apps/demo-origin`: 3 articles, 1 research page, `llms.txt`.
- `apps/agent`: CLI with mock wallet: fetch llms.txt, request article, handle 402, pay, print receipt.

Acceptance: `pnpm demo:mock` runs agent -> 402 -> pay -> 200 with receipt. Replay of the same payment returns `REPLAY`. Anonymous vs identified agent get different prices. Tests in `14-TESTING.md` for core and gateway pass.

## Phase 2: Live payments on Monad (Oct 3 to Oct 4)

Tasks
- Live facilitator adapter.
- Live ERC-8004 adapter; register the demo agent with `register-agent.ts`.
- Deploy `Data402AccessRegistry`; registry queue flusher.

Acceptance: agent pays real testnet USDC; tx and `AccessRecorded` tx both on explorer; links in `docs/evidence.md`.

## Phase 3: Mera owner flow (Oct 5 to Oct 7)

Tasks
- Dashboard shell (React, Vite, Tailwind), routes: onboard, signin, properties, property detail, policy, verify.
- `mera/derive.ts` with unit tests (fixed PRF vectors -> fixed addresses).
- Owner API signing; property create; ownership verification via `/.well-known/data402.json` on demo origin.
- `/verify` cross-device screen.

Acceptance: fresh browser -> onboard -> add property -> verified -> set price, in under 60 seconds. Second device `/verify` shows all green.

## Phase 4: Envio analytics (Oct 7 to Oct 9)

Tasks
- HyperIndex project, handlers, deploy (hosted if available, else local).
- Gateway Envio adapter, reconciliation, analytics routes, SSE stream.
- Dashboard: Overview, AI Activity (agents table + agent detail), Resources.

Acceptance: gateway stopped, dashboard still shows paid metrics. Live run: new payment appears within ~10 seconds of settlement.

## Phase 5: Dynamic agent wallet (Oct 9 to Oct 10)

Tasks
- `apps/agent/src/wallet/dynamic.ts` per verified approach.
- Fund wallet with testnet USDC and MON.
- Agent spend policy.

Acceptance: live agent run with Dynamic wallet, tx on explorer.

## Phase 6: Polish, demo, submission (Oct 11 to Oct 13)

Tasks
- Run `11-DEMO-SCRIPT.md` 5 times end to end. Fix only what breaks the script.
- Live architecture page in dashboard (idea from Rho `ui/architecture.html`).
- Record demo video, cross-device Mera clip.
- `docs/submission.md`: problem, solution, sponsor usage table (from `04-BOUNTIES.md`), evidence links.
- Deploy gateway and dashboard (Railway worked for both prior repos). Freeze the dashboard domain before recording.

Acceptance: video recorded, submission filed by Oct 12 evening to leave a buffer day.

## Stretch (only after Phase 6 acceptance criteria are met)

1. Real LLM agent consumer: a model with a tool `fetch_paid(url)` that calls `apps/agent/src/pay.ts`, summarizes the article. Makes the thesis tangible. Not tied to any bounty.
2. Reputation feedback to ERC-8004 after paid access.
3. Content encryption with HKDF content key.
4. Cloudflare header compatibility (`crawler-price`, `crawler-max-price`).
5. DNS TXT ownership verification.

## Cut order if behind schedule

Cut from the bottom: stretch items, then `/settings/recovery`, then Resources screen, then SSE (use polling). Never cut: live Monad payment, Mera onboarding + `/verify`, Envio powering revenue, Dynamic paying agent.
