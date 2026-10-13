import { useState, type FormEvent } from "react";
import { ServicePreview } from "../components/ServicePreview";
import type { Service } from "../types";

/** The bot demo that crawls the live blog. Same product, one umbrella. */
export const LIVE_BOT_PREVIEW_URL = "https://agent-preview-colosseum.netlify.app/";

export function ServiceBoard({
  services,
  onOpenDeck,
  onAdd,
  onRemove,
}: {
  services: Service[];
  onOpenDeck: (id: string) => void;
  onAdd: (name: string, origin: string) => string | null;
  onRemove: (id: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [origin, setOrigin] = useState("");
  const [error, setError] = useState("");

  function add(event: FormEvent) {
    event.preventDefault();
    const message = onAdd(name, origin);
    if (message) {
      setError(message);
      return;
    }
    setName("");
    setOrigin("");
    setError("");
    setAdding(false);
  }

  return (
    <div className="ledger-page service-board">
      <header className="obs-top">
        <div>
          <h1>Services</h1>
          <p className="obs-meta">Each site has a preview, its own observability deck, and a live view of the demo bot crawling it.</p>
        </div>
      </header>
      <div className="service-list">
        {services.map((service) => (
          <article className="service-card" key={service.id}>
            <ServicePreview name={service.name} origin={service.origin} />
            <div className="service-card-body">
              <h2>{service.name}</h2>
              <a className="service-origin" href={service.origin} target="_blank" rel="noreferrer">
                {service.origin.replace(/^https?:\/\//, "").replace(/\/$/, "")}
              </a>
              <div className="service-card-actions">
                <button type="button" className="obs-btn-sm is-primary" onClick={() => onOpenDeck(service.id)}>
                  Observability deck
                </button>
                {service.id === "blog" ? (
                  <a className="obs-btn-sm" href={LIVE_BOT_PREVIEW_URL} target="_blank" rel="noreferrer">
                    Live bot crawling preview
                    <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true"><path d="M4.5 2.5h5v5M9.5 2.5 3 9" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </a>
                ) : (
                  <span className="service-board-none">Not crawled by the demo bot</span>
                )}
              </div>
            </div>
            <button type="button" className="service-delete" aria-label={`Delete ${service.name}`} title="Remove service" onClick={() => onRemove(service.id)}>
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 3l6 6M9 3 3 9" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>
            </button>
          </article>
        ))}
      </div>
      <div className="service-board-add">
        {!adding && (
          <button type="button" className="service-add-trigger" onClick={() => { setAdding(true); setError(""); }}>
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 2v8M2 6h8" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>
            Add service
          </button>
        )}
        {adding && (
          <form className="service-add" onSubmit={add}>
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Service name" />
            <input value={origin} onChange={(event) => setOrigin(event.target.value)} placeholder="https://example.com" />
            <button type="submit" className="obs-btn-sm is-primary">Add</button>
            <button type="button" className="obs-btn-sm" onClick={() => setAdding(false)}>Cancel</button>
            {error && <p className="obs-lock-error">{error}</p>}
          </form>
        )}
      </div>
    </div>
  );
}
