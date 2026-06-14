"use client";
import { usePathname } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useState, useEffect } from "react";
import {
  LayoutDashboard,
  Users,
  UserPlus,
  Upload,
  Settings,
  LogOut,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  Building2,
} from "lucide-react";
import { cn } from "@/lib/cn";
import type { StaffingSession } from "@/types";

const navItems = [
  { label: "Dashboard", href: "/staffing/portal", icon: LayoutDashboard, exact: true },
  { label: "Resources", href: "/staffing/portal/resources", icon: Users },
  { label: "Add Resource", href: "/staffing/portal/resources/new", icon: UserPlus },
  { label: "Bulk Upload", href: "/staffing/portal/resources/upload", icon: Upload },
  { label: "Profile", href: "/staffing/portal/profile", icon: Settings },
];

interface StaffingSidebarProps {
  session: StaffingSession;
  companyName: string;
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
          active ? "text-violet-400" : "text-text-muted group-hover:text-text-dim"
        )}
      />
      {!collapsed && <span className="truncate">{label}</span>}
    </Link>
  );
}

export function StaffingSidebar({ session, companyName }: StaffingSidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const isActive = (href: string, exact = false) => {
    if (exact) return pathname === href;
    return pathname.startsWith(href);
  };

  const SidebarInner = ({ mobile = false }: { mobile?: boolean }) => (
    <div className="flex flex-col h-full overflow-hidden">
      <div
        className={cn(
          "flex items-center h-14 px-4 border-b border-border shrink-0",
          collapsed && !mobile ? "justify-center px-3" : "gap-2.5"
        )}
      >
        {collapsed && !mobile ? (
          <Image src="/logo.png" alt="Sajal Tech" width={28} height={28} className="w-7 h-7 object-contain" />
        ) : (
          <Image src="/logo.png" alt="Sajal Tech" width={100} height={34} className="h-6 w-auto" />
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

      {/* Vendor badge */}
      {(!collapsed || mobile) && (
        <div className="mx-3 mt-3 px-3 py-2 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center gap-2">
          <Building2 className="w-3.5 h-3.5 text-violet-400 shrink-0" />
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-violet-400/70">Vendor Portal</p>
            <p className="text-xs font-medium text-text-light truncate">{companyName}</p>
          </div>
        </div>
      )}

      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {navItems.map((item) => (
          <NavItem
            key={item.href}
            href={item.href}
            icon={item.icon}
            label={item.label}
            active={isActive(item.href, item.exact)}
            collapsed={collapsed && !mobile}
            onClick={mobile ? () => setMobileOpen(false) : undefined}
          />
        ))}
      </nav>

      <div className="border-t border-border px-2 py-3 shrink-0">
        <div className={cn("mt-2 pt-2 border-t border-border", collapsed && !mobile ? "flex justify-center" : "")}>
          {collapsed && !mobile ? (
            <form action="/api/staffing/auth/logout" method="POST">
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
              <div className="w-7 h-7 rounded-lg bg-violet-500/15 flex items-center justify-center shrink-0">
                <span className="font-display font-bold text-xs text-violet-400">
                  {session.name.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-text-light truncate leading-tight">{session.name}</p>
                <p className="text-[10px] text-text-muted truncate leading-tight">{session.email}</p>
              </div>
              <form action="/api/staffing/auth/logout" method="POST">
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
      <aside
        className={cn(
          "hidden lg:flex flex-col bg-bg-secondary border-r border-border h-screen sticky top-0 transition-all duration-250 shrink-0",
          collapsed ? "w-14" : "w-[220px]"
        )}
      >
        <SidebarInner />
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

      <button
        className="lg:hidden fixed top-3.5 left-3.5 z-40 w-9 h-9 flex items-center justify-center rounded-lg bg-bg-secondary border border-border shadow-sm"
        onClick={() => setMobileOpen(true)}
        aria-label="Open navigation"
      >
        <Menu className="w-4 h-4 text-text-light" />
      </button>

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
