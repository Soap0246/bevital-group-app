"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  BarChart3, Building2, CalendarCheck, CreditCard, Home, LayoutDashboard, Layers, Menu, Settings, ShieldCheck, Star, Stethoscope, Tag, Ticket, Users, X, type LucideIcon,
} from "lucide-react";

const NAV: Array<{ href: string; label: string; icon: LucideIcon }> = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/bookings", label: "Bookings", icon: CalendarCheck },
  { href: "/patients", label: "Patients", icon: Users },
  { href: "/therapists", label: "Physiotherapists", icon: Stethoscope },
  { href: "/verification", label: "Verification", icon: ShieldCheck },
  { href: "/services", label: "Services", icon: Layers },
  { href: "/pricing", label: "Pricing", icon: Tag },
  { href: "/clinics", label: "Clinics", icon: Building2 },
  { href: "/home-visits", label: "Home visits", icon: Home },
  { href: "/payments", label: "Payments", icon: CreditCard },
  { href: "/promotions", label: "Packages & promos", icon: Ticket },
  { href: "/reviews", label: "Reviews", icon: Star },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar({ logo, user, signOut }: { logo: React.ReactNode; user: { name: string; email: string }; signOut: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const active = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <>
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-surface px-4 py-3 lg:hidden">
        {logo}
        <button type="button" onClick={() => setOpen((o) => !o)} aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} className="grid size-11 place-items-center rounded-xl border border-line">
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>
      <aside className={`${open ? "block" : "hidden"} fixed inset-x-0 top-[73px] bottom-0 z-20 overflow-y-auto border-r border-line bg-surface p-4 lg:sticky lg:top-0 lg:block lg:h-screen lg:w-64 lg:shrink-0`} aria-label="Primary">
        <div className="mb-6 hidden px-2 pt-2 lg:block">{logo}</div>
        <nav className="space-y-1">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} onClick={() => setOpen(false)} aria-current={active(href) ? "page" : undefined}
              className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition-colors ${active(href) ? "bg-brand text-white shadow-[0_6px_14px_rgba(76,122,18,0.25)]" : "text-ink-soft hover:bg-brand-light hover:text-brand-dark"}`}>
              <Icon className="size-5 shrink-0" aria-hidden />
              {label}
            </Link>
          ))}
        </nav>
        <div className="mt-8 border-t border-line pt-4">
          <p className="truncate px-2 text-sm font-semibold text-ink">{user.name}</p>
          <p className="truncate px-2 text-xs text-muted">{user.email}</p>
          <div className="mt-3 px-2">{signOut}</div>
        </div>
      </aside>
    </>
  );
}
