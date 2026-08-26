function PlaceholderPage({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div>
      <div className="page-header">
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      <div className="placeholder-card">
        <span className="status-badge not-implemented">NOT_IMPLEMENTED</span>
        <p style={{ marginTop: '1rem' }}>
          Feature planned — see docs/PROJECT_STATE.md for phase timeline.
        </p>
      </div>
    </div>
  );
}

export { PlaceholderPage };
