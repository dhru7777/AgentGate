# 11 Demo Script

Target length: 3 minutes. Every UI decision should serve this script. If a feature is not in this script, it is not a priority.

Setup before recording: dashboard open on laptop (signed out), phone with the same synced passkey, terminal with the agent CLI, Monad explorer tab, demo origin running behind the gateway.

| Time | Screen | Action | Line to say | Proves |
|---|---|---|---|---|
| 0:00 | Slide | Problem | "AI agents read proprietary data all day. Owners either block them and lose the upside, or allow them and get nothing." | Problem |
| 0:15 | Dashboard | Click "Create account", one passkey prompt | "No seed phrase, no extension. One passkey." | Mera UX |
| 0:30 | Dashboard | Add property `dheeraj-blog`, see payout and ownership addresses appear | "Each property gets its own payout address and its own signing key, derived from that one passkey. Nothing is stored." | Mera Many Keys |
| 0:45 | Dashboard | Click Verify ownership, green check | "Ownership is proven by a signature published on the site." | Trust |
| 0:55 | Policy screen | Set article price 0.01 USDC, unregistered agents 2x, block agent #X | "Owner sets the rules, like Cloudflare, but per resource and per agent identity." | Trust, Cloudflare model |
| 1:10 | Terminal | Anonymous agent requests article, gets 402 at 0.02 USDC | "Unknown agent, higher price." | Policy |
| 1:20 | Terminal | Registered agent (ERC-8004 #id) with Dynamic wallet requests same article: 402 at 0.01, checks spend cap, signs, pays, gets content and receipt hash | "Registered agent, fair price, paid in USDC on Monad by its own Dynamic wallet." | Dynamic, ERC-8004, Monad |
| 1:45 | Explorer | Open payment tx, then AccessRecorded tx | "The payment and the access receipt are both onchain." | Proof |
| 2:00 | Dashboard AI Activity | New row appears, revenue ticks up, agent #id at top | "This dashboard is powered by Envio indexing Monad, not by our server's memory." | Envio |
| 2:15 | Dashboard | Stop the gateway process, refresh: revenue still there | "Turn our server off, the numbers are still there." | Envio |
| 2:30 | Phone | Sign in with the same passkey, open `/verify`, all green | "Same passkey on another device re-derives every key. Nothing was ever stored." | Mera Many Keys cross-device |
| 2:45 | Slide | Stack | "Mera for owners, Dynamic for agents, Monad for settlement, Envio for analytics, ERC-8004 for identity. Data402 ties it together." | Summary |

## Fallbacks during a live demo

- Facilitator slow: pre-recorded clip of the paid call; continue live from the dashboard.
- Envio lag: say "indexing" and show the tx on explorer first; come back.
- Passkey prompt fails on laptop Chrome: use Safari or ensure Google Password Manager. Test on the exact machine the day before.
