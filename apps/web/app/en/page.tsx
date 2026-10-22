"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function HomePage() {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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
          <Link href="/ar" style={{ color: "#748494", textDecoration: "none" }}>العربية</Link>
        </div>
      </nav>

      <main style={{ maxWidth: 800, margin: "40px auto", padding: "0 20px" }}>
        <header style={{ textAlign: "center", marginBottom: 40 }}>
          <h1 style={{ fontSize: 42, fontWeight: 800, letterSpacing: -1, marginBottom: 16 }}>
            EXO EXPRESS Logistics Platform
          </h1>
          <p style={{ fontSize: 16, color: "#748494", marginBottom: 32 }}>
            Complete shipping, tracking and financial management solutions for Moroccan businesses
          </p>
        </header>

        <section style={{ background: "#FFFFFF", borderRadius: 16, padding: 32, marginBottom: 32, boxShadow: "0 2px 8px rgba(7,26,66,0.08)" }}>
          <h2 style={{ fontSize: 20, color: "#071A42", marginBottom: 24 }}>Why Choose EXO EXPRESS?</h2>
          <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
            <div style={{ padding: 16, background: "#F8F9FA", borderRadius: 10 }}>
              <h3 style={{ color: "#F36A0A", fontSize: 16, marginBottom: 8 }}>🚚 Pickup & Delivery</h3>
              <p style={{ color: "#475467", lineHeight: 1.6 }}>
                Home pickup or warehouse delivery, fast and secure delivery across Morocco.
              </p>
            </div>
            <div style={{ padding: 16, background: "#F8F9FA", borderRadius: 10 }}>
              <h3 style={{ color: "#F36A0A", fontSize: 16, marginBottom: 8 }}>💰 COD Collections</h3>
              <p style={{ color: "#475467", lineHeight: 1.6 }}>
                Integrated financial management, collection tracking and transparent merchant settlements.
              </p>
            </div>
            <div style={{ padding: 16, background: "#F8F9FA", borderRadius: 10 }}>
              <h3 style={{ color: "#F36A0A", fontSize: 16, marginBottom: 8 }}>📊 Dashboard</h3>
              <p style={{ color: "#475467", lineHeight: 1.6 }}>
                Real-time statistics, exportable reports and full operational overview.
              </p>
            </div>
          </div>
        </section>

        <section style={{ background: "#FFFFFF", borderRadius: 16, padding: 32, marginBottom: 32, boxShadow: "0 2px 8px rgba(7,26,66,0.08)" }}>
          <h2 style={{ fontSize: 20, color: "#071A42", marginBottom: 24 }}>Our Services</h2>
          <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
            <div style={{ padding: 16, background: "#F8F9FA", borderRadius: 10, border: "1px solid #E5EBEF" }}>
              <h3 style={{ color: "#071A42", fontSize: 16, marginBottom: 8 }}>Shipment Tracking</h3>
              <p style={{ color: "#475467", lineHeight: 1.6 }}>
                Track your shipments in real-time with your EXO tracking number.
              </p>
            </div>
            <div style={{ padding: 16, background: "#F8F9FA", borderRadius: 10, border: "1px solid #E5EBEF" }}>
              <h3 style={{ color: "#071A42", fontSize: 16, marginBottom: 8 }}>Merchant Management</h3>
              <p style={{ color: "#475467", lineHeight: 1.6 }}>
                Register merchants, track shipments by merchant and manage settlements.
              </p>
            </div>
            <div style={{ padding: 16, background: "#F8F9FA", borderRadius: 10, border: "1px solid #E5EBEF" }}>
              <h3 style={{ color: "#071A42", fontSize: 16, marginBottom: 8 }}>Courier Portal</h3>
              <p style={{ color: "#475467", lineHeight: 1.6 }}>
                Mobile app for couriers: missions, COD collections and delivery proof.
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
            Access Your Dashboard
          </a>
        </div>
      </main>

      <footer style={{ padding: "20px 40px", background: "#071A42", margin: "-20px -40px", color: "#FFFFFF", fontSize: 12, textAlign: "center" }}>
        © 2026 EXO EXPRESS · Logistics Management System · All rights reserved
      </footer>
    </div>
  );
}