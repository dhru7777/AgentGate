import { useEffect, useState } from "react";
import { defaultRules, SERVICES } from "./data";
import type { AgentView, Range, Rule, ServiceView, Tab } from "./types";
import { ServicesView } from "./views/ServicesView";

const TABS: { id: Tab; label: string }[] = [
  { id: "services", label: "Services" },
  { id: "wallet", label: "Wallet" },
  { id: "identity", label: "Identity" },
  { id: "invoices", label: "Invoices" },
];

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function App() {
  const [tab, setTab] = useState<Tab>("services");
  const [serviceId, setServiceId] = useState("blog");
  const [view, setView] = useState<ServiceView>("graphs");
  const [agentView, setAgentView] = useState<AgentView>("all");
  const [range, setRange] = useState<Range>("week");
  const [rules, setRules] = useState<Rule[]>(() => readJson<Rule[] | null>("agentledger.rules", null) ?? defaultRules("blog"));

  useEffect(() => {
    localStorage.setItem("agentledger.rules", JSON.stringify(rules));
  }, [rules]);

  function toggleRule(id: string, allowed: boolean) {
    setRules((current) => current.map((rule) => (rule.id === id ? { ...rule, allowed } : rule)));
  }

  function ruleAction(action: "allow_all" | "block_all_ai" | "reset") {
    if (action === "reset") {
      setRules(defaultRules(serviceId));
      return;
    }
    if (action === "allow_all") {
      setRules((current) => current.map((rule) => ({ ...rule, allowed: true })));
      return;
    }
    setRules((current) => current.map((rule) => ({
      ...rule,
      allowed: rule.category === "Search Engine" || rule.id === "feed_protection",
    })));
  }

  return (
    <>
      <header className="ledger-header">
        <h1>AgentLedger</h1>
        <nav aria-label="Sections">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={tab === item.id ? "is-active" : ""}
              aria-current={tab === item.id ? "page" : undefined}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </header>
      {tab === "services" && (
        <ServicesView
          services={SERVICES}
          serviceId={serviceId}
          onService={setServiceId}
          view={view}
          onView={setView}
          agentView={agentView}
          onAgentView={setAgentView}
          range={range}
          onRange={setRange}
          rules={rules}
          onToggle={toggleRule}
          onAction={ruleAction}
        />
      )}
      {tab !== "services" && (
        <main className="ledger-page">
          <h1>{TABS.find((item) => item.id === tab)?.label}</h1>
          <p className="obs-meta">Coming next.</p>
        </main>
      )}
    </>
  );
}
