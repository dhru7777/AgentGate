// MapleLabsBot demo server. No npm dependencies, uses global fetch.
//
// Two modes: Search (covers both "search index" and "answer one person's question")
// and Train (bulk collection, paid as a 48-hour bundle).
//
// If ANTHROPIC_API_KEY is set, each run is a real agent loop: the model gets tools
// (read a URL on the site, pay for the training bundle, finish) and decides the
// order itself, it is not a fixed script. Without a key, a clearly-labeled scripted
// fallback runs instead, so the demo still works.
//
// A click on Approve sends real testnet USDC on Monad from the buyer wallet to the
// seller (POST /api/pay → wallet/transfer.mjs). The key stays in BUYER_WALLET_PRIVATE_KEY.
// The training bundle is still a local snapshot: paying does not unlock the live blog.

import http from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { extname, join, normalize, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Load .env.local if present (never committed, see .gitignore). No npm dependency.
try {
  const { readFileSync } = await import("node:fs");
  const envPath = join(dirname(fileURLToPath(import.meta.url)), ".env.local");
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch { /* no .env.local, that's fine */ }

const HERE = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 5180);
const SITE = (process.env.SITE || "https://dheeraj-work.netlify.app").replace(/\/$/, "");
const ADMIN_KEY = process.env.ADMIN_KEY || ""; // the blog's analytics password, only needed for the policy switch
// Read-only use: globe dots and the gate log. Never used to change the policy.
const ANALYTICS_KEY = process.env.ANALYTICS_KEY || ADMIN_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || "";
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";
const OPENAI_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5";
const RULE_ID = "maplelabs";
const PUBLIC = join(HERE, "public");
const POLITE_DELAY_MS = 350;

// Monad testnet, same chain and USDC contract apps/dashboard already uses (chain/monad.ts).
// Balances are read here. Signing happens in wallet/transfer.mjs, only after Approve.
const MONAD_RPC = process.env.MONAD_RPC_URL || "https://testnet-rpc.monad.xyz";
const MONAD_EXPLORER = "https://testnet.monadvision.com";
const MONAD_USDC = "0x534b2f3A21130d7a60830c2Df862319e593943A3";
// Public address. The matching private key is BUYER_WALLET_PRIVATE_KEY, read only
// inside wallet/transfer.mjs and never sent to the browser.
const BUYER_ADDRESS = process.env.BUYER_WALLET_ADDRESS || "";
const SELLER_ADDRESS = process.env.SELLER_WALLET_ADDRESS || "0xC90AC2b557088c50264de70969D71419311636c1";

async function rpcCall(method, params) {
  const res = await fetch(MONAD_RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const body = await res.json();
  if (body.error) throw new Error(body.error.message || "RPC error");
  return body.result;
}

const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const FIXED_AMOUNTS = new Set(["0.01", "0.15", "0.40"]);

function fixedAmount(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return null;
  const fixed = n.toFixed(2);
  return FIXED_AMOUNTS.has(fixed) ? fixed : null;
}

async function logsInRange(fromBlock, toBlock, topics) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await rpcCall("eth_getLogs", [{ address: MONAD_USDC, fromBlock, toBlock, topics }]);
    } catch (err) {
      if (!/limit/i.test(err.message) || attempt === 3) throw err;
      await sleep(400);
    }
  }
  return [];
}

const HISTORY_PATH = join(HERE, "data", "usdc-history.json");
// Monad testnet moves a few blocks a second, and eth_getLogs only accepts a
// 100-block window. A short walk misses payments within a couple of minutes.
// Remember every transfer we find so the dollar popover still has its last 3.
const HISTORY_WINDOWS = 100;
let history = [];
let historyReady = false;
let scanning = null;
let scannedAt = 0;

function padTopic(address) {
  return "0x" + address.slice(2).toLowerCase().padStart(64, "0");
}

async function loadHistory() {
  if (historyReady) return;
  try {
    history = JSON.parse(await readFile(HISTORY_PATH, "utf8"));
    if (!Array.isArray(history)) history = [];
  } catch {
    history = [];
  }
  historyReady = true;
}

function txsFor(address) {
  const a = address.toLowerCase();
  return history
    .filter((row) => row.from?.toLowerCase() === a || row.to?.toLowerCase() === a)
    .sort((x, y) => y.block - x.block)
    .slice(0, 3)
    .map((row) => ({
      hash: row.hash,
      direction: row.from.toLowerCase() === a ? "out" : "in",
      amount: row.amount,
      block: row.block,
      explorer: row.explorer,
    }));
}

async function rememberTransfers(rows) {
  let changed = false;
  for (const row of rows) {
    if (!row?.hash || history.some((h) => h.hash === row.hash)) continue;
    history.push(row);
    changed = true;
  }
  history.sort((a, b) => b.block - a.block);
  if (history.length > 40) history.length = 40;
  if (!changed) return;
  await mkdir(join(HERE, "data"), { recursive: true });
  await writeFile(HISTORY_PATH, JSON.stringify(history, null, 2));
}

