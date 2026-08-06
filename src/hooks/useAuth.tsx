import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "@tanstack/react-router";

export type AppRole = "inspection_manager" | "inspector";

export const MOCK_SESSION_STORAGE_KEY = "wgdeepinsight-mock-session";

type MockUser = {
  id: string;
  email: string;
  name: string;
  role: AppRole;
};

type AuthState = {
  session: { user: MockUser } | null;
  user: MockUser | null;
  role: AppRole | null;
  name: string;
  loading: boolean;
  isManager: boolean;
  signIn: (email: string, password: string) => Promise<{ ok: boolean; message?: string }>;
  signOut: () => void;
};

const AuthContext = createContext<AuthState>({
  session: null,
  user: null,
  role: null,
  name: "",
  loading: true,
  isManager: false,
  signIn: async () => ({ ok: false, message: "Not implemented" }),
  signOut: () => undefined,
});

const MOCK_USERS: Record<string, MockUser> = {
  "manager@wgtech.com": {
    id: "manager-1",
    email: "manager@wgtech.com",
    name: "Aarav Singh",
    role: "inspection_manager",
  },
  "inspector@wgtech.com": {
    id: "inspector-1",
    email: "inspector@wgtech.com",
    name: "Riya Patel",
    role: "inspector",
  },
};

const MOCK_PASSWORDS: Record<string, string> = {
  "manager@wgtech.com": "Manager@123",
  "inspector@wgtech.com": "Inspector@123",
};

function getStoredSession() {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(MOCK_SESSION_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as { user: MockUser };
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<{ user: MockUser } | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const stored = getStoredSession();
    if (stored?.user) {
      setSession(stored);
      setRole(stored.user.role);
      setName(stored.user.name);
    }
    setLoading(false);
  }, []);

  const signIn = useMemo(
    () => async (email: string, password: string) => {
      const normalizedEmail = email.trim().toLowerCase();
      const user = MOCK_USERS[normalizedEmail];
      const expectedPassword = MOCK_PASSWORDS[normalizedEmail];

      if (!user || password !== expectedPassword) {
        return { ok: false, message: "Invalid email or password." };
      }

      const nextSession = { user };
      if (typeof window !== "undefined") {
        window.localStorage.setItem("wgdeepinsight-mock-session", JSON.stringify(nextSession));
      }
      setSession(nextSession);
      setRole(user.role);
      setName(user.name);
      router.invalidate();
      return { ok: true };
    },
    [router],
  );

  const signOut = () => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("wgdeepinsight-mock-session");
    }
    setSession(null);
    setRole(null);
    setName("");
    router.invalidate();
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        role,
        name,
        loading,
        isManager: role === "inspection_manager",
        signIn,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
