// MapleLabsBot demo API, ported from server.mjs to run as a Netlify Edge Function (Deno).
// Same logic as the local Node server: two modes (Search, Train), three brains
// (MapleLabsBot's own script, ChatGPT, Claude), and a snapshot-based training bundle.
// Approve sends Monad testnet USDC from the buyer key to the seller. See server.mjs.
//
// @ts-nocheck (Deno-only globals: Deno.env, EdgeFunction config. Not type-checked by tsc.)

import type { Config } from "https://edge.netlify.com";
import SNAPSHOT from "../../data/snapshot.js";
import { createPublicClient, createWalletClient, http, parseUnits, formatUnits, defineChain } from "https://esm.sh/viem@2.57.4";
import { privateKeyToAccount } from "https://esm.sh/viem@2.57.4/accounts";

const SITE = (Deno.env.get("SITE") || "https://dheeraj-work.netlify.app").replace(/\/$/, "");
const ADMIN_KEY = Deno.env.get("ADMIN_KEY") || "";
const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY") || "";
const ANTHROPIC_MODEL = Deno.env.get("ANTHROPIC_MODEL") || "claude-sonnet-5-5";
const OPENAI_KEY = Deno.env.get("OPENAI_API_KEY") || "";
const OPENAI_MODEL = Deno.env.get("OPENAI_MODEL") || "gpt-5";
// Protects only the policy-change endpoint (Free/Charge/Block), not the chat itself, so
// anyone can try the bot, but only someone with this phrase can rewrite the live paywall rule.
const DEMO_POLICY_KEY = Deno.env.get("DEMO_POLICY_KEY") || "";
const RULE_ID = "maplelabs";
const POLITE_DELAY_MS = 350;

// Monad testnet, same chain and USDC contract apps/dashboard already uses (chain/monad.ts).
// Balances are read here. Approve signs with BUYER_WALLET_PRIVATE_KEY and never returns it.
const MONAD_RPC = Deno.env.get("MONAD_RPC_URL") || "https://testnet-rpc.monad.xyz";
const MONAD_EXPLORER = "https://testnet.monadvision.com";
const MONAD_USDC = "0x534b2f3A21130d7a60830c2Df862319e593943A3";
const BUYER_KEY = Deno.env.get("BUYER_WALLET_PRIVATE_KEY") || "";
const BUYER_ADDRESS = Deno.env.get("BUYER_WALLET_ADDRESS") || "";
const SELLER_ADDRESS = Deno.env.get("SELLER_WALLET_ADDRESS") || "0xC90AC2b557088c50264de70969D71419311636c1";

async function rpcCall(method: string, params: unknown[]) {
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

function fixedAmount(amount: string) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return null;
  const fixed = n.toFixed(2);
  return FIXED_AMOUNTS.has(fixed) ? fixed : null;
}

async function recentUsdc(address: string) {
  try {
    const latest = BigInt(await rpcCall("eth_blockNumber", []));
    const pad = "0x" + address.slice(2).toLowerCase().padStart(64, "0");
    const logs: { transactionHash: string; topics: string[]; data: string; blockNumber: string }[] = [];
    // This RPC rejects eth_getLogs ranges wider than 100 blocks.
    for (let i = 0; i < 12 && logs.length < 3; i++) {
      const end = latest - BigInt(i * 100);
      if (end < 0n) break;
      const start = end > 99n ? end - 99n : 0n;
      const range = { fromBlock: "0x" + start.toString(16), toBlock: "0x" + end.toString(16) };
      const [outgoing, incoming] = await Promise.all([
        rpcCall("eth_getLogs", [{ address: MONAD_USDC, ...range, topics: [TRANSFER_TOPIC, pad] }]),
        rpcCall("eth_getLogs", [{ address: MONAD_USDC, ...range, topics: [TRANSFER_TOPIC, null, pad] }]),
      ]);
      logs.push(...(outgoing || []), ...(incoming || []));
    }
    const seen = new Set<string>();
    return logs
      .map((log) => ({
        hash: log.transactionHash,
        direction: String(log.topics[1]).toLowerCase() === pad ? "out" : "in",
        amount: (Number(BigInt(log.data)) / 1e6).toFixed(2),
        block: Number(BigInt(log.blockNumber)),
        explorer: `${MONAD_EXPLORER}/tx/${log.transactionHash}`,
      }))
      .sort((a, b) => b.block - a.block)
      .filter((row) => (seen.has(row.hash) ? false : seen.add(row.hash)))
      .slice(0, 3);
  } catch {
    return [];
  }
}

