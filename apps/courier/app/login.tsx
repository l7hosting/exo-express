import { useState } from "react";
import { useRouter } from "expo-router";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { apiRequest, ApiError, NetworkError } from "../lib/api";
import { saveSession, type Session } from "../lib/session";
import { colors, shared } from "../lib/theme";

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!email.trim() || !password) {
      setError("Renseignez votre email et votre mot de passe.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const session = await apiRequest<Session>("/api/v1/auth/login", {
        method: "POST",
        body: { email: email.trim().toLowerCase(), password }
      });
      await saveSession(session);
      router.replace("/");
    } catch (err) {
      if (err instanceof ApiError) {
        setError(
          err.status === 401
            ? "Identifiants incorrects."
            : err.status === 403
              ? "Ce compte n'est pas autorisé à utiliser l'application livreur."
              : err.message
        );
      } else if (err instanceof NetworkError) {
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : "Connexion impossible");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={shared.screen}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView contentContainerStyle={shared.content} keyboardShouldPersistTaps="handled">
          <View style={shared.brandRow}>
            {/* Replace with the official logo image: <Image source={require("../assets/logo.png")} ... /> */}
            <View style={shared.logoMark}>
              <Text style={shared.logoMarkText}>EX</Text>
            </View>
            <View>
              <Text style={shared.brand}>EXO EXPRESS</Text>
              <Text style={shared.subBrand}>ESPACE LIVREUR</Text>
            </View>
          </View>

          <Text style={{ color: colors.navy, fontSize: 24, fontWeight: "800", marginTop: 12 }}>
            Connexion livreur
          </Text>
          <Text style={{ color: colors.muted, fontSize: 13, marginTop: 8, lineHeight: 19 }}>
            Accédez à vos missions, déclarez vos livraisons et enregistrez vos encaissements COD.
          </Text>

          {error ? (
            <View style={[shared.errorBox, { marginTop: 18 }]}>
              <Text style={shared.errorText}>{error}</Text>
            </View>
          ) : null}

          <View style={{ marginTop: 22 }}>
            <Text style={shared.label}>EMAIL PROFESSIONNEL</Text>
            <TextInput
              style={shared.input}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              placeholder="prenom.nom@exoexpress.ma"
              placeholderTextColor={colors.muted}
            />
          </View>

          <View style={shared.field}>
            <Text style={shared.label}>MOT DE PASSE</Text>
            <TextInput
              style={shared.input}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              placeholder="••••••••"
              placeholderTextColor={colors.muted}
            />
          </View>

          <TouchableOpacity
            style={[shared.primaryBtn, busy ? { opacity: 0.6 } : null]}
            onPress={() => void submit()}
            disabled={busy}
            accessibilityRole="button"
          >
            {busy ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={shared.primaryText}>Se connecter</Text>
            )}
          </TouchableOpacity>

          <Text style={shared.footer}>EXO EXPRESS · Application livreur · v0.3.0</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
