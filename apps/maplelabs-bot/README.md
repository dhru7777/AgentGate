# MapleLabsBot

A test crawler with three modes, plus a split-screen demo: the bot on the left, what the site's gate logged on the right.

| Mode | User-Agent token | What it does |
|---|---|---|
| Search | `MapleLabsBot-Search` | robots.txt, sitemap.xml, then the best-matching posts |
| Train | `MapleLabsBot-Train` | robots.txt, llms.txt, sitemap.xml, then up to 5 posts in bulk |
| User search | `MapleLabsBot-User` | robots.txt, sitemap.xml, then one post to answer one question |

It identifies itself, reads robots.txt first and stops if it is disallowed (a switch lets you test ignoring it).
It has no wallet, so on HTTP 402 it reports the price and stops. It only crawls `SITE`, so it cannot be pointed at other sites.

```bash
ADMIN_KEY=<analytics password> node server.mjs      # http://localhost:5180
```

- `SITE` (default `https://dheeraj-work.netlify.app`), `PORT` (default `5180`).
- `ADMIN_KEY` is the blog's analytics password. Without it the bot still runs, but the policy switch and the gate log are off.
- The Free / Charge / Block switch changes the live rule for `MapleLabsBot`. The site takes up to about a minute to pick it up, so the switch waits until the site behaves the new way.
