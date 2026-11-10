import React from "react";
import { useState } from "react";
import { ArrowUpRight, ShieldCheck, X, AlertTriangle } from "lucide-react";
import { Badge } from "../components/ui";
import { ErrorBox } from "../components/ui";
import { Pager } from "../components/ui";
import { Heading } from "../components/ui";
import { useData } from "../hooks/useData";
import { post } from "../services/api";
import { human, date } from "../utils/format";

export function Findings() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const { data, error, reload } = useData(
    "/findings?" +
      new URLSearchParams({
        page: String(page),
        ...(status ? { status } : {}),
      }),
  );
  const [selected, setSelected] = useState<any>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <>
      <Heading
        title="Integrity findings"
        description="Investigate concerns, preserve evidence, and document the outcome."
      />
      <ErrorBox error={error || err} />
      <div className="filters">
        <select
          aria-label="Finding status"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All investigation statuses</option>
          {["OPEN", "ACKNOWLEDGED", "CLOSED", "FALSE_ALARM"].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </div>
      <div className="finding-list">
        {data?.data.map((f: any) => (
          <section className="panel finding" key={f.id}>
            <div className={"finding-icon " + f.severity.toLowerCase()}>
              <AlertTriangle size={23} />
            </div>
            <div>
              <div className="finding-title">
                <h2>{human(f.result)}</h2>
                <Badge value={f.status} />
              </div>
              <p>{f.detail}</p>
              <small>
                {date(f.detectedAt)} · Event{" "}
                <span className="mono">{f.eventId}</span> · {f.severity}
              </small>
              {f.notes.map((n: any, index: number) => (
                <blockquote key={index}>
                  {n.text}
                  <small>
                    {date(n.timestamp)} · {n.status}
                  </small>
                </blockquote>
              ))}
            </div>
            {!["CLOSED", "FALSE_ALARM"].includes(f.status) && (
              <button onClick={() => setSelected(f)}>
                Investigate <ArrowUpRight size={15} />
              </button>
            )}
          </section>
        ))}
      </div>
      {data?.data.length === 0 && (
        <section className="panel empty">
          <ShieldCheck size={32} />
          <h2>No findings here</h2>
          <p>Run an integrity verification to check the audit inventory.</p>
        </section>
      )}
      <Pager
        page={page}
        setPage={setPage}
        total={data?.pagination.total ?? 0}
      />
      {selected && (
        <div className="modal-backdrop">
          <section
            className="panel modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="investigate-title"
          >
            <button
              className="close"
              aria-label="Close"
              onClick={() => setSelected(null)}
            >
              <X size={20} />
            </button>
            <h2 id="investigate-title">Document investigation</h2>
            <p>{selected.detail}</p>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                const f = new FormData(e.currentTarget);
                try {
                  await post(
                    "/findings/" + selected.id,
                    { status: f.get("status"), note: f.get("note") },
                    "PATCH",
                  );
                  setSelected(null);
                  await reload();
                } catch (e) {
                  setErr((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label>
                Investigation status
                <select name="status">
                  <option value="ACKNOWLEDGED">Acknowledged</option>
                  <option value="CLOSED">Close with documented outcome</option>
                  <option value="FALSE_ALARM">
                    False alarm with justification
                  </option>
                </select>
              </label>
              <label>
                Evidence, justification and next steps
                <textarea
                  name="note"
                  minLength={10}
                  maxLength={3000}
                  required
                  rows={4}
                />
              </label>
              <button className="primary" disabled={busy}>
                Save investigation
              </button>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
