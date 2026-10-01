# 02 Instructions for the Coding Agent

These are operating rules. They override your defaults.

## Before you write code

1. Read `README.md`, then `01` through `03`, then the file relevant to your task.
2. Check `10-BUILD-PLAN.md` for the current phase. Work only on the current phase unless told otherwise.
3. Check `05-REUSE-MAP.md`. If a source file exists for what you need, port it. Record the port in the module header comment: `// Ported from midnightx402/src/receipts/hash.ts`.
4. If the task touches a sponsor integration, re-read that section of `04-BOUNTIES.md` and `08-INTEGRATIONS.md`.

## How to work

- **Small vertical slices.** Each change should leave the golden flow runnable or closer to runnable. Prefer a working stub over a half-built real integration.
- **Adapter pattern for every external dependency.** Facilitator, Envio, Dynamic, ERC-8004 lookup, and Mera each sit behind an interface with a `live` and a `mock` implementation. Select via env (`DATA402_MODE=live|mock`). The demo must run in `mock` mode offline and in `live` mode on Monad testnet. This pattern exists in both source repos (`mode: "adapter" | "live"`); keep it.
- **Zod at every boundary.** HTTP input, HTTP output, env, DB rows read back, facilitator responses, Envio responses. Use `.strict()` on objects we own.
- **Fail closed.** Any error in identity lookup, policy evaluation, payment verification, or settlement results in a 402 or 403, never in content delivery.
- **Idempotency.** A `requestId` or payment `nonce` seen before returns the stored result and performs no new side effects. Port the pattern from `midnightx402/src/orchestrator/run.ts` (`store.get` before work).
- **Money in integer micros.** USDC has 6 decimals. Store amounts as integer atomic units (`amountMicros`). Never floats in storage or on the wire. Format only in UI.
- **Explicit gas on Monad.** Monad charges the declared gas limit, not gas used. Estimate, then pass `gas` explicitly with a 20 percent buffer (pattern already in `midnightx402/src/identity/register.ts`). Use `sendTransaction` with encoded data if `writeContract` simulation misbehaves.
- **Monad `eth_getLogs` limit.** RPC log queries are limited to about 100 blocks per call. Do not build analytics on raw `getLogs` polling. That is exactly what Envio is for.

## Security rules (non-negotiable)

- Never log, persist, return, or commit: private keys, Mera `prfOutput`, derived keys, Dynamic API secrets, facilitator credentials.
- Port `assertNoSensitiveFields` from `midnightx402/src/hardening/sensitive.ts` and call it on every JSON response the gateway and dashboard API return. Extend the regex with `prf`, `seed`, `mnemonic`.
- Mera signing sessions must be ended (`session.end()`) on sign-out and idle timeout. Default to "prompt per sensitive action" for anything that moves funds.
- `.env` is gitignored. `.env.example` lists every key with a placeholder.
- Content returned to agents is the only protected payload. Receipts and analytics never contain the content body.

## Code conventions

- TypeScript strict, ESM, Node 20+. `tsx` for scripts. `vitest` for tests.
- `viem` for all chain work. No ethers.
- Packages are workspaces (`pnpm` or `npm` workspaces). Shared code lives in `packages/`, never copy-pasted between apps.
- File names kebab-case. One responsibility per file. Keep files under about 300 lines.
- Every exported function has a one-line doc comment stating what it guarantees.
- Errors: throw typed errors with a `code` (`POLICY_DENIED`, `PAYMENT_INVALID`, `SETTLEMENT_FAILED`, `IDENTITY_UNAVAILABLE`, `REPLAY`). HTTP layer maps codes to status.

## Writing style for UI and docs

- Plain language. No em dashes. Short labels.
- Label trust honestly: `verified` only when cryptographically or onchain verified; otherwise `claimed` or `unverified`.

## When to stop and ask

Stop and ask the human instead of guessing when:
- A sponsor SDK behaves differently from `08-INTEGRATIONS.md`.
- A contract address or chain constant in `13-ENV-CONFIG.md` fails verification.
- A change would alter the demo flow in `11-DEMO-SCRIPT.md`.
- A decision is not covered in `12-DECISIONS.md`.

## Definition of done for any task

- Types compile (`tsc --noEmit`).
- Tests for the change pass, and the relevant tests in `14-TESTING.md` exist.
- Runs in `mock` mode. If the task is an integration, also verified once in `live` mode with a tx hash recorded in `docs/evidence.md`.
- `12-DECISIONS.md` updated if you made or changed a decision.
