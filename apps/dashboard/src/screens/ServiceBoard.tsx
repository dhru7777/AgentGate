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
      <div className="service-board-head">
        <span>Service name</span>
        <span>Human preview</span>
        <span>Observability Deck</span>
        <span>Live Bot Crawling Preview</span>
      </div>
      {services.map((service) => (
        <div className="service-board-row" key={service.id}>
          <div className="service-name-line">
            <strong>{service.name}</strong>
            <button type="button" className="service-delete" aria-label={`Delete ${service.name}`} onClick={() => onRemove(service.id)}>
              ×
            </button>
          </div>
          <ServicePreview name={service.name} origin={service.origin} />
          <button type="button" className="deck-link" onClick={() => onOpenDeck(service.id)}>
            Observability Deck
          </button>
          {service.id === "blog" ? (
            <a className="deck-link" href={LIVE_BOT_PREVIEW_URL} target="_blank" rel="noreferrer">
              Live Bot Crawling Preview
            </a>
          ) : (
            <span className="service-board-none">Not crawled by the demo bot</span>
          )}
        </div>
      ))}
      <div className="service-board-add">
        {!adding && (
          <button type="button" className="obs-btn-sm" onClick={() => { setAdding(true); setError(""); }}>
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
