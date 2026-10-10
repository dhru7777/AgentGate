// MapleLabsBot demo server. No dependencies.
// It only ever crawls SITE (default: the owner's own blog), so it cannot be pointed at other sites.
import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const PORT = Number(process.env.PORT || 5180);
const SITE = (process.env.SITE || "https://dheeraj-work.netlify.app").replace(/\/$/, "");
const ADMIN_KEY = process.env.ADMIN_KEY || ""; // only needed for the policy switch and the gate log
const RULE_ID = "maplelabs";
const PUBLIC = join(fileURLToPath(new URL(".", import.meta.url)), "public");
const POLITE_DELAY_MS = 450;

const MODES = {
  search: { label: "Search", token: "MapleLabsBot-Search", pages: 3, readLlms: false, why: "Build a search index" },
  train: { label: "Train", token: "MapleLabsBot-Train", pages: 5, readLlms: true, why: "Collect text to train a model" },
  user: { label: "User search", token: "MapleLabsBot-User", pages: 1, readLlms: false, why: "Answer one question for a person" },
};
const ua = (mode) => `Mozilla/5.0 (compatible; ${MODES[mode].token}/1.0; +https://github.com/dhru7777/AgentGate)`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- robots.txt (RFC 9309 style) ----------
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
  if (!best) return { allowed: true, group: "none" };
  let winner = null;
  for (const rule of best.rules) {
    if (!rule.path) continue;
    if (path.startsWith(rule.path) && (!winner || rule.path.length > winner.path.length || (rule.path.length === winner.path.length && rule.type === "allow"))) winner = rule;
  }
  const groupName = best.agents.join(", ");
  return { allowed: !winner || winner.type === "allow", group: groupName, rule: winner ? `${winner.type === "allow" ? "Allow" : "Disallow"}: ${winner.path}` : "no matching rule" };
}

// ---------- page text ----------
const decode = (s) => s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&rsquo;|&lsquo;/g, "'").replace(/&mdash;|&ndash;/g, "-");
function readPage(html) {
  const title = decode((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "").trim());
  const body = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<nav[\s\S]*?<\/nav>|<header[\s\S]*?<\/header>|<footer[\s\S]*?<\/footer>/gi, " ");
  const paras = [...body.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map((m) => decode(m[1].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim()).filter((p) => p.length > 60);
  return { title, paras };
}

const STOP = new Set("what when where which that this with from have about does your would could should there their they them then than into over under between how why who the and for are you can tell explain say says said please".split(" "));
const words = (s) => s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w));
const score = (text, q) => { const set = new Set(words(text)); return words(q).filter((w) => set.has(w)).length; };
const slugOf = (url) => decodeURIComponent(new URL(url).pathname).replace(/\.html$/, "").split("/").pop().replace(/-/g, " ");

