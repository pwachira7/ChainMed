import React from "react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowRight, Download, Search, ShieldCheck } from "lucide-react";
import { Badge } from "../components/ui";
import { ErrorBox } from "../components/ui";
import { Pager } from "../components/ui";
import { Heading } from "../components/ui";
import { useData } from "../hooks/useData";
import { post, download } from "../services/api";
import { human, date } from "../utils/format";

export function AuditList() {
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const [integrity, setIntegrity] = useState("");
  const [sort, setSort] = useState("newest");
  const [action, setAction] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<any>(null);
  const query =
    "?" +
    new URLSearchParams({
      page: String(page),
      q,
      sort,
      ...(role ? { role } : {}),
      ...(action ? { action } : {}),
      ...(integrity ? { integrity } : {}),
      ...(from ? { from: new Date(from).toISOString() } : {}),
      ...(to ? { to: new Date(to).toISOString() } : {}),
    });
  const data = useData("/audit" + query);
  async function verify() {
    setBusy(true);
    setError("");
    try {
      const r = await post(
        "/audit/verify",
        selected.length ? { ids: selected } : {},
      );
      setResult(r.data);
      await data.reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Heading
        title="Audit trail"
        description="Follow system activity from its original record to its integrity evidence."
      >
        <button
          onClick={() =>
            void download("csv", query).catch((e) => setError(e.message))
          }
        >
          <Download size={16} /> CSV
        </button>
        <button
          onClick={() =>
            void download("pdf", query).catch((e) => setError(e.message))
          }
        >
          <Download size={16} /> PDF
        </button>
        <button
          className="primary"
          disabled={busy}
          onClick={() => void verify()}
        >
          <ShieldCheck size={17} />
          {busy
            ? "Verifying…"
            : selected.length
              ? `Verify ${selected.length} selected`
              : "Verify full inventory"}
        </button>
      </Heading>
      <ErrorBox error={error || data.error} />
      {result && (
        <section className="panel verification-result">
          <h2>Verification completed</h2>
          <p>
            {result.results.length} records checked.{" "}
            {result.results.filter((r: any) => r.result === "VERIFIED").length}{" "}
            verified.
          </p>
          {result.results
            .filter((r: any) => r.result !== "VERIFIED")
            .slice(0, 10)
            .map((r: any) => (
              <p key={r.eventId}>
                <Badge value={r.result} />{" "}
                <span className="mono">{r.eventId.slice(0, 8)}</span> {r.detail}
              </p>
            ))}
          <Link to="/findings">
            Review findings <ArrowRight size={15} />
          </Link>
        </section>
      )}
      <section className="panel">
        <div className="filters">
          <label className="search">
            <Search size={18} />
            <input
              aria-label="Search audit events"
              placeholder="Search event ID or action…"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
            />
          </label>
          <select
            aria-label="Filter role"
            value={role}
            onChange={(e) => {
              setRole(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All roles</option>
            {["ADMIN", "STAFF", "AUDITOR", "CITIZEN", "ANONYMOUS"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <select
            aria-label="Integrity outcome"
            value={integrity}
            onChange={(e) => {
              setIntegrity(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All integrity outcomes</option>
            {[
              "VERIFIED",
              "HASH_MISMATCH",
              "PENDING_CONFIRMATION",
              "MISSING_BLOCKCHAIN_ANCHOR",
              "VERIFICATION_ERROR",
            ].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <select
            aria-label="Sort audit events"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </select>
        </div>
        <div className="filters secondary">
          <label>
            Action
            <input
              value={action}
              onChange={(e) => {
                setAction(e.target.value);
                setPage(1);
              }}
              placeholder="Exact action type"
            />
          </label>
          <label>
            From
            <input
              type="datetime-local"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label>
            To
            <input
              type="datetime-local"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>
                  <span className="sr-only">Select</span>
                </th>
                <th>Event / timestamp</th>
                <th>Actor role</th>
                <th>Action</th>
                <th>Resource</th>
                <th>Outcome</th>
                <th>Blockchain</th>
                <th>Integrity</th>
              </tr>
            </thead>
            <tbody>
              {data.data?.data.map((e: any) => (
                <tr key={e.id}>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={"Select event " + e.id}
                      checked={selected.includes(e.id)}
                      onChange={(x) =>
                        setSelected(
                          x.target.checked
                            ? [...selected, e.id]
                            : selected.filter((id) => id !== e.id),
                        )
                      }
                    />
                  </td>
                  <td>
                    <Link to={"/audit/" + e.id}>
                      <strong className="mono">{e.id.slice(0, 8)}…</strong>
                      <small>{date(e.timestamp)}</small>
                    </Link>
                  </td>
                  <td>{human(e.actorRole)}</td>
                  <td>{human(e.action)}</td>
                  <td>
                    {e.resourceType}
                    <small className="mono">{e.resourceId.slice(0, 8)}</small>
                  </td>
                  <td>
                    <Badge value={e.outcome} />
                  </td>
                  <td>
                    <Badge value={e.anchor?.status ?? "MISSING"} />
                    {e.finding && (
                      <small className="danger-text">
                        {human(e.finding.result)}
                      </small>
                    )}
                  </td>
                  <td>
                    <Badge value={e.integrity} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!data.data?.data.length && (
          <p className="empty">
            {data.loading
              ? "Loading audit evidence…"
              : "No events match these filters."}
          </p>
        )}
        <Pager
          page={page}
          setPage={setPage}
          total={data.data?.pagination.total ?? 0}
        />
      </section>
    </>
  );
}

export function AuditDetail() {
  const { id } = useParams();
  const { data, error, reload } = useData("/audit/" + id);
  const [result, setResult] = useState<any>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const e = data?.data;
  return (
    <>
      <Heading
        title="Audit evidence"
        description="Inspect the captured activity and its independent cryptographic commitment."
      >
        <Link to="/audit" className="button">
          Back to audit trail
        </Link>
        <button
          className="primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const r = await post("/audit/verify", { ids: [id] });
              setResult(r.data.results[0]);
              await reload();
            } catch (e) {
              setErr((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <ShieldCheck size={17} />
          Verify event
        </button>
      </Heading>
      <ErrorBox error={error || err} />
      {result && (
        <section className="panel verification-result">
          <Badge value={result.result} />
          <p>{result.detail}</p>
        </section>
      )}
      {e && (
        <section className="panel evidence">
          <h2>{human(e.action)}</h2>
          <dl className="details">
            {Object.entries({
              Event: e.id,
              Timestamp: date(e.timestamp),
              Actor: e.actorId ?? "Anonymous",
              Role: e.actorRole,
              Resource: e.resourceType + " / " + e.resourceId,
              Outcome: e.outcome,
              "Request ID": e.requestId,
              "Stored SHA-256": e.digest,
              "Previous digest": e.previousDigest ?? "Genesis event",
              "Anchor status": e.anchor?.status ?? "Missing",
              "Transaction hash":
                e.anchor?.transactionHash ?? "Awaiting submission",
              "Blockchain digest": e.commitment.digest ?? e.commitment.error,
            }).map(([k, v]) => (
              <React.Fragment key={k}>
                <dt>{k}</dt>
                <dd className="mono">{String(v)}</dd>
              </React.Fragment>
            ))}
          </dl>
          <h3>Approved metadata</h3>
          <pre>{JSON.stringify(e.metadata, null, 2)}</pre>
          <h3>Canonical payload</h3>
          <pre>{e.canonicalPayload}</pre>
          <h3>Verification history</h3>
          {e.verificationHistory.map((v: any) => (
            <p key={v.runId}>
              <Badge value={v.result} /> {date(v.checkedAt)} · {v.detail}
            </p>
          ))}
          <h3>Verification findings</h3>
          {e.findings.length ? (
            e.findings.map((f: any) => (
              <p key={f.id}>
                <Badge value={f.result} /> {date(f.detectedAt)} · {f.detail}
              </p>
            ))
          ) : (
            <p>No findings recorded for this event.</p>
          )}
        </section>
      )}
    </>
  );
}
