// Guided tour for the Crawl Sandbox. A dimmed screen, a highlighted area and a tip card with Next and Skip.
// The tour asks the bot a question for you. It never clicks Approve: that sends USDC, so the person does it.
(() => {
  const $ = (s) => document.querySelector(s);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let active = false;
  let token = 0;
  let resolveNext = null;
  let currentTarget = null;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "tour-launch";
  btn.id = "tutorialBtn";
  btn.textContent = "Tutorial";
  // Sits in the header beside the boards menu, so it never covers the chat or the suggestions.
  const brand = document.querySelector(".top .brand");
  if (brand) brand.appendChild(btn); else document.body.appendChild(btn);

  const root = document.createElement("div");
  root.className = "tour-root";
  root.hidden = true;
  root.innerHTML = `
    <div class="tour-spot" id="tourSpot" aria-hidden="true"></div>
    <div class="tour-tip" id="tourTip" role="dialog" aria-live="polite" aria-labelledby="tourTitle">
      <div class="tour-step" id="tourStep"></div>
      <div class="tour-title" id="tourTitle"></div>
      <div class="tour-body" id="tourBody"></div>
      <div class="tour-actions">
        <button type="button" class="tour-skip" id="tourSkip">Skip</button>
        <button type="button" class="tour-next" id="tourNext">Next</button>
      </div>
    </div>`;
  document.body.appendChild(root);

  const spot = root.querySelector("#tourSpot");
  const tip = root.querySelector("#tourTip");

  function place(target) {
    currentTarget = target || null;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const tipW = Math.min(340, vw - 24);
    tip.style.width = `${tipW}px`;
    if (!target) {
      spot.style.opacity = "0";
      tip.style.left = `${Math.max(12, (vw - tipW) / 2)}px`;
      tip.style.top = `${Math.max(24, vh * 0.25)}px`;
      return;
    }
    const r = target.getBoundingClientRect();
    const pad = 6;
    spot.style.opacity = "1";
    spot.style.top = `${Math.max(4, r.top - pad)}px`;
    spot.style.left = `${Math.max(4, r.left - pad)}px`;
    spot.style.width = `${Math.min(vw - 8, r.width + pad * 2)}px`;
    spot.style.height = `${Math.min(vh - 8, r.height + pad * 2)}px`;
    const tipH = tip.offsetHeight || 190;
    let left = Math.min(vw - tipW - 12, Math.max(12, r.left));
    let top = r.bottom + 16;
    if (top + tipH > vh - 12) top = r.top - tipH - 16;
    if (top < 12) {
      // The target is tall: float the card over its lower-right corner instead.
      top = Math.min(vh - tipH - 12, Math.max(12, r.bottom - tipH - 16));
      left = Math.min(vw - tipW - 12, Math.max(12, r.right - tipW - 16));
    }
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
  }

  function waitNext() {
    return new Promise((resolve) => { resolveNext = () => { resolveNext = null; resolve(); }; });
  }

  // Resolves with the element once it exists and is visible, or null after the timeout.
  async function waitFor(selector, ms = 30000) {
    const end = Date.now() + ms;
    while (active && Date.now() < end) {
      const el = $(selector);
      if (el && !el.hidden && el.getClientRects().length) return el;
      await sleep(250);
    }
    return null;
  }

  async function step({ n, total, title, body, target, next = "Next", action, onShow, live }) {
    if (!active) return;
    root.querySelector("#tourStep").textContent = `${n} / ${total}`;
    root.querySelector("#tourTitle").textContent = title;
    root.querySelector("#tourBody").textContent = body;
    root.querySelector("#tourNext").textContent = next;
    if (target && target.scrollIntoView) target.scrollIntoView({ block: "nearest", behavior: "smooth" });
    await sleep(target ? 250 : 0);
    if (typeof onShow === "function") await onShow();
    place(target);
    // A live step rewrites its text while the bot works, so the person sees the crawl as it happens.
    let ticker = null;
    if (typeof live === "function") {
      const bodyEl = root.querySelector("#tourBody");
      bodyEl.classList.add("tour-live");
      const paint = () => { bodyEl.textContent = live(); place(currentTarget); };
      paint();
      ticker = setInterval(paint, 500);
    }
    await waitNext();
    if (ticker) { clearInterval(ticker); root.querySelector("#tourBody").classList.remove("tour-live"); }
    if (active && typeof action === "function") await action();
  }

  // The gate log's newest rows, as plain lines: path, answer and whether the bot obeyed robots.txt.
  function crawlLines() {
    const rows = [...document.querySelectorAll("#log tbody tr")].slice(0, 5);
    if (!rows.length) return "Waiting for the first request...";
    return rows.map((tr) => {
      const c = [...tr.children].map((td) => td.textContent.trim());
      const [, , purpose, path, status, robots] = c;
      return `${status || "..."}  ${path || ""}  (${purpose || "read"}${robots ? ", robots.txt: " + robots : ""})`;
    }).join("\n");
  }

  function end() {
    active = false;
    root.hidden = true;
    spot.style.opacity = "0";
    btn.disabled = false;
    if (resolveNext) resolveNext();
  }

  async function run() {
    if (active) return;
    active = true;
    const mine = ++token;
    btn.disabled = true;
    root.hidden = false;
    const total = 7;
    const alive = () => active && mine === token;
    try {
      await step({
        n: 1, total, next: "Start",
        title: "Make AI agents pay",
        body: "AI agents read websites all day, usually for free. AgentGate lets the owner charge them instead. This takes about a minute.",
      });
      if (!alive()) return;

      await step({
        n: 2, total,
        title: "The bot",
        body: "MapleLabsBot is a test crawler standing in for any AI agent. You ask it a question and it reads the blog to answer.",
        target: $(".pane.chat"),
      });
      if (!alive()) return;

      const send = $("#send");
      await step({
        n: 3, total, next: "Ask it",
        title: "Ask a question",
        body: "We will ask \"What is x402?\". The bot reads robots.txt first, then the sitemap, then picks a post to open.",
        target: $(".composer") || $("#form"),
        action: () => {
          const q = $("#q");
          if (q && send) { q.value = "What is x402?"; $("#form").requestSubmit(); }
        },
      });
      if (!alive()) return;

      await step({
        n: 4, total,
        title: "Watch it crawl",
        body: "",
        target: $("#log")?.closest(".card") || $(".pane.site-top"),
        // Behind the globe is the Details view: every request the gate saw, and whether the bot obeyed robots.txt.
        onShow: async () => { $("#gateDetails")?.click(); await sleep(400); },
        live: () => "The gate's live log, newest first: the answer, the path, and whether the bot obeyed robots.txt.\n\n" + crawlLines(),
      });
      if (!alive()) return;

      const gate = await waitFor("#siteGate", 40000);
      if (!alive()) return;
      await step({
        n: 5, total,
        title: gate ? "HTTP 402: payment required" : "Waiting for the 402",
        body: gate
          ? "The post answered 402 with a price. It stays closed until it is paid. People are never charged, only agents."
          : "The bot has not reached a post yet. Give it a moment.",
        target: gate || $(".pane.site-bottom"),
      });
      if (!alive()) return;

      const card = await waitFor(".approve-card", 15000);
      if (!alive()) return;
      await step({
        n: 6, total, next: "Done with this step",
        title: "You decide whether to pay",
        body: card
          ? "Approve sends 0.01 testnet USDC on Monad, and the post opens. The tour never clicks it for you: your call."
          : "An Approve card appears here once the bot finds a priced post. Nothing moves until you click it.",
        target: card || $(".pane.chat"),
      });
      if (!alive()) return;

      await step({
        n: 7, total, next: "Finish",
        title: "The owner sets the rule",
        body: "Free, Charge or Block, per agent. Every request and payment also shows in the owner dashboard.",
        target: $("#policy"),
        onShow: async () => { $("#gateBack")?.click(); await sleep(400); },
      });
    } finally {
      if (mine === token) end();
    }
  }

  btn.addEventListener("click", run);
  // The judges' walkthrough on the dashboard opens this page with ?tour=judges.
  if (new URLSearchParams(location.search).get("tour")) setTimeout(run, 1500);
  root.querySelector("#tourNext").addEventListener("click", () => resolveNext && resolveNext());
  root.querySelector("#tourSkip").addEventListener("click", end);
  document.addEventListener("keydown", (e) => { if (active && e.key === "Escape") end(); });
  window.addEventListener("resize", () => { if (active) place(currentTarget); });
})();
