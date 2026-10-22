"use client";

import { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { apiRequest, ApiClientError, readStoredSession } from "@/lib/api";
import type {
  MerchantListResponse,
  SettlementListResponse,
  SettleableShipmentResponse
} from "@exo/shared";

type ActionState = { kind: "idle" } | { kind: "busy" } | { kind: "done"; message: string } | { kind: "error"; message: string };

export default function SettlementsPage() {
  const [settlements, setSettlements] = useState<SettlementListResponse["items"]>([]);
  const [merchants, setMerchants] = useState<MerchantListResponse["items"]>([]);
  const [merchantId, setMerchantId] = useState("");
  const [settleable, setSettleable] = useState<SettleableShipmentResponse | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [adjustments, setAdjustments] = useState("0");
  const [loading, setLoading] = useState(true);
  const [settleableLoading, setSettleableLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<ActionState>({ kind: "idle" });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const token = readStoredSession()?.token ?? null;
    try {
      const [settlementData, merchantData] = await Promise.all([
        apiRequest<SettlementListResponse>("/api/v1/settlements?pageSize=50", { token }),
        apiRequest<MerchantListResponse>("/api/v1/merchants?pageSize=100", { token })
      ]);
      setSettlements(settlementData.items);
      setMerchants(merchantData.items);
      setMerchantId((current) => current || merchantData.items[0]?.id || "");
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Impossible de charger les règlements");
      setSettlements([]);
      setMerchants([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSettleable = useCallback(async (targetMerchantId: string) => {
    if (!targetMerchantId) {
      setSettleable(null);
      return;
    }
    setSettleableLoading(true);
    try {
      const data = await apiRequest<SettleableShipmentResponse>(
        `/api/v1/settlements/settleable/${targetMerchantId}`,
        { token: readStoredSession()?.token ?? null }
      );
      setSettleable(data);
      setSelected(data.items.map((item) => item.id));
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Impossible de charger les expéditions réglables");
      setSettleable(null);
    } finally {
      setSettleableLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadSettleable(merchantId);
  }, [merchantId, loadSettleable]);

  function toggle(id: string) {
    setSelected((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id]
    );
  }

  async function createSettlement() {
    if (!merchantId || selected.length === 0) return;
    setAction({ kind: "busy" });
    try {
      const created = await apiRequest<{ reference: string }>("/api/v1/settlements", {
        method: "POST",
        token: readStoredSession()?.token ?? null,
        body: {
          merchantId,
          shipmentIds: selected,
          adjustments: Number(adjustments) || 0
        }
      });
      setAction({ kind: "done", message: `Règlement ${created.reference} créé` });
      await load();
      await loadSettleable(merchantId);
    } catch (err) {
      setAction({ kind: "error", message: err instanceof ApiClientError ? err.message : "Échec de la création" });
    }
  }

  async function transition(id: string, step: "approve" | "pay" | "cancel") {
    setAction({ kind: "busy" });
    try {
      const body = step === "cancel" ? { reason: window.prompt("Motif d'annulation :") ?? "" } : {};
      await apiRequest(`/api/v1/settlements/${id}/${step}`, {
        method: "POST",
        token: readStoredSession()?.token ?? null,
        body
      });
      setAction({
        kind: "done",
        message: step === "approve" ? "Règlement approuvé" : step === "pay" ? "Règlement payé" : "Règlement annulé"
      });
      await load();
    } catch (err) {
      setAction({ kind: "error", message: err instanceof ApiClientError ? err.message : "Opération refusée" });
    }
  }

  return (
    <DashboardShell active="Règlements">
      <header className="topbar">
        <div>
          <div className="eyebrow">WORKSPACE / FINANCE</div>
          <h1>Règlements marchands</h1>
        </div>
        <div className="userPill">
          <span className="statusDot" />
          {settlements.length} règlement(s)
        </div>
      </header>

      {error ? <div className="errorState" role="alert">{error}</div> : null}
      {action.kind === "error" ? <div className="errorState" role="alert">{action.message}</div> : null}
      {action.kind === "done" ? <div className="successState" role="status">{action.message}</div> : null}

      <div className="splitGrid">
        <section className="panel">
          <div className="sectionHead">
            <div><h3>Nouveau règlement</h3><p>Expéditions livrées et encaissées</p></div>
          </div>

          <div className="field">
            <label htmlFor="settlement-merchant">Marchand</label>
            <select
              id="settlement-merchant"
              className="select"
              value={merchantId}
              onChange={(e) => setMerchantId(e.target.value)}
            >
              <option value="">— Sélectionner —</option>
              {merchants.map((merchant) => (
                <option key={merchant.id} value={merchant.id}>{merchant.businessName}</option>
              ))}
            </select>
          </div>

          {loading ? (
            <div className="loadingState"><span className="spinner" /> Chargement…</div>
          ) : merchants.length === 0 ? (
            error ? null : (
              <div className="emptyState">
                <strong>Aucun marchand</strong>
                Un règlement nécessite au moins un compte marchand.
              </div>
            )
          ) : settleableLoading ? (
            <div className="loadingState"><span className="spinner" /> Chargement des expéditions réglables…</div>
          ) : settleable ? (
            <>
              <ul className="checkList">
                {settleable.items.length === 0 ? (
                  <li className="emptyState"><strong>Rien à régler</strong>Aucune expédition éligible pour ce marchand.</li>
                ) : (
                  settleable.items.map((item) => (
                    <li key={item.id}>
                      <label className="checkRow">
                        <input
                          type="checkbox"
                          checked={selected.includes(item.id)}
                          onChange={() => toggle(item.id)}
                        />
                        <span className="checkBody">
                          <span className="tracking">{item.trackingNumber}</span>
                          <span className="cellSub">{item.recipientName} · frais {item.deliveryFee} DH</span>
                        </span>
                        <span className="cellAmount">{item.codAmount} DH</span>
                      </label>
                    </li>
                  ))
                )}
              </ul>

              <div className="formulaBox">
                <div><span>COD brut</span><strong>{settleable.preview.grossCod} DH</strong></div>
                <div><span>Frais de livraison</span><strong>- {settleable.preview.deliveryFees} DH</strong></div>
                <div><span>Frais de retour</span><strong>- {settleable.preview.returnFees} DH</strong></div>
                <div className="formulaTotal">
                  <span>Net à payer (avant ajustements)</span>
                  <strong>{settleable.preview.netPayable} DH</strong>
                </div>
              </div>

              <div className="field">
                <label htmlFor="settlement-adjustments">Ajustement manuel (DH)</label>
                <input
                  id="settlement-adjustments"
                  className="input"
                  type="number"
                  step="0.01"
                  value={adjustments}
                  onChange={(e) => setAdjustments(e.target.value)}
                />
              </div>

              <div className="formActions">
                <button
                  className="btn btnPrimary"
                  onClick={() => void createSettlement()}
                  disabled={action.kind === "busy" || selected.length === 0}
                >
                  {action.kind === "busy" ? "Création…" : `Créer le règlement (${selected.length})`}
                </button>
              </div>
            </>
          ) : (
            <div className="emptyState">
              <strong>Sélectionnez un marchand</strong>
              Les expéditions livrées et encaissées apparaîtront ici.
            </div>
          )}
        </section>

        <section className="panel">
          <div className="sectionHead">
            <div><h3>Formule de règlement</h3><p>Règle métier appliquée par l'API</p></div>
          </div>
          <div className="formulaDoc">
            <p><strong>net à payer = COD brut − frais de livraison − frais de retour + ajustements</strong></p>
            <ul>
              <li>Le COD brut additionne les montants effectivement encaissés (statut <code>COLLECTED</code>).</li>
              <li>Les frais de livraison sont ceux facturés au marchand pour chaque expédition.</li>
              <li>Les frais de retour ne s'appliquent qu'aux expéditions non livrées.</li>
              <li>Une expédition ne peut être réglée qu'une seule fois.</li>
              <li>Cycle de vie : <code>PENDING → APPROVED → PAID</code>, ou <code>CANCELLED</code>.</li>
              <li>Le créateur ne peut ni approuver ni payer son propre règlement.</li>
            </ul>
          </div>
        </section>
      </div>

      <div className="sectionHead">
        <div><h3>Historique des règlements</h3><p>50 derniers règlements</p></div>
      </div>
      {loading ? (
        <div className="loadingState"><span className="spinner" /> Chargement…</div>
      ) : settlements.length === 0 ? (
        error ? null : (
          <div className="emptyState"><strong>Aucun règlement</strong>Créez un premier règlement à partir des COD encaissés.</div>
        )
      ) : (
        <div className="tableWrap">
          <table className="table">
            <thead>
              <tr><th>Référence</th><th>Marchand</th><th>Articles</th><th>Brut</th><th>Frais</th><th>Net à payer</th><th>Statut</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {settlements.map((settlement) => (
                <tr key={settlement.id}>
                  <td className="tracking">{settlement.reference}</td>
                  <td>{settlement.merchant?.businessName ?? "—"}</td>
                  <td>{settlement._count?.items ?? 0}</td>
                  <td>{Number(settlement.grossCod).toFixed(2)} DH</td>
                  <td>{Number(settlement.deliveryFees).toFixed(2)} DH</td>
                  <td><strong>{Number(settlement.netPayable).toFixed(2)} DH</strong></td>
                  <td>
                    <span className={`badge ${settlement.status === "PAID" ? "delivered" : settlement.status === "CANCELLED" ? "cancelled" : settlement.status === "APPROVED" ? "out_for_delivery" : "created"}`}>
                      {settlement.status}
                    </span>
                  </td>
                  <td>
                    <div className="rowActions">
                      {settlement.status === "PENDING" ? (
                        <>
                          <button className="btn btnPrimary btnSmall" onClick={() => void transition(settlement.id, "approve")} disabled={action.kind === "busy"}>
                            Approuver
                          </button>
                          <button className="btn btnGhost btnSmall" onClick={() => void transition(settlement.id, "cancel")} disabled={action.kind === "busy"}>
                            Annuler
                          </button>
                        </>
                      ) : null}
                      {settlement.status === "APPROVED" ? (
                        <button className="btn btnPrimary btnSmall" onClick={() => void transition(settlement.id, "pay")} disabled={action.kind === "busy"}>
                          Payer
                        </button>
                      ) : null}
                    </div>
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
