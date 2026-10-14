import { useCallback, useEffect, useRef, useState } from "react";
import type { Route } from "../routes";

/** The live Crawl Sandbox. Override with VITE_BOT_URL to point the walkthrough at a local copy. */
const BOT_URL = (import.meta.env.VITE_BOT_URL as string | undefined) ?? "https://bot.agentgate.santboblabs.com/";

type Step = {
  title: string;
  body: string;
  route?: Partial<Route>;
  /** First selector that is on screen wins. No target centers the card. */
  target?: string[];
  next?: string;
  onNext?: () => void;
  link?: { label: string; href: string };
};

const STEPS: Step[] = [
  {
    title: "Services",
    body: "Each site you protect is a card here. Ours is a real blog that AI crawlers read every day.",
    route: { tab: "services" },
    target: [".service-card"],
    next: "Start",
  },
  {
    title: "Observability deck",
    body: "This is the owner's view of one site: who is reading it, what they paid, and who ignored the gate.",
    route: { tab: "services" },
    target: [".service-card-actions .is-primary"],
    next: "Open it",
  },
  {
    title: "Traffic at a glance",
    body: "AI vs human requests, HTTP 402s, and which agents stopped at the gate, ignored it, or paid. Switch Day, Week or 30 days at the top right.",
    route: { tab: "observability", view: "graphs", agentView: "all" },
    target: [".obs-kpis"],
  },
  {
    title: "Graphs and globe",
    body: "Every light on the globe is a real request, placed where the blog saw it come from. Drag it to spin, and see the places table below.",
    route: { tab: "observability", view: "graphs", agentView: "all" },
    target: [".obs-map"],
  },
  {
    title: "Agents",
    body: "Every agent that touched the site. Good agents stop at the 402, bad ones ignore it, and paid ones settle in USDC on Monad.",
    route: { tab: "observability", view: "agents", agentView: "all" },
    target: [".obs-main"],
  },
  {
    title: "Events",
    body: "The raw trail behind the numbers: each request, when it came, and how the gate answered it.",
    route: { tab: "observability", view: "events", agentView: "all" },
    target: [".obs-main"],
  },
  {
    title: "Wallet",
    body: "Agent payments land at the site's receiving address on Monad. A Mera passkey opens the full wallet: no password, no seed phrase, nothing stored.",
    route: { tab: "wallet" },
    target: [".ledger-page .obs-kpis", ".ledger-page"],
  },
  {
    title: "Crawl Sandbox",
    body: "See an agent run into the gate. The sandbox opens here with its own short tour, then brings you back for the last steps.",
    route: { tab: "services" },
    target: [".service-card-actions a[href*='bot']", ".service-card-actions"],
    next: "Open sandbox",
    // Same tab: the sandbox tour ends by sending the person back to the Identity step.
    onNext: () => { window.location.href = `${BOT_URL.replace(/\/$/, "")}/search?tour=judges&return=${encodeURIComponent(window.location.origin)}`; },
  },
  {
    title: "Agent identity",
    body: "Each agent is verified in the public ERC-8004 registry on Monad, a shared onchain list no single company controls. 8004scan shows its profile and feedback, so the owner can price a known agent differently.",
    link: { label: "See agent #1810 on 8004scan", href: "https://testnet.8004scan.io/agents/monad-testnet/1810" },
    route: { tab: "identity" },
    target: [".ledger-page"],
  },
  {
    title: "That is the loop",
    body: "An agent asks, the gate answers 402 with a price, the agent pays USDC on Monad, and the page opens. The owner sees all of it here.",
    // The tour ends on the Observability graphs, so Finish leaves the judge on the deck.
    route: { tab: "observability", view: "graphs", agentView: "all" },
    next: "Finish",
  },
];

type Box = { top: number; left: number; width: number; height: number };

function findTarget(selectors?: string[]): HTMLElement | null {
  for (const selector of selectors ?? []) {
    const el = document.querySelector<HTMLElement>(selector);
    if (el && el.getClientRects().length) return el;
  }
  return null;
}

const HIDE_KEY = "agentgate.walkthroughHidden";

function readHidden(): boolean {
  try {
    // /anything?walkthrough=1 brings the button back after it was minimized.
    if (new URLSearchParams(window.location.search).get("walkthrough")) localStorage.removeItem(HIDE_KEY);
    return localStorage.getItem(HIDE_KEY) === "1";
  } catch {
    return false;
  }
}

