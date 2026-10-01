# 06 Data Model

All amounts are integer USDC atomic units (`amountMicros`, 6 decimals). All ids are strings. All timestamps ISO 8601 with offset in JSON, unix seconds onchain.

## Zod schemas (`packages/core/src/schemas/`)

```ts
// owner.ts
export const ownerSchema = z.object({
  ownerId: z.string(),                 // = lowercase owner EOA address (BIP-44 index 0)
  credentialId: z.string(),            // Mera passkey credential id. Not secret.
  createdAt: z.string().datetime({ offset: true }),
}).strict();

// property.ts
export const propertySchema = z.object({
  propertyId: z.string(),              // uuid v7
  ownerId: z.string(),
  slug: z.string().regex(/^[a-z0-9-]{3,40}$/),
  origin: z.string().url(),            // upstream origin URL
  propIndex: z.number().int().min(1),  // BIP-44 index used for payout address
  payoutAddress: addressSchema,        // derived client side, public
  ownershipAddress: addressSchema,     // derived via HKDF, public
  ownershipStatus: z.enum(["pending", "verified", "failed"]),
  createdAt: z.string().datetime({ offset: true }),
}).strict();

// policy.ts
export const policyRuleSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("block_agent"), agentId: z.number().int().positive() }),
  z.object({ kind: z.literal("block_anonymous") }),
  z.object({ kind: z.literal("allow_free_agent"), agentId: z.number().int().positive() }),
  z.object({ kind: z.literal("identity_multiplier"), tier: identityTierSchema, bps: z.number().int().min(0).max(100_000) }),
]);
export const resourcePriceSchema = z.object({
  propertyId: z.string(),
  pathPattern: z.string(),             // glob, e.g. "/research/*"
  amountMicros: z.number().int().nonnegative(),   // 0 = free for agents
  label: z.string().max(60),
}).strict();
export const propertyPolicySchema = z.object({
  propertyId: z.string(),
  defaultAmountMicros: z.number().int().nonnegative(),
  rules: z.array(policyRuleSchema),    // evaluated in order, first match wins
  prices: z.array(resourcePriceSchema),// most specific pathPattern wins
}).strict();

// identity.ts
export const identityTierSchema = z.enum(["missing", "thin", "watch", "good"]); // from Rho characterFrom8004
export const agentIdentitySchema = z.object({
  status: z.enum(["verified", "claimed", "anonymous"]),
  agentId: z.number().int().positive().optional(),
  registeredWallet: addressSchema.optional(),
  payerWallet: addressSchema.optional(),
  tier: identityTierSchema,
  claimedUserAgent: z.string().optional(),
}).strict();
// verified  = ERC-8004 agent exists AND payer wallet == registered agent wallet (or owner)
// claimed   = X-Agent-Id given but wallet mismatch or lookup failed softly
// anonymous = no agent id

// receipt.ts
export const accessReceiptSchema = z.object({
  version: z.literal("1.0"),
  requestId: z.string(),
  propertyId: z.string(),
  resourcePath: z.string(),
  resourceHash: hashSchema,            // sha256 of propertyId + path, not of content
  contentHash: hashSchema,             // sha256 of delivered bytes (proves what was delivered)
  agent: agentIdentitySchema,
  payment: z.object({
    network: z.literal("eip155:10143"),
    asset: addressSchema,
    amountMicros: z.number().int().nonnegative(),
    payTo: addressSchema,
    payer: addressSchema,
    nonce: hashSchema,
    txHash: hashSchema,
  }).strict().optional(),              // absent when ALLOW_FREE
  license: z.enum(["single-use", "cache-24h"]),
  issuedAt: z.string().datetime({ offset: true }),
  receiptHash: hashSchema,             // hashReceipt(receipt without receiptHash)
}).strict();
```

## SQLite tables (`apps/gateway/src/db/`)

Use `better-sqlite3` with plain SQL migrations. Tables mirror the schemas.

| Table | Key | Purpose |
|---|---|---|
| `owners` | `owner_id` | Owner accounts |
| `properties` | `property_id`, unique `slug` | Protected properties |
| `ownership_challenges` | `nonce` | Issued challenges, consumed once |
| `policies` | `property_id` | JSON column of `propertyPolicySchema` |
| `request_log` | `request_id` | Every request the gateway sees (see below) |
| `receipts` | `receipt_hash`, unique `request_id`, unique `payment_nonce` | Access receipts; idempotency store |
| `registry_queue` | `receipt_hash` | Receipts waiting to be anchored; `status`, `tx_hash` |
| `agent_cache` | `agent_id` | ERC-8004 lookup cache, 60s TTL (Rho uses 60s) |
| `used_owner_nonces` | `nonce` | Replay protection for owner API signatures |

