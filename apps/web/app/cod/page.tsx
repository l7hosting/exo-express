"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { DashboardShell } from "@/components/DashboardShell";
import { apiRequest, ApiClientError, readStoredSession } from "@/lib/api";
import type { CodListResponse, CodReconciliation, MerchantBalance } from "@exo/shared";

type ActionState = { kind: "idle" } | { kind: "busy" } | { kind: "done"; message: string } | { kind: "error"; message: string };

export default function CodPage() {
  const [ledger, setLedger] = useState<CodListResponse | null>(null);
  const [reconciliation, setReconciliation] = useState<CodReconciliation | null>(null);
  const [balances, setBalances] = useState<MerchantBalance[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<ActionState>({ kind: "idle" });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const token = readStoredSession()?.token ?? null;
    try {
      const query = statusFilter ? `?status=${statusFilter}&pageSize=50` : "?pageSize=50";
      const [ledgerData, reconciliationData, balanceData] = await Promise.all([
        apiRequest<CodListResponse>(`/api/v1/cod${query}`, { token }),
        apiRequest<CodReconciliation>("/api/v1/cod/reconciliation", { token }),
        apiRequest<{ items: MerchantBalance[] }>("/api/v1/cod/merchant-balances", { token })
      ]);
      setLedger(ledgerData);
      setReconciliation(reconciliationData);
      setBalances(balanceData.items);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Impossible de charger le journal COD");
      setLedger(null);
      setReconciliation(null);
      setBalances([]);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  async function reverse(collectionId: string) {
    const reason = window.prompt("Motif de l'annulation de l'encaissement :");
    if (!reason || reason.trim().length < 3) return;
    setAction({ kind: "busy" });
    try {
      await apiRequest(`/api/v1/cod/${collectionId}/reverse`, {
        method: "POST",
        token: readStoredSession()?.token ?? null,
        body: { reason: reason.trim() }
      });
      setAction({ kind: "done", message: "Encaissement annulé et historisé" });
      await load();
    } catch (err) {
      setAction({ kind: "error", message: err instanceof ApiClientError ? err.message : "Échec de l'annulation" });
    }
  }

  return (
    <DashboardShell active="COD">
      <header className="topbar">
        <div>
          <div className="eyebrow">WORKSPACE / FINANCE</div>
          <h1>Journal des encaissements COD</h1>
        </div>
        <div className="userPill">
          <span className="statusDot" />
          {ledger ? `${ledger.total} écriture(s)` : "Données API"}
        </div>
      </header>

      {error ? <div className="errorState" role="alert">{error}</div> : null}
      {action.kind === "error" ? <div className="errorState" role="alert">{action.message}</div> : null}
      {action.kind === "done" ? <div className="successState" role="status">{action.message}</div> : null}

      <div className="metrics">
        <article className="metric metricAccent">
          <div className="metricLabel">COD attendu</div>
          <div className="metricValue">{reconciliation?.expectedCodTotal ?? "0.00"} DH</div>
          <div className="metricNote">Expéditions livrées avec COD</div>
        </article>
        <article className="metric">
          <div className="metricLabel">COD encaissé</div>
          <div className="metricValue">{reconciliation?.collectedTotal ?? "0.00"} DH</div>
          <div className="metricNote">{reconciliation?.collections ?? 0} encaissement(s)</div>
        </article>
        <article className="metric">
          <div className="metricLabel">À rapprocher</div>
          <div className="metricValue">{reconciliation?.outstandingTotal ?? "0.00"} DH</div>
          <div className="metricNote">{reconciliation?.uncollectedDelivered.length ?? 0} expédition(s) sans encaissement</div>
        </article>
        <article className="metric">
          <div className="metricLabel">Annulé / inversé</div>
          <div className="metricValue">{reconciliation?.reversedTotal ?? "0.00"} DH</div>
          <div className="metricNote">{reconciliation?.reversals ?? 0} annulation(s)</div>
        </article>
      </div>

      <div className="sectionHead">
        <div><h3>Écritures</h3><p>Chaque encaissement est immuable et historisé</p></div>
        <div className="field fieldInline">
          <label htmlFor="cod-status">Statut</label>
          <select
            id="cod-status"
            className="select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">Tous</option>
            <option value="COLLECTED">Encaissé</option>
            <option value="REVERSED">Annulé</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="loadingState"><span className="spinner" /> Chargement du journal…</div>
      ) : !ledger || ledger.items.length === 0 ? (
        error ? null : (
          <div className="emptyState"><strong>Aucun encaissement</strong>Les encaissements COD apparaîtront ici.</div>
        )
      ) : (
        <div className="tableWrap">
          <table className="table">
            <thead>
              <tr><th>Référence</th><th>Tracking</th><th>Marchand</th><th>Livreur</th><th>Montant</th><th>Mode</th><th>Date</th><th>Statut</th><th /></tr>
            </thead>
            <tbody>
              {ledger.items.map((entry) => (
                <tr key={entry.id}>
                  <td className="tracking">{entry.reference}</td>
                  <td>
                    <Link className="tracking" href={`/shipments/view?id=${encodeURIComponent(entry.shipmentId)}`}>
                      {entry.shipment?.trackingNumber ?? entry.shipmentId.slice(0, 8)}
                    </Link>
                  </td>
                  <td>{entry.shipment?.merchant?.businessName ?? "—"}</td>
                  <td>{entry.courier?.fullName ?? "—"}</td>
                  <td>{Number(entry.amount).toFixed(2)} DH</td>
                  <td>{entry.paymentMethod}</td>
                  <td>{new Date(entry.collectedAt).toLocaleString("fr-MA")}</td>
                  <td>
                    <span className={`badge ${entry.status === "COLLECTED" ? "delivered" : "cancelled"}`}>
                      {entry.status === "COLLECTED" ? "ENCAISSÉ" : "ANNULÉ"}
                    </span>
                  </td>
                  <td>
                    {entry.status === "COLLECTED" ? (
                      <button
                        className="btn btnGhost btnSmall"
                        onClick={() => void reverse(entry.id)}
                        disabled={action.kind === "busy"}
                      >
                        Annuler
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="splitGrid">
        <section className="panel">
          <div className="sectionHead">
            <div><h3>Expéditions livrées sans encaissement</h3><p>À rapprocher</p></div>
          </div>
          {loading ? (
            <div className="loadingState"><span className="spinner" /> Chargement…</div>
          ) : !reconciliation || reconciliation.uncollectedDelivered.length === 0 ? (
            <div className="emptyState"><strong>Tout est rapproché</strong>Aucune livraison COD sans encaissement.</div>
          ) : (
            <div className="tableWrap">
              <table className="table">
                <thead><tr><th>Tracking</th><th>Montant</th><th>Statut</th></tr></thead>
                <tbody>
                  {reconciliation.uncollectedDelivered.map((row) => (
                    <tr key={row.id}>
                      <td className="tracking">{row.trackingNumber}</td>
                      <td>{row.codAmount} DH</td>
                      <td>{row.collectionStatus ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="panel">
          <div className="sectionHead">
            <div><h3>Balances marchands</h3><p>Encaissé vs reste à encaisser</p></div>
          </div>
          {loading ? (
            <div className="loadingState"><span className="spinner" /> Chargement…</div>
          ) : balances.length === 0 ? (
            <div className="emptyState"><strong>Aucune balance</strong>Les balances marchands apparaîtront ici.</div>
          ) : (
            <div className="tableWrap">
              <table className="table">
                <thead><tr><th>Marchand</th><th>Encaissé</th><th>En attente</th></tr></thead>
                <tbody>
                  {balances.map((balance) => (
                    <tr key={balance.merchantId}>
                      <td>{balance.businessName}</td>
                      <td>{balance.collected} DH</td>
                      <td>{balance.outstanding} DH</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <footer>EXO EXPRESS · Système interne de gestion de livraison</footer>
    </DashboardShell>
  );
}
