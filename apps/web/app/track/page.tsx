export default function TrackingPage() {
  const urlParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const trackingNumber = urlParams?.get("trackingNumber") ?? null;

  return (
    <div style={{ padding: 40, textAlign: "center", minHeight: "100vh", background: "#F4F6F8", color: "#071A42" }}>
      <nav style={{ background: "#071A42", padding: "20px 40px", margin: "-20px -40px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: 2 }}>
          EXO EXPRESS
        </div>
        <div style={{ display: "flex", gap: "24px" }}>
          <a href="/fr" style={{ color: "#F36A0A", textDecoration: "none", fontWeight: "700" }}>Français</a>
          <a href="/en" style={{ color: "#748494", textDecoration: "none" }}>English</a>
          <a href="/ar" style={{ color: "#748494", textDecoration: "none" }} dir="rtl">العربية</a>
        </div>
      </nav>

      <main style={{ maxWidth: 600, margin: "40px auto", padding: "0 20px" }}>
        <header style={{ textAlign: "center", marginBottom: 40 }}>
          <h1 style={{ fontSize: 42, fontWeight: 800, letterSpacing: -1, marginBottom: 24 }}>
            {trackingNumber ? `Suivi d'expédition ${trackingNumber}` : "Suivi d'expédition"}
          </h1>
          <p style={{ color: "#748494", fontSize: 14, marginBottom: 8 }}>
            Entrer le code de suivi pour connaître le statut en temps réel
          </p>
          <div style={{ border: "1px solid #e5ebef", borderRadius: 12, padding: 24, marginBottom: 24, maxWidth: 400, margin: "0 auto" }}>
            <input
              type="text"
              placeholder="EXO-XXXXXXXXXX"
              style={{
                width: "100%", padding: 12, border: "none", borderRadius: 8,
                fontSize: 16, color: "#071A42", background: "#F4F6F8",
                marginBottom: 16
              }}
            />
            <button
              style={{
                background: "#F36A0A", color: "#FFFFFF", border: "none",
                padding: "12px 24px", borderRadius: 8, fontSize: 14, fontWeight: "700",
                cursor: "pointer", width: "100%"
              }}
            >
              Suivre
            </button>
          </div>
          <p style={{ color: "#748494", fontSize: 12, marginBottom: 40 }}>
            Ou consultez vos expéditions dans votre espace client
          </p>
        </header>
      </main>
    </div>
  );
}