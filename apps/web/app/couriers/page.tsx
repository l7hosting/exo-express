"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { DashboardShell } from "@/components/DashboardShell";
import { apiRequest, ApiClientError, readStoredSession } from "@/lib/api";
import type {
  AssignmentListResponse,
  CourierListResponse,
  EligibleShipmentResponse
} from "@exo/shared";

type ActionState = { kind: "idle" } | { kind: "busy" } | { kind: "done"; message: string } | { kind: "error"; message: string };

export default function CouriersPage() {
  const [couriers, setCouriers] = useState<CourierListResponse["items"]>([]);
  const [eligible, setEligible] = useState<EligibleShipmentResponse["items"]>([]);
  const [assignments, setAssignments] = useState<AssignmentListResponse["items"]>([]);
  const [selectedCourier, setSelectedCourier] = useState("");
  const [selectedShipments, setSelectedShipments] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<ActionState>({ kind: "idle" });

  const token = useMemo(() => readStoredSession()?.token ?? null, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [courierData, eligibleData, assignmentData] = await Promise.all([
        apiRequest<CourierListResponse>("/api/v1/couriers", { token }),
        apiRequest<EligibleShipmentResponse>("/api/v1/assignments/eligible-shipments", { token }),
        apiRequest<AssignmentListResponse>("/api/v1/assignments?pageSize=25", { token })
      ]);
      setCouriers(courierData.items);
      setEligible(eligibleData.items);
      setAssignments(assignmentData.items);
      setSelectedCourier((current) => current || courierData.items.find((c) => c.isActive)?.id || "");
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Impossible de charger les livreurs");
      setCouriers([]);
      setEligible([]);
      setAssignments([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  function toggleShipment(id: string) {
    setSelectedShipments((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id]
    );
  }

  async function assign() {
    if (!selectedCourier || selectedShipments.length === 0) return;
    setAction({ kind: "busy" });
    try {
      const result = await apiRequest<{ count: number }>("/api/v1/assignments", {
        method: "POST",
        token,
        body: { courierId: selectedCourier, shipmentIds: selectedShipments }
      });
      setAction({ kind: "done", message: `${result.count} expédition(s) assignée(s)` });
      setSelectedShipments([]);
      await load();
    } catch (err) {
      setAction({ kind: "error", message: err instanceof ApiClientError ? err.message : "Échec de l'assignation" });
    }
  }

  async function unassign(assignmentId: string) {
    setAction({ kind: "busy" });
    try {
      await apiRequest<void>(`/api/v1/assignments/${assignmentId}`, { method: "DELETE", token });
      setAction({ kind: "done", message: "Affectation retirée" });
      await load();
    } catch (err) {
      setAction({ kind: "error", message: err instanceof ApiClientError ? err.message : "Échec du retrait" });
    }
  }

  async function toggleCourierStatus(courierId: string, isActive: boolean) {
    setAction({ kind: "busy" });
    try {
      await apiRequest(`/api/v1/couriers/${courierId}/status`, {
        method: "PATCH",
        token,
        body: { isActive: !isActive }
      });
      setAction({ kind: "done", message: isActive ? "Livreur désactivé" : "Livreur réactivé" });
      await load();
    } catch (err) {
      setAction({ kind: "error", message: err instanceof ApiClientError ? err.message : "Échec du changement de statut" });
    }
  }

  return (
    <DashboardShell active="Livreurs">
      <header className="topbar">
        <div>
          <div className="eyebrow">WORKSPACE / COUPLIERS</div>
          <h1>Livreurs & affectations</h1>
        </div>
        <div className="userPill">
          <span className="statusDot" />
          {couriers.filter((c) => c.isActive).length} livreur(s) actif(s)
        </div>
      </header>

      {error ? <div className="errorState" role="alert">{error}</div> : null}
      {action.kind === "error" ? <div className="errorState" role="alert">{action.message}</div> : null}
      {action.kind === "done" ? <div className="successState" role="status">{action.message}</div> : null}

      <div className="splitGrid">
        <section className="panel">
          <div className="sectionHead">
            <div><h3>Flotte de livreurs</h3><p>Charge de travail calculée en direct</p></div>
          </div>
          {loading ? (
            <div className="loadingState"><span className="spinner" /> Chargement…</div>
          ) : couriers.length === 0 ? (
            error ? null : (
              <div className="emptyState"><strong>Aucun livreur</strong>Créez un compte livreur pour commencer.</div>
            )
          ) : (
            <div className="tableWrap">
              <table className="table">
                <thead>
                  <tr><th>Livreur</th><th>Contact</th><th>Charge</th><th>Statut</th><th /></tr>
                </thead>
                <tbody>
                  {couriers.map((courier) => (
                    <tr key={courier.id}>
                      <td>
                        <strong>{courier.fullName}</strong>
                        <div className="cellSub">{courier.email}</div>
                      </td>
                      <td>{courier.phone ?? "—"}</td>
                      <td>{courier.activeShipments} en cours</td>
                      <td>
                        <span className={`badge ${courier.isActive ? "delivered" : "cancelled"}`}>
                          {courier.isActive ? "ACTIF" : "INACTIF"}
                        </span>
                      </td>
                      <td>
                        <button
                          className="btn btnGhost btnSmall"
                          onClick={() => void toggleCourierStatus(courier.id, courier.isActive)}
                          disabled={action.kind === "busy"}
                        >
                          {courier.isActive ? "Désactiver" : "Réactiver"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="panel">
          <div className="sectionHead">
            <div><h3>Affecter des expéditions</h3><p>Uniquement les expéditions en attente</p></div>
          </div>

          <div className="field">
            <label htmlFor="courier-select">Livreur</label>
            <select
              id="courier-select"
              className="select"
              value={selectedCourier}
              onChange={(e) => setSelectedCourier(e.target.value)}
            >
              <option value="">— Sélectionner —</option>
              {couriers.filter((c) => c.isActive).map((courier) => (
                <option key={courier.id} value={courier.id}>
                  {courier.fullName} ({courier.activeShipments})
                </option>
              ))}
            </select>
          </div>

          {loading ? (
            <div className="loadingState"><span className="spinner" /> Chargement…</div>
          ) : eligible.length === 0 ? (
            error ? null : (
              <div className="emptyState"><strong>Aucune expédition en attente</strong>Toutes les expéditions sont affectées.</div>
            )
          ) : (
            <>
              <ul className="checkList">
                {eligible.map((shipment) => (
                  <li key={shipment.id}>
                    <label className="checkRow">
                      <input
                        type="checkbox"
                        checked={selectedShipments.includes(shipment.id)}
                        onChange={() => toggleShipment(shipment.id)}
                      />
                      <span className="checkBody">
                        <span className="tracking">{shipment.trackingNumber}</span>
                        <span className="cellSub">
                          {shipment.recipientName} · {shipment.zone?.name ?? shipment.city}
                        </span>
                      </span>
                      <span className="cellAmount">{Number(shipment.codAmount).toFixed(2)} DH</span>
                    </label>
                  </li>
                ))}
              </ul>
              <div className="formActions">
                <button
                  className="btn btnPrimary"
                  onClick={() => void assign()}
                  disabled={action.kind === "busy" || !selectedCourier || selectedShipments.length === 0}
                >
                  {action.kind === "busy" ? "Affectation…" : `Affecter (${selectedShipments.length})`}
                </button>
              </div>
            </>
          )}
        </section>
      </div>

      <div className="sectionHead">
        <div><h3>Historique des affectations</h3><p>25 derniers mouvements</p></div>
      </div>
      {loading ? (
        <div className="loadingState"><span className="spinner" /> Chargement…</div>
      ) : assignments.length === 0 ? (
        error ? null : (
          <div className="emptyState"><strong>Aucune affectation</strong>L’historique apparaîtra après la première affectation.</div>
        )
      ) : (
        <div className="tableWrap">
          <table className="table">
            <thead>
              <tr><th>Tracking</th><th>Livreur</th><th>Assigné par</th><th>Statut</th><th>Date</th><th /></tr>
            </thead>
            <tbody>
              {assignments.map((assignment) => (
                <tr key={assignment.id}>
                  <td>
                    <Link className="tracking" href={`/shipments/view?id=${encodeURIComponent(assignment.shipmentId)}`}>
                      {assignment.shipment?.trackingNumber ?? assignment.shipmentId.slice(0, 8)}
                    </Link>
                  </td>
                  <td>{assignment.courier?.fullName ?? "—"}</td>
                  <td>{assignment.assignedBy?.fullName ?? "—"}</td>
                  <td>
                    <span className={`badge ${assignment.status === "ACTIVE" ? "out_for_delivery" : assignment.status === "REASSIGNED" ? "at_depot" : "cancelled"}`}>
                      {assignment.status}
                    </span>
                  </td>
                  <td>{new Date(assignment.assignedAt).toLocaleString("fr-MA")}</td>
                  <td>
                    {assignment.status === "ACTIVE" ? (
                      <button
                        className="btn btnGhost btnSmall"
                        onClick={() => void unassign(assignment.id)}
                        disabled={action.kind === "busy"}
                      >
                        Retirer
                      </button>
                    ) : null}
                  </td>
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
