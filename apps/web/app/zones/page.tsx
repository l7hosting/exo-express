"use client";

import { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { apiRequest, ApiClientError, readStoredSession } from "@/lib/api";
import type { ZoneListItem, ZoneListResponse } from "@exo/shared";

export default function ZonesPage() {
  const [items, setItems] = useState<ZoneListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiRequest<ZoneListResponse>("/api/v1/zones", {
        token: readStoredSession()?.token ?? null
      });
      setItems(data.items);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Impossible de charger les zones");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <DashboardShell active="Zones & tarifs">
      <header className="topbar">
        <div><div className="eyebrow">ZONES & TARIFS</div><h1>Zones de livraison</h1></div>
      </header>

      {error ? <div className="errorState" role="alert">{error}</div> : null}

      {loading ? (
        <div className="loadingState"><span className="spinner" /> Chargement des zones…</div>
      ) : items.length === 0 ? (
        error ? null : (
          <div className="emptyState">
            <strong>Aucune zone configurée</strong>
            Les zones et tarifs de référence doivent être créés côté API avant de pouvoir expédier.
          </div>
        )
      ) : (
        <div className="tableWrap">
          <table className="table">
            <thead><tr><th>Zone</th><th>Ville</th><th>Tarif livraison</th><th>Frais de retour</th><th>Statut</th></tr></thead>
            <tbody>
              {items.map((zone) => (
                <tr key={zone.id}>
                  <td>{zone.name}</td>
                  <td>{zone.city}</td>
                  <td>{Number(zone.deliveryFee).toFixed(2)} DH</td>
                  <td>{Number(zone.returnFee).toFixed(2)} DH</td>
                  <td><span className={`badge ${zone.isActive ? "delivered" : "cancelled"}`}>
                    {zone.isActive ? "ACTIVE" : "INACTIVE"}
                  </span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </DashboardShell>
  );
}
