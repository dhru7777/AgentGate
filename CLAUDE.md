# AgentGate

Monetized AI agent access to proprietary data over HTTP 402 Payment Required. Dashboard in `apps/dashboard` (React 19, Vite, viem, Mera). Specs live in `Context/` and `instructions/`.

## Branches

- `dev`: working branch, all development happens here.
- `main`: release branch. Dev-only files (this file, `Context/`, `instructions/`, `docs/`) are left out when merging into it.

## Commands

Run from `apps/dashboard`:

- `npm run dev`: Vite dev server on localhost:5173
- `npm run build`: typecheck then production build into `dist`
- `server/`: standalone Node server with the Etherscan proxy (needs `ETHERSCAN_API_KEY`)

## Deploy

Netlify, configured in `netlify.toml` (base `apps/dashboard`, publish `dist`).
