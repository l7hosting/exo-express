"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { DashboardShell } from "@/components/DashboardShell";
import { apiRequest, ApiClientError, readStoredSession } from "@/lib/api";
import type { DashboardKpis, ShipmentListResponse } from "@exo/shared";

export default function HomePage() {
  const [kpis, setKpis] = useState<DashboardKpis | null>(null);
  const [recent, setRecent] = useState<ShipmentListResponse["items"]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const token = readStoredSession()?.token ?? null;
    try {
      const [kpiData, listData] = await Promise.all([
        apiRequest<DashboardKpis>("/api/v1/dashboard/kpis", { token }),
        apiRequest<ShipmentListResponse>("/api/v1/shipments?page=1&pageSize=8", { token })
      ]);
      setKpis(kpiData);
      setRecent(listData.items);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Impossible de charger le tableau de bord");
      setKpis(null);
      setRecent([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <DashboardShell active="Vue d'ensemble">
      <header className="topbar">
        <div>
          <div className="eyebrow">WORKSPACE / OVERVIEW</div>
          <h1>Vue d'ensemble</h1>
        </div>
        <div className="userPill">
          <span className="statusDot" />
          {kpis ? `${kpis.shipments.total} expédition(s)` : "Données API"}
        </div>
      </header>

      <div className="welcome">
        <div>
          <div className="eyebrow light">EXO EXPRESS · DELIVERY OPERATIONS</div>
          <h2>Pilotage de vos livraisons au Maroc.</h2>
          <p>Expéditions, livreurs, encaissements COD et règlements marchands réunis dans un seul espace.</p>
        </div>
        <div className="welcomeIcon">EX</div>
      </div>

      {error ? <div className="errorState" role="alert">{error}</div> : null}

      <div className="sectionHead">
        <div><h3>Indicateurs clés</h3><p>Valeurs calculées par l'API sur les données réelles</p></div>
        {kpis ? <span className="period">Actualisé le {new Date(kpis.generatedAt).toLocaleString("fr-MA")}</span> : null}
      </div>
      {loading ? (
        <div className="loadingState"><span className="spinner" /> Chargement des indicateurs…</div>
      ) : (
        <div className="metrics">
          <article className="metric metricAccent">
            <div className="metricLabel">Expéditions totales</div>
            <div className="metricValue">{kpis?.shipments.total ?? "—"}</div>
            <div className="metricNote">{kpis?.shipments.awaitingAssignment ?? "—"} en attente d'affectation</div>
          </article>
          <article className="metric">
            <div className="metricLabel">Livreurs actifs</div>
            <div className="metricValue">{kpis?.couriers.active ?? "—"}</div>
            <div className="metricNote">Comptes livreurs habilités</div>
          </article>
          <article className="metric">
            <div className="metricLabel">En cours de livraison</div>
            <div className="metricValue">{kpis?.shipments.inDelivery ?? "—"}</div>
            <div className="metricNote">Collectées et en tournée</div>
          </article>
          <article className="metric">
            <div className="metricLabel">COD à rapprocher</div>
            <div className="metricValue">{kpis?.cod.awaitingReconciliationTotal ?? "—"} DH</div>
            <div className="metricNote">{kpis?.cod.uncollectedShipments ?? "—"} livraison(s) sans encaissement</div>
          </article>
        </div>
      )}

      <div className="metrics metricsSecondary">
        <article className="metric">
          <div className="metricLabel">Livrées</div>
          <div className="metricValue">{kpis?.shipments.delivered ?? "—"}</div>
          <div className="metricNote">Livraison confirmée</div>
        </article>
        <article className="metric">
          <div className="metricLabel">Échecs de livraison</div>
          <div className="metricValue">{kpis?.shipments.deliveryFailed ?? "—"}</div>
          <div className="metricNote">Adresse incorrecte, refus, absent</div>
        </article>
        <article className="metric">
          <div className="metricLabel">COD encaissé</div>
          <div className="metricValue">{kpis?.cod.collectedTotal ?? "—"} DH</div>
          <div className="metricNote">Attendu : {kpis?.cod.expectedTotal ?? "—"} DH</div>
        </article>
        <article className="metric">
          <div className="metricLabel">Règlements en attente</div>
          <div className="metricValue">{kpis?.settlements.pending ?? "—"}</div>
          <div className="metricNote">{kpis?.settlements.pendingNetPayable ?? "—"} DH à approuver</div>
        </article>
      </div>

      <div className="sectionHead">
        <div><h3>Expéditions récentes</h3><p>Dernières créations</p></div>
        <Link className="period" href="/shipments">Tout voir</Link>
      </div>
      {loading ? (
        <div className="loadingState"><span className="spinner" /> Chargement…</div>
      ) : recent.length === 0 ? (
        error ? null : (
          <div className="emptyState"><strong>Aucune expédition</strong>Créez votre première expédition pour voir la liste ici.</div>
        )
      ) : (
        <div className="tableWrap">
          <table className="table">
            <thead><tr><th>Tracking</th><th>Destinataire</th><th>Zone</th><th>COD</th><th>Statut</th></tr></thead>
            <tbody>
              {recent.map((shipment) => (
                <tr key={shipment.id}>
                  <td><Link className="tracking" href={`/shipments/view?id=${encodeURIComponent(shipment.id)}`}>{shipment.trackingNumber}</Link></td>
                  <td>{shipment.recipientName}</td>
                  <td>{shipment.zone?.name ?? "—"}</td>
                  <td>{Number(shipment.codAmount).toFixed(2)} DH</td>
                  <td><span className={`badge ${shipment.status.toLowerCase()}`}>{shipment.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <footer>EXO EXPRESS · Système interne de gestion de livraison</footer>
    </DashboardShell>
  );
}
