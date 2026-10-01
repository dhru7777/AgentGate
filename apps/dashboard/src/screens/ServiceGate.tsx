import { useState, type FormEvent } from "react";
import { meraMessage } from "../modules/mera/passkey";
import { verifyServiceWithPasskey } from "../modules/mera/verifyService";
import { nextServiceId, parseOrigin } from "../modules/services/catalog";
import type { OwnerSession, Service } from "../types";

export function ServiceGate({
  services,
  onOpen,
  onVerified,
}: {
  services: Service[];
  onOpen: (serviceId: string) => void;
  onVerified: (service: Service, owner: OwnerSession) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [origin, setOrigin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function verify(event: FormEvent) {
    event.preventDefault();
    const parsed = parseOrigin(origin);
    if (!name.trim() || !parsed) {
      setError("Enter a service name and a site URL.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const id = nextServiceId(services, name.trim());
      const keys = await verifyServiceWithPasskey({ name: name.trim(), origin: parsed, slug: id });
      onVerified(
        {
          id,
          name: name.trim(),
          origin: parsed,
          payoutAddress: keys.payoutAddress,
          ownershipAddress: keys.ownershipAddress,
          verified: true,
        },
        { credentialId: keys.credentialId, ownerAddress: keys.ownerAddress },
      );
    } catch (err) {
      setError(meraMessage(err));
      setBusy(false);
    }
  }

  return (
    <div className="ledger-page">
      <header className="obs-top">
        <div>
          <h1>Services</h1>
          <p className="obs-meta">Add a site, verify it with your passkey, and its analytics window opens.</p>
        </div>
        {!adding && (
          <button type="button" className="obs-btn-sm is-primary" onClick={() => { setAdding(true); setError(""); }}>
            Add service
          </button>
        )}
      </header>

      {adding && (
        <form className="ledger-card" onSubmit={verify}>
          <h2>Verify service</h2>
          <p className="obs-lead">
            One passkey derives this service’s payout address and ownership key. The signature has to recover to that ownership address before analytics open.
          </p>
          <div className="ledger-form">
            <label>
              Name
              <input value={name} onChange={(event) => setName(event.target.value)} placeholder="dheeraj.blog" disabled={busy} />
            </label>
            <label>
              Site
              <input value={origin} onChange={(event) => setOrigin(event.target.value)} placeholder="https://dheeraj-work.netlify.app" disabled={busy} />
            </label>
            <button type="submit" className="obs-lock-submit" disabled={busy}>
              {busy ? "Waiting for passkey…" : "Verify service"}
            </button>
          </div>
          {error && <p className="obs-lock-error">{error}</p>}
          {!busy && (
            <button type="button" className="obs-btn-sm" onClick={() => { setAdding(false); setError(""); }}>
              Cancel
            </button>
          )}
        </form>
      )}

      <div className="service-list">
        {services.map((service) => (
          <button
            key={service.id}
            type="button"
            className="service-row"
            onClick={() => {
              if (service.verified) onOpen(service.id);
            }}
            disabled={!service.verified}
          >
            <span>
              <strong>{service.name}</strong>
              <small>{service.origin}</small>
            </span>
            <em>{service.verified ? "Verified" : "Needs passkey"}</em>
          </button>
        ))}
      </div>
    </div>
  );
}
