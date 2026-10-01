# 13 Env and Config

All env parsed with zod in `packages/core/src/env.ts`. Process fails to start on invalid env.

## Constants (verify each in Phase 0, mark verified date here)

| Name | Value | Source | Verified |
|---|---|---|---|
| Monad testnet chain id | `10143` | midnightx402, Mera docs | |
| Monad testnet CAIP-2 | `eip155:10143` | midnightx402 | |
| Monad testnet RPC | `https://testnet-rpc.monad.xyz` | midnightx402 `wallets/chains.ts` | |
| Explorer | `https://testnet.monadvision.com` | midnightx402 | |
| USDC (testnet) | `0x534b2f3A21130d7a60830c2Df862319e593943A3` | midnightx402 `wallets/chains.ts` | |
| USDC EIP-712 domain | name `USDC`, version `2` | midnightx402 `economics/x402.ts` | |
| ERC-8004 Identity registry | `0x8004A818BFB912233c491871b3d84c89A494BD9e` | midnightx402 `identity/constants.ts` | |
| ERC-8004 Reputation registry | `0x8004B663056A597Dffe9eCcC1965A193B7388713` | midnightx402 `identity/constants.ts` | |
| 8004scan agent URL | `https://testnet.8004scan.io/agents/monad-testnet/<id>` | midnightx402 | |
| x402 facilitator | `https://x402-facilitator.molandak.org` | midnightx402 | |
| Monad mainnet chain id | `143` (not used for demo) | Mera docs | |

## `.env.example`

```bash
# mode
DATA402_MODE=mock                 # mock | live
NODE_ENV=development

# chain
MONAD_RPC_URL=https://testnet-rpc.monad.xyz
MONAD_CHAIN_ID=10143
USDC_ADDRESS=0x534b2f3A21130d7a60830c2Df862319e593943A3
ERC8004_IDENTITY_REGISTRY=0x8004A818BFB912233c491871b3d84c89A494BD9e
ERC8004_REPUTATION_REGISTRY=0x8004B663056A597Dffe9eCcC1965A193B7388713

# gateway
GATEWAY_PORT=8402
GATEWAY_PUBLIC_URL=http://localhost:8402
GATEWAY_DB_PATH=./data/data402.sqlite
X402_FACILITATOR_URL=https://x402-facilitator.molandak.org
REGISTRY_ADDRESS=                 # set after deploy
REGISTRY_OPERATOR_PRIVATE_KEY=    # server only; holds MON for gas; never logged
REGISTRY_FLUSH_MS=2000
ENVIO_GRAPHQL_URL=                # hosted or http://localhost:8080/v1/graphql

# demo origin
DEMO_ORIGIN_URL=http://localhost:8403

# dashboard (Vite, public)
VITE_GATEWAY_URL=http://localhost:8402
VITE_RP_ID=localhost              # MUST equal final dashboard hostname before recording
VITE_RP_NAME=Data402

# agent
AGENT_ERC8004_ID=
AGENT_PER_REQUEST_MAX_MICROS=50000     # 0.05 USDC
AGENT_DAILY_CAP_MICROS=1000000         # 1 USDC
AGENT_DEV_PRIVATE_KEY=            # mock mode only
DYNAMIC_ENVIRONMENT_ID=
DYNAMIC_API_KEY=                  # server only
```

## Deploy artifacts

- `contracts/deployments/monad-testnet.json`: `{ chainId, operator, data402AccessRegistry: { address, deploymentTransaction, block } }` (same shape as midnightx402 `data/phase9-deployment.json`).
- Envio `start_block` = registry deploy block.
