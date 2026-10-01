import { useState } from "react";

type Tab = "services" | "wallet" | "identity" | "invoices";

const TABS: { id: Tab; label: string }[] = [
  { id: "services", label: "Services" },
  { id: "wallet", label: "Wallet" },
  { id: "identity", label: "Identity" },
  { id: "invoices", label: "Invoices" },
];

const COPY: Record<Tab, string> = {
  services: "Sites and the analytics for each one.",
  wallet: "The owner account and a wallet for each agent.",
  identity: "ERC-8004 identity on Monad.",
  invoices: "USDC paid for access.",
};

export function App() {
  const [tab, setTab] = useState<Tab>("services");

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
      <main className="ledger-page">
        <h1>{TABS.find((item) => item.id === tab)?.label}</h1>
        <p className="obs-meta">{COPY[tab]}</p>
      </main>
    </>
  );
}