async function walletBalances(address: string) {
  if (!address) return null;
  const [monWei, usdcRaw, txs] = await Promise.all([
    rpcCall("eth_getBalance", [address, "latest"]),
    rpcCall("eth_call", [{ to: MONAD_USDC, data: "0x70a08231" + address.slice(2).toLowerCase().padStart(64, "0") }, "latest"]),
    recentUsdc(address),
  ]);
  return {
    address,
    mon: (Number(BigInt(monWei)) / 1e18).toFixed(4),
    usdc: (Number(BigInt(usdcRaw || "0x0")) / 1e6).toFixed(2),
    explorer: `${MONAD_EXPLORER}/address/${address}`,
    txs,
  };
}

const PRICES = {
  search: { perPage: 0.01, unit: "USDC", label: "Pay per use", note: "one page" },
  train: {
    starter: { usd: 0.15, label: "Starter bundle", postCap: 10 },
    full: { usd: 0.4, label: "Full archive bundle", postCap: 999 },
    hours: 48,
  },
};

function monadQuote(mode: string, bundleChoice?: string) {
  const usd = mode === "train"
    ? PRICES.train[bundleChoice === "full" ? "full" : "starter"].usd
    : PRICES.search.perPage;
  return `$${Number(usd).toFixed(2)} USDC`;
}

const MODES = {
  search: { label: "Search", token: "MapleLabsBot-Search", why: "Look something up, for a search index or to answer one question" },
  train: { label: "Train", token: "MapleLabsBot-Train", why: "Collect a bundle of posts to train on" },
};

function ua(mode: string, brand: string, model: string | null) {
  const tag = brand === "openai" ? `brain=openai:${model}` : brand === "anthropic" ? `brain=anthropic:${model}` : "brain=script";
  return `Mozilla/5.0 (compatible; ${MODES[mode].token}/1.0; ${tag}) +https://github.com/dhru7777/AgentGate`;
}

function modelFromUa(uaString: string) {
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function parseRobots(text: string) {
  const groups: { agents: string[]; rules: { type: string; path: string }[] }[] = [];
  const sitemaps: string[] = [];
  let current: (typeof groups)[number] | null = null;
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

function verdictFor(robots: ReturnType<typeof parseRobots>, token: string, path: string) {
  const me = token.toLowerCase();
  let best: (typeof robots.groups)[number] | null = null;
  let bestLen = -1;
  for (const group of robots.groups) {
    for (const agent of group.agents) {
      const match = agent === "*" ? 0 : me.startsWith(agent) ? agent.length : -1;
      if (match > bestLen) { best = group; bestLen = match; }
    }
  }
  if (!best) return { allowed: true, rule: "no matching group" };
  let winner: { type: string; path: string } | null = null;
  for (const rule of best.rules) {
    if (!rule.path) continue;
    if (path.startsWith(rule.path) && (!winner || rule.path.length > winner.path.length || (rule.path.length === winner.path.length && rule.type === "allow"))) winner = rule;
  }
  return { allowed: !winner || winner.type === "allow", rule: winner ? `${winner.type === "allow" ? "Allow" : "Disallow"}: ${winner.path}` : "no matching rule" };
}

function slugOf(url: string) {
  return decodeURIComponent(new URL(url, SITE).pathname).replace(/\.html$/, "").split("/").pop()!.replace(/-/g, " ");
}
const STOP = new Set("what when where which that this with from have about does your would could should there their they them then than into over under between how why who the and for are you can tell explain say says said please".split(" "));
const words = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w));
const score = (text: string, q: string) => { const set = new Set(words(text)); return words(q).filter((w) => set.has(w)).length; };

