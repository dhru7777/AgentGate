# 08 Integrations

Each integration sits behind an adapter interface in `apps/*/src/adapters/<name>/` with `live.ts`, `mock.ts`, `index.ts` (selects by `DATA402_MODE`). Build the mock first, then live.

---

## 1. Mera (owner identity and keys)

Package: `@category-labs/mera` plus `viem @scure/bip32 @scure/bip39 @noble/hashes`.
Docs: https://docs.monad.xyz/guides/mera and https://mera.category.xyz
Location: `apps/dashboard/src/mera/`

### Facts to respect
- Needs HTTPS or `localhost`, and a passkey provider with WebAuthn PRF (iCloud Keychain, 1Password, Google Password Manager).
- **Desktop Chrome only returns PRF for passkeys saved to Google Password Manager.** Local profile passkeys throw `PRF_UNAVAILABLE`. This is the most common failure. The UI must explain it.
- Passkeys are bound to `rpId`. Fix the dashboard domain before recording any demo.
- `createPasskeyWithPrfOutput` creates a new passkey every call. Call it once at onboarding. Store `credentialId` (not secret) and reuse with `getPasskeyPrfOutput`.
- Errors are `MeraError` with `code`: `PRF_UNAVAILABLE`, `PASSKEY_OPERATION_FAILED`, `CRYPTO_UNAVAILABLE`, `SESSION_ENDED`.
- `createSecp256k1SigningSession({ privateKey })` + `toViemAccount(session)` gives a viem `LocalAccount`. `session.end()` zeroes the key.

### Files
```
mera/passkey.ts       create / sign in, credential storage in localStorage
mera/derive.ts        all derivations below; pure functions; unit tested with fixed 32-byte vectors
mera/session.ts       holds sessions in memory, idle timeout 10 min, end() on sign-out
mera/errors.ts        maps MeraError codes to UI copy
```

### Derivations (`derive.ts`)
```ts
// BIP-44 accounts: portable, same as Mera docs recipe
export function deriveBip44Key(prf: Uint8Array, index: number): Uint8Array {
  const seed = mnemonicToSeedSync(entropyToMnemonic(prf, wordlist));
  const node = HDKey.fromMasterSeed(seed).derive(`m/44'/60'/0'/0/${index}`);
  if (!node.privateKey) throw new Error("derivation produced no key");
  return node.privateKey;
}
// index 0 = owner account; index propIndex (>=1) = property payout address

// Purpose keys: HKDF-SHA256 with a namespaced info string
export function derivePurposeKey(prf: Uint8Array, info: string): Uint8Array {
  return hkdf(sha256, prf, /*salt*/ utf8("data402"), utf8(info), 32);
}
// "data402/v1/property/<slug>/ownership" -> secp256k1 ownership signing key
//    (check 0 < key < n; if not, append "/1" to info and retry)
// "data402/v1/property/<slug>/content"   -> AES-256-GCM key (stretch)
```
Rules: never persist outputs; zero `Uint8Array`s after use (`fill(0)`); never send them over the network. Only public addresses leave the browser.

### Screens that use Mera
- `/onboard`: "Create your Data402 account" -> passkey -> derive owner address -> `POST /api/owners` signed.
- `/signin`: one tap.
- `/properties/new`: derive payout + ownership addresses for the next `propIndex`, show them, sign challenge.
- `/verify` (cross-device check): sign in, re-derive every property's addresses, compare to server records, show a green check per property. This is the Mera Many Keys demo moment.
- `/settings/recovery` (optional): show mnemonic behind a typed confirmation.

### Open question
Mera may expose PRF evaluation with a caller-chosen salt per namespace (one PRF output per purpose) instead of HKDF from a single output. If the bounty text or docs prefer that, switch `derivePurposeKey` to call PRF with salt `sha256("data402/v1/...")`. Keep the same function signature so callers do not change.

---

## 2. Dynamic (agent wallet)

Location: `apps/agent/src/wallet/`
Interface:
```ts
export interface AgentWallet {
  address(): Promise<Address>;
  signTypedData(args: TypedDataDefinition): Promise<Hex>;   // EIP-712, needed for EIP-3009
  usdcBalance(): Promise<bigint>;
}
```
Implementations:
- `mock.ts`: viem `privateKeyToAccount` from `AGENT_DEV_PRIVATE_KEY` (dev only, never in live demo).
- `dynamic.ts`: Dynamic wallet.

### Before implementing `dynamic.ts` (do this first, record in `12-DECISIONS.md`)
1. Read the Dynamic bounty text and save it verbatim to `docs/bounties.md`.
2. From Dynamic docs, confirm: (a) which product fits a headless agent (server wallets or an agent wallet product), (b) Monad testnet 10143 support or custom EVM network config, (c) EIP-712 `signTypedData` support for that wallet type, (d) auth model for a Node process.
3. If server side typed-data signing is supported: agent CLI uses it directly.
4. If not: build `apps/dashboard/src/agent-operator/` page with Dynamic embedded wallet where an operator funds the agent wallet and the page signs authorizations on request from the agent over a local websocket, within a spend cap. This is uglier; prefer (3).

Do not invent Dynamic method names. Wrap whatever the docs show in the interface above.

### Agent payment flow (`apps/agent/src/pay.ts`)
```
GET resource
  if 200: done
  if 402: decode PAYMENT-REQUIRED
     choose accepts[] entry with network eip155:10143 and asset USDC
     policy check (port Rho policy, agent side):
        amount <= perRequestMaxMicros AND spentToday + amount <= dailyCapMicros
        payTo appears in /.well-known/data402.json for this property
     build EIP-3009 authorization: from=agent, to=payTo, value=amount,
        validAfter=now-60, validBefore=now+300, nonce=random 32 bytes
     sign with AgentWallet.signTypedData (domain name "USDC", version "2", chainId 10143, verifyingContract USDC)
     retry GET with PAYMENT-SIGNATURE and X-Agent-Id
  log: price, decision, tx hash, receipt hash
