import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  BarChart3,
  Box,
  ChevronsLeft,
  ClipboardCheck,
  Cpu,
  FileText,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  Ruler,
  Settings,
  Users,
} from "lucide-react";
import { useState, type ReactNode } from "react";

import { WgLogo } from "@/lib/brand";
import { cn } from "@/lib/utils";
import { MOCK_SESSION_STORAGE_KEY, useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";

type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  managerOnly?: boolean;
  badge?: number;
};

const NAV: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/inspection", label: "Inspection", icon: ClipboardCheck },
  { to: "/analytics", label: "Analytics", icon: BarChart3, managerOnly: true },
  { to: "/history", label: "History", icon: History },
  { to: "/models", label: "Models", icon: Cpu, managerOnly: true },
  { to: "/specifications", label: "Specifications", icon: Ruler },
  { to: "/parts", label: "Parts", icon: Box, managerOnly: true },
  { to: "/reports", label: "Reports", icon: FileText },
  { to: "/users", label: "Users", icon: Users, managerOnly: true },
  { to: "/settings", label: "Settings", icon: Settings },
];

export function AppShell({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const { isManager, name, user, role } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const items = NAV.filter((item) => {
    if (isManager && item.to === "/inspection") return false;
    return !item.managerOnly || isManager;
  });
  const initials = (name || user?.email || "U").slice(0, 1).toUpperCase();

  async function signOut() {
    queryClient.cancelQueries();
    queryClient.clear();
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(MOCK_SESSION_STORAGE_KEY);
      window.location.assign("/auth");
      return;
    }
    navigate({ to: "/auth", replace: true });
  }

  const sidebar = (
    <div
      className={cn(
        "flex h-full flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200",
        collapsed ? "w-19" : "w-62",
      )}
    >
      <div className="flex h-16 items-center px-4">
        <WgLogo compact={collapsed} />
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
        {items.map((item) => {
          const active = pathname === item.to || pathname.startsWith(`${item.to}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={() => setMobileOpen(false)}
              className={cn(
                "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 type-body-m font-medium transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
              title={collapsed ? item.label : undefined}
            >
              {active && (
                <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-primary" />
              )}
              <Icon className="size-4.5 shrink-0" />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      <div className="space-y-1 border-t border-sidebar-border p-3">
        <button
          onClick={signOut}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 type-body-m font-medium text-muted-foreground transition-colors hover:bg-error/10 hover:text-error"
        >
          <LogOut className="size-4.5 shrink-0" />
          {!collapsed && <span>Logout</span>}
        </button>
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="hidden w-full items-center gap-3 rounded-lg px-3 py-2.5 type-body-s font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:flex"
        >
          <ChevronsLeft className={cn("size-4.5 transition-transform", collapsed && "rotate-180")} />
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="sticky top-0 hidden h-screen lg:block">{sidebar}</aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-foreground/40"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
          <div className="absolute inset-y-0 left-0">{sidebar}</div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-border bg-card/95 px-4 py-3 backdrop-blur md:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation"
            >
              <Menu className="size-5" />
            </Button>
            <div className="min-w-0">
              <h1 className="type-h-xs truncate text-foreground">{title}</h1>
              {subtitle && <p className="type-body-s truncate text-muted-foreground">{subtitle}</p>}
            </div>
          </div>

          <div className="flex items-center gap-3">
            {actions}
            <span className="hidden items-center gap-1.5 rounded-full bg-brand-blue-subtle px-3 py-1 type-caption font-semibold text-brand-blue-text sm:inline-flex">
              <Activity className="size-3" />
              {role === "inspection_manager" ? "Inspection Manager" : "Inspector"}
            </span>
            <span className="flex size-9 items-center justify-center rounded-full bg-brand-blue type-body-m font-semibold text-primary-foreground">
              {initials}
            </span>
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
