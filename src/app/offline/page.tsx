export default function OfflinePage() {
  return (
    <main className="center-page">
      <div className="offline-card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="offline-logo" src="/trai-lang-logo.jpg" alt="Logo Trại Làng FC" />
        <h1>Bạn đang ngoại tuyến</h1>
        <p>FCFUND cần kết nối mạng để đọc hoặc ghi dữ liệu tài chính an toàn.</p>
        <a className="button primary" href="/dashboard">Thử kết nối lại</a>
      </div>
    </main>
  );
}