function refreshHistory() {
  if (scanning) return scanning;
  if (Date.now() - scannedAt < 90_000 && history.length) return Promise.resolve();
  const pads = [BUYER_ADDRESS, SELLER_ADDRESS].filter((a) => /^0x[a-fA-F0-9]{40}$/.test(a)).map(padTopic);
  if (!pads.length) return Promise.resolve();
  scanning = (async () => {
    const latest = BigInt(await rpcCall("eth_blockNumber", []));
    const logs = [];
    for (let i = 0; i < HISTORY_WINDOWS; i++) {
      const end = latest - BigInt(i * 100);
      if (end < 0n) break;
      const start = end > 99n ? end - 99n : 0n;
      const fromBlock = "0x" + start.toString(16);
      const toBlock = "0x" + end.toString(16);
      logs.push(...(await logsInRange(fromBlock, toBlock, [TRANSFER_TOPIC, pads]) || []));
      logs.push(...(await logsInRange(fromBlock, toBlock, [TRANSFER_TOPIC, null, pads]) || []));
      const unique = new Set(logs.map((log) => log.transactionHash));
      if (unique.size >= 3) break;
      await sleep(40);
    }
    const seen = new Set();
    const rows = [];
    for (const log of logs) {
      if (seen.has(log.transactionHash)) continue;
      seen.add(log.transactionHash);
      rows.push({
        hash: log.transactionHash,
        from: "0x" + String(log.topics[1]).slice(-40),
        to: "0x" + String(log.topics[2]).slice(-40),
        amount: (Number(BigInt(log.data)) / 1e6).toFixed(2),
        block: Number(BigInt(log.blockNumber)),
        explorer: `${MONAD_EXPLORER}/tx/${log.transactionHash}`,
      });
    }
    await rememberTransfers(rows);
    scannedAt = Date.now();
  })().catch((err) => {
    console.error("refreshHistory", err.message);
  }).finally(() => {
    scanning = null;
  });
  return scanning;
}

async function walletBalances(address) {
  if (!address) return null;
  await loadHistory();
  const pending = refreshHistory();
  // The first open of the dollar popover waits so Last 3 is filled, not blank.
  if (!history.length) await pending;
  const [monWei, usdcRaw] = await Promise.all([
    rpcCall("eth_getBalance", [address, "latest"]),
    // ERC-20 balanceOf(address), hand-encoded: no library needed for one read call.
    rpcCall("eth_call", [{ to: MONAD_USDC, data: "0x70a08231" + address.slice(2).toLowerCase().padStart(64, "0") }, "latest"]),
  ]);
  return {
    address,
    mon: (Number(BigInt(monWei)) / 1e18).toFixed(4),
    usdc: (Number(BigInt(usdcRaw || "0x0")) / 1e6).toFixed(2),
    explorer: `${MONAD_EXPLORER}/address/${address}`,
    txs: history.length ? txsFor(address) : null,
  };
}

// v1 demo prices. Placeholders, not a real pricing model. v2 will set these properly.
const PRICES = {
  search: { perPage: 0.01, unit: "USDC", label: "Pay per use", note: "one page" },
  train: {
    starter: { usd: 0.15, label: "Starter bundle", postCap: 10 },
    full: { usd: 0.4, label: "Full archive bundle", postCap: 999 },
    hours: 48,
  },
};

function monadQuote(mode, bundleChoice) {
  const usd = mode === "train"
    ? PRICES.train[bundleChoice === "full" ? "full" : "starter"].usd
    : PRICES.search.perPage;
  return `$${Number(usd).toFixed(2)} USDC`;
}

const MODES = {
  search: { label: "Search", token: "MapleLabsBot-Search", why: "Look something up, for a search index or to answer one question" },
  train: { label: "Train", token: "MapleLabsBot-Train", why: "Collect a bundle of posts to train on" },
};
// The brain tag sits right after the token, before the long URL, so it survives the live
// gate's 100 char truncation of the User-Agent it logs. This is how the gate log, and the
// demo's own /api/log, can show which model actually drove a given request.
function ua(mode, brand, model) {
  const tag = brand === "openai" ? `brain=openai:${model}` : brand === "anthropic" ? `brain=anthropic:${model}` : "brain=script";
  return `Mozilla/5.0 (compatible; ${MODES[mode].token}/1.0; ${tag}) +https://github.com/dhru7777/AgentGate`;
}

// The reverse of the tag above, read back out of a logged User-Agent string for the gate log table.
function modelFromUa(uaString) {
  const m = (uaString || "").match(/brain=([^)]+)/);
  if (!m) return "";
  const value = m[1];
  if (value === "script") return "MapleLabsBot script";
  const sep = value.indexOf(":");
  if (sep < 0) return value;
  const vendor = value.slice(0, sep);
  const model = value.slice(sep + 1);
  const label = vendor === "openai" ? "ChatGPT" : vendor === "anthropic" ? "Claude" : vendor;
  return `${label} (${model})`;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- robots.txt (RFC 9309-style matching) ----------
function parseRobots(text) {
  const groups = [];
  const sitemaps = [];
  let current = null;
  let lastWasAgent = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    if (!line) continue;
    const i = line.indexOf(":");
    if (i < 0) continue;
    const key = line.slice(0, i).trim().toLowerCase();
    const value = line.slice(i + 1).trim();
    if (key === "user-agent") {
      if (!current || !lastWasAgent) { current = { agents: [], rules: [] }; groups.push(current); }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if (key === "allow" || key === "disallow") {
      if (current) current.rules.push({ type: key, path: value });
      lastWasAgent = false;
    } else if (key === "sitemap") {
      sitemaps.push(value);
    } else lastWasAgent = false;
  }
  return { groups, sitemaps };
}

