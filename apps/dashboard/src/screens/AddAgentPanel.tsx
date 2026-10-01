import { useState, type FormEvent } from "react";
import { explorerAddressUrl, explorerTxUrl, MONAD_TESTNET_IDENTITY_REGISTRY, scan8004AgentUrl } from "../modules/chain/monad";
import { rememberChainAgent } from "../modules/erc8004/directory";
import { readOnchainAgent, registerAgentOnMonad } from "../modules/erc8004/register";
import { connectMonadWallet } from "../modules/erc8004/wallet";
import type { Identity } from "../types";

export function AddAgentPanel({
  serviceId,
  serviceName,
  onChange,
}: {
  serviceId: string;
  serviceName: string;
  onChange: (agents: Identity[]) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState(`Issues invoices when company bots read ${serviceName}.`);
  const [lookupId, setLookupId] = useState("");
  const [wallet, setWallet] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [registeredId, setRegisteredId] = useState<number | null>(null);
  const [txHash, setTxHash] = useState("");

  async function connect() {
    setBusy("Connecting wallet…");
    setError("");
    try {
      const { address } = await connectMonadWallet();
      setWallet(address);
      setNotice(`Connected ${address}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not connect the wallet.");
    } finally {
      setBusy("");
    }
  }

  async function register(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      setError("Name the agent.");
      return;
    }
    setBusy("Registering on Monad…");
    setError("");
    setNotice("");
    try {
      const result = await registerAgentOnMonad({
        name: name.trim(),
        description: description.trim() || name.trim(),
      });
      const agents = rememberChainAgent({
        agentId: result.agentId,
        name: name.trim(),
        claimedAs: name.trim(),
        wallet: result.walletAddress,
        owner: result.owner,
        status: "verified",
        reputation: null,
        services: [serviceId],
        registerTxHash: result.txHash,
        agentURI: result.agentURI,
      });
      onChange(agents);
      setWallet(result.walletAddress);
      setRegisteredId(result.agentId);
      setTxHash(result.txHash);
      setNotice(`Agent #${result.agentId} is on the registry.`);
      setName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed.");
    } finally {
      setBusy("");
    }
  }

  async function lookup(event: FormEvent) {
    event.preventDefault();
    const agentId = Number(lookupId);
    if (!Number.isInteger(agentId) || agentId < 0) {
      setError("Enter the agent id from the registry.");
      return;
    }
    setBusy("Reading registry…");
    setError("");
    try {
      const onchain = await readOnchainAgent(agentId);
      const agents = rememberChainAgent({
        agentId,
        name: `Agent #${agentId}`,
        claimedAs: "ERC-8004",
        wallet: onchain.agentWallet,
        owner: onchain.owner,
        status: "verified",
        reputation: null,
        services: [serviceId],
        agentURI: onchain.tokenURI,
      });
      onChange(agents);
      setRegisteredId(agentId);
      setTxHash("");
      setNotice(`Read agent #${agentId} from Monad.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That id is not on the registry.");
    } finally {
      setBusy("");
    }
  }

  return (
    <section className="ledger-card">
      <h2>Register your invoice agent</h2>
      <p className="obs-lead">
        This is your agent for {serviceName}. It is the one that writes invoices for the company bots that read the service. Registration follows midnightx402 on Monad: <code>register(agentURI)</code>, read <code>Registered</code>, then <code>setAgentURI</code>. Your wallet signs both and needs testnet MON for gas.
      </p>
      <form className="ledger-form" onSubmit={register}>
        <label>
          Name
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder={`${serviceName} invoice agent`} disabled={Boolean(busy)} />
        </label>
        <label>
          Description
          <input value={description} onChange={(event) => setDescription(event.target.value)} disabled={Boolean(busy)} />
        </label>
        <button type="button" className="obs-btn-sm" onClick={connect} disabled={Boolean(busy)}>
          {wallet ? "Wallet connected" : "Connect wallet"}
        </button>
        <button type="submit" className="obs-btn-sm is-primary" disabled={Boolean(busy)}>
          {busy === "Registering on Monad…" ? busy : "Register on Monad"}
        </button>
      </form>
      {wallet && <p className="obs-meta mono">{wallet}</p>}
      <form className="ledger-form" onSubmit={lookup}>
        <label>
          Already registered
          <input value={lookupId} onChange={(event) => setLookupId(event.target.value)} placeholder="Agent id" inputMode="numeric" disabled={Boolean(busy)} />
        </label>
        <button type="submit" className="obs-btn-sm" disabled={Boolean(busy)}>Read from registry</button>
      </form>
      {busy && busy !== "Registering on Monad…" && <p className="obs-meta">{busy}</p>}
      {error && <p className="obs-lock-error">{error}</p>}
      {notice && <p className="obs-toast">{notice}</p>}
      {registeredId !== null && (
        <p className="obs-meta">
          <a href={scan8004AgentUrl(registeredId)} target="_blank" rel="noreferrer">8004scan #{registeredId}</a>
          {txHash && <> · <a href={explorerTxUrl(txHash)} target="_blank" rel="noreferrer">registration tx</a></>}
        </p>
      )}
      <p className="obs-meta">
        Registry <a href={explorerAddressUrl(MONAD_TESTNET_IDENTITY_REGISTRY)} target="_blank" rel="noreferrer">0x8004A818…BD9e</a>
      </p>
    </section>
  );
}