function fetcher(mode: string, brand: string, model: string | null, emit: (ev: unknown) => void, stats: { requests: number; served: number; blocked: number }) {
  let n = 0;
  return async (path: string, kind: string, label?: string) => {
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

function payForBundle(bundle: string) {
  const tier = PRICES.train[bundle] || PRICES.train.starter;
  return { ok: true, tier, charged: tier.usd, expiresAt: Date.now() + PRICES.train.hours * 3600 * 1000 };
}

function buildBundle(bundle: string, question: string) {
  const tier = PRICES.train[bundle] || PRICES.train.starter;
  let posts = SNAPSHOT.posts;
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

// ---------- scripted fallback (MapleLabsBot's own script, no model) ----------
async function runScripted({ mode, question, respectRobots, bundleChoice }: RunOpts, emit: (ev: unknown) => void) {
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
      const bundle = buildBundle(tier, question);
      emit({ type: "bundle", bundle });
      emit({ type: "answer", text: `The post returned HTTP 402. Click Approve to send $${paid.charged} USDC on Monad testnet from the buyer wallet to the seller. The ${paid.tier.label} (${bundle.postCount} posts) is a local snapshot, ready once you approve.`, sources: [] });
      emit({ type: "done", mode, ...stats });
      return;
    }
  }

  const ranked = urls.map((u) => ({ u, s: score(slugOf(u), question) })).sort((a, b) => b.s - a.s);
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
function toolsFor(mode: string) {
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

function systemPrompt({ mode, brand, respectRobots, question }: { mode: string; brand: string; respectRobots: boolean; question: string }) {
  const m = MODES[mode];
  const priceLine = mode === "train"
    ? `Train pricing, paid in testnet USDC on Monad only after the person clicks Approve: ${PRICES.train.starter.label} $${PRICES.train.starter.usd} (up to ${PRICES.train.starter.postCap} posts), ${PRICES.train.full.label} $${PRICES.train.full.usd} (the whole archive), both valid ${PRICES.train.hours} hours.`
    : `Search pricing: $${PRICES.search.perPage} ${PRICES.search.unit} per page. On HTTP 402, tell the person to click Approve. That sends the USDC on Monad.`;
  return `You are MapleLabsBot, running in ${m.label} mode (${m.why}). Your User-Agent token is ${m.token}. ${BRAND_LINE[brand] || ""} You are a test crawler built to demonstrate AgentGate's paywall to someone evaluating it, so behave the way a real, well-behaved crawler would: check robots.txt before you fetch anything else, decide what to do next yourself based on what you actually find, and do not follow a fixed script.

The operator's respect-robots.txt switch is currently ${respectRobots ? "ON, meaning if robots.txt disallows you for post URLs, you must stop and not request any post." : "OFF, meaning you may ignore a Disallow for this test run, but say plainly that you are doing so."}

${priceLine}

The person asked: "${question}"

Work the way a careful crawler should: read /robots.txt first. Then use your judgment, read /llms.txt if it seems useful, read /sitemap.xml to find posts, and read whichever post(s) best fit the question (in Train mode, read more broadly, in Search mode, usually one or two is enough). Settlement is always testnet USDC on Monad, from the buyer wallet to the seller, and only after the person clicks Approve. The live blog's 402 body may name another network. Ignore that. Never say the payment is on Base, and never say Search has no wallet.

If a post answers with HTTP 402 and robots.txt did not stop you: in Train mode, use pay_for_training_bundle; in Search mode, stop fetching and tell the person to click Approve for the per-page Monad price. Before each tool call, say one short sentence in plain first-person language about what you're about to check and why, as ordinary message text alongside the call, the way you would narrate a thought out loud in a real conversation, not a log line. When you have what you need, or you are stopped, call finish with a short, honest answer, including saying so plainly if you were blocked or paid.`;
}

type RunOpts = { mode: string; brain?: string; question: string; respectRobots: boolean; bundleChoice?: string };

async function anthropicCall(messages: unknown[], system: string, mode: string) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: ANTHROPIC_MODEL, max_tokens: 6000, thinking: { type: "adaptive" }, output_config: { effort: "high" }, system, tools: toolsFor(mode), messages }),
  });
  if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

