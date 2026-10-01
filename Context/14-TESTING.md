# 14 Testing

Runner: vitest. Every package has `test` script. CI is not required, but `pnpm test` at root must pass before each phase is marked done.

## Required tests

### packages/core
- `receipt-hash`: key order independence; undefined fields dropped; stable hash for a fixture (port `midnightx402/src/receipts/receipts.test.ts` ideas).
- `policy/evaluate`: first match wins; `block_agent` beats `allow_free_agent` when earlier; missing identity with `block_anonymous` denies; identity multiplier math in micros; most specific path price wins.
- `sensitive`: blocks `privateKey`, `prfOutput`, `mnemonic`, nested and in arrays.

### packages/chain
- x402 codec round trip (base64 encode/decode).
- EIP-3009 typed data: sign with fixed key, recover with viem `verifyTypedData`.

### apps/gateway (mock mode, in-process with Hono test client)
- Human request passes through with no 402.
- Agent without payment gets 402, `PAYMENT-REQUIRED` decodes to expected requirement, payTo equals property payout.
- Valid payment -> 200, receipt stored, `X-Data402-Receipt` set, request_log `PAID`.
- Underpayment -> 402 `PAYMENT_INVALID`.
- Wrong payTo -> 402 `PAYMENT_INVALID`.
- Expired `validBefore` -> 402.
- Replay same nonce -> `REPLAY` and no second settle call (spy on facilitator mock).
- Facilitator settle failure -> 402 `SETTLEMENT_FAILED`, no content.
- Origin down after settle -> 502, receipt `delivery: failed`, retry with same nonce within 10 min gets content without new settle.
- Blocked agent -> 403.
- Payer wallet not matching ERC-8004 wallet -> identity `claimed`, priced as policy says.
- Every JSON response passes `assertNoSensitiveFields`.
- Owner API: bad signature 401, reused nonce 401, stale timestamp 401.

### apps/dashboard
- `mera/derive`: fixed 32-byte PRF vector -> fixed owner address, fixed payout addresses for index 1..3, fixed ownership address per slug; different slugs give different keys; same inputs give same outputs.
- Reconciliation display states.

### indexer
- Envio handler tests with mock events (Envio test helpers): AccessRecorded updates Agent, Property, DailyStat; duplicate event is idempotent.

### contracts
- Deploy on local anvil (or viem test client): only operator can record; duplicate receiptHash reverts in `recordAccess`, skipped in batch; events emitted with correct fields.

## Live smoke (manual, record in `docs/evidence.md`)
1. Facilitator settle 0.001 USDC.
2. Agent paid access, tx hash + AccessRecorded tx hash.
3. Envio shows the Access entity.
4. Mera `/verify` on second device.
5. Dynamic wallet pays.