function verdictFor(robots, token, path) {
  const me = token.toLowerCase();
  let best = null;
  let bestLen = -1;
  for (const group of robots.groups) {
    for (const agent of group.agents) {
      const match = agent === "*" ? 0 : me.startsWith(agent) ? agent.length : -1;
      if (match > bestLen) { best = group; bestLen = match; }
    }
  }
  if (!best) return { allowed: true, rule: "no matching group" };
  let winner = null;
  for (const rule of best.rules) {
    if (!rule.path) continue;
    if (path.startsWith(rule.path) && (!winner || rule.path.length > winner.path.length || (rule.path.length === winner.path.length && rule.type === "allow"))) winner = rule;
  }
  return { allowed: !winner || winner.type === "allow", rule: winner ? `${winner.type === "allow" ? "Allow" : "Disallow"}: ${winner.path}` : "no matching rule" };
}

let SNAPSHOT = null;
async function loadSnapshot() {
  if (SNAPSHOT) return SNAPSHOT;
  const raw = await readFile(join(HERE, "data/snapshot.json"), "utf8");
  SNAPSHOT = JSON.parse(raw);
  return SNAPSHOT;
}

function findPost(pathname) {
  const want = String(pathname || "").split("?")[0];
  return (SNAPSHOT?.posts || []).find((post) => post.url === want || want.endsWith(post.url));
}

function slugOf(url) {
  return decodeURIComponent(new URL(url, SITE).pathname).replace(/\.html$/, "").split("/").pop().replace(/-/g, " ");
}
const STOP = new Set("what when where which that this with from have about does your would could should there their they them then than into over under between how why who the and for are you can tell explain say says said please".split(" "));
const words = (s) => s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w));
const score = (text, q) => { const set = new Set(words(text)); return words(q).filter((w) => set.has(w)).length; };

// ---------- the live site: fetch, pay (simulated), build the bundle ----------
function fetcher(mode, brand, model, emit, stats) {
  let n = 0;
  return async (path, kind, label) => {
    const url = path.startsWith("http") ? path : SITE + path;
    if (new URL(url).origin !== SITE) throw new Error("MapleLabsBot only reads " + SITE);
    const t0 = Date.now();
    const res = await fetch(url, { headers: { "User-Agent": ua(mode, brand, model), Accept: "text/html,text/plain,application/json;q=0.9,*/*;q=0.5" }, redirect: "follow" });
    const body = await res.text();
    n += 1;
    stats.requests += 1;
    if (res.status === 200) stats.served += 1;
    if (res.status === 402) stats.blocked += 1;
    emit({ type: "step", n, label: label || kind, kind, path: new URL(url).pathname, status: res.status, ms: Date.now() - t0, bytes: body.length });
    await sleep(POLITE_DELAY_MS);
    return { status: res.status, body, url };
  };
}

function payForBundle(bundle) {
  // Quote only. USDC moves later, when the person clicks Approve.
  const tier = PRICES.train[bundle] || PRICES.train.starter;
  return { ok: true, tier, charged: tier.usd, expiresAt: Date.now() + PRICES.train.hours * 3600 * 1000 };
}

async function buildBundle(bundle, question) {
  const snap = await loadSnapshot();
  const tier = PRICES.train[bundle] || PRICES.train.starter;
  let posts = snap.posts;
  if (question) posts = [...posts].sort((a, b) => score(b.title + " " + b.excerpts.join(" "), question) - score(a.title + " " + a.excerpts.join(" "), question));
  posts = posts.slice(0, tier.postCap);
  return {
    generatedAt: new Date().toISOString(),
    source: "Local snapshot of the blog's own Jekyll source files, not fetched around the live paywall.",
    site: SITE,
    bundle,
    expiresAt: new Date(Date.now() + PRICES.train.hours * 3600 * 1000).toISOString(),
    postCount: posts.length,
    posts,
  };
}