// ---------- the run ----------
async function run({ mode, question, respectRobots }, emit) {
  const m = MODES[mode];
  if (!m) throw new Error("Unknown mode");
  let n = 0;
  const stats = { requests: 0, served: 0, blocked: 0 };
  const fetchStep = async (path, label, extra = {}) => {
    const url = path.startsWith("http") ? path : SITE + path;
    if (new URL(url).origin !== SITE) throw new Error("MapleLabsBot only crawls " + SITE);
    const t0 = Date.now();
    const res = await fetch(url, { headers: { "User-Agent": ua(mode), Accept: "text/html,text/plain,application/json;q=0.9,*/*;q=0.5" }, redirect: "follow" });
    const body = await res.text();
    stats.requests += 1;
    if (res.status === 200) stats.served += 1;
    if (res.status === 402) stats.blocked += 1;
    n += 1;
    const step = { type: "step", n, label, path: new URL(url).pathname, status: res.status, ms: Date.now() - t0, bytes: body.length, kind: extra.kind || label };
    emit(step);
    await sleep(POLITE_DELAY_MS);
    return { res, body, step };
  };

  emit({ type: "start", mode, label: m.label, why: m.why, token: m.token });

  // 1. robots.txt
  const robotsRes = await fetchStep("/robots.txt", "robots.txt", { kind: "robots" });
  const robots = parseRobots(robotsRes.body);
  const verdict = verdictFor(robots, m.token, "/2026/");
  emit({ type: "decision", text: verdict.allowed ? `robots.txt allows ${m.token} (${verdict.rule})` : `robots.txt disallows ${m.token} (${verdict.rule})`, allowed: verdict.allowed });
  if (!verdict.allowed && respectRobots) {
    emit({ type: "answer", text: `I read robots.txt and it tells ${m.token} to stay out, so I stopped. I did not request any posts.`, sources: [], stopped: "robots" });
    emit({ type: "done", mode, ...stats });
    return;
  }
  if (!verdict.allowed) emit({ type: "decision", text: "Ignoring robots.txt (demo switch is off). The site should log this as a violation.", allowed: false, violation: true });

  // 2. llms.txt (Train always; others only after a 402)
  let llms = "";
  const readLlms = async () => {
    const r = await fetchStep("/llms.txt", "llms.txt", { kind: "llms" });
    llms = r.body;
    const price = llms.match(/Amount:\s*([^\n]+)/)?.[1]?.trim();
    emit({ type: "decision", text: price ? `llms.txt says posts cost ${price} for agents` : "llms.txt read", allowed: true });
  };
  if (m.readLlms) await readLlms();

  // 3. sitemap
  const sitemapUrl = robots.sitemaps[0] || SITE + "/sitemap.xml";
  const site = await fetchStep(new URL(sitemapUrl).pathname, "sitemap.xml", { kind: "sitemap" });
  const urls = [...site.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((x) => x[1].trim()).filter((u) => /\/\d{4}\/\d{2}\/\d{2}\//.test(u));
  emit({ type: "decision", text: `${urls.length} posts in the sitemap`, allowed: true });

  // 4. choose pages
  let ranked = urls.map((u) => ({ u, s: score(slugOf(u), question) }));
  ranked = mode === "train" ? ranked : ranked.sort((a, b) => b.s - a.s);
  const picks = ranked.slice(0, m.pages).map((x) => x.u);

  // 5. fetch pages
  const got = [];
  let terms = null;
  for (const u of picks) {
    const r = await fetchStep(new URL(u).pathname, "post", { kind: "post" });
    if (r.res.status === 200) {
      const page = readPage(r.body);
      got.push({ url: u, ...page });
    } else if (r.res.status === 402) {
      try { terms = JSON.parse(r.body); } catch { terms = { message: "Payment required" }; }
      emit({ type: "payment", price: terms.pay?.amount, network: terms.pay?.network, payTo: terms.pay?.payTo, terms: terms.terms });
      if (!m.readLlms && !llms) await readLlms();
      break; // a paywalled bot with no wallet stops here instead of hammering the site
    }
  }

  // 6. answer
  let text;
  let sources = [];
  if (got.length) {
    const sentences = got.flatMap((g) => g.paras.flatMap((p) => p.split(/(?<=[.!?])\s+/)).map((s) => ({ s, t: g.title, u: g.url })));
    const best = sentences.map((x) => ({ ...x, sc: score(x.s, question) })).sort((a, b) => b.sc - a.sc).slice(0, 3);
    text = best.map((b) => b.s).join(" ");
    sources = [...new Set(best.map((b) => b.u))].map((u) => ({ url: u, title: got.find((g) => g.url === u)?.title || u }));
    if (mode === "train") text = `Collected ${got.length} post${got.length > 1 ? "s" : ""} for training. Sample: ${text}`;
  } else if (terms) {
    const price = terms.pay?.amount ? `${terms.pay.amount} on ${terms.pay.network}` : "a payment";
    text = `I could not read that post. The site answered HTTP 402: it wants ${price}. I have no wallet, so I did not pay and I stopped after one blocked request.`;
  } else {
    text = "I could not read any posts for that question.";
  }
  emit({ type: "answer", text, sources, paywalled: Boolean(terms) });
  emit({ type: "done", mode, ...stats });
}

// ---------- site policy and gate log (needs ADMIN_KEY) ----------
async function siteJson(path, init = {}) {
  const res = await fetch(SITE + path + (path.includes("?") ? "&" : "?") + "auth=" + encodeURIComponent(ADMIN_KEY), { ...init, headers: { "x-admin-key": ADMIN_KEY, "Content-Type": "application/json", ...(init.headers || {}) } });
  return res.json();
}
const modeOf = (r) => (r.allowed ? "free" : r.charge ? "charge" : "block");


// The gate caches rules for about 15 seconds on every server, so a saved change is not live straight away.
// Probe the site as the bot until it behaves the new way.
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

async function handleApi(req, res, url) {
  const json = (code, body) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(body)); };
  if (url.pathname === "/api/config") return json(200, { site: SITE, modes: MODES, canControl: Boolean(ADMIN_KEY) });
  if (url.pathname === "/api/policy" && req.method === "GET") {
    if (!ADMIN_KEY) return json(200, { mode: null });
    const data = await siteJson("/api/bot-rules");
    const rule = (data.rules || []).find((r) => r.id === RULE_ID);
    return json(200, { mode: rule ? modeOf(rule) : null });
  }
  if (url.pathname === "/api/policy" && req.method === "POST") {
    if (!ADMIN_KEY) return json(403, { error: "ADMIN_KEY not set" });
    const body = JSON.parse(await readBody(req));
    const mode = body.mode;
    if (!["free", "charge", "block"].includes(mode)) return json(400, { error: "bad mode" });
    const data = await siteJson("/api/bot-rules", { method: "POST", body: JSON.stringify({ id: RULE_ID, allowed: mode === "free", charge: mode === "charge" }) });
    const rule = (data.rules || []).find((r) => r.id === RULE_ID);
    const applied = await waitUntilLive(mode);
    return json(200, { mode: rule ? modeOf(rule) : null, applied });
  }
  if (url.pathname === "/api/log") {
    if (!ADMIN_KEY) return json(200, { rows: [] });
    const data = await siteJson("/api/analytics?range=week");
    const rows = (data.recent || []).filter((r) => (/maplelabsbot/i.test(r.ua || "") || r.agent === "MapleLabsBot") && !/verify/i.test(r.ua || "")).slice(0, 40);
    return json(200, { rows });
  }
  if (url.pathname === "/api/run" && req.method === "POST") {
    const body = JSON.parse(await readBody(req));
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive" });
    const emit = (ev) => res.write(`data: ${JSON.stringify(ev)}\n\n`);
    try { await run({ mode: body.mode, question: String(body.question || "").slice(0, 300), respectRobots: body.respectRobots !== false }, emit); }
    catch (err) { emit({ type: "error", text: err.message }); }
    return res.end();
  }
  return json(404, { error: "not found" });
}

function readBody(req) { return new Promise((resolve) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => resolve(b || "{}")); }); }
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" };

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
}).listen(PORT, () => console.log(`MapleLabsBot demo on http://localhost:${PORT} (crawls ${SITE}${ADMIN_KEY ? ", policy switch on" : ", policy switch off"})`));
