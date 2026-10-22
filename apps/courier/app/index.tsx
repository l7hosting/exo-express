import { useEffect, useState } from "react";
import { Redirect, useRouter } from "expo-router";
import { ActivityIndicator, RefreshControl, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { apiRequest, ApiError, NetworkError } from "../lib/api";
import { loadSession, clearSession, type Session } from "../lib/session";
import { colors, shared } from "../lib/theme";
import { STATUS_LABEL, STATUS_STYLE, type Mission, type MissionListResponse } from "../lib/types";

export default function MissionsScreen() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [booting, setBooting] = useState(true);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [totals, setTotals] = useState<{ codTotal: string; deliveryFeesTotal: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    void (async () => {
      const stored = await loadSession();
      setSession(stored);
      setBooting(false);
    })();
  }, []);

  const load = async (activeOnly: boolean) => {
    setError(null);
    try {
      const token = session?.token ?? null;
      const data = await apiRequest<MissionListResponse>(
        `/api/v1/courier/missions?activeOnly=${activeOnly ? "true" : "false"}`,
        { token }
      );
      setMissions(data.items ?? []);
      setTotals(data.totals ?? null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        await clearSession();
        setSession(null);
        setError("Votre session a expiré, reconnectez-vous.");
      } else if (err instanceof NetworkError) {
        setError(`${err.message}. Les missions déjà chargées restent visibles.`);
      } else {
        setError(err instanceof Error ? err.message : "Impossible de charger les missions");
      }
      setMissions([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (!booting && session) {
      void load(showHistory);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booting, session, showHistory]);

  if (booting) {
    return (
      <SafeAreaView style={shared.screen}>
        <View style={[shared.loadingBox, { paddingTop: 120 }]}>
          <ActivityIndicator color={colors.orange} size="large" />
          <Text style={shared.loadingText}>Ouverture de l'espace livreur…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!session) {
    return <Redirect href="/login" />;
  }

  const pending = missions.filter((mission) => mission.status !== "DELIVERED").length;
  const delivered = missions.filter((mission) => mission.status === "DELIVERED").length;

  return (
    <SafeAreaView style={shared.screen}>
      <ScrollView
        contentContainerStyle={shared.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load(showHistory);
            }}
          />
        }
      >
        <View style={shared.brandRow}>
          {/* Replace with the official logo image: <Image source={require("../assets/logo.png")} ... /> */}
          <View style={shared.logoMark}>
            <Text style={shared.logoMarkText}>EX</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={shared.brand}>EXO EXPRESS</Text>
            <Text style={shared.subBrand}>ESPACE LIVREUR</Text>
          </View>
          <TouchableOpacity
            onPress={async () => {
              await clearSession();
              setSession(null);
              router.replace("/login");
            }}
            accessibilityRole="button"
            style={{ padding: 10 }}
          >
            <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700" }}>Déconnexion</Text>
          </TouchableOpacity>
        </View>

        <View
          style={{
            backgroundColor: colors.navy,
            borderRadius: 18,
            padding: 22,
            marginBottom: 18
          }}
        >
          <Text style={{ color: colors.orange, fontSize: 10, letterSpacing: 1.8, fontWeight: "800" }}>
            VOTRE JOURNÉE
          </Text>
          <Text style={{ color: colors.white, fontSize: 24, fontWeight: "800", marginTop: 12 }}>
            Bonjour, {session.user.fullName.split(" ")[0]}.
          </Text>
          <Text style={{ color: "#D6E0F0", fontSize: 12, lineHeight: 19, marginTop: 8 }}>
            Vos missions et vos encaissements COD sont réunis sur un seul écran.
          </Text>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              marginTop: 24,
              borderTopWidth: 1,
              borderTopColor: colors.navyLine,
              paddingTop: 18
            }}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.white, fontSize: 22, fontWeight: "800" }}>{missions.length}</Text>
              <Text style={{ color: "#D6E0F0", fontSize: 10, marginTop: 4 }}>Missions</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.white, fontSize: 22, fontWeight: "800" }}>{delivered}</Text>
              <Text style={{ color: "#D6E0F0", fontSize: 10, marginTop: 4 }}>Livrées</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.white, fontSize: 22, fontWeight: "800" }}>
                {pending}
              </Text>
              <Text style={{ color: "#D6E0F0", fontSize: 10, marginTop: 4 }}>En cours</Text>
            </View>
          </View>
        </View>

        {error ? (
          <View style={shared.errorBox}>
            <Text style={shared.errorText}>{error}</Text>
          </View>
        ) : null}

        <View style={{ flexDirection: "row", gap: 10, marginTop: 4 }}>
          <TouchableOpacity
            onPress={() => setShowHistory(false)}
            style={{
              flex: 1,
              minHeight: 48,
              borderRadius: 12,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: showHistory ? colors.white : colors.orange,
              borderWidth: 1,
              borderColor: showHistory ? colors.line : colors.orange
            }}
            accessibilityRole="button"
          >
            <Text style={{ fontWeight: "800", fontSize: 13, color: showHistory ? colors.navy : colors.white }}>
              Missions en cours
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setShowHistory(true)}
            style={{
              flex: 1,
              minHeight: 48,
              borderRadius: 12,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: showHistory ? colors.orange : colors.white,
              borderWidth: 1,
              borderColor: showHistory ? colors.orange : colors.line
            }}
            accessibilityRole="button"
          >
            <Text style={{ fontWeight: "800", fontSize: 13, color: showHistory ? colors.white : colors.navy }}>
              Historique
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={shared.section}>{showHistory ? "Toutes mes missions" : "Missions du jour"}</Text>

        {loading ? (
          <View style={shared.loadingBox}>
            <ActivityIndicator color={colors.orange} size="large" />
            <Text style={shared.loadingText}>Chargement des missions…</Text>
          </View>
        ) : missions.length === 0 ? (
          <View style={shared.emptyBox}>
            <Text style={shared.emptyTitle}>Aucune mission</Text>
            <Text style={shared.emptyText}>
              {showHistory
                ? "Vous n'avez encore aucune mission enregistrée."
                : "Vos nouvelles missions apparaîtront ici dès l'affectation."}
            </Text>
          </View>
        ) : (
          missions.map((mission) => {
            const style = STATUS_STYLE[mission.status];
            const cod = Number(mission.codAmount ?? 0);
            const collected = mission.codCollection?.status === "COLLECTED";
            return (
              <TouchableOpacity
                key={mission.id}
                style={shared.card}
                onPress={() => router.push(`/mission/${mission.id}`)}
                accessibilityRole="button"
                accessibilityLabel={`Ouvrir la mission ${mission.trackingNumber}`}
              >
                <View style={shared.cardTop}>
                  <Text style={shared.code}>{mission.trackingNumber}</Text>
                  <View style={[shared.badge, { backgroundColor: style.bg }]}>
                    <Text style={[shared.badgeText, { color: style.fg }]}>
                      {STATUS_LABEL[mission.status]}
                    </Text>
                  </View>
                </View>
                <Text style={shared.cardTitle}>{mission.recipientName}</Text>
                <Text style={shared.cardLine}>{mission.recipientPhone}</Text>
                <Text style={shared.cardLine}>
                  {mission.address}, {mission.city}
                </Text>
                {cod > 0 ? (
                  <View
                    style={{
                      marginTop: 14,
                      backgroundColor: colors.orange050,
                      borderRadius: 12,
                      padding: 12,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between"
                    }}
                  >
                    <Text style={{ color: colors.orange600, fontSize: 10, fontWeight: "800", letterSpacing: 1 }}>
                      {collected ? "COD ENCAISSÉ" : "À ENCAISSER"}
                    </Text>
                    <Text style={{ color: colors.navy, fontSize: 16, fontWeight: "900" }}>
                      {cod.toFixed(2)} DH
                    </Text>
                  </View>
                ) : null}
                <View
                  style={{
                    marginTop: 14,
                    backgroundColor: colors.navy,
                    borderRadius: 12,
                    minHeight: 52,
                    alignItems: "center",
                    justifyContent: "center"
                  }}
                >
                  <Text style={{ color: colors.white, fontSize: 14, fontWeight: "800" }}>
                    Ouvrir la mission
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })
        )}

        {totals ? (
          <View
            style={{
              marginTop: 18,
              backgroundColor: colors.white,
              borderColor: colors.line,
              borderWidth: 1,
              borderRadius: 14,
              padding: 16
            }}
          >
            <Text style={{ color: colors.navy, fontWeight: "800", fontSize: 13 }}>Récapitulatif</Text>
            <Text style={{ color: colors.muted, fontSize: 12, marginTop: 8 }}>
              COD cumulé : {Number(totals.codTotal).toFixed(2)} DH
            </Text>
            <Text style={{ color: colors.muted, fontSize: 12, marginTop: 4 }}>
              Frais de livraison : {Number(totals.deliveryFeesTotal).toFixed(2)} DH
            </Text>
          </View>
        ) : null}

        <Text style={shared.footer}>EXO EXPRESS · Application livreur · v0.3.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}