// ---------- scripted fallback (no ANTHROPIC_API_KEY) ----------
async function runScripted({ mode, question, respectRobots, bundleChoice }, emit) {
  const m = MODES[mode];
  const stats = { requests: 0, served: 0, blocked: 0 };
  const step = fetcher(mode, "maplelabs", null, emit, stats);
  const scriptName = mode === "train" ? "MapleLabsBot's training script" : "MapleLabsBot's search script";
  emit({ type: "start", mode, label: m.label, why: m.why, token: m.token, brain: `${scriptName}, a fixed sequence, no model call`, brand: "maplelabs" });

  const robotsRes = await step("/robots.txt", "robots", "robots.txt");
  const robots = parseRobots(robotsRes.body);
  const verdict = verdictFor(robots, m.token, "/2026/");
  emit({ type: "decision", text: verdict.allowed ? `robots.txt allows ${m.token} (${verdict.rule})` : `robots.txt disallows ${m.token} (${verdict.rule})`, allowed: verdict.allowed });
  if (!verdict.allowed && respectRobots) {
    emit({ type: "answer", text: `robots.txt tells ${m.token} to stay out, so I stopped before asking for any post. Nothing was charged.`, sources: [] });
    emit({ type: "done", mode, ...stats });
    return;
  }
  if (!verdict.allowed) emit({ type: "decision", text: "Ignoring robots.txt, the demo's checkbox is off. The site should log this as a violation.", allowed: false, violation: true });

  await step("/llms.txt", "llms", "llms.txt");
  const siteRes = await step("/sitemap.xml", "sitemap", "sitemap.xml");
  const urls = [...siteRes.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((x) => x[1].trim()).filter((u) => /\/\d{4}\/\d{2}\/\d{2}\//.test(u));
  emit({ type: "decision", text: `${urls.length} posts in the sitemap`, allowed: true });

  if (mode === "train") {
    const pick = urls[0];
    const r = pick ? await step(new URL(pick).pathname, "post", "post") : null;
    if (r && r.status === 402) {
      const tier = bundleChoice || "starter";
      const paid = payForBundle(tier);
      emit({ type: "payment", price: `$${Number(paid.charged).toFixed(2)} USDC`, network: "Monad" });
      emit({ type: "paid", tier: paid.tier.label, charged: paid.charged, hours: PRICES.train.hours });
      const bundle = await buildBundle(tier, question);
      emit({ type: "bundle", bundle });
      emit({ type: "answer", text: `The post returned HTTP 402. Click Approve to send $${paid.charged} USDC on Monad testnet from the buyer wallet to the seller. The ${paid.tier.label} (${bundle.postCount} posts) is a local snapshot, ready once you approve.`, sources: [] });
      emit({ type: "done", mode, ...stats });
      return;
    }
  }

  let ranked = urls.map((u) => ({ u, s: score(slugOf(u), question) })).sort((a, b) => b.s - a.s);
  const pick = ranked[0]?.u;
  const r = pick ? await step(new URL(pick).pathname, "post", "post") : null;
  if (r && r.status === 200) {
    const title = r.body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() || pick;
    emit({ type: "answer", text: `Read "${title}". This script just fetches, it does not summarize. Pick ChatGPT or Claude as the brain for a real read-and-answer.`, sources: [{ url: pick, title }] });
  } else if (r && r.status === 402) {
    const page = Number(PRICES.search.perPage).toFixed(2);
    emit({ type: "payment", price: `$${page} USDC`, network: "Monad" });
    emit({ type: "answer", text: "Approve to open it.", sources: [] });
  } else {
    emit({ type: "answer", text: "No posts to read for that question.", sources: [] });
  }
  emit({ type: "done", mode, ...stats });
}

// ---------- real agent loop (either vendor) ----------
// Either brain can run either mode. A 402 in Search or Train is paid on Monad when the person clicks Approve.
function toolsFor(mode) {
  const all = [
    {
      name: "read_url",
      description: "Fetch a path on the site as MapleLabsBot and get back its status code and text. Use this for /robots.txt, /llms.txt, /sitemap.xml, and post URLs you find in the sitemap. You can only read this one site.",
      input_schema: { type: "object", properties: { path: { type: "string", description: "A path like /robots.txt or /2026/06/08/some-post.html" } }, required: ["path"] },
    },
    {
      name: "pay_for_training_bundle",
      description: "Only use this in Train mode, only after a post you asked for came back as HTTP 402, and only if the operator's respect-robots.txt setting did not already stop you. Prepares the training bundle. It does not send USDC. The person clicks Approve in the demo to send testnet USDC from the buyer wallet to the seller on Monad.",
      input_schema: { type: "object", properties: { bundle: { type: "string", enum: ["starter", "full"], description: "starter = up to 10 posts, full = the whole archive" } }, required: ["bundle"] },
    },
    {
      name: "finish",
      description: "End the run with your final answer for the person who asked, and which page URLs, if any, you actually read and are citing.",
      input_schema: { type: "object", properties: { answer: { type: "string" }, sources: { type: "array", items: { type: "string" } } }, required: ["answer"] },
    },
  ];
  return mode === "train" ? all : all.filter((t) => t.name !== "pay_for_training_bundle");
}

const BRAND_LINE = {
  openai: "You are being run by an OpenAI model for this test.",
  anthropic: "You are being run by an Anthropic model for this test.",
};

function systemPrompt({ mode, brand, respectRobots, question }) {
  const m = MODES[mode];
  const priceLine = mode === "train"
    ? `Train pricing, paid in testnet USDC on Monad only after the person clicks Approve: ${PRICES.train.starter.label} $${PRICES.train.starter.usd} (up to ${PRICES.train.starter.postCap} posts), ${PRICES.train.full.label} $${PRICES.train.full.usd} (the whole archive), both valid ${PRICES.train.hours} hours.`
    : `Search pricing: $${PRICES.search.perPage} ${PRICES.search.unit} per page. On HTTP 402, tell the person to click Approve. That sends the USDC on Monad.`;
  return `You are MapleLabsBot, running in ${m.label} mode (${m.why}). Your User-Agent token is ${m.token}. ${BRAND_LINE[brand] || ""} You are a test crawler built to demonstrate AgentGate's paywall to someone evaluating it, so behave the way a real, well-behaved crawler would: check robots.txt before you fetch anything else, decide what to do next yourself based on what you actually find, and do not follow a fixed script.

Settlement is always testnet USDC on Monad, from the buyer wallet to the seller, and only after the person clicks Approve. The live blog's 402 body may name another network. Ignore that. Never say the payment is on Base, and never say Search has no wallet.

The operator's respect-robots.txt switch is currently ${respectRobots ? "ON, meaning if robots.txt disallows you for post URLs, you must stop and not request any post." : "OFF, meaning you may ignore a Disallow for this test run, but say plainly that you are doing so."}

${priceLine}

The person asked: "${question}"

Work the way a careful crawler should: read /robots.txt first. Then use your judgment, read /llms.txt if it seems useful, read /sitemap.xml to find posts, and read whichever post(s) best fit the question (in Train mode, read more broadly, in Search mode, usually one or two is enough). If a post answers with HTTP 402 and robots.txt did not stop you: in Train mode, use pay_for_training_bundle; in Search mode, stop fetching and tell the person to click Approve for the per-page Monad price. Before each tool call, say one short sentence in plain first-person language about what you're about to check and why, as ordinary message text alongside the call, the way you would narrate a thought out loud in a real conversation, not a log line. When you have what you need, or you are stopped, call finish with a short, honest answer, including saying so plainly if you were blocked or paid.`;
}

// Extended thinking, maximum effort. The whole content array (including any thinking blocks)
// must be sent back unchanged on the next turn, which the code below already does.
async function anthropicCall(messages, system, mode) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 6000,
      thinking: { type: "adaptive" },
      output_config: { effort: "high" },
      system,
      tools: toolsFor(mode),
      messages,
    }),
  });
  if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

