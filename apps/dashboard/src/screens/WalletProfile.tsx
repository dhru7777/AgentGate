import { useEffect, useState } from "react";
import { explorerAddressUrl, quicknodeAgentUrl, scan8004AgentUrl } from "../modules/chain/monad";
import { readAgentReputation, type AgentReputation } from "../modules/erc8004/reputation";
import { globalAgentId, shortAddress, shortGlobalAgentId } from "../modules/wallet/format";

type ProfileTab = "id" | "rank" | "feedback" | "verify";

export function WalletProfile({
  name,
  address,
  agentId,
  owner,
  transactions,
}: {
  name: string;
  address: string;
  agentId: number | null;
  owner: string | null;
  transactions: number;
}) {
  const [tab, setTab] = useState<ProfileTab>("id");
  const [reputation, setReputation] = useState<AgentReputation | null>(null);
  const [reputationError, setReputationError] = useState("");
  const registered = agentId !== null;

  useEffect(() => {
    if (agentId === null) {
      setReputation(null);
      setReputationError("");
      return;
    }
    let cancelled = false;
    setReputation(null);
    setReputationError("");
    readAgentReputation(agentId)
      .then((next) => {
        if (!cancelled) setReputation(next);
      })
      .catch((error: unknown) => {
        if (!cancelled) setReputationError(error instanceof Error ? error.message : "Could not read feedback.");
      });
    return () => {
      cancelled = true;
    };
  }, [agentId]);
  const walletHref = address.startsWith("0x") ? explorerAddressUrl(address) : undefined;
  const tabs: { id: ProfileTab; label: string }[] = [
    { id: "id", label: "ID" },
    { id: "rank", label: "Rank" },
    { id: "feedback", label: "Feedback" },
    { id: "verify", label: "Verify" },
  ];

  return (
    <section className="wallet-pop">
      <p className="wallet-pop-kicker">Profile · {name}</p>
      <div className="wallet-tabs" role="tablist">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={tab === item.id ? "is-active" : ""}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="wallet-kv">
        {tab === "id" && (
          <>
            <Row label="Agent ID" value={registered ? `#${agentId}` : "—"} href={registered ? scan8004AgentUrl(agentId) : undefined} />
            <Row label="Chain" value="Monad Testnet" />
            <Row label="Global ID" value={registered ? shortGlobalAgentId(agentId) : "Unregistered"} title={registered ? globalAgentId(agentId) : undefined} />
            <Row label="Owner" value={owner ? shortAddress(owner) : "—"} href={owner ? explorerAddressUrl(owner) : undefined} />
            <Row label="Agent wallet" value={address ? shortAddress(address) : "—"} href={walletHref} />
          </>
        )}
        {tab === "rank" && (
          <>
            <Row label="Rank score" value={reputation?.average ? `${reputation.average} / 100` : reputation ? "— / 100" : "…"} />
            <Row label="Total txns" value={String(transactions)} />
            <Row label="Capacity" value="$500" />
          </>
        )}
        {tab === "feedback" && (
          <>
            <Row label="On-chain feedbacks" value={reputation ? String(reputation.count) : reputationError ? "—" : "…"} />
            <Row label="Average score" value={reputation?.average ? `${reputation.average} / 100` : "— / 100"} />
            <Row label="Publisher" value="ERC-8004" />
            {reputationError && <p className="tx-empty">{reputationError}</p>}
            {reputation && reputation.entries.length > 0 && (
              <ul className="feedback-list">
                {reputation.entries.map((entry) => (
                  <li key={entry.index}>
                    <span>#{entry.index} {entry.tag1}{entry.tag2 ? ` · ${entry.tag2}` : ""}</span>
                    <strong>{entry.revoked ? "revoked" : entry.score}</strong>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        {tab === "verify" && (
          <>
            <Row label="ERC-8004" value={registered ? "registered" : "not registered"} />
            <Row label="Verified" value={registered ? "yes · on-chain" : "no"} />
            <Row label="8004scan" value={registered ? "open profile" : "—"} href={registered ? scan8004AgentUrl(agentId) : undefined} />
            <Row label="QuickNode" value={registered ? "open profile" : "—"} href={registered ? quicknodeAgentUrl(agentId) : undefined} />
            <Row label="Explorer" value={walletHref ? "monadvision" : "—"} href={walletHref} />
          </>
        )}
      </div>
    </section>
  );
}

function Row({ label, value, href, title }: { label: string; value: string; href?: string; title?: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong title={title}>
        {href ? (
          <a href={href} target="_blank" rel="noreferrer">{value}</a>
        ) : (
          value
        )}
      </strong>
    </div>
  );
}