```
Port typed-data layout from `midnightx402/src/economics/x402.ts` `signExactPayment` (reversed direction).

---

## 3. x402 facilitator (settlement on Monad)

Location: `apps/gateway/src/adapters/facilitator/`
Live base URL: `X402_FACILITATOR_URL`, default `https://x402-facilitator.molandak.org` (used in midnightx402). **Verify it is up on day 1** with a 0.001 USDC settle. If down, fallback plan: gateway settles itself by submitting `transferWithAuthorization` to USDC from an operator EOA that holds MON for gas (same effect onchain; note in decisions).
Interface (from midnightx402):
```ts
interface Facilitator {
  verify(req: X402ExactRequest): Promise<{ isValid: boolean; detail: string }>;
  settle(req: X402ExactRequest): Promise<{ success: boolean; transactionHash?: Hex; detail: string }>;
}
```
Mock: `verify` checks signature locally with viem `verifyTypedData`; `settle` returns a deterministic fake hash `0xmock...` and marks it `mock` in receipts.

---

## 4. ERC-8004 (agent identity on Monad)

Location: `packages/chain/src/erc8004/` and `apps/gateway/src/adapters/erc8004/`
Registries on Monad testnet (from midnightx402, verify in `13-ENV-CONFIG.md`):
- Identity: `0x8004A818BFB912233c491871b3d84c89A494BD9e`
- Reputation: `0x8004B663056A597Dffe9eCcC1965A193B7388713`

Lookup (live):
1. `ownerOf(agentId)` and the agent URI / card (ABI in `IdentityRegistry.abi.json`). Card contains the agent wallet (see `buildAgentCard` in midnightx402 `identity/types.ts`).
2. Reputation summary from Reputation registry if cheap; else count of feedback.
3. Map to tier with ported `characterFrom8004`.
4. Cache 60 seconds in `agent_cache`.

Registering the demo agent: `apps/agent/scripts/register-agent.ts`, ported from `midnightx402/src/identity/register.ts`. Keep the "register -> publish card with agentId -> setAgentURI" flow and explicit gas.

Optional stretch: after a successful paid access, the property (via operator) gives feedback to the agent on the Reputation registry (`giveFeedback`, used in midnightx402 `reputation/monad.ts`). Great trust story, low effort if the ABI path already works.

---

## 5. Envio (indexing and analytics)

Location: `indexer/`
Tool: Envio HyperIndex (`pnpx envio init`), TypeScript handlers, GraphQL output. Confirm Monad testnet (10143) is supported by HyperSync; if only RPC mode is supported, set `rpc_config` with the Monad RPC and accept slower sync.

Files:
```
indexer/config.yaml         network 10143, start_block = registry deploy block
indexer/schema.graphql      entities from 06-DATA-MODEL.md
indexer/src/EventHandlers.ts
indexer/abis/               USDC (Transfer, AuthorizationUsed), Data402AccessRegistry
```

Contracts to index:
| Contract | Events | Notes |
|---|---|---|
| USDC | `Transfer`, `AuthorizationUsed` | Keep only transfers whose `to` is a known `Property.payoutAddress`. Use event filters on `to` if the Envio version supports dynamic filters; otherwise filter in handler by loading `Property` by payout address |
| Data402AccessRegistry | `PropertyRegistered`, `AccessRecorded` | `PropertyRegistered` creates `Property` so USDC handler knows payout addresses. Registry must be registered before any payments to that property |
| ERC-8004 Identity (optional) | `Registered` | Enrich `Agent` with registration time |

Handler rules:
- Idempotent by entity id (`txHash-logIndex`, `receiptHash`).
- `AuthorizationUsed` and `Transfer` in the same tx: set `Payment.nonce` by matching on `txHash`.
- Update `Agent`, `Property`, `DailyStat` aggregates in `AccessRecorded`.

Check the current Envio docs for exact `config.yaml` keys and handler registration syntax for the installed version. Do not guess syntax; run `envio codegen` and follow generated types.

Gateway adapter (`apps/gateway/src/adapters/envio/`): typed GraphQL queries for summary, agents, resources, payments since block. Mock returns data derived from local `receipts` table so the dashboard works offline.