async function runAgent({ mode, question, respectRobots, bundleChoice }, emit) {
  const m = MODES[mode];
  const stats = { requests: 0, served: 0, blocked: 0 };
  const step = fetcher(mode, "anthropic", ANTHROPIC_MODEL, emit, stats);
  emit({ type: "start", mode, label: m.label, why: m.why, token: m.token, brain: `live call to ${ANTHROPIC_MODEL} (Anthropic)`, brand: "anthropic" });

  const system = systemPrompt({ mode, brand: "anthropic", respectRobots, question });
  const messages = [{ role: "user", content: question }];
  let blockedByRobots = false;
  let paid = null;

  for (let turn = 0; turn < 10; turn++) {
    const resp = await anthropicCall(messages, system, mode);
    messages.push({ role: "assistant", content: resp.content });
    for (const block of resp.content) {
      if (block.type === "thinking" && block.thinking) emit({ type: "thinking", text: block.thinking });
    }
    const toolUses = resp.content.filter((b) => b.type === "tool_use");
    if (toolUses.length === 0) {
      const text = resp.content.find((b) => b.type === "text")?.text || "(no answer)";
      emit({ type: "answer", text, sources: [] });
      break;
    }
    // Narration alongside this turn's tool calls, shown as a chat bubble, not just a log line.
    for (const block of resp.content) {
      if (block.type === "text" && block.text) emit({ type: "aside", text: block.text });
    }
    const results = [];
    for (const call of toolUses) {
      let result;
      if (call.name === "read_url") {
        const path = call.input.path;
        if (path === "/robots.txt") {
          const r = await step(path, "robots", "robots.txt");
          const robots = parseRobots(r.body);
          const verdict = verdictFor(robots, m.token, "/2026/");
          emit({ type: "decision", text: verdict.allowed ? `robots.txt allows ${m.token} (${verdict.rule})` : `robots.txt disallows ${m.token} (${verdict.rule})`, allowed: verdict.allowed });
          if (!verdict.allowed && respectRobots) blockedByRobots = true;
          result = `HTTP ${r.status}\n${r.body.slice(0, 2500)}`;
        } else {
          const kind = path === "/llms.txt" ? "llms" : path.startsWith("/sitemap") ? "sitemap" : /^\/\d{4}\//.test(path) ? "post" : "other";
          if (kind === "post" && blockedByRobots) {
            result = "Refused locally: robots.txt disallowed this bot and the operator's switch says to respect it. Do not request any more posts.";
          } else {
            const r = await step(path, kind, kind === "post" ? "post" : path.replace("/", ""));
            if (r.status === 402) {
              const price = monadQuote(mode, bundleChoice);
              emit({ type: "payment", price, network: "Monad" });
              result = `HTTP 402. Settle on Monad. The person clicks Approve to send ${price} from the buyer wallet to the seller. Do not say Base, and do not say Search has no wallet.`;
            } else {
              result = `HTTP ${r.status}\n${r.body.slice(0, 2500)}`;
            }
          }
        }
      } else if (call.name === "pay_for_training_bundle") {
        if (mode !== "train" || blockedByRobots) {
          result = "Refused: payment is only available in Train mode and only when robots.txt did not stop you.";
        } else {
          const tier = call.input.bundle === "full" ? "full" : "starter";
          paid = payForBundle(tier);
          const bundle = await buildBundle(tier, question);
          emit({ type: "paid", tier: paid.tier.label, charged: paid.charged, hours: PRICES.train.hours });
          emit({ type: "bundle", bundle });
          const titles = bundle.posts.map((p) => `- ${p.title}`).join("\n");
          result = `Quote ready, no USDC sent yet: ${paid.tier.label}, $${paid.charged}, valid ${PRICES.train.hours}h. The person must click Approve, which sends that USDC on Monad testnet from the buyer wallet to the seller. Bundle prepared locally: ${bundle.postCount} posts from a snapshot, not fetched around the paywall. Titles:\n${titles}\n\nSay that payment still needs Approve. You may summarize titles in this list. Do not invent details beyond a title, and do not say the USDC has already moved.`;
        }
      } else if (call.name === "finish") {
        emit({ type: "answer", text: call.input.answer, sources: (call.input.sources || []).map((url) => ({ url, title: url })) });
        emit({ type: "done", mode, ...stats });
        return;
      }
      results.push({ type: "tool_result", tool_use_id: call.id, content: String(result) });
    }
    messages.push({ role: "user", content: results });
  }
  emit({ type: "done", mode, ...stats });
}

