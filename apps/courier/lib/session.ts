import AsyncStorage from "@react-native-async-storage/async-storage";

export type CourierRole =
  | "SUPER_ADMIN"
  | "ADMIN"
  | "OPERATIONS"
  | "DISPATCHER"
  | "DEPOT_AGENT"
  | "COURIER"
  | "MERCHANT"
  | "ACCOUNTANT"
  | "SUPPORT";

export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  role: CourierRole;
}

export interface Session {
  token: string;
  expiresAt: string;
  user: SessionUser;
}

const SESSION_KEY = "exo.courier.session";

export async function loadSession(): Promise<Session | null> {
  try {
    const raw = await AsyncStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as Session;
    if (!session?.token || !session?.user?.id) {
      await AsyncStorage.removeItem(SESSION_KEY);
      return null;
    }
    if (session.expiresAt && new Date(session.expiresAt).getTime() <= Date.now()) {
      await AsyncStorage.removeItem(SESSION_KEY);
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

export async function saveSession(session: Session): Promise<void> {
  try {
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // Storage failures must never block the login: the session simply stays
    // in memory for the current run.
  }
}

export async function clearSession(): Promise<void> {
  try {
    await AsyncStorage.removeItem(SESSION_KEY);
  } catch {
    // ignore
  }
}
