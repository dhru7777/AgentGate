# MapleLabsBot

A test crawler with two modes, in a three-pane demo: the bot on the left, your gate's live view top-right, your actual blog bottom-right, following along with whatever the bot just requested.

| Mode | User-Agent token | What it does |
|---|---|---|
| Search | `MapleLabsBot-Search` | Covers both a search-index crawl and answering one person's question — robots.txt, sitemap.xml, then the page(s) that best fit the question |
| Train | `MapleLabsBot-Train` | Bulk collection — robots.txt, llms.txt, sitemap.xml, then it reads for a 402 and, if the policy allows it in, pays for a bundle |

It identifies itself and reads robots.txt first. A checkbox lets you test both obeying it and ignoring it.

## A real decision-maker, or a script?

With `ANTHROPIC_API_KEY` set, each run is a live call to the model (`claude-sonnet-5-5` by default): it gets tools — read a URL, pay for the training bundle, finish — and decides the order itself from the question and what it actually finds. No two runs are identical. Without a key, a clearly-labeled scripted fallback runs the same steps in a fixed order, so the demo still works; the header always says which one is running.

```bash
ANTHROPIC_API_KEY=sk-ant-... ADMIN_KEY=<analytics password> node server.mjs   # http://localhost:5180
```

## Payment is simulated, not a live bypass

The bot has no real wallet. When Train mode "pays," it pays a simulated demo wallet — no transaction, no token sent to the live site. The delivered bundle is built from `data/snapshot.json`, a small set of the blog's own posts collected from its Jekyll source files on disk, not by fetching around the 402. The chat says this plainly. Prices (`$0.15` starter / `$0.40` full, 48 hours) are v1 placeholders, not a real pricing model.

- **Train + Block:** robots.txt disallows the bot, it stops before any post request, nothing is charged.
- **Train + Charge:** robots.txt allows it, a post 402s, it pays the simulated wallet and gets the bundle.
- **Search:** no wallet at all — a 402 just ends the lookup.

## Other env vars

- `SITE` (default `https://dheeraj-work.netlify.app`), `PORT` (default `5180`), `ANTHROPIC_MODEL` (default `claude-sonnet-5-5`).
- `ADMIN_KEY` is the blog's analytics password. Without it the bot still runs, but the Free/Charge/Block switch and the gate log are off.
- The policy switch changes the live rule for `MapleLabsBot`. The site takes up to about a minute to pick it up; the switch waits until it actually behaves the new way before re-enabling itself.
