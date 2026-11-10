import React from "react";
import { useState } from "react";
import { Routes, Route, NavLink, Link, Navigate } from "react-router-dom";
import {
  Bell,
  ClipboardList,
  FileSearch,
  LayoutDashboard,
  LogOut,
  Menu,
  ShieldCheck,
  Users,
  UserRound,
} from "lucide-react";
import { ErrorBox } from "../components/ui";
import { Brand } from "../components/ui";
import { Dashboard } from "../pages/Dashboard";
import { IncidentList } from "../pages/Incidents";
import { NewIncident } from "../pages/Incidents";
import { IncidentDetail } from "../pages/Incidents";
import { AuditList } from "../pages/Audit";
import { AuditDetail } from "../pages/Audit";
import { Findings } from "../pages/Findings";
import { UserList } from "../pages/Accounts";
import { Notifications } from "../pages/Accounts";
import { Profile } from "../pages/Accounts";
import { useAuth } from "../contexts/AuthContext";
import { post, setToken } from "../services/api";
import { labels } from "../utils/format";

export function Shell() {
  const { user, setUser } = useAuth();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const audit = user!.role === "ADMIN" || user!.role === "AUDITOR";
  const nav = [
    { to: "/", icon: LayoutDashboard, label: "Overview" },
    ...(user!.role !== "AUDITOR"
      ? [{ to: "/incidents", icon: ClipboardList, label: "Care incidents" }]
      : []),
    ...(audit
      ? [
          { to: "/audit", icon: FileSearch, label: "Audit trail" },
          { to: "/findings", icon: ShieldCheck, label: "Integrity findings" },
        ]
      : []),
    ...(user!.role === "ADMIN"
      ? [{ to: "/users", icon: Users, label: "Team & access" }]
      : []),
    { to: "/notifications", icon: Bell, label: "Notifications" },
    { to: "/profile", icon: UserRound, label: "My account" },
  ];
  return (
    <div className="app-shell">
      <aside className={open ? "sidebar open" : "sidebar"}>
        <Brand />
        <div className="nav-label">WORKSPACE</div>
        <nav>
          {nav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === "/"}
              onClick={() => setOpen(false)}
            >
              <n.icon size={19} />
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-note">
          <ShieldCheck size={24} />
          <strong>Accountability by design</strong>
          <p>Care activity is captured in a verifiable audit trail.</p>
          <span>SHA-256 · Ethereum registry</span>
        </div>
        <div className="sidebar-user">
          <span className="avatar">{user!.name.slice(0, 1)}</span>
          <div>
            <strong>{user!.name}</strong>
            <small>{labels[user!.role]}</small>
          </div>
          <button
            aria-label="Sign out"
            onClick={async () => {
              try {
                await post("/auth/logout");
                setToken();
                setUser(null);
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            <LogOut size={18} />
          </button>
        </div>
      </aside>
      {open && (
        <button
          className="overlay"
          aria-label="Close menu"
          onClick={() => setOpen(false)}
        />
      )}
      <div className="main-wrap">
        <header className="topbar">
          <div>
            <button
              className="menu"
              aria-label="Open menu"
              onClick={() => setOpen(!open)}
            >
              <Menu />
            </button>
            <span>
              Care operations <span className="slash">/</span>{" "}
              <strong>Workspace</strong>
            </span>
          </div>
          <div className="top-right">
            <span className="environment">LOCAL WORKSPACE</span>
            <Link to="/notifications" aria-label="Notifications">
              <Bell size={20} />
            </Link>
            <span className="avatar small">{user!.name.slice(0, 1)}</span>
          </div>
        </header>
        <main>
          <ErrorBox error={error} />
          <Routes>
            <Route path="/" element={<Dashboard />} />
            {user!.role !== "AUDITOR" && (
              <>
                <Route path="/incidents" element={<IncidentList />} />
                <Route path="/incidents/new" element={<NewIncident />} />
                <Route path="/incidents/:id" element={<IncidentDetail />} />
              </>
            )}
            {audit && (
              <>
                <Route path="/audit" element={<AuditList />} />
                <Route path="/audit/:id" element={<AuditDetail />} />
                <Route path="/findings" element={<Findings />} />
              </>
            )}
            {user!.role === "ADMIN" && (
              <Route path="/users" element={<UserList />} />
            )}
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
          <footer>
            ChainMed{" "}
            <span>Secure care operations. Verifiable accountability.</span>
            <span>University research platform</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
