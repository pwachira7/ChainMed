import React from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  ClipboardList,
  HeartPulse,
  Plus,
  ShieldCheck,
  RefreshCw,
  Link2,
} from "lucide-react";
import { Badge } from "../components/ui";
import { ErrorBox } from "../components/ui";
import { Heading } from "../components/ui";
import { useData } from "../hooks/useData";
import { useAuth } from "../contexts/AuthContext";
import { labels, human } from "../utils/format";

export function Dashboard() {
  const { user } = useAuth();
  const isAudit = ["ADMIN", "AUDITOR"].includes(user!.role);
  const { data, error, loading } = useData(
    isAudit ? "/audit/summary" : "/incidents?limit=100",
  );
  const recent = useData(
    user!.role === "AUDITOR" ? "/findings?limit=5" : "/incidents?limit=5",
  );
  const stats = isAudit
    ? [
        {
          label: "Audit events",
          value: data?.data.events,
          icon: Activity,
          sub: "Automatically captured",
        },
        {
          label: "Confirmed anchors",
          value: data?.data.confirmed,
          icon: Link2,
          sub: "Committed to the registry",
        },
        {
          label: "Awaiting anchors",
          value: data ? data.data.pending + data.data.failed : undefined,
          icon: RefreshCw,
          sub: "Pending or retrying",
        },
        {
          label: "Open findings",
          value: data?.data.alerts,
          icon: ShieldCheck,
          sub: "Awaiting investigation",
        },
      ]
    : [
        {
          label: "Your reports",
          value: data?.pagination.total,
          icon: ClipboardList,
          sub: "All submitted care needs",
        },
        {
          label: "Active incidents",
          value: data?.data.filter(
            (i: any) => !["CLOSED", "RESOLVED"].includes(i.status),
          ).length,
          icon: Activity,
          sub: "In your latest 100 reports",
        },
        {
          label: "Resolved",
          value: data?.data.filter((i: any) =>
            ["CLOSED", "RESOLVED"].includes(i.status),
          ).length,
          icon: CheckCircle2,
          sub: "In your latest 100 reports",
        },
      ];
  return (
    <>
      <Heading
        eyebrow="YOUR CARE OPERATIONS, AT A GLANCE"
        title={`Welcome back, ${user!.name.split(" ")[0]}`}
        description={
          user!.role === "AUDITOR"
            ? "Review the evidence. Protect the integrity of care."
            : "A clear view of the care activity that matters to you."
        }
      >
        {user!.role === "CITIZEN" || user!.role === "ADMIN" ? (
          <Link className="primary" to="/incidents/new">
            <Plus size={17} /> Report an incident
          </Link>
        ) : (
          <span className="role-chip">{labels[user!.role]}</span>
        )}
      </Heading>
      <ErrorBox error={error} />
      <section className="hero">
        <div>
          <div className="hero-tag">
            <span /> CONNECTED CARE. CLEAR ACCOUNTABILITY.
          </div>
          <h2>
            Better care starts
            <br />
            with a trusted record.
          </h2>
          <p>
            {isAudit
              ? "Follow every action from operational record to blockchain commitment. Identify concerns and keep investigations moving."
              : "Report care needs, follow progress, and keep your community connected to the right support."}
          </p>
          <Link to={isAudit ? "/audit" : "/incidents"}>
            {isAudit ? "Explore the audit trail" : "View care incidents"}{" "}
            <ArrowRight size={17} />
          </Link>
        </div>
        <div className="hero-art">
          <div className="orbit one" />
          <div className="orbit two" />
          <div className="hero-shield">
            <ShieldCheck size={66} strokeWidth={1.25} />
          </div>
          <span className="art-card top">
            <Activity size={18} /> Care activity captured
          </span>
          <span className="art-card bottom">
            <Link2 size={18} /> Integrity independently verifiable
          </span>
        </div>
      </section>
      <div className="stats">
        {stats.map((s) => (
          <div className="stat" key={s.label}>
            <div className="stat-top">
              {s.label}
              <s.icon size={19} />
            </div>
            <strong>{loading ? "—" : (s.value ?? "—")}</strong>
            <small>{s.sub}</small>
          </div>
        ))}
      </div>
      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-title">
            <div>
              <h2>
                {user!.role === "AUDITOR"
                  ? "Recent integrity findings"
                  : "Recent care incidents"}
              </h2>
              <p>
                {user!.role === "AUDITOR"
                  ? "Evidence requiring review"
                  : "The latest activity in your care workspace"}
              </p>
            </div>
            <Link to={user!.role === "AUDITOR" ? "/findings" : "/incidents"}>
              View all <ArrowUpRight size={16} />
            </Link>
          </div>
          <ErrorBox error={recent.error} />
          {recent.loading ? (
            <p className="empty">Loading activity…</p>
          ) : recent.data?.data.length ? (
            recent.data.data.map((i: any) => (
              <Link
                className="activity-row"
                key={i.id}
                to={
                  user!.role === "AUDITOR" ? "/findings" : "/incidents/" + i.id
                }
              >
                <span className="activity-icon">
                  {user!.role === "AUDITOR" ? (
                    <ShieldCheck size={19} />
                  ) : (
                    <HeartPulse size={19} />
                  )}
                </span>
                <div>
                  <strong>{i.reference ?? human(i.result)}</strong>
                  <small>
                    {i.category ?? i.detail}{" "}
                    {i.location ? "· " + i.location : ""}
                  </small>
                </div>
                <Badge value={i.status} />
              </Link>
            ))
          ) : (
            <p className="empty">
              No activity yet. New records will appear here.
            </p>
          )}
        </section>
        <section className="panel trust-panel">
          <div className="trust-icon">
            <ShieldCheck size={28} />
          </div>
          <h2>A trail you can verify</h2>
          <p>
            Every important action creates an audit event. Cryptographic
            commitments help reveal later changes.
          </p>
          <ol>
            <li>
              <span>01</span> Capture the care activity
            </li>
            <li>
              <span>02</span> Anchor its SHA-256 digest
            </li>
            <li>
              <span>03</span> Verify and investigate
            </li>
          </ol>
          {isAudit && (
            <Link to="/findings">
              Review integrity findings <ArrowRight size={16} />
            </Link>
          )}
        </section>
      </div>
    </>
  );
}
