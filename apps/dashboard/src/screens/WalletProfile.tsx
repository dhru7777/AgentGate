import { useState } from "react";
import { explorerAddressUrl, scan8004AgentUrl } from "../modules/chain/monad";
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
  const registered = agentId !== null;
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
            <Row label="Rank score" value="0 / 100" />
            <Row label="Total txns" value={String(transactions)} />
            <Row label="Capacity" value="$500" />
          </>
        )}
        {tab === "feedback" && (
          <>
            <Row label="On-chain feedbacks" value="0" />
            <Row label="Average score" value="— / 100" />
            <Row label="Publisher" value="Agent Gate" />
          </>
        )}
        {tab === "verify" && (
          <>
            <Row label="ERC-8004" value={registered ? "registered" : "not registered"} />
            <Row label="Verified" value={registered ? "yes · on-chain" : "no"} />
            <Row label="8004scan" value={registered ? "open profile" : "—"} href={registered ? scan8004AgentUrl(agentId) : undefined} />
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