async function runAgent({ mode, question, respectRobots, bundleChoice }: RunOpts, emit: (ev: unknown) => void) {
  const m = MODES[mode];
  const stats = { requests: 0, served: 0, blocked: 0 };
  const step = fetcher(mode, "anthropic", ANTHROPIC_MODEL, emit, stats);
  emit({ type: "start", mode, label: m.label, why: m.why, token: m.token, brain: `live call to ${ANTHROPIC_MODEL} (Anthropic)`, brand: "anthropic" });

  const system = systemPrompt({ mode, brand: "anthropic", respectRobots, question });
  const messages: unknown[] = [{ role: "user", content: question }];
  let blockedByRobots = false;

  for (let turn = 0; turn < 10; turn++) {
    const resp = await anthropicCall(messages, system, mode);
    messages.push({ role: "assistant", content: resp.content });
    for (const block of resp.content) {
      if (block.type === "thinking" && block.thinking) emit({ type: "thinking", text: block.thinking });
    }
    const toolUses = resp.content.filter((b: { type: string }) => b.type === "tool_use");
    if (toolUses.length === 0) {
      const text = resp.content.find((b: { type: string }) => b.type === "text")?.text || "(no answer)";
      emit({ type: "answer", text, sources: [] });
      break;
    }
    for (const block of resp.content) {
      if (block.type === "text" && block.text) emit({ type: "aside", text: block.text });
    }
    const results = [];
    for (const call of toolUses) {
      let result: string;
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
          const paid = payForBundle(tier);
          const bundle = buildBundle(tier, question);
          emit({ type: "paid", tier: paid.tier.label, charged: paid.charged, hours: PRICES.train.hours });
          emit({ type: "bundle", bundle });
          const titles = bundle.posts.map((p) => `- ${p.title}`).join("\n");
          result = `Quote ready, no USDC sent yet: ${paid.tier.label}, $${paid.charged}, valid ${PRICES.train.hours}h. The person must click Approve, which sends that USDC on Monad testnet from the buyer wallet to the seller. Bundle prepared locally: ${bundle.postCount} posts from a snapshot, not fetched around the paywall. Titles:\n${titles}\n\nSay that payment still needs Approve. You may summarize titles in this list. Do not invent details beyond a title, and do not say the USDC has already moved.`;
        }
      } else if (call.name === "finish") {
        emit({ type: "answer", text: call.input.answer, sources: (call.input.sources || []).map((url: string) => ({ url, title: url })) });
        emit({ type: "done", mode, ...stats });
        return;
      } else {
        result = "Unknown tool.";
      }
      results.push({ type: "tool_result", tool_use_id: call.id, content: String(result) });
    }
    messages.push({ role: "user", content: results });
  }
  emit({ type: "done", mode, ...stats });
}

function openaiTools(mode: string) {
  return toolsFor(mode).map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.input_schema } }));
}

async function openaiCall(messages: unknown[], system: string, mode: string) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${OPENAI_KEY}` },
    body: JSON.stringify({ model: OPENAI_MODEL, max_completion_tokens: 4096, reasoning_effort: "high", messages: [{ role: "system", content: system }, ...messages], tools: openaiTools(mode) }),
  });
  if (!res.ok) throw new Error(`OpenAI API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

