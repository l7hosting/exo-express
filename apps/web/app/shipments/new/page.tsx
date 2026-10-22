"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardShell } from "@/components/DashboardShell";
import { apiRequest, ApiClientError, readStoredSession } from "@/lib/api";
import type { MerchantListResponse, ZoneOption } from "@exo/shared";

export default function NewShipmentPage() {
  const router = useRouter();
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [merchants, setMerchants] = useState<{ id: string; businessName: string }[]>([]);
  const [zones, setZones] = useState<ZoneOption[]>([]);
  const [refLoading, setRefLoading] = useState(true);
  const [refError, setRefError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    merchantId: "",
    zoneId: "",
    recipientName: "",
    recipientPhone: "",
    address: "",
    city: "Casablanca",
    codAmount: "0",
    notes: ""
  });

  // localStorage is browser-only: read the token after mount, never during render.
  useEffect(() => {
    setSessionToken(readStoredSession()?.token ?? null);
    setSessionReady(true);
  }, []);

  useEffect(() => {
    if (!sessionReady) return;
    let cancelled = false;
    setRefLoading(true);
    setRefError(null);

    void Promise.all([
      apiRequest<MerchantListResponse>("/api/v1/merchants", { token: sessionToken }),
      apiRequest<{ items: ZoneOption[] }>("/api/v1/zones", { token: sessionToken })
    ])
      .then(([merchantData, zoneData]) => {
        if (cancelled) return;
        setMerchants(merchantData.items.map((m) => ({ id: m.id, businessName: m.businessName })));
        setZones(zoneData.items);
      })
      .catch((err) => {
        if (cancelled) return;
        setRefError(err instanceof ApiClientError ? err.message : "Impossible de charger les référentiels");
        setMerchants([]);
        setZones([]);
      })
      .finally(() => {
        if (!cancelled) setRefLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [sessionReady, sessionToken, reloadKey]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const created = await apiRequest<{ id: string; trackingNumber: string }>("/api/v1/shipments", {
        method: "POST",
        token: sessionToken,
        body: {
          merchantId: form.merchantId,
          zoneId: form.zoneId,
          recipientName: form.recipientName,
          recipientPhone: form.recipientPhone,
          address: form.address,
          city: form.city,
          codAmount: Number(form.codAmount),
          notes: form.notes || undefined
        }
      });
      router.push(`/shipments/view?id=${encodeURIComponent(created.id)}`);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Création impossible");
    } finally {
      setSubmitting(false);
    }
  }

  const referencesReady = !refLoading && !refError && merchants.length > 0 && zones.length > 0;

  return (
    <DashboardShell active="Expéditions">
      <header className="topbar">
        <div>
          <div className="eyebrow">SHIPMENTS / NEW</div>
          <h1>Nouvelle expédition</h1>
        </div>
      </header>

      {error ? <div className="errorState" role="alert">{error}</div> : null}

      {refLoading ? (
        <div className="loadingState"><span className="spinner" /> Chargement des marchands et des zones…</div>
      ) : null}

      {refError ? (
        <div className="errorState" role="alert">
          {refError}
          <div className="formActions" style={{ marginTop: 10, marginBottom: 0 }}>
            <button type="button" className="btn btnGhost btnSmall" onClick={() => setReloadKey((key) => key + 1)}>
              Réessayer
            </button>
          </div>
        </div>
      ) : null}

      {!refLoading && !refError && (merchants.length === 0 || zones.length === 0) ? (
        <div className="emptyState">
          <strong>Référentiels incomplets</strong>
          {merchants.length === 0 ? "Aucun marchand disponible. " : ""}
          {zones.length === 0 ? "Aucune zone de livraison configurée." : ""}
        </div>
      ) : null}

      <form onSubmit={submit} className="formGrid">
        <div className="field">
          <label htmlFor="merchantId">Marchand</label>
          <select id="merchantId" className="select" required value={form.merchantId}
            disabled={!referencesReady}
            onChange={(e) => setForm({ ...form, merchantId: e.target.value })}>
            <option value="">Sélectionner…</option>
            {merchants.map((m) => <option key={m.id} value={m.id}>{m.businessName}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="zoneId">Zone de livraison</label>
          <select id="zoneId" className="select" required value={form.zoneId}
            disabled={!referencesReady}
            onChange={(e) => setForm({ ...form, zoneId: e.target.value })}>
            <option value="">Sélectionner…</option>
            {zones.map((z) => <option key={z.id} value={z.id}>{z.name} — {z.city}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="recipientName">Destinataire</label>
          <input id="recipientName" className="input" required minLength={2} value={form.recipientName}
            onChange={(e) => setForm({ ...form, recipientName: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="recipientPhone">Téléphone</label>
          <input id="recipientPhone" className="input" required minLength={6} value={form.recipientPhone}
            onChange={(e) => setForm({ ...form, recipientPhone: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="address">Adresse</label>
          <input id="address" className="input" required minLength={5} value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="city">Ville</label>
          <input id="city" className="input" value={form.city}
            onChange={(e) => setForm({ ...form, city: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="codAmount">Montant COD (DH)</label>
          <input id="codAmount" className="input" type="number" min="0" step="0.01" value={form.codAmount}
            onChange={(e) => setForm({ ...form, codAmount: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="notes">Notes</label>
          <input id="notes" className="input" maxLength={500} value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
        <div className="formActions" style={{ gridColumn: "1 / -1" }}>
          <button className="btn btnPrimary" type="submit" disabled={submitting || !referencesReady}>
            {submitting ? "Création…" : "Créer l'expédition"}
          </button>
          <button className="btn btnGhost" type="button" onClick={() => router.back()}>Annuler</button>
        </div>
      </form>
    </DashboardShell>
  );
}
