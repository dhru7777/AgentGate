# MapleLabsBot

A test crawler, in a three-pane demo: the bot on the left, your gate's live view top right, your actual blog bottom right, following along with whatever the bot just requested. Each of the three panes can be maximized with the icon in its top right corner.

## Mode and Brain are separate choices

**Mode** decides what the bot is trying to do:

| Mode | User-Agent token | What it does |
|---|---|---|
| Search | `MapleLabsBot-Search` | A search index crawl or answering one person's question, robots.txt, sitemap.xml, then the page(s) that best fit the question |
| Train | `MapleLabsBot-Train` | Bulk collection, robots.txt, llms.txt, sitemap.xml, then it reads for a 402 and, if the policy allows it in, pays for a bundle |

**Brain** decides who is driving that mode, and any combination works:

| Brain | What runs |
|---|---|
| MapleLabsBot's own script | A fixed sequence, no model call, always available, no cost |
| ChatGPT (OpenAI) | A live call to `OPENAI_MODEL`, with tools: read a URL, pay for the training bundle, finish |
| Claude (Anthropic) | A live call to `ANTHROPIC_MODEL`, the same tools |

With a real brain, the model decides the order itself from the question and what it actually finds, narrating each step as it goes, so no two runs look alike. The chat pane's look follows whichever brain answered that turn: Claude's turns use a warm reading layout, ChatGPT's turns use a plain minimalist layout, MapleLabsBot's own script stays in its usual technical, no-narration look. These are color and layout choices, not a copy of either product's actual interface or logo.

```bash
OPENAI_API_KEY=sk-... ANTHROPIC_API_KEY=sk-ant-... ADMIN_KEY=<analytics password> node server.mjs   # http://localhost:5180
```

Put the keys in `.env.local` next to `server.mjs` instead if you would rather not type them each time. That file is gitignored and the server loads it automatically if present; it is never committed.

## Payment

A 402 shows an Approve card. Approve sends testnet USDC on Monad from `BUYER_WALLET_ADDRESS` to `SELLER_WALLET_ADDRESS` (default `0xC90AC2b557088c50264de70969D71419311636c1`). The private key stays in `BUYER_WALLET_PRIVATE_KEY` on the server. Each click is capped at 1 USDC, and the recipient is always the seller, never an address from the browser.

The training bundle is still built from `data/snapshot.json`. Paying does not unlock the live blog. Prices (`$0.01` per search page, `$0.15` starter / `$0.40` full, 48 hours) are v1 placeholders.

- **Train + Block:** robots.txt disallows the bot, it stops before any post request, nothing is charged.
- **Train + Charge:** robots.txt allows it, a post 402s, Approve sends the USDC, and the snapshot bundle is offered.
- **Search:** a 402 ends the lookup until Approve sends the page price. The blog then verifies the transaction and the post opens in the blog pane with its access token.

## Other env vars

- `SITE` (default `https://dheeraj-work.netlify.app`), `PORT` (default `5180`).
- `ANTHROPIC_MODEL` (default `claude-sonnet-5-5`), `OPENAI_MODEL` (default `gpt-5`).
- `ADMIN_KEY` is the blog's analytics password. Without it the bot still runs, but the Free/Charge/Block switch and the gate log are off.
- `BUYER_WALLET_ADDRESS`, `BUYER_WALLET_PRIVATE_KEY`, and optional `SELLER_WALLET_ADDRESS`. Without the private key, balances still show and Approve reports that it cannot send.
- On Netlify, set the same three variables on the site. The edge function `POST /api/pay` uses them. The key is never returned to the page.
- The policy switch changes the live rule for `MapleLabsBot`. The site takes up to about a minute to pick it up; the switch waits until it actually behaves the new way before re-enabling itself.