// ---------- OpenAI-flavored agent loop (OPENAI_API_KEY set) ----------
function openaiTools(mode) {
  // Same tools as the Anthropic loop, reshaped for Chat Completions function calling.
  return toolsFor(mode).map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: t.input_schema },
  }));
}

async function openaiCall(messages, system, mode) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${OPENAI_KEY}` },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      max_completion_tokens: 4096,
      reasoning_effort: "high", // maximum effort: leave the model as much room to think as this demo can afford
      messages: [{ role: "system", content: system }, ...messages],
      tools: openaiTools(mode),
    }),
  });
  if (!res.ok) throw new Error(`OpenAI API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

async function runOpenAIAgent({ mode, question, respectRobots, bundleChoice }, emit) {
  const m = MODES[mode];
  const stats = { requests: 0, served: 0, blocked: 0 };
  const step = fetcher(mode, "openai", OPENAI_MODEL, emit, stats);
  emit({ type: "start", mode, label: m.label, why: m.why, token: m.token, brain: `live call to ${OPENAI_MODEL} (OpenAI)`, brand: "openai" });

  const system = systemPrompt({ mode, brand: "openai", respectRobots, question });
  const messages = [{ role: "user", content: question }];
  let blockedByRobots = false;

  for (let turn = 0; turn < 10; turn++) {
    const resp = await openaiCall(messages, system, mode);
    const msg = resp.choices?.[0]?.message;
    if (!msg) throw new Error("OpenAI returned no message");
    if (process.env.DEBUG_OPENAI) console.error("OPENAI RESP:", JSON.stringify(resp, null, 2).slice(0, 4000));
    messages.push({ role: "assistant", content: msg.content ?? null, tool_calls: msg.tool_calls });
    const calls = msg.tool_calls || [];
    if (calls.length === 0) {
      emit({ type: "answer", text: msg.content || "(no answer)", sources: [] });
      break;
    }
    // Narration alongside this turn's tool calls, when the model provides it.
    if (typeof msg.content === "string" && msg.content.trim()) emit({ type: "aside", text: msg.content });
    for (const call of calls) {
      let args = {};
      try { args = JSON.parse(call.function.arguments || "{}"); } catch { /* ignore */ }
      let result;
      if (call.function.name === "read_url") {
        const path = args.path;
        if (path === "/robots.txt") {
          const r = await step(path, "robots", "robots.txt");
          const robots = parseRobots(r.body);
          const verdict = verdictFor(robots, m.token, "/2026/");
          emit({ type: "decision", text: verdict.allowed ? `robots.txt allows ${m.token} (${verdict.rule})` : `robots.txt disallows ${m.token} (${verdict.rule})`, allowed: verdict.allowed });
          if (!verdict.allowed && respectRobots) blockedByRobots = true;
          result = `HTTP ${r.status}\n${r.body.slice(0, 2500)}`;
        } else {
          const kind = path === "/llms.txt" ? "llms" : path.startsWith("/sitemap") ? "sitemap" : /^\/\d{4}\//.test(path) ? "post" : "other";
          if (kind === "post" && blockedByRobots) {
            result = "Refused locally: robots.txt disallowed this bot and the operator's switch says to respect it. Do not request any more posts.";
          } else {
            const r = await step(path, kind, kind === "post" ? "post" : path.replace("/", ""));
            if (r.status === 402) {
              const price = monadQuote(mode, bundleChoice);
              emit({ type: "payment", price, network: "Monad" });
              result = `HTTP 402. Settle on Monad. The person clicks Approve to send ${price} from the buyer wallet to the seller. Do not say Base, and do not say Search has no wallet.`;
            } else {
              result = `HTTP ${r.status}\n${r.body.slice(0, 2500)}`;
            }
          }
        }
      } else if (call.function.name === "pay_for_training_bundle") {
        if (mode !== "train" || blockedByRobots) {
          result = "Refused: payment is only available in Train mode and only when robots.txt did not stop you.";
        } else {
          const tier = args.bundle === "full" ? "full" : "starter";
          const paid = payForBundle(tier);
          const bundle = await buildBundle(tier, question);
          emit({ type: "paid", tier: paid.tier.label, charged: paid.charged, hours: PRICES.train.hours });
          emit({ type: "bundle", bundle });
          const titles = bundle.posts.map((p) => `- ${p.title}`).join("\n");
          result = `Quote ready, no USDC sent yet: ${paid.tier.label}, $${paid.charged}, valid ${PRICES.train.hours}h. The person must click Approve, which sends that USDC on Monad testnet from the buyer wallet to the seller. Bundle prepared locally: ${bundle.postCount} posts from a snapshot, not fetched around the paywall. Titles:\n${titles}\n\nSay that payment still needs Approve. You may summarize titles in this list. Do not invent details beyond a title, and do not say the USDC has already moved.`;
        }
      } else if (call.function.name === "finish") {
        emit({ type: "answer", text: args.answer, sources: (args.sources || []).map((url) => ({ url, title: url })) });
        emit({ type: "done", mode, ...stats });
        return;
      } else {
        result = "Unknown tool.";
      }
      messages.push({ role: "tool", tool_call_id: call.id, content: String(result) });
    }
  }
  emit({ type: "done", mode, ...stats });
}