`request_log` columns:

```
request_id TEXT PK, ts TEXT, property_id TEXT, path TEXT, method TEXT,
classification TEXT  -- human | agent | unknown
agent_id INTEGER NULL, identity_status TEXT, identity_tier TEXT,
claimed_user_agent TEXT NULL, payer TEXT NULL,
decision TEXT        -- ALLOW_FREE | CHARGE | DENY
deny_reason TEXT NULL, price_micros INTEGER NULL,
outcome TEXT         -- DELIVERED_FREE | CHALLENGED | PAID | PAYMENT_INVALID | SETTLE_FAILED | DENIED | REPLAY | HUMAN_PASS
payment_nonce TEXT NULL, tx_hash TEXT NULL, receipt_hash TEXT NULL,
latency_ms INTEGER
```

## Onchain: `Data402AccessRegistry.sol`

```solidity
event AccessRecorded(
  bytes32 indexed requestId,       // keccak256(requestId string)
  bytes32 indexed propertyId,      // keccak256(propertyId string)
  uint256 indexed agentId,         // 0 if anonymous
  bytes32 receiptHash,
  bytes32 resourceHash,
  address payer,
  address payTo,
  uint256 amountMicros,
  bytes32 paymentTxHash
);
event PropertyRegistered(bytes32 indexed propertyId, address indexed payoutAddress, address ownershipAddress);
event OperatorUpdated(address indexed previousOperator, address indexed newOperator);

function registerProperty(bytes32 propertyId, address payoutAddress, address ownershipAddress) external onlyOperator;
function recordAccess(AccessRecord calldata r) external onlyOperator;         // reverts on duplicate receiptHash
function recordAccessBatch(AccessRecord[] calldata rs) external onlyOperator; // skips duplicates, does not revert
```

Keep `onlyOperator`, custom errors, and zero-hash checks from `CommerceReceiptRegistry.sol`. Drop revision chaining.

## Onchain: USDC events we rely on

- `Transfer(address indexed from, address indexed to, uint256 value)`
- `AuthorizationUsed(address indexed authorizer, bytes32 indexed nonce)` (EIP-3009). This lets Envio link a payment to our x402 `nonce`, which the gateway also stores in `receipts.payment_nonce`. This is the reference key for reconciliation.

## Envio entities (`indexer/schema.graphql`)

```graphql
type Property @entity {
  id: ID!                  # propertyId bytes32 hex
  payoutAddress: String! @index
  ownershipAddress: String!
  revenueMicros: BigInt!
  paidAccessCount: Int!
}

type Agent @entity {
  id: ID!                  # agentId as string, or "anon:<payer>"
  agentId: BigInt
  wallet: String @index
  spendMicros: BigInt!
  paidAccessCount: Int!
  firstSeen: Int!
  lastSeen: Int!
}

type Payment @entity {
  id: ID!                  # txHash-logIndex
  txHash: String! @index
  from: String! @index
  to: String! @index
  valueMicros: BigInt!
  nonce: String @index     # from AuthorizationUsed in same tx
  blockTimestamp: Int!
  property: Property       # set when `to` is a known payout address
}

type Access @entity {
  id: ID!                  # receiptHash
  requestId: String! @index
  property: Property!
  agent: Agent!
  resourceHash: String! @index
  payer: String!
  amountMicros: BigInt!
  paymentTxHash: String! @index
  blockTimestamp: Int!
}

type DailyStat @entity {
  id: ID!                  # propertyId-YYYYMMDD
  property: Property!
  day: Int!
  revenueMicros: BigInt!
  paidAccessCount: Int!
  uniqueAgents: Int!
}
```

## Offchain to onchain join (reconciliation)

For each `request_log` row with outcome `PAID`:
1. Reference match: Envio `Payment.nonce == request_log.payment_nonce` -> `matched_reference`.
2. Fallback: Envio `Access.requestId == keccak(requestId)` -> `matched_registry`.
3. Fuzzy: same payer, same payTo, same amount, within 10 minutes -> `matched_fuzzy`.
4. Otherwise `unmatched` (shown in dashboard as "awaiting index" if under 2 minutes old, else warning).
