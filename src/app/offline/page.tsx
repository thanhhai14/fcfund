export default function OfflinePage() {
  return (
    <main className="center-page">
      <div className="offline-card">
        <div className="brand-badge large">FC</div>
        <h1>Bạn đang ngoại tuyến</h1>
        <p>FCFUND cần kết nối mạng để đọc hoặc ghi dữ liệu tài chính an toàn.</p>
        <a className="button primary" href="/dashboard">Thử kết nối lại</a>
      </div>
    </main>
  );
}
