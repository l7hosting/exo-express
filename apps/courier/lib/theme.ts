import { StyleSheet } from "react-native";

export const colors = {
  orange: "#F36A0A",
  orange600: "#D85C05",
  orange050: "#FFF1E6",
  navy: "#071A42",
  navy700: "#0E2A5C",
  navyLine: "#1E3568",
  bg: "#F4F6F8",
  white: "#FFFFFF",
  muted: "#748494",
  line: "#E5EBEF",
  green: "#1F9254",
  green050: "#E6F4EC",
  red: "#B42318",
  red050: "#FEECEB",
  blue: "#1D4ED8",
  blue050: "#E8EEFD",
  amber: "#B54708",
  amber050: "#FFF4E5"
} as const;

export const shared = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 18, paddingTop: 24, paddingBottom: 40 },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 20 },
  logoMark: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.orange,
    alignItems: "center",
    justifyContent: "center"
  },
  logoMarkText: { color: colors.navy, fontWeight: "900", fontSize: 16 },
  brand: { color: colors.navy, fontWeight: "900", letterSpacing: 2, fontSize: 13 },
  subBrand: { color: colors.muted, fontSize: 9, letterSpacing: 1.8, marginTop: 4 },
  section: { color: colors.navy, fontSize: 16, fontWeight: "800", marginTop: 22, marginBottom: 10 },
  card: {
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    marginTop: 10
  },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  code: { color: colors.navy, fontSize: 11, fontWeight: "800" },
  badge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  badgeText: { fontSize: 10, fontWeight: "800" },
  cardTitle: { color: colors.navy, fontSize: 15, fontWeight: "700", marginTop: 12 },
  cardLine: { color: colors.muted, fontSize: 12, marginTop: 5, lineHeight: 18 },
  loadingBox: { alignItems: "center", paddingVertical: 34, gap: 12 },
  loadingText: { color: colors.muted, fontSize: 12 },
  emptyBox: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.line,
    borderRadius: 14,
    padding: 26,
    alignItems: "center"
  },
  emptyTitle: { color: colors.navy, fontWeight: "800", fontSize: 14, marginBottom: 6 },
  emptyText: { color: colors.muted, fontSize: 12, textAlign: "center" },
  errorBox: {
    backgroundColor: colors.red050,
    borderColor: "#F3C9C5",
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8
  },
  errorText: { color: colors.red, fontSize: 12 },
  successBox: {
    backgroundColor: colors.green050,
    borderColor: "#B9E0C9",
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8
  },
  successText: { color: "#14663C", fontSize: 12 },
  primaryBtn: {
    marginTop: 14,
    backgroundColor: colors.orange,
    borderRadius: 12,
    minHeight: 54,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16
  },
  primaryText: { color: colors.white, fontSize: 15, fontWeight: "800" },
  ghostBtn: {
    marginTop: 10,
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 12,
    minHeight: 54,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16
  },
  ghostText: { color: colors.navy, fontSize: 14, fontWeight: "700" },
  dangerBtn: {
    marginTop: 10,
    backgroundColor: colors.red,
    borderRadius: 12,
    minHeight: 54,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16
  },
  dangerText: { color: colors.white, fontSize: 15, fontWeight: "800" },
  input: {
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    minHeight: 54,
    fontSize: 15,
    color: colors.navy,
    backgroundColor: colors.white
  },
  label: { color: "#475467", fontSize: 11, fontWeight: "700", marginBottom: 6 },
  field: { marginBottom: 14 },
  footer: { color: "#91A0AC", fontSize: 10, marginTop: 30, textAlign: "center" }
});
