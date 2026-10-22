"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function HomePage() {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(false);
  }, []);

  return (
    <div style={{ minHeight: "100vh", direction: "rtl", background: "#F4F6F8", color: "#071A42" }}>
      <nav style={{ background: "#071A42", padding: "20px 40px", margin: "-20px -40px", display: "flex", justifyContent: "flex-end", alignItems: "center" }}>
        <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: 2, textAlign: "right" }}>
          EXO EXPRESS
        </div>
        <div style={{ display: "flex", gap: "24px", alignItems: "center" }}>
          <Link href="/en" style={{ color: "#748494", textDecoration: "none" }}>English</Link>
        </div>
      </nav>

      <div style={{ maxWidth: 800, margin: "40px auto", padding: "0 20px", textAlign: "right" }}>
        <header style={{ textAlign: "right", marginBottom: 40 }}>
          <h1 style={{ fontSize: 42, fontWeight: 800, letterSpacing: -1, marginBottom: 16, direction: "rtl" }}>
            منصة EXO EXPRESS لإدارة اللوجستيك
          </h1>
          <p style={{ fontSize: 16, color: "#748494", marginBottom: 32, direction: "rtl" }}>
            حلول متكاملة للشحن، التracking وإدارة المالية للشركات المغربية
          </p>
        </header>

        <section style={{ background: "#FFFFFF", borderRadius: 16, padding: 32, marginBottom: 32, boxShadow: "0 2px 8px rgba(7,26,66,0.08)", direction: "rtl" }}>
          <h2 style={{ fontSize: 20, color: "#071A42", marginBottom: 24, textAlign: "right" }}>Features :</h2>
          <ul style={{ listStyle: "none", padding: 0, direction: "rtl" }}>
            <li style={{ marginBottom: 12, color: "#475467", lineHeight: 1.6 }}>
              <strong>🚚 Ramassage & Livraison</strong> : Ramassage à domicile ou en entrepôt, livraison rapide et sécurisée sur tout le territoire marocain.
            </li>
            <li style={{ marginBottom: 12, color: "#475467", lineHeight: 1.6 }}>
              <strong>💰 Encaissements COD</strong> : Gestion financière intégrée, suivi des collecte et règlements marchands transparents.
            </li>
            <li style={{ marginBottom: 12, color: "#475467", lineHeight: 1.6 }}>
              <strong>📊 Tableau de bord</strong> : Statistiques en temps réel, rapports exportables et vue complète de vos opérations.
            </li>
            <li style={{ marginBottom: 12, color: "#475467", lineHeight: 1.6 }}>
              <strong>📱 Portail livreur</strong> : Application mobile pour les livreurs : missions, encaissements COD et preuves de livraison.
            </li>
          </ul>
        </section>

        <section style={{ background: "#FFFFFF", borderRadius: 16, padding: 32, marginBottom: 32, boxShadow: "0 2px 8px rgba(7,26,66,0.08)", direction: "rtl" }}>
          <h2 style={{ fontSize: 20, color: "#071A42", marginBottom: 24, textAlign: "right" }}>Services :</h2>
          <ul style={{ listStyle: "none", padding: 0, direction: "rtl" }}>
            <li style={{ marginBottom: 12, color: "#475467", lineHeight: 1.6 }}>
              <strong>Suivi de colis</strong> : Suivez vos expéditions en temps réel avec votre numéro de tracking EXO.
            </li>
            <li style={{ marginBottom: 12, color: "#475467", lineHeight: 1.6 }}>
              <strong>Gestion de marchands</strong> : Enregistrement des marchands, suivi des expéditions par marchand et gestion des règlements.
            </li>
            <li style={{ marginBottom: 12, color: "#475467", lineHeight: 1.6 }}>
              <strong>Paramètres de zone</strong> : Configuration des zones de livraison et des tarifs.
            </li>
          </ul>
        </section>

        <div style={{ textAlign: "right", marginTop: 40 }}>
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
      </div>

      <footer style={{ padding: "20px 40px", background: "#071A42", margin: "-20px -40px", color: "#FFFFFF", fontSize: 12, textAlign: "right" }}>
        © 2026 EXO EXPRESS · Système de gestion de livraison · Tous droits réservés
      </footer>
    </div>
  );
}