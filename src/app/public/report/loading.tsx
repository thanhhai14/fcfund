export default function PublicReportLoading() {
  return (
    <main className="route-loading-skeleton public-report-loading" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Đang tải báo cáo…</span>
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
        <div className="skeleton-table">
          {Array.from({ length: 7 }, (_, index) => (
            <div className="skeleton-row" key={index}>
              <span className="skeleton-block skeleton-avatar" />
              <span className="skeleton-block skeleton-line wide" />
              <span className="skeleton-block skeleton-line short" />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
