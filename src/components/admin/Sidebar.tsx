"use client";
import { usePathname } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useState, useEffect } from "react";
import {
  LayoutDashboard,
  Briefcase,
  Users,
  Mail,
  Search,
  BarChart3,
  Settings,
  Bell,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
  FileX2,
  Building2,
  Layers,
} from "lucide-react";
import { cn } from "@/lib/cn";
import type { AdminSession } from "@/types";

const navGroups = [
  {
    label: "Main",
    items: [
      { label: "Dashboard", href: "/admin", icon: LayoutDashboard, exact: true },
      { label: "Requirements", href: "/admin/requirements", icon: Briefcase },
      { label: "Candidates", href: "/admin/candidates", icon: Users },
      { label: "Talent Pool", href: "/admin/pool", icon: Layers },
      { label: "Incomplete", href: "/admin/drafts", icon: FileX2 },
    ],
  },
  {
    label: "Outreach",
    items: [
      { label: "Email", href: "/admin/email", icon: Mail },
      { label: "Sourcing", href: "/admin/prospects", icon: Search },
    ],
  },
  {
    label: "Staffing",
    items: [
      { label: "Overview", href: "/admin/staffing", icon: Building2, exact: true },
      { label: "Companies", href: "/admin/staffing/companies", icon: Building2 },
      { label: "Resources", href: "/admin/staffing/resources", icon: Users },
    ],
  },
  {
    label: "Insights",
    items: [
      { label: "Analytics", href: "/admin/analytics", icon: BarChart3 },
    ],
  },
];

interface SidebarProps {
  session: AdminSession;
  unreadCount?: number;
}

function NavItem({
  href,
  icon: Icon,
  label,
  active,
  collapsed,
  onClick,
}: {
  href: string;
  icon: React.ElementType;
  label: string;
  active: boolean;
  collapsed: boolean;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      title={collapsed ? label : undefined}
      className={cn(
        "nav-link group",
        collapsed ? "justify-center px-2" : "",
        active ? "active" : ""
      )}
    >
      <Icon
        className={cn(
          "w-[18px] h-[18px] shrink-0 transition-colors",
          active ? "text-primary" : "text-text-muted group-hover:text-text-dim"
        )}
      />
      {!collapsed && <span className="truncate">{label}</span>}
    </Link>
  );
}

export function Sidebar({ session, unreadCount = 0 }: SidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const isActive = (href: string, exact = false) => {
    if (exact) return pathname === href;
    return pathname.startsWith(href);
  };

  const SidebarInner = ({ mobile = false }: { mobile?: boolean }) => (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Logo */}
      <div
        className={cn(
          "flex items-center h-14 px-4 border-b border-border shrink-0",
          collapsed && !mobile ? "justify-center px-3" : "gap-2.5"
        )}
      >
        {collapsed && !mobile ? (
          <Image src="/logo.png" alt="Sajal Tech" width={28} height={28} className="w-7 h-7 object-contain" />
        ) : (
          <>
            <Image src="/logo.png" alt="Sajal Tech" width={100} height={34} className="h-6 w-auto" />
          </>
        )}
        {mobile && (
          <button
            className="ml-auto w-7 h-7 flex items-center justify-center rounded-lg hover:bg-bg-hover text-text-muted"
            onClick={() => setMobileOpen(false)}
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
        {navGroups.map((group) => (
          <div key={group.label}>
            {(!collapsed || mobile) && (
              <p className="px-2 mb-1 text-[10px] font-semibold uppercase tracking-widest text-text-muted/60">
                {group.label}
              </p>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <NavItem
                  key={item.href}
                  href={item.href}
                  icon={item.icon}
                  label={item.label}
                  active={isActive(item.href, (item as { exact?: boolean }).exact)}
                  collapsed={collapsed && !mobile}
                  onClick={mobile ? () => setMobileOpen(false) : undefined}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Bottom section */}
      <div className="border-t border-border px-2 py-3 space-y-0.5 shrink-0">
        {/* Notifications */}
        <Link
          href="/admin/notifications"
          onClick={mobile ? () => setMobileOpen(false) : undefined}
          title={collapsed && !mobile ? "Notifications" : undefined}
          className={cn(
            "nav-link relative group",
            collapsed && !mobile ? "justify-center px-2" : "",
            isActive("/admin/notifications") ? "active" : ""
          )}
        >
          <div className="relative shrink-0">
            <Bell
              className={cn(
                "w-[18px] h-[18px] transition-colors",
                isActive("/admin/notifications") ? "text-primary" : "text-text-muted group-hover:text-text-dim"
              )}
            />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-primary text-white text-[8px] font-bold flex items-center justify-center leading-none">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </div>
          {(!collapsed || mobile) && <span className="truncate">Notifications</span>}
          {(!collapsed || mobile) && unreadCount > 0 && (
            <span className="ml-auto badge badge-blue shrink-0">{unreadCount}</span>
          )}
        </Link>

        {/* Settings */}
        <NavItem
          href="/admin/settings"
          icon={Settings}
          label="Settings"
          active={isActive("/admin/settings")}
          collapsed={collapsed && !mobile}
          onClick={mobile ? () => setMobileOpen(false) : undefined}
        />

        {/* User + logout */}
        <div className={cn("mt-2 pt-2 border-t border-border", collapsed && !mobile ? "flex justify-center" : "")}>
          {collapsed && !mobile ? (
            <form action="/api/admin/auth/logout" method="POST">
              <button
                type="submit"
                title="Sign out"
                className="w-9 h-9 flex items-center justify-center rounded-lg text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-all"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </form>
          ) : (
            <div className="flex items-center gap-2.5 px-2 py-2">
              <div className="w-7 h-7 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
                <span className="font-display font-bold text-xs text-primary">
                  {session.name.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-text-light truncate leading-tight" title={session.name}>
                  {session.name}
                </p>
                <p className="text-[10px] text-text-muted truncate leading-tight" title={session.email}>
                  {session.email}
                </p>
              </div>
              <form action="/api/admin/auth/logout" method="POST">
                <button
                  type="submit"
                  title="Sign out"
                  className="w-7 h-7 flex items-center justify-center rounded-lg text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-all shrink-0"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "hidden lg:flex flex-col bg-bg-secondary border-r border-border h-screen sticky top-0 transition-all duration-250 shrink-0",
          collapsed ? "w-14" : "w-[220px]"
        )}
      >
        <SidebarInner />
        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="absolute -right-3 top-14 mt-3 w-5.5 h-5.5 rounded-full bg-bg-secondary border border-border flex items-center justify-center hover:bg-bg-hover transition-colors z-10 shadow-xs"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <ChevronRight className="w-3 h-3 text-text-muted" />
          ) : (
            <ChevronLeft className="w-3 h-3 text-text-muted" />
          )}
        </button>
      </aside>

      {/* Mobile hamburger */}
      <button
        className="lg:hidden fixed top-3.5 left-3.5 z-40 w-9 h-9 flex items-center justify-center rounded-lg bg-bg-secondary border border-border shadow-sm"
        onClick={() => setMobileOpen(true)}
        aria-label="Open navigation"
      >
        <Menu className="w-4 h-4 text-text-light" />
      </button>

      {/* Mobile drawer */}
      {mobileOpen && (
        <>
          <div
            className="lg:hidden fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <div className="lg:hidden fixed left-0 top-0 bottom-0 z-50 w-64 bg-bg-secondary border-r border-border shadow-lg">
            <SidebarInner mobile />
          </div>
        </>
      )}
    </>
  );
}
