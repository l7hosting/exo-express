import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { colors } from "../lib/theme";

export default function RootLayout() {
  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.navy },
          headerTintColor: "#FFFFFF",
          headerTitleStyle: { fontWeight: "800", fontSize: 15 },
          contentStyle: { backgroundColor: colors.bg }
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="mission/[id]" options={{ title: "Mission" }} />
      </Stack>
    </>
  );
}