export function WalkthroughButton({ onClick, running }: { onClick: () => void; running: boolean }) {
  const [hidden, setHidden] = useState(readHidden);
  if (hidden && !running) return null;
  function minimize() {
    try { localStorage.setItem(HIDE_KEY, "1"); } catch { /* the button just stays hidden for this visit */ }
    setHidden(true);
  }
  return (
    <div className="walkthrough-dock">
      <button type="button" className="walkthrough-btn" onClick={onClick} disabled={running}>
        Walkthrough for Judges
      </button>
      <button type="button" className="walkthrough-min" onClick={minimize} disabled={running} aria-label="Hide the walkthrough button" title="Hide this button">
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 2l6 6M8 2 2 8" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
      </button>
    </div>
  );
}

export function Walkthrough({ index, go, onIndex }: { index: number | null; go: (next: Partial<Route>) => void; onIndex: (next: number | null) => void }) {
  const [box, setBox] = useState<Box | null>(null);
  const [tipPos, setTipPos] = useState<{ top: number; left: number } | null>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const targetRef = useRef<HTMLElement | null>(null);
  const step = index === null ? null : STEPS[index];

  // Move to the page this step lives on, then look for its target until it shows up.
  useEffect(() => {
    if (index === null) return;
    const current = STEPS[index];
    if (current.route) go(current.route);
    targetRef.current = null;
    setBox(null);
    let scrolled = false;
    const started = Date.now();
    const timer = window.setInterval(() => {
      const el = findTarget(current.target);
      targetRef.current = el;
      if (el && !scrolled) {
        scrolled = true;
        const r = el.getBoundingClientRect();
        if (r.top < 80 || r.bottom > window.innerHeight - 40) el.scrollIntoView({ block: r.height > window.innerHeight * 0.7 ? "start" : "center", behavior: "smooth" });
      }
      if (!el && Date.now() - started > 9000 && current.target) targetRef.current = null;
      measure();
    }, 250);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  const measure = useCallback(() => {
    const el = targetRef.current;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (!el) {
      setBox(null);
      return;
    }
    const r = el.getBoundingClientRect();
    const pad = 6;
    const top = Math.max(4, r.top - pad);
    const left = Math.max(4, r.left - pad);
    const bottom = Math.min(vh - 4, r.bottom + pad);
    const right = Math.min(vw - 4, r.right + pad);
    setBox((old) => {
      const next = { top, left, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
      return old && old.top === next.top && old.left === next.left && old.width === next.width && old.height === next.height ? old : next;
    });
  }, []);

  useEffect(() => {
    if (index === null) return;
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onIndex(null);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [index, measure, onIndex]);

  // Place the card next to the highlight, or in the middle when the step has no target.
  useEffect(() => {
    const tip = tipRef.current;
    if (!tip || index === null) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = Math.min(360, vw - 24);
    const h = tip.offsetHeight;
    if (!box) {
      setTipPos({ left: Math.max(12, (vw - w) / 2), top: Math.max(24, (vh - h) / 3) });
      return;
    }
    let left = Math.min(vw - w - 12, Math.max(12, box.left));
    let top = box.top + box.height + 14;
    if (top + h > vh - 12) top = box.top - h - 14;
    if (top < 12) {
      // The highlight fills the screen: float the card over its lower right corner.
      top = Math.max(12, box.top + box.height - h - 16);
      left = Math.max(12, box.left + box.width - w - 16);
    }
    setTipPos({ left, top });
  }, [box, index]);

  if (index === null || !step) return null;
  const last = index === STEPS.length - 1;

  function advance() {
    step?.onNext?.();
    if (last) onIndex(null);
    else onIndex(index! + 1);
  }

  return (
    <div className="tour-root" role="presentation">
      {box && <div className="tour-spot" style={{ top: box.top, left: box.left, width: box.width, height: box.height }} />}
      {!box && <div className="tour-dim" />}
      <div
        className="tour-tip"
        ref={tipRef}
        role="dialog"
        aria-live="polite"
        aria-labelledby="tour-title"
        style={{ width: Math.min(360, window.innerWidth - 24), left: tipPos?.left ?? 12, top: tipPos?.top ?? 24, visibility: tipPos ? "visible" : "hidden" }}
      >
        <div className="tour-step">Step {index + 1} of {STEPS.length}</div>
        <div className="tour-title" id="tour-title">{step.title}</div>
        <p className="tour-body">{step.body}</p>
        {step.link && <a className="tour-link" href={step.link.href} target="_blank" rel="noreferrer">{step.link.label}</a>}
        <div className="tour-actions">
          <button type="button" className="tour-skip" onClick={() => onIndex(null)}>Skip</button>
          <span className="tour-spacer" />
          {index > 0 && <button type="button" className="tour-back" onClick={() => onIndex(index - 1)}>Back</button>}
          <button type="button" className="tour-next" onClick={advance} autoFocus>{step.next ?? "Next"}</button>
        </div>
      </div>
    </div>
  );
}
