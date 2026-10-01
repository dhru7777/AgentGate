# 12 Decisions

Format: ID, decision, reason, status. Agents: add new entries at the bottom. Never silently change a LOCKED decision.

## Locked

| ID | Decision | Reason |
|---|---|---|
| D-001 | Chain is Monad testnet (10143) for build and demo | Hackathon chain; midnightx402 already works there |
| D-002 | Payments use x402 v2 `exact` scheme with USDC EIP-3009 | Already implemented in midnightx402; open standard |
| D-003 | Mera owns the data owner identity. Dynamic owns the agent wallet. No overlap | Clear story for both bounties; avoids two login systems |
| D-004 | Privy not used | Overlaps Dynamic |
| D-005 | Agent identity via ERC-8004 on Monad, read directly from registries. 8004scan only for UI links | Rho used 8004scan on Sepolia; we need Monad and fewer HTTP dependencies |
| D-006 | Rho-AgentLedger chain code (Circle, Arc, Stripe, Rho) is not reused. Only patterns | It is not on Monad |
| D-007 | Onchain `Data402AccessRegistry` emits `AccessRecorded` | USDC Transfer alone cannot carry resource or agent id; Envio needs it |
| D-008 | Analytics: paid metrics from Envio, unpaid and blocked from gateway log | Envio cannot see HTTP requests that never paid |
| D-009 | Owner property keys: BIP-44 for accounts (payout, owner), HKDF purpose keys for ownership signing and content | Portable accounts per Mera docs; non-wallet keys satisfy Many Keys |
| D-010 | Identity labels are honest: `verified` only when ERC-8004 agent wallet matches payer | Avoid claiming "this is Claude" from User-Agent |
| D-011 | TypeScript, viem, zod, Hono, better-sqlite3, React + Vite, vitest | Matches prior repos, fast to build |
| D-012 | Every external dependency behind live and mock adapters | Demo must never be blocked by a flaky service |
| D-013 | Money stored as integer micros | Avoid float errors |

## Excluded bounties and why

| Bounty | Reason |
|---|---|
| Qwen, KIMI | Real LLM consumer is stretch only; not worth splitting focus |
| Privy | Overlaps Dynamic |
| Nansen, Alchemy | Envio already covers indexing; no specific need |
| CRE | Adds workflow complexity with no product need |
| Agora, Aurora, Kuru, Perpl, Cleanverse | Trading, cross-border, liquidity: unrelated |
| Hunyuan | No multimodal need |
| MetaMask Agent Wallet Plugin | Not building a wallet plugin |

## Open questions (resolve in Phase 0)

| ID | Question | Owner | Resolution |
|---|---|---|---|
| Q-001 | Is `0x534b2f3A21130d7a60830c2Df862319e593943A3` still the Monad testnet USDC used by x402, and does it emit `AuthorizationUsed`? | builder | |
| Q-002 | Is `https://x402-facilitator.molandak.org` up and settling on 10143? If not, self-settle via operator EOA | builder | |
| Q-003 | Dynamic: which product (server wallet vs embedded), Monad support, EIP-712 signing from Node | builder | |
| Q-004 | Envio: HyperSync support for Monad testnet, hosted deployment availability | builder | |
| Q-005 | Mera bounty text: HKDF from one PRF output acceptable, or per-namespace PRF salts required? | builder | |
| Q-006 | Final dashboard domain (fixes passkey `rpId`) | builder | |
| Q-007 | Primary track exact name and judging criteria | builder | |

## Log (append below)

| ID | Date | Decision | Reason |
|---|---|---|---|
