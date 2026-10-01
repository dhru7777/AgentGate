# 09 Cloudflare Reference

Cloudflare is the product inspiration. We borrow its mental model and UX vocabulary so judges instantly understand the product. We do not clone it.

## What Cloudflare offers (as of mid 2026, verify before quoting in the pitch)

- **AI Crawl Control** (formerly AI Audit): shows which AI services crawl a site, how often, and lets owners allow or block each crawler.
- **Pay Per Crawl** (private beta): owner sets a price. Crawlers without payment get `HTTP 402` with a `crawler-price` header. Crawlers can send `crawler-max-price` (willing to pay up to) or `crawler-exact-price` (accept quoted price). On success the response carries `crawler-charged`. Cloudflare acts as merchant of record and bills in fiat.
- **Web Bot Auth**: crawlers sign requests with HTTP Message Signatures so the site can verify the crawler cryptographically instead of trusting User-Agent.
- **x402 proxy template**: a Worker template that puts x402 payment in front of an origin.

## Concept mapping

| Cloudflare | Data402 | Difference |
|---|---|---|
| AI Crawl Control dashboard | AI Activity screen | Built from onchain payments (Envio) plus gateway log |
| Crawler identified by verified bot list / Web Bot Auth | Agent identified by ERC-8004 id on Monad, bound to paying wallet | Open registry, anyone can register, reputation is onchain |
| Allow / Block per crawler | Policy rules: `block_agent`, `block_anonymous`, `allow_free_agent` | Rules reference agent ids, not company names |
| Pay Per Crawl, flat price per site | Per resource price with path patterns, identity multipliers | Research page can cost more than a blog post |
| `crawler-price` header | x402 `PAYMENT-REQUIRED` header | Open standard, any x402 client works |
| `crawler-max-price` / `crawler-exact-price` | Agent side spend policy (per request max, daily cap) | Enforced in the agent, not negotiated in headers (stretch: accept `crawler-max-price` too) |
| Cloudflare as merchant of record, fiat billing | Direct USDC settlement to owner's passkey derived payout address | No intermediary holds funds |
| Requires Cloudflare proxy | Standalone gateway in front of any origin | Portable |

## UX vocabulary to reuse

Use these labels so the product feels familiar: "AI Activity", "Crawlers / Agents", "Allow", "Charge", "Block", "Price per request", "Requests", "Paid", "Blocked".

## What we will not copy

- Crawler reputation lists maintained by us. Identity comes from ERC-8004.
- Fiat billing and merchant of record.
- CDN scale concerns.

## Stretch compatibility

If time allows, the gateway also accepts Cloudflare style headers: when a request has `crawler-max-price` >= price, include `crawler-price` in the 402 response alongside `PAYMENT-REQUIRED`. Settlement still happens via x402. This is a nice slide ("works with the vocabulary crawlers already speak") but not required.
