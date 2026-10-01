export function ServicePreview({ name, origin }: { name: string; origin: string }) {
  return (
    <div className="service-preview">
      <div className="service-preview-scale">
        <iframe src={origin} title={`${name} preview`} tabIndex={-1} sandbox="allow-scripts allow-same-origin" />
      </div>
      <a href={origin} target="_blank" rel="noreferrer">
        Open {name}
      </a>
    </div>
  );
}