async function runOpenAIAgent({ mode, question, respectRobots, bundleChoice }: RunOpts, emit: (ev: unknown) => void) {
  const m = MODES[mode];
  const stats = { requests: 0, served: 0, blocked: 0 };
  const step = fetcher(mode, "openai", OPENAI_MODEL, emit, stats);
  emit({ type: "start", mode, label: m.label, why: m.why, token: m.token, brain: `live call to ${OPENAI_MODEL} (OpenAI)`, brand: "openai" });

  const system = systemPrompt({ mode, brand: "openai", respectRobots, question });
  const messages: unknown[] = [{ role: "user", content: question }];
  let blockedByRobots = false;

  for (let turn = 0; turn < 10; turn++) {
    const resp = await openaiCall(messages, system, mode);
    const msg = resp.choices?.[0]?.message;
    if (!msg) throw new Error("OpenAI returned no message");
    messages.push({ role: "assistant", content: msg.content ?? null, tool_calls: msg.tool_calls });
    const calls = msg.tool_calls || [];
    if (calls.length === 0) {
      emit({ type: "answer", text: msg.content || "(no answer)", sources: [] });
      break;
    }
    if (typeof msg.content === "string" && msg.content.trim()) emit({ type: "aside", text: msg.content });
    for (const call of calls) {
      let args: Record<string, unknown> = {};
      try { args = JSON.parse(call.function.arguments || "{}"); } catch { /* ignore */ }
      let result: string;
      if (call.function.name === "read_url") {
        const path = args.path as string;
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
          const bundle = buildBundle(tier, question);
          emit({ type: "paid", tier: paid.tier.label, charged: paid.charged, hours: PRICES.train.hours });
          emit({ type: "bundle", bundle });
          const titles = bundle.posts.map((p) => `- ${p.title}`).join("\n");
          result = `Quote ready, no USDC sent yet: ${paid.tier.label}, $${paid.charged}, valid ${PRICES.train.hours}h. The person must click Approve, which sends that USDC on Monad testnet from the buyer wallet to the seller. Bundle prepared locally: ${bundle.postCount} posts from a snapshot, not fetched around the paywall. Titles:\n${titles}\n\nSay that payment still needs Approve. You may summarize titles in this list. Do not invent details beyond a title, and do not say the USDC has already moved.`;
        }
      } else if (call.function.name === "finish") {
        emit({ type: "answer", text: args.answer, sources: ((args.sources as string[]) || []).map((url) => ({ url, title: url })) });
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

async function run(opts: RunOpts, emit: (ev: unknown) => void) {
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
async function siteJson(path: string, init: RequestInit = {}) {
  const res = await fetch(SITE + path + (path.includes("?") ? "&" : "?") + "auth=" + encodeURIComponent(ADMIN_KEY), { ...init, headers: { "x-admin-key": ADMIN_KEY, "Content-Type": "application/json", ...(init.headers || {}) } });
  return res.json();
}
const modeOf = (r: { allowed: boolean; charge?: boolean }) => (r.allowed ? "free" : r.charge ? "charge" : "block");

async function waitUntilLive(mode: string) {
  const probe = { headers: { "User-Agent": "Mozilla/5.0 (compatible; MapleLabsBot-Verify/1.0; +https://github.com/dhru7777/AgentGate)" } };
  const started = Date.now();
  while (Date.now() - started < 25_000) {
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

// Same rules as wallet/transfer.mjs: seller only, at most 1 USDC, key never leaves the server.
async function transferUsdc(amount: string) {
  if (!BUYER_KEY) {
    const err = new Error("BUYER_WALLET_PRIVATE_KEY is not set on the server. Nothing was sent.");
    (err as Error & { status?: number }).status = 503;
    throw err;
  }
  const account = privateKeyToAccount(BUYER_KEY.startsWith("0x") ? BUYER_KEY : `0x${BUYER_KEY}`);
  if (BUYER_ADDRESS && account.address.toLowerCase() !== BUYER_ADDRESS.toLowerCase()) {
    const err = new Error("BUYER_WALLET_PRIVATE_KEY does not match BUYER_WALLET_ADDRESS. Nothing was sent.");
    (err as Error & { status?: number }).status = 503;
    throw err;
  }
  if (!/^0x[a-fA-F0-9]{40}$/.test(SELLER_ADDRESS)) {
    const err = new Error("Seller address is missing or not a valid address.");
    (err as Error & { status?: number }).status = 400;
    throw err;
  }
  let value: bigint;
  try { value = parseUnits(amount, 6); } catch {
    const err = new Error("Amount must be a number of USDC, for example 0.01.");
    (err as Error & { status?: number }).status = 400;
    throw err;
  }
  const max = parseUnits("1", 6);
  if (value <= 0n || value > max) {
    const err = new Error("Amount must be greater than 0 and at most 1 USDC.");
    (err as Error & { status?: number }).status = 400;
    throw err;
  }
  const chain = defineChain({
    id: 10143,
    name: "Monad Testnet",
    nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
    rpcUrls: { default: { http: [MONAD_RPC] } },
    blockExplorers: { default: { name: "MonadVision", url: MONAD_EXPLORER } },
    testnet: true,
  });
  const abi = [
    { name: "transfer", type: "function", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] },
    { name: "balanceOf", type: "function", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }] },
  ];
  const publicClient = createPublicClient({ chain, transport: http(MONAD_RPC) });
  const [fromBalance, mon] = await Promise.all([
    publicClient.readContract({ address: MONAD_USDC, abi, functionName: "balanceOf", args: [account.address] }),
    publicClient.getBalance({ address: account.address }),
  ]);
  if (fromBalance < value) {
    const err = new Error(`Buyer wallet only has ${formatUnits(fromBalance, 6)} USDC.`);
    (err as Error & { status?: number }).status = 400;
    throw err;
  }
  if (mon === 0n) {
    const err = new Error("Buyer wallet has 0 MON, so it cannot pay gas.");
    (err as Error & { status?: number }).status = 400;
    throw err;
  }
  const walletClient = createWalletClient({ account, chain, transport: http(MONAD_RPC) });
  const gas = await publicClient.estimateContractGas({
    address: MONAD_USDC, abi, functionName: "transfer", args: [SELLER_ADDRESS, value], account,
  });
  const hash = await walletClient.writeContract({
    address: MONAD_USDC, abi, functionName: "transfer", args: [SELLER_ADDRESS, value], gas: (gas * 120n) / 100n,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    const err = new Error("The transaction was mined and reverted. No USDC moved.");
    (err as Error & { status?: number }).status = 502;
    throw err;
  }
  return { from: account.address, to: SELLER_ADDRESS, amount: formatUnits(value, 6), txHash: hash, explorer: `${MONAD_EXPLORER}/tx/${hash}` };
}

const settlements: { at: string; amount: string; path: string; txHash: string; explorer: string; from: string; to: string }[] = [];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

let chargeEnsured = false;
async function ensureChargePolicy() {
  if (chargeEnsured || !ADMIN_KEY) return;
  chargeEnsured = true;
  try {
    const data = await siteJson("/api/bot-rules");
    const rule = (data.rules || []).find((r: { id?: string }) => r.id === RULE_ID);
    if (rule && modeOf(rule) === "charge") return;
    await siteJson("/api/bot-rules", { method: "POST", body: JSON.stringify({ id: RULE_ID, allowed: false, charge: true }) });
  } catch { /* the demo still runs if the live switch cannot be set */ }
}

export default async (req: Request) => {
  const url = new URL(req.url);
  const pathname = url.pathname;
  if (pathname === "/api/config" || pathname === "/api/run") ensureChargePolicy();

  if (pathname === "/api/config") {
    const brains = {
      openai: { available: Boolean(OPENAI_KEY), model: OPENAI_MODEL },
      anthropic: { available: Boolean(ANTHROPIC_KEY), model: ANTHROPIC_MODEL },
      maplelabs: { available: true, model: null },
    };
    return json({
      site: SITE, modes: MODES, prices: PRICES, canControl: Boolean(ADMIN_KEY), requiresPolicyKey: Boolean(DEMO_POLICY_KEY), brains,
      wallets: { buyer: BUYER_ADDRESS || null, seller: SELLER_ADDRESS, chain: "Monad Testnet", explorer: MONAD_EXPLORER },
      canPay: Boolean(BUYER_KEY),
    });
  }

  if (pathname === "/api/post" && req.method === "GET") {
    const want = url.searchParams.get("path") || "";
    const paid = settlements.some((row) => row.path && (row.path === want || want.endsWith(row.path) || row.path.endsWith(want)));
    if (!paid) return json({ found: false, error: "Approve the Monad payment first." }, 402);
    const post = (SNAPSHOT.posts || []).find((item: { url: string }) => item.url === want || want.endsWith(item.url));
    if (!post) return json({ found: false }, 404);
    return json({ found: true, title: post.title, url: post.url, excerpts: post.excerpts });
  }

  if (pathname === "/api/prices" && req.method === "GET") {
    return json({ prices: PRICES, chain: "Monad Testnet" });
  }
  if (pathname === "/api/settlements" && req.method === "GET") {
    return json({ settlements });
  }
  if (pathname === "/api/wallets") {
    const [buyer, seller] = await Promise.all([walletBalances(BUYER_ADDRESS), walletBalances(SELLER_ADDRESS)]);
    return json({ buyer, seller });
  }

  if (pathname === "/api/pay" && req.method === "POST") {
    try {
      const body = await req.json();
      const amount = fixedAmount(String(body.amount ?? ""));
      if (!amount) return json({ ok: false, error: "Amount must be a fixed price: 0.01, 0.15, or 0.40 USDC." }, 400);
      const result = await transferUsdc(amount);
      const path = typeof body.path === "string" ? body.path.slice(0, 300) : "";
      settlements.unshift({ at: new Date().toISOString(), amount: result.amount, path, txHash: result.txHash, explorer: result.explorer, from: result.from, to: result.to });
      if (settlements.length > 20) settlements.length = 20;
      return json({ ok: true, path, ...result });
    } catch (err) {
      const status = (err && err.status) || 500;
      return json({ ok: false, error: err instanceof Error ? err.message : "Payment failed" }, status);
    }
  }

  if (pathname === "/api/policy" && req.method === "GET") {
    if (!ADMIN_KEY) return json({ mode: null });
    const data = await siteJson("/api/bot-rules");
    const rule = (data.rules || []).find((r) => r.id === RULE_ID);
    return json({ mode: rule ? modeOf(rule) : null });
  }

  if (pathname === "/api/policy" && req.method === "POST") {
    if (!ADMIN_KEY) return json({ error: "ADMIN_KEY not set" }, 403);
    if (DEMO_POLICY_KEY && req.headers.get("x-demo-key") !== DEMO_POLICY_KEY) return json({ error: "Wrong or missing demo key for changing the live policy." }, 401);
    const body = await req.json();
    const mode = body.mode;
    if (!["free", "charge", "block"].includes(mode)) return json({ error: "bad mode" }, 400);
    const data = await siteJson("/api/bot-rules", { method: "POST", body: JSON.stringify({ id: RULE_ID, allowed: mode === "free", charge: mode === "charge" }) });
    const rule = (data.rules || []).find((r) => r.id === RULE_ID);
    const applied = await waitUntilLive(mode);
    return json({ mode: rule ? modeOf(rule) : null, applied });
  }

  if (pathname === "/api/places" && req.method === "GET") {
    if (!ADMIN_KEY) return json({ places: [] });
    const data = await siteJson("/api/analytics?range=week");
    const places = (data.places || [])
      .filter((place: { lat?: number; lon?: number }) => Number.isFinite(place.lat) && Number.isFinite(place.lon))
      .map((place: { country?: string; city?: string; lat: number; lon: number; count?: number }) => ({
        country: place.country || "",
        city: place.city || place.country || "",
        lat: place.lat,
        lon: place.lon,
        count: place.count || 0,
      }));
    return json({ places });
  }

  if (pathname === "/api/log") {
    if (!ADMIN_KEY) return json({ rows: [] });
    const data = await siteJson("/api/analytics?range=week");
    const rows = (data.recent || [])
      .filter((r) => (/maplelabsbot/i.test(r.ua || "") || r.agent === "MapleLabsBot") && !/verify/i.test(r.ua || ""))
      .slice(0, 40)
      .map((r) => ({ ...r, model: modelFromUa(r.ua) }));
    return json({ rows });
  }

  if (pathname === "/api/run" && req.method === "POST") {
    const body = await req.json();
    const stream = new ReadableStream({
      async start(controller) {
        const enc = new TextEncoder();
        const emit = (ev: unknown) => controller.enqueue(enc.encode(`data: ${JSON.stringify(ev)}\n\n`));
        try {
          await run({ mode: body.mode, brain: body.brain, question: String(body.question || "").slice(0, 300), respectRobots: body.respectRobots !== false, bundleChoice: body.bundleChoice }, emit);
        } catch (err) {
          emit({ type: "error", text: err instanceof Error ? err.message : String(err) });
        }
        controller.close();
      },
    });
    return new Response(stream, { headers: { "content-type": "text/event-stream", "cache-control": "no-store" } });
  }

  return json({ error: "not found" }, 404);
};

export const config: Config = { path: "/api/*" };
