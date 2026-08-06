import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { MOCK_SESSION_STORAGE_KEY } from "@/hooks/useAuth";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    if (typeof window === "undefined") throw redirect({ to: "/auth" });

    const raw = window.localStorage.getItem(MOCK_SESSION_STORAGE_KEY);
    if (!raw) throw redirect({ to: "/auth" });

    try {
      const session = JSON.parse(raw) as { user?: { id: string; email: string; name: string; role: string } };
      if (!session.user?.id) throw redirect({ to: "/auth" });
      return { user: session.user };
    } catch {
      throw redirect({ to: "/auth" });
    }
  },
  component: () => <Outlet />,
});
