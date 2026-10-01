# 15 Existing Netlify Gate (dheeraj-work.netlify.app)

This documents the AI access gate already running on the builder's blog. It is the closest working prototype of Data402 and the source for the CLASSIFY stage and the human path. Read it before touching `apps/gateway/src/pipeline/classify.ts` or anything that decides who must pay.

Diagrams: `assets/diagrams/request-flow.html` in the blog repo (local only unless pushed; would live at `https://dheeraj-work.netlify.app/assets/diagrams/request-flow.html`). Five diagrams, time runs downward, one column per party.

## Components

| Component | Type | Runs when |
|---|---|---|
| `gate-ai-access` | Netlify edge function | On every URL, first |
| `/api/reader-unlock` | Route handled inside `gate-ai-access` | When the 402 page's JavaScript finishes proof of work |
| `/api/verify-payment` | Function | Agent posts proof of a 0.01 USDC payment on Base; returns `accessToken` |
| `/api/content` | Function | Alternate path for a paid agent to fetch the post |
| `bot-rules`, `track`, `analytics` | Functions | Only when those URLs are called directly |
| Jekyll static files | Origin | Read only after the edge allows the request |

Netlify itself does not identify the visitor. The edge function reads only what the client sent on that request.

## The five flows

1. **Opening the connection.** DNS, TCP handshake, TLS. No page is sent yet.
2. **A human opens a blog post.** Edge returns the 402 page. Its JavaScript runs a small proof of work, calls `/api/reader-unlock`, edge mints the `dw_reader` cookie, browser reloads, post is served.
3. **An agent wants the same post.** `/llms.txt` is readable for free. The post stays locked behind 402.
4. **Which function runs.** Every URL hits `gate-ai-access` first. `/api/reader-unlock` stays inside it. Other functions run only on their own URLs. Jekyll file read happens last.
5. **The agent pays, then the post is accepted.** Agent sends 0.01 USDC on Base, calls `POST /api/verify-payment`, receives an `accessToken`, then opens the post on the same URL with the token or through `/api/content`.

## How a visit is labeled

| What arrives | Label |
|---|---|
| User-Agent contains Claude, GPTBot, ChatGPT, Cursor, Perplexity, or another name in the AI list | AI agent |
| User-Agent is Googlebot or Bingbot | Search |
| User-Agent looks like Chrome, Safari, or Firefox, AND (`Sec-Fetch-Mode: navigate` OR `Sec-Fetch-Dest: document`), AND no AI name in the User-Agent | Human |
| User-Agent looks like Chrome but `Sec-Fetch-*` headers are missing | AI agent (automated browser, curl, or python) |
| Valid payment token attached | Paid agent |

Principle: a request with no browser headers is treated as an agent. A normal browser always sends `Sec-Fetch-Mode: navigate` on page open. curl and most agent fetches do not. Missing headers signal an agent, not a person.

## The label is not the key

The label drives analytics and messaging. It does not unlock content. A post URL (for example `/2025/05/13/...`) is served only if one of these is true:

1. Request carries the `dw_reader` cookie, minted by this site only after the 402 page's JavaScript completes proof of work. Accepting cookies is not enough; the cookie must be one this site minted.
2. Request carries an `accessToken` from `POST /api/verify-payment` after a 0.01 USDC payment on Base.
3. User-Agent matches an allowed search crawler (Googlebot, Bingbot).

Everyone else gets 402, including a client that only claims `User-Agent: Chrome`.

## What is self-proclaimed

| Signal | Trust |
|---|---|
| User-Agent | Fully self-proclaimed. Any client can send `ClaudeBot` or a Chrome string |
| `Sec-Fetch-*` headers | Also self-proclaimed. Raises the bar for naive clients only |
| `dw_reader` cookie | Earned: requires running JavaScript and finishing proof of work |
| `accessToken` | Earned: requires an onchain payment verified by the server |

## Known weak spots

| Weak spot | Risk | Fix |
|---|---|---|
| Search allow-list trusts `User-Agent: Googlebot` | Any agent can read every post free by claiming Googlebot | Verify crawler IP: reverse DNS must end in `googlebot.com` / `google.com` / `search.msn.com`, then forward DNS must match; or match against Google and Bing published IP ranges. Cache results |
| `Sec-Fetch-*` can be spoofed | A scripted client can add the headers and get labeled Human | Acceptable, because the label does not unlock content. Keep it that way |
| Proof of work is solvable by headless browsers | A Playwright agent can mint `dw_reader` | Tune difficulty; bind cookie to expiry and a server-signed value; rate limit cookie minting per IP. Accept that a determined headless agent pays in compute instead of USDC |
| Cookie and token format | Unknown from this summary | Confirm: signed (HMAC) or opaque, expiry, scope (one post or whole site), replay handling |

## What Data402 takes from this

| Netlify gate | Data402 equivalent | Change |
|---|---|---|
| `gate-ai-access` labeling table | `pipeline/classify.ts` | Port the table as written. Add ERC-8004 `X-Agent-Id` as a stronger agent signal |
| "Label is not the key" | Policy decides, classification only informs | Already the Data402 design. Keep it |
| Human path: 402 page + proof of work + `dw_reader` | Human path in gateway | **Replaces** the earlier "humans pass straight through" rule in `03-ARCHITECTURE.md`. Humans also get a challenge, solved by the browser, not by payment |
| `/llms.txt` free | `GET /p/:slug/llms.txt` free | Same |
| Search crawler allow-list | Policy rule `allow_verified_search` | Must use DNS or IP verification, not User-Agent only |
| Pay on Base, then `POST /api/verify-payment`, then `accessToken` | x402 on Monad: `PAYMENT-SIGNATURE` on the retry, settled by facilitator, receipt per request | Different model. Netlify gate is pay first then redeem a token; Data402 is pay inside the HTTP retry. Optional stretch: issue a short-lived access token after settlement so an agent can read several pages of one license without re-paying |
| `/api/content` alternate path | Not needed | x402 retry on the same URL covers it |
| Base USDC | Monad testnet USDC | Chain swap per D-001 |

## Open questions for the builder

| ID | Question |
|---|---|
| Q-N1 | Is the `dw_reader` cookie HMAC signed with an expiry? What is the proof of work difficulty? |
| Q-N2 | What is the `accessToken` lifetime and scope (one post, whole site)? Is it single use? |
| Q-N3 | How does `/api/verify-payment` prove the payment: tx hash lookup on Base RPC? Does it prevent the same tx hash being redeemed twice? |
| Q-N4 | Should Data402's demo origin be this blog (real traffic, real story) or a fresh demo origin? |
| Q-N5 | Push `assets/diagrams/request-flow.html` to the live site so judges can open it? |
