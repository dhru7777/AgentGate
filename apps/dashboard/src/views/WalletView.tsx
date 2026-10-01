import { useState } from "react";
import { meraMessage } from "../modules/mera/passkey";
import type { AgentWallet, OwnerSession, Service } from "../types";

function addressFor(name: string, index: number): string {
  let hash = 2166136261;
  const text = `agentledger:${name}:${index}`;
  const parts: number[] = [];
  for (let round = 0; round < 5; round += 1) {
    for (let i = 0; i < text.length; i += 1) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
    hash ^= Math.imul(round + 1, 0x9e3779b9);
    parts.push(hash >>> 0);
  }
  return `0x${parts.map((part) => part.toString(16).padStart(8, "0")).join("")}`;
}

export function WalletView({
  services,
  owner,
  onCreateOwner,
  onSignOut,
  environmentId,
  onEnvironmentId,
  wallets,
  onCreateWallet,
}: {
  services: Service[];
  owner: OwnerSession | null;
  onCreateOwner: () => Promise<void>;
  onSignOut: () => void;
  environmentId: string;
  onEnvironmentId: (value: string) => void;
  wallets: AgentWallet[];
  onCreateWallet: (wallet: AgentWallet) => void;
}) {
  const invoiceName = `${services[0]?.name ?? "Service"} invoice agent`;
  const receiving = wallets.filter((wallet) => wallet.spendCapUsdc === 0);
  const [creating, setCreating] = useState(false);
  const [agentName, setAgentName] = useState(invoiceName);
  const [notice, setNotice] = useState("");
  const [noticeError, setNoticeError] = useState(false);

  async function createOwner() {
    setCreating(true);
    setNotice("");
    setNoticeError(false);
    try {
      await onCreateOwner();
    } catch (error) {
      setNotice(meraMessage(error));
      setNoticeError(true);
    } finally {
      setCreating(false);
    }
  }

  function createWallet() {
    const name = agentName.trim();
    if (!name) {
      setNotice("Name the invoice agent that receives USDC.");
      setNoticeError(true);
      return;
    }
    onCreateWallet({
      id: `aw-${Date.now()}`,
      name,
      address: addressFor(name, wallets.length + 1),
      environmentId: environmentId.trim() || "local",
      spendCapUsdc: 0,
      delegated: false,
      createdAt: new Date().toISOString(),
    });
    setNoticeError(false);
    setNotice("This address receives USDC when company bots pay an invoice.");
  }

  return (
    <div className="ledger-page">
      <header className="obs-top">
        <div>
          <h1>Wallet</h1>
          <p className="obs-meta">The invoice agent’s wallet. Paid invoices settle here in USDC.</p>
        </div>
      </header>

      <ol className="wallet-steps">
        <li className={receiving.length ? "is-done" : "is-current"}>Receiving wallet</li>
        <li className={owner ? "is-done" : receiving.length ? "is-current" : ""}>Owner passkey</li>
      </ol>

      <section className="ledger-card">
        <h2>Receiving wallet</h2>
        <p className="obs-lead">
          This wallet is for your invoice agent{services[0] ? ` on ${services[0].name}` : ""}. Company bots pay this address. The agent does not spend from it.
        </p>
        {receiving.length === 0 ? (
          <div className="ledger-form">
            <label>
              Invoice agent
              <input value={agentName} onChange={(event) => setAgentName(event.target.value)} />
            </label>
            <button type="button" className="obs-lock-submit" onClick={createWallet}>Create receiving wallet</button>
            <details>
              <summary>Dynamic environment, if you have one</summary>
              <label>
                Environment id
                <input
                  value={environmentId}
                  onChange={(event) => onEnvironmentId(event.target.value)}
                  placeholder="from app.dynamic.xyz"
                />
              </label>
            </details>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Invoice agent</th>
                  <th>Receives USDC at</th>
                </tr>
              </thead>
              <tbody>
                {receiving.map((wallet) => (
                  <tr key={wallet.id}>
                    <td>{wallet.name}</td>
                    <td className="mono receive-address">{wallet.address}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {notice && <p className={noticeError ? "obs-lock-error" : "obs-toast"}>{notice}</p>}
      </section>

      <section className="ledger-card">
        <h2>Owner account</h2>
        <p className="obs-lead">
          Your passkey owns the service. It is separate from the address that receives USDC.
        </p>
        {owner ? (
          <>
            <div className="obs-kpis">
              <div className="obs-kpi"><span>Owner</span><strong className="mono">{owner.ownerAddress}</strong></div>
            </div>
            <button type="button" className="obs-btn-sm" onClick={onSignOut}>Sign out</button>
          </>
        ) : (
          <button type="button" className="obs-lock-submit" onClick={createOwner} disabled={creating}>
            {creating ? "Waiting for passkey…" : "Create account"}
          </button>
        )}
      </section>

    </div>
  );
}
