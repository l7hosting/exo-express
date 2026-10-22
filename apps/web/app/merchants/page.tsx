"use client";

import { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { apiRequest, ApiClientError, readStoredSession } from "@/lib/api";
import type { MerchantListItem, MerchantListResponse } from "@exo/shared";

export default function MerchantsPage() {
  const [items, setItems] = useState<MerchantListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = search.trim().length >= 2 ? `?search=${encodeURIComponent(search.trim())}` : "";
      const data = await apiRequest<MerchantListResponse>(`/api/v1/merchants${query}`, {
        token: readStoredSession()?.token ?? null
      });
      setItems(data.items);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Impossible de charger les marchands");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    // Debounce the search box: `load` changes on every keystroke.
    const timer = setTimeout(() => {
      void load();
    }, 300);
    return () => clearTimeout(timer);
  }, [load]);

  return (
    <DashboardShell active="Marchands">
      <header className="topbar">
        <div><div className="eyebrow">MERCHANTS</div><h1>Marchands</h1></div>
      </header>

      <form className="field" onSubmit={(e) => { e.preventDefault(); void load(); }}>
        <label htmlFor="merchant-search">Recherche</label>
        <input id="merchant-search" className="input" value={search} placeholder="Nom, contact, téléphone"
          onChange={(e) => setSearch(e.target.value)} />
      </form>

      {error ? <div className="errorState" role="alert">{error}</div> : null}

      {loading ? (
        <div className="loadingState"><span className="spinner" /> Chargement des marchands…</div>
      ) : items.length === 0 ? (
        error ? null : (
          <div className="emptyState">
            <strong>Aucun marchand</strong>
            {search.trim() ? "Aucun résultat pour cette recherche." : "Les comptes marchands apparaîtront ici."}
          </div>
        )
      ) : (
        <div className="tableWrap">
          <table className="table">
            <thead><tr><th>Société</th><th>Contact</th><th>Téléphone</th><th>Expéditions</th><th>Statut</th></tr></thead>
            <tbody>
              {items.map((merchant) => (
                <tr key={merchant.id}>
                  <td>{merchant.businessName}</td>
                  <td>{merchant.contactName}</td>
                  <td>{merchant.phone}</td>
                  <td>{merchant._count?.shipments ?? 0}</td>
                  <td><span className={`badge ${merchant.isActive ? "delivered" : "cancelled"}`}>
                    {merchant.isActive ? "ACTIF" : "INACTIF"}
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
