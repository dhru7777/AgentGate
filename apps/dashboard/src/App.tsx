import { useEffect, useState } from "react";
import { defaultRules } from "./data";
import { unlockOwnerAccount } from "./modules/mera/verifyService";
import { blogIsVerified, fetchBlogAnalytics, fetchBlogRules, markBlogVerified, updateBlogRules } from "./modules/services/blogAnalytics";
import { loadServices, nextServiceId, parseOrigin, saveUserServices } from "./modules/services/catalog";
import type { AgentView, AgentWallet, OwnerSession, Range, Rule, Service, ServiceView, Summary, Tab } from "./types";
import { ServiceBoard } from "./screens/ServiceBoard";
import { IdentityView } from "./views/IdentityView";
import { InvoicesView } from "./views/InvoicesView";
import { ServicesView } from "./views/ServicesView";
import { WalletView } from "./views/WalletView";

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

function initialRules(services: Service[]): Record<string, Rule[]> {
  const stored = readJson<Record<string, Rule[]> | null>("agentledger.rules", null);
  const base = Object.fromEntries(services.map((service) => [service.id, stored?.[service.id] ?? defaultRules(service.id)]));
  return base;
}

export function App() {
  const [tab, setTab] = useState<Tab>("services");
  const [services, setServices] = useState<Service[]>(() => loadServices());
  const [blogVerified, setBlogVerified] = useState(blogIsVerified);
  const [liveSummary, setLiveSummary] = useState<Summary | null>(null);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveError, setLiveError] = useState("");
  const [serviceId, setServiceId] = useState("blog");
  const [deckOpen, setDeckOpen] = useState(false);
  const [view, setView] = useState<ServiceView>("graphs");
  const [agentView, setAgentView] = useState<AgentView>("all");
  const [range, setRange] = useState<Range>("week");
  const [rulesByService, setRulesByService] = useState<Record<string, Rule[]>>(() => initialRules(loadServices()));
  const [owner, setOwner] = useState<OwnerSession | null>(() => readJson<OwnerSession | null>("agentledger.owner", null));
  const [environmentId, setEnvironmentId] = useState(() => readJson<string>("agentledger.environment", ""));
  const [wallets, setWallets] = useState<AgentWallet[]>(() => readJson<AgentWallet[]>("agentledger.wallets", []));

  useEffect(() => {
    localStorage.setItem("agentledger.rules", JSON.stringify(rulesByService));
  }, [rulesByService]);

  useEffect(() => {
    if (owner) localStorage.setItem("agentledger.owner", JSON.stringify(owner));
    else localStorage.removeItem("agentledger.owner");
  }, [owner]);

  useEffect(() => {
    localStorage.setItem("agentledger.environment", JSON.stringify(environmentId));
  }, [environmentId]);

  useEffect(() => {
    localStorage.setItem("agentledger.wallets", JSON.stringify(wallets));
  }, [wallets]);

  useEffect(() => {
    if (!blogVerified) return;
    let cancel = false;
    setLiveLoading(true);
    setLiveError("");
    fetchBlogAnalytics(range)
      .then((summary) => {
        if (!cancel) setLiveSummary(summary);
      })
      .catch((err: unknown) => {
        if (!cancel) setLiveError(err instanceof Error ? err.message : "Could not open the live dashboard.");
      })
      .finally(() => {
        if (!cancel) setLiveLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, [blogVerified, range]);

  useEffect(() => {
    if (!blogVerified) return;
    let cancel = false;
    fetchBlogRules()
      .then((rules) => {
        if (!cancel) setRulesByService((current) => ({ ...current, blog: rules }));
      })
      .catch(() => {
        /* permissions stay on the last saved copy */
      });
    return () => {
      cancel = true;
    };
  }, [blogVerified]);

  function addService(name: string, origin: string): string | null {
    const parsed = parseOrigin(origin);
    if (!name.trim() || !parsed) return "Enter a name and a site URL.";
    const id = nextServiceId(services, name.trim());
    const next = [
      ...services,
      {
        id,
        name: name.trim(),
        origin: parsed,
        payoutAddress: "0x0000000000000000000000000000000000000000",
        ownershipAddress: "0x0000000000000000000000000000000000000000",
        verified: true,
      },
    ];
    setServices(next);
    saveUserServices(next);
    setServiceId(id);
    return null;
  }

  function removeService(id: string) {
    if (id === "blog") return;
    const next = services.filter((service) => service.id !== id);
    setServices(next);
    saveUserServices(next);
    if (serviceId === id) {
      setServiceId(next[0]?.id ?? "");
      setDeckOpen(false);
    }
  }

  function verifyBlog() {
    setLiveError("");
    markBlogVerified();
    setBlogVerified(true);
  }

  const listed = services.map((service) => (service.id === "blog" ? { ...service, verified: blogVerified } : service));

  async function toggleRule(id: string, allowed: boolean) {
    setRulesByService((current) => ({
      ...current,
      [serviceId]: (current[serviceId] ?? []).map((rule) => (rule.id === id ? { ...rule, allowed } : rule)),
    }));
    if (serviceId !== "blog" || !blogVerified) return;
    try {
      const rules = await updateBlogRules({ id, allowed });
      setRulesByService((current) => ({ ...current, blog: rules }));
    } catch (err) {
      setRulesByService((current) => ({
        ...current,
        blog: (current.blog ?? []).map((rule) => (rule.id === id ? { ...rule, allowed: !allowed } : rule)),
      }));
      setLiveError(err instanceof Error ? err.message : "Could not save that permission.");
    }
  }

  async function ruleAction(action: "allow_all" | "block_all_ai" | "reset") {
    if (serviceId === "blog" && blogVerified) {
      try {
        const rules = await updateBlogRules({ action: action === "reset" ? "reset_defaults" : action });
        setRulesByService((current) => ({ ...current, blog: rules }));
      } catch (err) {
        setLiveError(err instanceof Error ? err.message : "Could not update permissions.");
      }
      return;
    }
    setRulesByService((current) => {
      const rules = current[serviceId] ?? defaultRules(serviceId);
      if (action === "reset") return { ...current, [serviceId]: defaultRules(serviceId) };
      if (action === "allow_all") {
        return { ...current, [serviceId]: rules.map((rule) => ({ ...rule, allowed: true })) };
      }
      return {
        ...current,
        [serviceId]: rules.map((rule) => ({
          ...rule,
          allowed: rule.category === "Search Engine" || rule.id === "feed_protection",
        })),
      };
    });
  }

  return (
    <>
      <header className="ledger-header">
        <h1>Agent Gate</h1>
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
      {tab === "services" && !deckOpen && (
        <ServiceBoard
          services={listed}
          onOpenDeck={(id) => { setServiceId(id); setView("graphs"); setDeckOpen(true); }}
          onAdd={addService}
          onRemove={removeService}
        />
      )}
      {tab === "services" && deckOpen && (
        <ServicesView
          services={listed}
          serviceId={serviceId}
          onBack={() => setDeckOpen(false)}
          view={view}
          onView={setView}
          agentView={agentView}
          onAgentView={setAgentView}
          range={range}
          onRange={setRange}
          rules={rulesByService[serviceId] ?? defaultRules(serviceId)}
          onToggle={toggleRule}
          onAction={ruleAction}
          liveSummary={liveSummary}
          liveLoading={liveLoading}
          liveError={liveError}
          onVerify={verifyBlog}
        />
      )}
      {tab === "wallet" && (
        <WalletView
          services={services}
          owner={owner}
          onCreateOwner={async () => {
            const next = await unlockOwnerAccount();
            setOwner({ credentialId: next.credentialId, ownerAddress: next.ownerAddress });
          }}
          onSignOut={() => setOwner(null)}
          environmentId={environmentId}
          onEnvironmentId={setEnvironmentId}
          wallets={wallets}
          onCreateWallet={(wallet) => setWallets((current) => [wallet, ...current])}
        />
      )}
      {tab === "identity" && <IdentityView services={services} />}
      {tab === "invoices" && <InvoicesView />}
    </>
  );
}
