"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { DashboardShell } from "@/components/DashboardShell";
import { apiRequest, ApiClientError, readStoredSession } from "@/lib/api";
import type { ShipmentDetail, ShipmentStatus } from "@exo/shared";

const NEXT_STATUSES: Partial<Record<ShipmentStatus, ShipmentStatus[]>> = {
  CREATED: ["PICKUP_ASSIGNED", "CANCELLED"],
  PICKUP_ASSIGNED: ["PICKED_UP", "CANCELLED"],
  PICKED_UP: ["AT_DEPOT", "DELIVERY_FAILED"],
  AT_DEPOT: ["OUT_FOR_DELIVERY", "DELIVERY_FAILED"],
  OUT_FOR_DELIVERY: ["DELIVERED", "DELIVERY_FAILED"],
  DELIVERY_FAILED: ["RETURN_REQUESTED", "OUT_FOR_DELIVERY"],
  RETURN_REQUESTED: ["RETURNING"],
  RETURNING: ["RETURNED"]
};

function ShipmentDetailContent() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id");
  const [shipment, setShipment] = useState<ShipmentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    if (!id) {
      setShipment(null);
      setLoading(false);
      return;
    }
    try {
      const data = await apiRequest<ShipmentDetail>(`/api/v1/shipments/${encodeURIComponent(id)}`, {
        token: readStoredSession()?.token ?? null
      });
      setShipment(data);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Impossible de charger l'expédition");
      setShipment(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function changeStatus(status: ShipmentStatus) {
    if (!id) return;
    setPending(status);
    setError(null);
    try {
      await apiRequest(`/api/v1/shipments/${encodeURIComponent(id)}/status`, {
        method: "PATCH",
        token: readStoredSession()?.token ?? null,
        body: { status }
      });
      await load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Transition refusée");
    } finally {
      setPending(null);
    }
  }

  return (
    <DashboardShell active="Expéditions">
      <header className="topbar">
        <div>
          <div className="eyebrow">SHIPMENTS / DETAIL</div>
          <h1>{shipment?.trackingNumber ?? "Expédition"}</h1>
        </div>
        {shipment ? <span className={`badge ${shipment.status.toLowerCase()}`}>{shipment.status}</span> : null}
      </header>

      {error ? <div className="errorState" role="alert">{error}</div> : null}

      {loading ? (
        <div className="loadingState"><span className="spinner" /> Chargement…</div>
      ) : !shipment ? (
        <div className="emptyState"><strong>Expédition introuvable</strong> Vérifiez le numéro de suivi.</div>
      ) : (
        <>
          <div className="modules">
            <article className="module"><div><h4>Destinataire</h4><p>{shipment.recipientName}<br />{shipment.recipientPhone}<br />{shipment.address}, {shipment.city}</p></div></article>
            <article className="module"><div><h4>Marchand</h4><p>{shipment.merchant?.businessName ?? "—"}</p></div></article>
            <article className="module"><div><h4>Zone</h4><p>{shipment.zone?.name ?? "—"}</p></div></article>
            <article className="module"><div><h4>Montants</h4><p>COD {Number(shipment.codAmount).toFixed(2)} DH<br />Livraison {Number(shipment.deliveryFee).toFixed(2)} DH<br />Retour {Number(shipment.returnFee).toFixed(2)} DH</p></div></article>
            <article className="module"><div><h4>Livreur</h4><p>{shipment.courier?.fullName ?? "Non affecté"}</p></div></article>
            <article className="module"><div><h4>Créée le</h4><p>{new Date(shipment.createdAt).toLocaleString("fr-MA")}</p></div></article>
          </div>

          <div className="sectionHead"><div><h3>Historique</h3><p>Journal immuable des transitions</p></div></div>
          <div className="tableWrap">
            <table className="table">
              <thead><tr><th>Date</th><th>De</th><th>Vers</th><th>Par</th><th>Note</th></tr></thead>
              <tbody>
                {shipment.events.length === 0 ? (
                  <tr><td colSpan={5}>Aucun événement enregistré.</td></tr>
                ) : (
                  shipment.events.map((event) => (
                    <tr key={event.id}>
                      <td>{new Date(event.createdAt).toLocaleString("fr-MA")}</td>
                      <td>{event.fromStatus ?? "—"}</td>
                      <td><span className={`badge ${event.toStatus.toLowerCase()}`}>{event.toStatus}</span></td>
                      <td>{event.actor?.fullName ?? "Système"}</td>
                      <td>{event.note ?? "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {NEXT_STATUSES[shipment.status]?.length ? (
            <>
              <div className="sectionHead"><div><h3>Actions</h3><p>Transitions autorisées pour le statut actuel</p></div></div>
              <div className="formActions">
                {NEXT_STATUSES[shipment.status]!.map((status) => (
                  <button key={status} className="btn btnGhost" disabled={pending !== null}
                    onClick={() => void changeStatus(status)}>
                    {pending === status ? "…" : status}
                  </button>
                ))}
              </div>
            </>
          ) : null}
        </>
      )}
    </DashboardShell>
  );
}

export default function ShipmentDetailPage() {
  return (
    <Suspense
      fallback={
        <DashboardShell active="Expéditions">
          <header className="topbar">
            <div>
              <div className="eyebrow">SHIPMENTS / DETAIL</div>
              <h1>Expédition</h1>
            </div>
          </header>
          <div className="loadingState"><span className="spinner" /> Chargement…</div>
        </DashboardShell>
      }
    >
      <ShipmentDetailContent />
    </Suspense>
  );
}
