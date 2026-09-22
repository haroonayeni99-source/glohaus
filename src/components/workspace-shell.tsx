import Link from "next/link";
import {
  ArrowUpRight,
  LayoutDashboard,
  ShieldCheck,
  Users,
  CalendarDays,
  Sparkles,
  WalletCards,
} from "lucide-react";
import { Brand } from "./brand";
import { AccountControls } from "./account-controls";
import type { Account, Role } from "@/modules/accounts/domain";

const roles: Record<Role, { title: string; path: string }> = {
  customer: { title: "Customer", path: "/account" },
  professional: { title: "Professional", path: "/professional" },
  staff: { title: "Staff", path: "/admin" },
  admin: { title: "Admin", path: "/admin" },
  owner: { title: "Owner", path: "/admin" },
};

export function WorkspaceShell({
  account,
  role,
}: {
  account: Account;
  role: Role;
}) {
  const isPro = role === "professional";
  const isAdmin = role === "admin" || role === "owner" || role === "staff";
  return (
    <div className="workspace">
      <aside className="sidebar">
        <Brand />
        <div className="workspace-label">
          <span className="mini-avatar">
            {account.displayName.slice(0, 1).toUpperCase()}
          </span>
          <div>
            <strong>{account.displayName}</strong>
            <span>{roles[role].title} workspace</span>
          </div>
        </div>
        <nav aria-label="Workspace">
          <Link
            className="nav-item active"
            href={roles[role].path}
            aria-current="page"
          >
            <LayoutDashboard size={19} aria-hidden />
            Overview
          </Link>
          {isPro && (
            <Link className="nav-item" href="/professional/profile">
              <Users size={19} aria-hidden />
              Profile & services
            </Link>
          )}
          {isPro && (
            <Link className="nav-item" href="/professional/posts">
              <Sparkles size={19} aria-hidden />
              Posts & tutorials
            </Link>
          )}
          {isPro && (
            <Link className="nav-item" href="/professional/availability">
              <CalendarDays size={19} aria-hidden />
              Working hours
            </Link>
          )}
          {isPro && (
            <Link className="nav-item" href="/professional/portfolio">
              <Sparkles size={19} aria-hidden />
              Portfolio
            </Link>
          )}
          {isPro && (
            <Link className="nav-item" href="/professional/reviews">
              <Sparkles size={19} aria-hidden />
              Reviews
            </Link>
          )}
          {isPro && (
            <Link className="nav-item" href="/professional/wallet">
              <WalletCards size={19} aria-hidden />
              GLOHAUS Wallet
            </Link>
          )}
          {!isAdmin && (
            <Link
              className="nav-item"
              href={isPro ? "/professional/bookings" : "/account/bookings"}
            >
              <CalendarDays size={19} aria-hidden />
              Appointments
            </Link>
          )}
          <Link className="nav-item" href="/">
            Discover
          </Link>
          <Link className="nav-item" href="/security">
            <ShieldCheck size={19} aria-hidden />
            Account & security
          </Link>
        </nav>
        {account.roles.length > 1 && (
          <div className="role-links">
            <p className="eyebrow">YOUR WORKSPACES</p>
            {account.roles
              .filter((r) => r !== role)
              .map((r) => (
                <Link className="nav-item" key={r} href={roles[r].path}>
                  {roles[r].title}
                  <ArrowUpRight size={16} aria-hidden />
                </Link>
              ))}
          </div>
        )}
        <div className="sidebar-bottom">
          <span className="eyebrow">MADE FOR INDEPENDENTS</span>
          <p>
            A little more space
            <br />
            for what you love.
          </p>
        </div>
      </aside>
      <div className="workspace-content">
        <header className="workspace-top">
          <span>
            {roles[role].title} / <strong>Overview</strong>
          </span>
          <AccountControls />
        </header>
        <main id="main" className="dashboard">
          <p className="eyebrow">YOUR NEXT CHAPTER</p>
          <h1>Welcome, {account.displayName}.</h1>
          <p className="lead">
            {isAdmin
              ? "Your protected platform workspace."
              : isPro
                ? "A home for your craft. Let’s start with you."
                : "A little time for yourself starts here."}
          </p>
          <section className="welcome-panel">
            <div>
              <span className="pill">
                <ShieldCheck size={14} aria-hidden /> Account created
              </span>
              <h2>
                {isAdmin
                  ? "Admin access, verified."
                  : isPro
                    ? "Your business has a home."
                    : "Make yourself at home."}
              </h2>
              <p>
                {isAdmin
                  ? "Your role and recent two-step verification have been checked. Open administration to manage accounts, bookings and moderation."
                  : isPro
                    ? "Your professional workspace is ready. Create your public page and add your services, prices and deposits. Manage appointments from the Appointments tab."
                    : "Your customer account is ready. Explore the inspiration feed and find independent professionals. Manage appointments from the Appointments tab."}
              </p>
              <Link
                href={isPro ? "/professional/setup" : "/security"}
                className="text-link"
              >
                {isPro
                  ? "Complete your professional setup"
                  : "Manage account security"}
                <ArrowUpRight size={18} aria-hidden />
              </Link>
            </div>
            <span className="welcome-symbol" aria-hidden>
              {isAdmin ? (
                <ShieldCheck />
              ) : isPro ? (
                <Sparkles />
              ) : (
                <CalendarDays />
              )}
            </span>
          </section>
          <div className="dashboard-grid">
            <section className="empty-panel">
              <div className="panel-title">
                <h2>
                  {isAdmin
                    ? "Platform management"
                    : isPro
                      ? "Your professional profile"
                      : "Your appointments"}
                </h2>
                <span className="muted-badge">
                  {isPro ? "Ready to edit" : "Ready to view"}
                </span>
              </div>
              <div className="empty-content">
                {isPro ? (
                  <Users size={32} aria-hidden />
                ) : (
                  <CalendarDays size={32} aria-hidden />
                )}
                <h3>
                  {isAdmin
                    ? "Your community at a glance"
                    : isPro
                      ? "A blank canvas for your business"
                      : "Your next good-hair day awaits"}
                </h3>
                <p>
                  {isAdmin
                    ? "Manage community accounts, review recent bookings and moderate published content."
                    : isPro
                      ? "Use Profile & services to introduce your business, publish your page and manage your menu."
                      : "View your upcoming and past appointments, manage cancellations and review completed visits."}
                </p>
                <Link
                  className="text-link"
                  href={
                    isAdmin
                      ? "/admin"
                      : isPro
                        ? "/professional/profile"
                        : "/account/bookings"
                  }
                >
                  {isAdmin
                    ? "Open administration"
                    : isPro
                      ? "Edit your profile"
                      : "View appointments"}
                  <ArrowUpRight size={18} aria-hidden />
                </Link>
              </div>
            </section>
            <section className="security-panel">
              <ShieldCheck size={24} aria-hidden />
              <p className="eyebrow">A SPACE THAT’S YOURS</p>
              <h2>
                Personal.
                <br />
                Protected.
              </h2>
              <p>
                Your account information is private. You control your sign-in
                and security settings.
              </p>
              <Link className="text-link" href="/security">
                Review security
                <ArrowUpRight size={18} aria-hidden />
              </Link>
            </section>
          </div>
        </main>
        <footer className="workspace-footer">
          GLOHAUS <span>Built around you.</span>
        </footer>
      </div>
    </div>
  );
}
