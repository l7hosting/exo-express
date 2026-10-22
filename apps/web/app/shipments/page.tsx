"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { DashboardShell } from "@/components/DashboardShell";
import { apiRequest, ApiClientError, readStoredSession } from "@/lib/api";
import type { ShipmentListItem, ShipmentListResponse } from "@exo/shared";

const STATUS_FILTERS = [
  "",
  "CREATED",
  "PICKUP_ASSIGNED",
  "PICKED_UP",
  "AT_DEPOT",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "DELIVERY_FAILED",
  "RETURNED"
] as const;

export default function ShipmentsPage() {
  const [items, setItems] = useState<ShipmentListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const session = readStoredSession();
    const params = new URLSearchParams({ page: String(page), pageSize: "20" });
    if (status) params.set("status", status);
    if (search.trim().length >= 2) params.set("search", search.trim());
    try {
      const data = await apiRequest<ShipmentListResponse>(`/api/v1/shipments?${params.toString()}`, {
        token: session?.token ?? null
      });
      setItems(data.items);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Impossible de charger les expéditions");
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, search, status]);

  useEffect(() => {
    void load();
  }, [load]);

  const pages = useMemo(() => Math.max(1, Math.ceil(total / 20)), [total]);

  return (
    <DashboardShell active="Expéditions">
      <header className="topbar">
        <div>
          <div className="eyebrow">SHIPMENTS</div>
          <h1>Expéditions</h1>
        </div>
        <Link className="btn btnPrimary" href="/shipments/new">Nouvelle expédition</Link>
      </header>

      <form
        className="formGrid"
        onSubmit={(event) => {
          event.preventDefault();
          // setPage(1) already retriggers `load` through the effect.
          if (page !== 1) setPage(1);
          else void load();
        }}
      >
        <div className="field">
          <label htmlFor="search">Recherche (tracking, destinataire, téléphone)</label>
          <input
            id="search"
            className="input"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="EXO-XXXXXXXXXX"
          />
        </div>
        <div className="field">
          <label htmlFor="status">Statut</label>
          <select id="status" className="select" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
            {STATUS_FILTERS.map((value) => (
              <option key={value || "all"} value={value}>{value === "" ? "Tous les statuts" : value}</option>
            ))}
          </select>
        </div>
      </form>

      {error ? <div className="errorState" role="alert">{error}</div> : null}

      {loading ? (
        <div className="loadingState"><span className="spinner" /> Chargement des expéditions…</div>
      ) : items.length === 0 ? (
        error ? null : (
          <div className="emptyState">
            <strong>Aucune expédition</strong>
            {search.trim() || status ? "Aucun résultat pour ces filtres." : "Les expéditions créées apparaîtront ici."}
          </div>
        )
      ) : (
        <div className="tableWrap">
          <table className="table">
            <thead>
              <tr>
                <th>Tracking</th>
                <th>Destinataire</th>
                <th>Marchand</th>
                <th>Zone</th>
                <th>COD</th>
                <th>Statut</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td><Link className="tracking" href={`/shipments/view?id=${encodeURIComponent(item.id)}`}>{item.trackingNumber}</Link></td>
                  <td>{item.recipientName}<div style={{ color: "var(--muted)", fontSize: 11 }}>{item.recipientPhone}</div></td>
                  <td>{item.merchant?.businessName ?? "—"}</td>
                  <td>{item.zone?.name ?? "—"}</td>
                  <td>{Number(item.codAmount).toFixed(2)} DH</td>
                  <td><span className={`badge ${item.status.toLowerCase()}`}>{item.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {total > 0 ? (
        <div className="formActions" style={{ justifyContent: "space-between", marginTop: 16 }}>
          <span style={{ fontSize: 12, color: "var(--muted)" }}>{total} expédition(s)</span>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btnGhost" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Précédent</button>
            <span style={{ alignSelf: "center", fontSize: 12 }}>{page} / {pages}</span>
            <button className="btn btnGhost" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Suivant</button>
          </div>
        </div>
      ) : null}
    </DashboardShell>
  );
}
