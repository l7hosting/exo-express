import { useCallback, useEffect, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ActivityIndicator,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { apiRequest, ApiError, NetworkError } from "../../lib/api";
import { loadSession, type Session } from "../../lib/session";
import { colors, shared } from "../../lib/theme";
import {
  FAILURE_OUTCOMES,
  NEXT_STATUS,
  OUTCOME_LABEL,
  PAYMENT_METHOD_LABEL,
  STATUS_LABEL,
  STATUS_STYLE,
  type DeliveryOutcome,
  type MissionDetail,
  type ShipmentStatus
} from "../../lib/types";

type PodType = "PHOTO" | "SIGNATURE" | "OTP";

const ACTION_LABEL: Partial<Record<ShipmentStatus, string>> = {
  PICKED_UP: "Collecter le colis",
  AT_DEPOT: "Déposer au dépôt",
  OUT_FOR_DELIVERY: "Partir en livraison",
  DELIVERED: "Confirmer la livraison",
  RETURN_REQUESTED: "Demander le retour",
  RETURNING: "Retourner à l'expéditeur"
};

export default function MissionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [session, setSession] = useState<Session | null>(null);
  const [mission, setMission] = useState<MissionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [failurePanel, setFailurePanel] = useState(false);
  const [outcome, setOutcome] = useState<DeliveryOutcome>("RECIPIENT_UNAVAILABLE");

  const [podPanel, setPodPanel] = useState(false);
  const [podType, setPodType] = useState<PodType>("PHOTO");
  const [podValue, setPodValue] = useState("");

  const [codPanel, setCodPanel] = useState(false);
  const [codAmount, setCodAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<keyof typeof PAYMENT_METHOD_LABEL>("CASH");

  useEffect(() => {
    void (async () => {
      setSession(await loadSession());
    })();
  }, []);

  const load = useCallback(async () => {
    if (!session) return;
    setError(null);
    try {
      const data = await apiRequest<MissionDetail>(`/api/v1/shipments/${id}`, {
        token: session.token
      });
      setMission(data);
      setCodAmount(Number(data.codAmount ?? 0).toFixed(2));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError("Votre session a expiré, reconnectez-vous.");
      } else if (err instanceof NetworkError) {
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : "Impossible de charger la mission");
      }
    } finally {
      setLoading(false);
    }
  }, [id, session]);

  useEffect(() => {
    void load();
  }, [load]);

  async function changeStatus(status: ShipmentStatus, deliveryOutcome?: DeliveryOutcome, note?: string) {
    if (!session || !mission) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await apiRequest(`/api/v1/shipments/${mission.id}/status`, {
        method: "PATCH",
        token: session.token,
        body: { status, ...(deliveryOutcome ? { outcome: deliveryOutcome } : {}), ...(note ? { note } : {}) }
      });
      setSuccess(`Statut mis à jour : ${STATUS_LABEL[status]}`);
      setFailurePanel(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Mise à jour impossible");
    } finally {
      setBusy(false);
    }
  }

  async function submitPod() {
    if (!session || !mission) return;
    if (podValue.trim().length < 3) {
      setError("La référence de la preuve de livraison est obligatoire.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { type: podType, note: `Preuve de livraison ${podType}` };
      if (podType === "PHOTO") body.photoRef = podValue.trim();
      if (podType === "SIGNATURE") body.signatureRef = podValue.trim();
      if (podType === "OTP") body.otpCode = podValue.trim();

      await apiRequest(`/api/v1/shipments/${mission.id}/proof-of-delivery`, {
        method: "POST",
        token: session.token,
        body
      });
      setSuccess("Preuve de livraison enregistrée");
      setPodPanel(false);
      setPodValue("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Enregistrement impossible");
    } finally {
      setBusy(false);
    }
  }

  async function collectCod() {
    if (!session || !mission) return;
    const amount = Number(codAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Le montant encaissé doit être supérieur à zéro.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiRequest("/api/v1/cod", {
        method: "POST",
        token: session.token,
        body: { shipmentId: mission.id, amount, paymentMethod }
      });
      setSuccess(`Encaissement de ${amount.toFixed(2)} DH enregistré`);
      setCodPanel(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Encaissement impossible");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={shared.screen}>
        <View style={[shared.loadingBox, { paddingTop: 120 }]}>
          <ActivityIndicator color={colors.orange} size="large" />
          <Text style={shared.loadingText}>Chargement de la mission…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!mission) {
    return (
      <SafeAreaView style={shared.screen}>
        <View style={shared.content}>
          <View style={shared.errorBox}>
            <Text style={shared.errorText}>{error ?? "Mission introuvable"}</Text>
          </View>
          <TouchableOpacity style={shared.ghostBtn} onPress={() => router.back()}>
            <Text style={shared.ghostText}>Retour</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const style = STATUS_STYLE[mission.status];
  const next = NEXT_STATUS[mission.status] ?? [];
  const primaryNext = next.find((status) => status !== "DELIVERY_FAILED");
  const cod = Number(mission.codAmount ?? 0);
  const collected = mission.codCollection?.status === "COLLECTED";
  const hasPod = Boolean(mission.proofOfDelivery);

  return (
    <SafeAreaView style={shared.screen}>
      <ScrollView contentContainerStyle={shared.content}>
        <View style={shared.cardTop}>
          <Text style={shared.code}>{mission.trackingNumber}</Text>
          <View style={[shared.badge, { backgroundColor: style.bg }]}>
            <Text style={[shared.badgeText, { color: style.fg }]}>{STATUS_LABEL[mission.status]}</Text>
          </View>
        </View>

        <Text style={shared.cardTitle}>{mission.recipientName}</Text>
        <Text style={shared.cardLine}>{mission.recipientPhone}</Text>
        <Text style={shared.cardLine}>
          {mission.address}, {mission.city}
        </Text>
        <Text style={shared.cardLine}>
          {mission.merchant?.businessName ?? "—"}
          {mission.zone?.name ? ` · ${mission.zone.name}` : ""}
        </Text>
        {mission.notes ? <Text style={shared.cardLine}>Note : {mission.notes}</Text> : null}

        {cod > 0 ? (
          <View
            style={{
              marginTop: 14,
              backgroundColor: colors.orange050,
              borderRadius: 12,
              padding: 14,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between"
            }}
          >
            <Text style={{ color: colors.orange600, fontSize: 10, fontWeight: "800", letterSpacing: 1 }}>
              {collected ? "COD ENCAISSÉ" : "MONTANT À ENCAISSER"}
            </Text>
            <Text style={{ color: colors.navy, fontSize: 18, fontWeight: "900" }}>{cod.toFixed(2)} DH</Text>
          </View>
        ) : null}

        {error ? (
          <View style={[shared.errorBox, { marginTop: 14 }]}>
            <Text style={shared.errorText}>{error}</Text>
          </View>
        ) : null}
        {success ? (
          <View style={[shared.successBox, { marginTop: 14 }]}>
            <Text style={shared.successText}>{success}</Text>
          </View>
        ) : null}

        <Text style={shared.section}>Actions</Text>

        {primaryNext ? (
          <TouchableOpacity
            style={shared.primaryBtn}
            onPress={() => void changeStatus(primaryNext)}
            disabled={busy}
            accessibilityRole="button"
          >
            <Text style={shared.primaryText}>{ACTION_LABEL[primaryNext] ?? primaryNext}</Text>
          </TouchableOpacity>
        ) : null}

        {next.includes("DELIVERY_FAILED") ? (
          <TouchableOpacity
            style={shared.ghostBtn}
            onPress={() => setFailurePanel((value) => !value)}
            disabled={busy}
            accessibilityRole="button"
          >
            <Text style={shared.ghostText}>Signaler un échec de livraison</Text>
          </TouchableOpacity>
        ) : null}

        {failurePanel ? (
          <View style={shared.card}>
            <Text style={{ color: colors.navy, fontWeight: "800", fontSize: 13, marginBottom: 10 }}>
              Motif de l'échec
            </Text>
            {FAILURE_OUTCOMES.map((item) => (
              <TouchableOpacity
                key={item}
                onPress={() => setOutcome(item)}
                style={{
                  minHeight: 50,
                  justifyContent: "center",
                  borderWidth: 1,
                  borderColor: outcome === item ? colors.orange : colors.line,
                  backgroundColor: outcome === item ? colors.orange050 : colors.white,
                  borderRadius: 10,
                  paddingHorizontal: 14,
                  marginBottom: 8
                }}
                accessibilityRole="radio"
                accessibilityState={{ selected: outcome === item }}
              >
                <Text style={{ color: colors.navy, fontWeight: outcome === item ? "800" : "600", fontSize: 13 }}>
                  {OUTCOME_LABEL[item]}
                </Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={[shared.primaryBtn, { backgroundColor: colors.red }]}
              onPress={() => void changeStatus("DELIVERY_FAILED", outcome)}
              disabled={busy}
              accessibilityRole="button"
            >
              <Text style={shared.primaryText}>Enregistrer l'échec</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {mission.status === "DELIVERED" ? (
          <>
            <Text style={shared.section}>Preuve de livraison</Text>
            {hasPod ? (
              <View style={[shared.card, { backgroundColor: colors.green050 }]}>
                <Text style={{ color: "#14663C", fontSize: 13, fontWeight: "700" }}>
                  Preuve de livraison déjà enregistrée
                </Text>
              </View>
            ) : null}
            <TouchableOpacity
              style={shared.ghostBtn}
              onPress={() => setPodPanel((value) => !value)}
              disabled={busy || hasPod}
              accessibilityRole="button"
            >
              <Text style={shared.ghostText}>{hasPod ? "Preuve déjà envoyée" : "Ajouter une preuve de livraison"}</Text>
            </TouchableOpacity>

            {podPanel ? (
              <View style={shared.card}>
                {(["PHOTO", "SIGNATURE", "OTP"] as PodType[]).map((type) => (
                  <TouchableOpacity
                    key={type}
                    onPress={() => {
                      setPodType(type);
                      setPodValue("");
                    }}
                    style={{
                      minHeight: 50,
                      justifyContent: "center",
                      borderWidth: 1,
                      borderColor: podType === type ? colors.orange : colors.line,
                      backgroundColor: podType === type ? colors.orange050 : colors.white,
                      borderRadius: 10,
                      paddingHorizontal: 14,
                      marginBottom: 8
                    }}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: podType === type }}
                  >
                    <Text style={{ color: colors.navy, fontWeight: podType === type ? "800" : "600", fontSize: 13 }}>
                      {type === "PHOTO" ? "Photo" : type === "SIGNATURE" ? "Signature" : "Code OTP"}
                    </Text>
                  </TouchableOpacity>
                ))}
                <Text style={shared.label}>
                  {podType === "PHOTO"
                    ? "RÉFÉRENCE DE LA PHOTO"
                    : podType === "SIGNATURE"
                      ? "RÉFÉRENCE DE LA SIGNATURE"
                      : "CODE OTP REÇU DU DESTINATAIRE"}
                </Text>
                <TextInput
                  style={shared.input}
                  value={podValue}
                  onChangeText={setPodValue}
                  keyboardType={podType === "OTP" ? "number-pad" : "default"}
                  placeholder={podType === "OTP" ? "1234" : "uploads/pod/…"}
                  placeholderTextColor={colors.muted}
                />
                <TouchableOpacity
                  style={shared.primaryBtn}
                  onPress={() => void submitPod()}
                  disabled={busy}
                  accessibilityRole="button"
                >
                  <Text style={shared.primaryText}>Envoyer la preuve</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </>
        ) : null}

        {mission.status === "DELIVERED" && cod > 0 ? (
          <>
            <Text style={shared.section}>Encaissement COD</Text>
            {collected ? (
              <View style={[shared.card, { backgroundColor: colors.green050 }]}>
                <Text style={{ color: "#14663C", fontSize: 13, fontWeight: "700" }}>
                  Encaissement enregistré · référence {mission.codCollection?.reference}
                </Text>
                <Text style={{ color: "#14663C", fontSize: 12, marginTop: 4 }}>
                  {Number(mission.codCollection?.amount ?? 0).toFixed(2)} DH
                </Text>
              </View>
            ) : (
              <>
                <TouchableOpacity
                  style={shared.primaryBtn}
                  onPress={() => setCodPanel((value) => !value)}
                  disabled={busy}
                  accessibilityRole="button"
                >
                  <Text style={shared.primaryText}>Enregistrer l'encaissement</Text>
                </TouchableOpacity>

                {codPanel ? (
                  <View style={shared.card}>
                    <Text style={shared.label}>MONTANT ENCAISSÉ (DH)</Text>
                    <TextInput
                      style={shared.input}
                      value={codAmount}
                      onChangeText={setCodAmount}
                      keyboardType="decimal-pad"
                      placeholder="0.00"
                      placeholderTextColor={colors.muted}
                    />
                    <Text style={[shared.label, { marginTop: 14 }]}>MODE DE PAIEMENT</Text>
                    {(Object.keys(PAYMENT_METHOD_LABEL) as (keyof typeof PAYMENT_METHOD_LABEL)[]).map(
                      (method) => (
                        <TouchableOpacity
                          key={method}
                          onPress={() => setPaymentMethod(method)}
                          style={{
                            minHeight: 50,
                            justifyContent: "center",
                            borderWidth: 1,
                            borderColor: paymentMethod === method ? colors.orange : colors.line,
                            backgroundColor: paymentMethod === method ? colors.orange050 : colors.white,
                            borderRadius: 10,
                            paddingHorizontal: 14,
                            marginBottom: 8
                          }}
                          accessibilityRole="radio"
                          accessibilityState={{ selected: paymentMethod === method }}
                        >
                          <Text style={{ color: colors.navy, fontWeight: paymentMethod === method ? "800" : "600", fontSize: 13 }}>
                            {PAYMENT_METHOD_LABEL[method]}
                          </Text>
                        </TouchableOpacity>
                      )
                    )}
                    <TouchableOpacity
                      style={shared.primaryBtn}
                      onPress={() => void collectCod()}
                      disabled={busy}
                      accessibilityRole="button"
                    >
                      <Text style={shared.primaryText}>Valider l'encaissement</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
              </>
            )}
          </>
        ) : null}

        <Text style={shared.section}>Historique</Text>
        <View style={shared.card}>
          {mission.events.length === 0 ? (
            <Text style={shared.cardLine}>Aucun événement enregistré.</Text>
          ) : (
            mission.events
              .slice()
              .reverse()
              .map((event) => (
                <View key={event.id} style={{ marginBottom: 12 }}>
                  <Text style={{ color: colors.navy, fontSize: 12, fontWeight: "700" }}>
                    {STATUS_LABEL[event.toStatus]}
                  </Text>
                  <Text style={shared.cardLine}>
                    {new Date(event.createdAt).toLocaleString("fr-MA")}
                    {event.actor ? ` · ${event.actor.fullName}` : ""}
                  </Text>
                  {event.note ? <Text style={shared.cardLine}>{event.note}</Text> : null}
                </View>
              ))
          )}
        </View>

        <TouchableOpacity style={shared.ghostBtn} onPress={() => router.back()}>
          <Text style={shared.ghostText}>Retour aux missions</Text>
        </TouchableOpacity>

        <Text style={shared.footer}>EXO EXPRESS · Application livreur · v0.3.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}
