export default function AppLoading() {
  return (
    <div className="route-loading-skeleton" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Đang tải nội dung…</span>
      <div className="skeleton-page-header">
        <span className="skeleton-block skeleton-eyebrow" />
        <span className="skeleton-block skeleton-title" />
        <span className="skeleton-block skeleton-subtitle" />
      </div>

      <div className="skeleton-stat-grid">
        {Array.from({ length: 3 }, (_, index) => (
          <div className="skeleton-card" key={index}>
            <span className="skeleton-block skeleton-icon" />
            <div>
              <span className="skeleton-block skeleton-line short" />
              <span className="skeleton-block skeleton-line medium" />
            </div>
          </div>
        ))}
      </div>

      <div className="skeleton-panel">
        <div className="skeleton-panel-heading">
          <div>
            <span className="skeleton-block skeleton-line short" />
            <span className="skeleton-block skeleton-line medium" />
          </div>
          <span className="skeleton-block skeleton-action" />
        </div>
        <div className="skeleton-table">
          {Array.from({ length: 6 }, (_, index) => (
            <div className="skeleton-row" key={index}>
              <span className="skeleton-block skeleton-avatar" />
              <span className="skeleton-block skeleton-line wide" />
              <span className="skeleton-block skeleton-line short" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
