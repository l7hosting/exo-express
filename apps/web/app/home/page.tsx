"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function HomePage() {
  const [kpis, setKpis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Public home page doesn't need auth - just show branding
    setLoading(false);
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: "#F4F6F8", color: "#071A42" }}>
      <nav style={{ background: "#071A42", padding: "20px 40px", margin: "-20px -40px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: 2 }}>
          EXO EXPRESS
        </div>
        <div style={{ display: "flex", gap: "24px" }}>
          <Link href="/fr" style={{ color: "#F36A0A", textDecoration: "none", fontWeight: "700" }}>Français</Link>
          <Link href="/en" style={{ color: "#748494", textDecoration: "none" }}>English</Link>
          <Link href="/ar" style={{ color: "#748494", textDecoration: "none" }} dir="rtl">العربية</Link>
        </div>
      </nav>

      <main style={{ maxWidth: 800, margin: "40px auto", padding: "0 20px" }}>
        <header style={{ textAlign: "center", marginBottom: 40 }}>
          <h1 style={{ fontSize: 42, fontWeight: 800, letterSpacing: -1, marginBottom: 16 }}>
            Plateforme de Gestion Logistique
          </h1>
          <p style={{ fontSize: 16, color: "#748494", marginBottom: 32 }}>
            Solutions complètes d'expédition, de suivi et de gestion financière pour les entreprises au Maroc
          </p>
        </header>

        <section style={{ background: "#FFFFFF", borderRadius: 16, padding: 32, marginBottom: 32, boxShadow: "0 2px 8px rgba(7,26,66,0.08)" }}>
          <h2 style={{ fontSize: 20, color: "#071A42", marginBottom: 24 }}>Pourquoi choisir EXO EXPRESS ?</h2>
          <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
            <div style={{ padding: 16, background: "#F8F9FA", borderRadius: 10 }}>
              <h3 style={{ color: "#F36A0A", fontSize: 16, marginBottom: 8 }}>🚚 Ramassage & Livraison</h3>
              <p style={{ color: "#475467", lineHeight: 1.6 }}>
                Ramassage à domicile ou en entrepôt, livraison rapide et sécurisée sur tout le territoire marocain.
              </p>
            </div>
            <div style={{ padding: 16, background: "#F8F9FA", borderRadius: 10 }}>
              <h3 style={{ color: "#F36A0A", fontSize: 16, marginBottom: 8 }}>💰 Encaissements COD</h3>
              <p style={{ color: "#475467", lineHeight: 1.6 }}>
                Gestion financière intégrée, suivi des collecte et règlements marchands transparents.
              </p>
            </div>
            <div style={{ padding: 16, background: "#F8F9FA", borderRadius: 10 }}>
              <h3 style={{ color: "#F36A0A", fontSize: 16, marginBottom: 8 }}>📊 Tableau de bord</h3>
              <p style={{ color: "#475467", lineHeight: 1.6 }}>
                Statistiques en temps réel, rapports exportables et vue complète de vos opérations.
              </p>
            </div>
          </div>
        </section>

        <section style={{ background: "#FFFFFF", borderRadius: 16, padding: 32, marginBottom: 32, boxShadow: "0 2px 8px rgba(7,26,66,0.08)" }}>
          <h2 style={{ fontSize: 20, color: "#071A42", marginBottom: 24 }}>Nos services</h2>
          <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
            <div style={{ padding: 16, background: "#F8F9FA", borderRadius: 10, border: "1px solid #E5EBEF" }}>
              <h3 style={{ color: "#071A42", fontSize: 16, marginBottom: 8 }}>Suivi de colis</h3>
              <p style={{ color: "#475467", lineHeight: 1.6 }}>
                Suivez vos expéditions en temps réel avec votre numéro de tracking EXO.
              </p>
            </div>
            <div style={{ padding: 16, background: "#F8F9FA", borderRadius: 10, border: "1px solid #E5EBEF" }}>
              <h3 style={{ color: "#071A42", fontSize: 16, marginBottom: 8 }}>Gestion de marchands</h3>
              <p style={{ color: "#475467", lineHeight: 1.6 }}>
                Enregistrement des marchands, suivi des expéditions par marchand et gestion des règlements.
              </p>
            </div>
            <div style={{ padding: 16, background: "#F8F9FA", borderRadius: 10, border: "1px solid #E5EBEF" }}>
              <h3 style={{ color: "#071A42", fontSize: 16, marginBottom: 8 }}>Portail livreur</h3>
              <p style={{ color: "#475467", lineHeight: 1.6 }}>
                Application mobile pour les livreurs : missions, encaissements COD et preuves de livraison.
              </p>
            </div>
          </div>
        </section>

        <div style={{ textAlign: "center", marginTop: 40 }}>
          <a
            href="/dashboard"
            style={{
              background: "#F36A0A", color: "#FFFFFF", border: "none",
              padding: "14px 32px", borderRadius: 8, fontSize: 16, fontWeight: "700",
              textDecoration: "none", display: "inline-block"
            }}
          >
            Accéder à votre espace client
          </a>
        </div>
      </main>

      <footer style={{ padding: "20px 40px", background: "#071A42", margin: "-20px -40px", color: "#FFFFFF", fontSize: 12, textAlign: "center" }}>
        © 2026 EXO EXPRESS · Système de gestion de livraison · Tous droits réservés
      </footer>
    </div>
  );
}