async function run(opts, emit) {
  if (!MODES[opts.mode]) throw new Error("Unknown mode");
  const brain = opts.brain === "openai" || opts.brain === "anthropic" ? opts.brain : "maplelabs";
  if (brain === "openai") {
    if (OPENAI_KEY) return runOpenAIAgent(opts, emit);
    emit({ type: "decision", text: "No OPENAI_API_KEY on this server, running MapleLabsBot's own script instead.", allowed: true });
  } else if (brain === "anthropic") {
    if (ANTHROPIC_KEY) return runAgent(opts, emit);
    emit({ type: "decision", text: "No ANTHROPIC_API_KEY on this server, running MapleLabsBot's own script instead.", allowed: true });
  }
  await runScripted(opts, emit);
}

// ---------- site policy and gate log (needs ADMIN_KEY) ----------
async function siteJson(path, init = {}) {
  const res = await fetch(SITE + path + (path.includes("?") ? "&" : "?") + "auth=" + encodeURIComponent(ADMIN_KEY), { ...init, headers: { "x-admin-key": ADMIN_KEY, "Content-Type": "application/json", ...(init.headers || {}) } });
  return res.json();
}
const readCache = new Map();
// Cached so a busy page never hammers the blog: one analytics request per minute, however many tabs are open.
async function siteRead(path, ttlMs = 60_000) {
  const hit = readCache.get(path);
  if (hit && Date.now() - hit.at < ttlMs) return hit.data;
  try {
    const res = await fetch(SITE + path + (path.includes("?") ? "&" : "?") + "auth=" + encodeURIComponent(ANALYTICS_KEY));
    const data = await res.json();
    readCache.set(path, { at: Date.now(), data });
    return data;
  } catch (err) {
    if (hit) return hit.data;
    throw err;
  }
}
const modeOf = (r) => (r.allowed ? "free" : r.charge ? "charge" : "block");

async function waitUntilLive(mode) {
  const probe = { headers: { "User-Agent": "Mozilla/5.0 (compatible; MapleLabsBot-Verify/1.0; +https://github.com/dhru7777/AgentGate)" } };
  const started = Date.now();
  while (Date.now() - started < 70_000) {
    try {
      const robots = parseRobots(await (await fetch(`${SITE}/robots.txt?cb=${Date.now()}`, probe)).text());
      const disallowed = !verdictFor(robots, "MapleLabsBot-Verify", "/2026/").allowed;
      if (mode === "block") { if (disallowed) return true; }
      else if (!disallowed) {
        const post = await fetch(`${SITE}/2026/06/22/Understanding-ERC-8004.html?cb=${Date.now()}`, probe);
        if ((mode === "charge" && post.status === 402) || (mode === "free" && post.status === 200)) return true;
      }
    } catch { /* keep trying */ }
    await sleep(4000);
  }
  return false;
}

function readBody(req) { return new Promise((resolve) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => resolve(b || "{}")); }); }

const settlements = [];
function rememberSettlement(entry) {
  settlements.unshift(entry);
  if (settlements.length > 20) settlements.length = 20;
}

async function handleApi(req, res, url) {
  const json = (code, body) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(body)); };
  if (url.pathname === "/api/config") {
    // Each brain can drive either mode. Availability only depends on whether its key is set.
    const brains = {
      openai: { available: Boolean(OPENAI_KEY), model: OPENAI_MODEL },
      anthropic: { available: Boolean(ANTHROPIC_KEY), model: ANTHROPIC_MODEL },
      maplelabs: { available: true, model: null },
    };
    return json(200, {
      site: SITE, modes: MODES, prices: PRICES, canControl: Boolean(ADMIN_KEY), canRead: Boolean(ANALYTICS_KEY), brains,
      wallets: { buyer: BUYER_ADDRESS || null, seller: SELLER_ADDRESS, chain: "Monad Testnet", explorer: MONAD_EXPLORER },
      canPay: Boolean(process.env.BUYER_WALLET_PRIVATE_KEY),
    });
  }
  if (url.pathname === "/api/post" && req.method === "GET") {
    const want = url.searchParams.get("path") || "";
    const paid = settlements.some((row) => row.path && (row.path === want || want.endsWith(row.path) || row.path.endsWith(want)));
    if (!paid) return json(402, { found: false, error: "Approve the Monad payment first." });
    await loadSnapshot();
    const post = findPost(want);
    if (!post) return json(404, { found: false });
    return json(200, { found: true, title: post.title, url: post.url, excerpts: post.excerpts });
  }
  if (url.pathname === "/api/prices" && req.method === "GET") {
    return json(200, { prices: PRICES, chain: "Monad Testnet" });
  }
  if (url.pathname === "/api/settlements" && req.method === "GET") {
    return json(200, { settlements });
  }
  if (url.pathname === "/api/wallets") {
    const [buyer, seller] = await Promise.all([walletBalances(BUYER_ADDRESS), walletBalances(SELLER_ADDRESS)]);
    return json(200, { buyer, seller });
  }
  if (url.pathname === "/api/transfers" && req.method === "GET") {
    const [buyer, seller] = await Promise.all([walletBalances(BUYER_ADDRESS), walletBalances(SELLER_ADDRESS)]);
    return json(200, {
      buyer: buyer ? buyer.txs : [],
      seller: seller ? seller.txs : [],
    });
  }
  if (url.pathname === "/api/pay" && req.method === "POST") {
    const body = JSON.parse(await readBody(req));
    const amount = fixedAmount(body.amount);
    if (!amount) return json(400, { ok: false, error: "Amount must be a fixed price: 0.01, 0.15, or 0.40 USDC." });
    try {
      const { transferUsdc } = await import("./wallet/transfer.mjs");
      const result = await transferUsdc({ to: SELLER_ADDRESS, amount });
      const path = typeof body.path === "string" ? body.path.slice(0, 300) : "";
      rememberSettlement({ at: new Date().toISOString(), amount: result.amount, path, txHash: result.txHash, explorer: result.explorer, from: result.from, to: result.to });
      const receipt = await rpcCall("eth_getTransactionReceipt", [result.txHash]);
      await loadHistory();
      await rememberTransfers([{
        hash: result.txHash,
        from: result.from,
        to: result.to,
        amount: result.amount,
        block: Number(BigInt(receipt?.blockNumber || "0x0")),
        explorer: result.explorer,
      }]);
      return json(200, { ok: true, path, ...result });
    } catch (err) {
      return json(err.status || 500, { ok: false, error: err.message || "Payment failed" });
    }
  }
  if (url.pathname === "/api/policy" && req.method === "GET") {
    if (!ANALYTICS_KEY) return json(200, { mode: "charge" });
    const data = await siteRead("/api/bot-rules");
    const rule = (data.rules || []).find((r) => r.id === RULE_ID);
    return json(200, { mode: rule ? modeOf(rule) : "charge" });
  }
  if (url.pathname === "/api/policy" && req.method === "POST") {
    if (!ADMIN_KEY) return json(403, { error: "ADMIN_KEY not set" });
    const body = JSON.parse(await readBody(req));
    const mode = body.mode;
    if (!["free", "charge", "block"].includes(mode)) return json(400, { error: "bad mode" });
    const data = await siteJson("/api/bot-rules", { method: "POST", body: JSON.stringify({ id: RULE_ID, allowed: mode === "free", charge: mode === "charge" }) });
    readCache.delete("/api/bot-rules");
    const rule = (data.rules || []).find((r) => r.id === RULE_ID);
    const applied = await waitUntilLive(mode);
    return json(200, { mode: rule ? modeOf(rule) : null, applied });
  }
  if (url.pathname === "/api/places" && req.method === "GET") {
    if (!ANALYTICS_KEY) return json(200, { places: [] });
    const data = await siteRead("/api/analytics?range=week");
    const places = (data.places || [])
      .filter((place) => Number.isFinite(place.lat) && Number.isFinite(place.lon))
      .map((place) => ({
        country: place.country || "",
        city: place.city || place.country || "",
        lat: place.lat,
        lon: place.lon,
        count: place.count || 0,
      }));
    return json(200, { places });
  }
  if (url.pathname === "/api/log") {
    if (!ANALYTICS_KEY) return json(200, { rows: [] });
    const data = await siteRead("/api/analytics?range=week");
    const rows = (data.recent || [])
      .filter((r) => (/maplelabsbot/i.test(r.ua || "") || r.agent === "MapleLabsBot") && !/verify/i.test(r.ua || ""))
      .slice(0, 40)
      .map((r) => ({ ...r, model: modelFromUa(r.ua) }));
    return json(200, { rows });
  }
  if (url.pathname === "/api/run" && req.method === "POST") {
    const body = JSON.parse(await readBody(req));
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive" });
    const emit = (ev) => res.write(`data: ${JSON.stringify(ev)}\n\n`);
    try {
      await run({ mode: body.mode, brain: body.brain, question: String(body.question || "").slice(0, 300), respectRobots: body.respectRobots !== false, bundleChoice: body.bundleChoice }, emit);
    } catch (err) {
      emit({ type: "error", text: err.message });
    }
    return res.end();
  }
  return json(404, { error: "not found" });
}

async function ensureChargePolicy() {
  if (!ADMIN_KEY) return;
  try {
    const data = await siteJson("/api/bot-rules");
    const rule = (data.rules || []).find((r) => r.id === RULE_ID);
    if (rule && modeOf(rule) === "charge") return;
    await siteJson("/api/bot-rules", { method: "POST", body: JSON.stringify({ id: RULE_ID, allowed: false, charge: true }) });
    console.log("MapleLabsBot policy set to charge");
  } catch (err) {
    console.error("ensureChargePolicy", err.message);
  }
}

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json" };

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  try {
    if (url.pathname.startsWith("/api/")) return await handleApi(req, res, url);
    const file = normalize(join(PUBLIC, url.pathname === "/" ? "index.html" : url.pathname));
    if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
    const data = await readFile(file);
    res.writeHead(200, { "Content-Type": TYPES[extname(file)] || "application/octet-stream" });
    res.end(data);
  } catch (err) {
    res.writeHead(err.code === "ENOENT" ? 404 : 500); res.end(err.code === "ENOENT" ? "Not found" : "Error");
  }
}).listen(PORT, () => {
  loadHistory().then(() => refreshHistory());
  ensureChargePolicy();
  console.log(
  `MapleLabsBot demo on http://localhost:${PORT} (crawls ${SITE}, policy switch ${ADMIN_KEY ? "on" : "off"}, ` +
  `ChatGPT brain ${OPENAI_KEY ? `live (${OPENAI_MODEL})` : "unavailable, no OPENAI_API_KEY"}, ` +
  `Claude brain ${ANTHROPIC_KEY ? `live (${ANTHROPIC_MODEL})` : "unavailable, no ANTHROPIC_API_KEY"}, ` +
  "MapleLabsBot's own script always available)"
  );
});
