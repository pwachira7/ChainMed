import React from "react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowRight, HeartPulse, Plus, Search } from "lucide-react";
import { Badge } from "../components/ui";
import { ErrorBox } from "../components/ui";
import { Pager } from "../components/ui";
import { Heading } from "../components/ui";
import { useData } from "../hooks/useData";
import { useAuth } from "../contexts/AuthContext";
import { post } from "../services/api";
import { human, date } from "../utils/format";

export function IncidentList() {
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState("newest");
  const { data, error, loading } = useData(
    "/incidents?" +
      new URLSearchParams({
        page: String(page),
        q,
        sort,
        ...(status ? { status } : {}),
      }),
  );
  const { user } = useAuth();
  return (
    <>
      <Heading
        title="Care incidents"
        description="Coordinate a response and follow each report through to resolution."
      >
        {["CITIZEN", "ADMIN"].includes(user!.role) && (
          <Link className="primary" to="/incidents/new">
            <Plus size={17} /> Report an incident
          </Link>
        )}
      </Heading>
      <section className="panel">
        <div className="filters">
          <label className="search">
            <Search size={18} />
            <input
              aria-label="Search incidents"
              placeholder="Search reference, category or location…"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
            />
          </label>
          <select
            aria-label="Filter status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All statuses</option>
            {[
              "SUBMITTED",
              "UNDER_REVIEW",
              "ASSIGNED",
              "IN_PROGRESS",
              "RESOLVED",
              "CLOSED",
            ].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <select
            aria-label="Sort incidents"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </select>
        </div>
        <ErrorBox error={error} />
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Incident</th>
                <th>Location</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Assigned to</th>
                <th>Reported</th>
              </tr>
            </thead>
            <tbody>
              {data?.data.map((i: any) => (
                <tr key={i.id}>
                  <td>
                    <Link to={"/incidents/" + i.id}>
                      <strong>{i.reference}</strong>
                      <small>{i.category}</small>
                    </Link>
                  </td>
                  <td>{i.location}</td>
                  <td>
                    <Badge value={i.urgency} />
                  </td>
                  <td>
                    <Badge value={i.status} />
                  </td>
                  <td>{i.assignee?.name ?? "Unassigned"}</td>
                  <td>{date(i.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!data?.data.length && (
          <p className="empty">
            {loading
              ? "Loading incidents…"
              : "No incidents match these filters."}
          </p>
        )}
        <Pager
          page={page}
          setPage={setPage}
          total={data?.pagination.total ?? 0}
        />
      </section>
    </>
  );
}

export function NewIncident() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [key] = useState(() => crypto.randomUUID());
  const navigate = useNavigate();
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const f = new FormData(e.currentTarget);
    try {
      const r = await post("/incidents", Object.fromEntries(f), "POST", {
        "Idempotency-Key": key,
      });
      navigate("/incidents/" + r.data.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Heading
        title="Report a care incident"
        description="Share the details needed to coordinate a response."
      />
      <div className="form-layout">
        <section className="panel">
          <ErrorBox error={error} />
          <form onSubmit={submit}>
            <div className="form-grid">
              <label>
                Category
                <select name="category" required>
                  {[
                    "Medical emergency",
                    "Safety concern",
                    "Care assistance",
                    "Welfare check",
                    "Other",
                  ].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label>
                Urgency
                <select name="urgency" defaultValue="MEDIUM">
                  {["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              General location
              <input
                name="location"
                minLength={3}
                maxLength={200}
                required
                placeholder="Area, landmark or community centre"
              />
            </label>
            <label>
              What happened?
              <textarea
                name="description"
                minLength={10}
                maxLength={5000}
                rows={5}
                required
                placeholder="Describe the situation and what help is needed."
              />
            </label>
            <label>
              Contact details (optional)
              <input name="contact" maxLength={100} />
            </label>
            <div className="actions">
              <Link className="button" to="/incidents">
                Cancel
              </Link>
              <button className="primary" disabled={busy}>
                {busy ? "Submitting…" : "Submit incident"}
                <ArrowRight size={17} />
              </button>
            </div>
          </form>
        </section>
        <aside className="panel info-panel">
          <HeartPulse size={30} />
          <h2>Help us coordinate care</h2>
          <p>
            Include a clear location and an accurate description. You can track
            your report after submission.
          </p>
          <p>
            This research platform does not dispatch emergency services. Use
            your established local emergency channel for immediate danger.
          </p>
          <small>
            Use fictional information for the university demonstration.
          </small>
        </aside>
      </div>
    </>
  );
}

export function IncidentDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const { data, error, reload } = useData("/incidents/" + id);
  const staff = useData(user!.role === "ADMIN" ? "/staff" : "/auth/me");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const i = data?.data;
  async function change(
    body: unknown,
    path = "/incidents/" + id,
    method = "PATCH",
  ) {
    setBusy(true);
    setMessage("");
    try {
      await post(path, body, method);
      await reload();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const transition: Record<string, string[]> = {
    SUBMITTED: ["UNDER_REVIEW"],
    UNDER_REVIEW: [],
    ASSIGNED: ["IN_PROGRESS"],
    IN_PROGRESS: ["RESOLVED"],
    RESOLVED: ["IN_PROGRESS", "CLOSED"],
    CLOSED: [],
  };
  return (
    <>
      <Heading
        title={i?.reference ?? "Incident details"}
        description="A complete view of this report and its progress."
      >
        <Link className="button" to="/incidents">
          Back to incidents
        </Link>
      </Heading>
      <ErrorBox error={error || message} />
      {i ? (
        <div className="form-layout">
          <div>
            <section className="panel">
              <div className="panel-title">
                <h2>{i.category}</h2>
                <Badge value={i.status} />
              </div>
              <p className="description">{i.description}</p>
              <dl className="details">
                <dt>General location</dt>
                <dd>{i.location}</dd>
                <dt>Urgency</dt>
                <dd>
                  <Badge value={i.urgency} />
                </dd>
                <dt>Contact</dt>
                <dd>{i.contact || "Not provided"}</dd>
                <dt>Assigned to</dt>
                <dd>{i.assignee?.name ?? "Unassigned"}</dd>
                <dt>Submitted</dt>
                <dd>{date(i.createdAt)}</dd>
              </dl>
            </section>
            {["ADMIN", "STAFF"].includes(user!.role) && (
              <section className="panel mt">
                <h2>Operational notes</h2>
                {i.notes.map((n: any) => (
                  <div className="note" key={n.id}>
                    <strong>{n.author.name}</strong>
                    <small>{date(n.createdAt)}</small>
                    <p>{n.text}</p>
                  </div>
                ))}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const form = e.currentTarget;
                    void change(
                      { text: new FormData(form).get("text") },
                      "/incidents/" + id + "/notes",
                      "POST",
                    ).then(() => form.reset());
                  }}
                >
                  <label>
                    Add a note
                    <textarea
                      name="text"
                      minLength={3}
                      required
                      maxLength={3000}
                    />
                  </label>
                  <button disabled={busy} className="primary">
                    Save note
                  </button>
                </form>
              </section>
            )}
          </div>
          <div>
            {["ADMIN", "STAFF"].includes(user!.role) && (
              <section className="panel">
                <h2>Coordinate response</h2>
                <div className="stack">
                  {transition[i.status]?.map((s) => (
                    <button
                      disabled={busy}
                      className="primary"
                      key={s}
                      onClick={() =>
                        void change({ version: i.version, status: s })
                      }
                    >
                      Move to {human(s)} <ArrowRight size={16} />
                    </button>
                  ))}
                </div>
                {user!.role === "ADMIN" &&
                  ["UNDER_REVIEW", "ASSIGNED", "IN_PROGRESS"].includes(
                    i.status,
                  ) && (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void change({
                          version: i.version,
                          assigneeId: new FormData(e.currentTarget).get(
                            "assigneeId",
                          ),
                        });
                      }}
                    >
                      <label>
                        Responsible staff
                        <select
                          name="assigneeId"
                          required
                          defaultValue={i.assigneeId ?? ""}
                        >
                          <option value="" disabled>
                            Select care staff
                          </option>
                          {staff.data?.data.map((s: any) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button disabled={busy}>Assign staff</button>
                    </form>
                  )}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void change({
                      version: i.version,
                      urgency: new FormData(e.currentTarget).get("urgency"),
                    });
                  }}
                >
                  <label>
                    Priority
                    <select name="urgency" defaultValue={i.urgency}>
                      {["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </label>
                  <button disabled={busy}>Update priority</button>
                </form>
              </section>
            )}
            <section className="panel mt">
              <h2>Incident timeline</h2>
              <div className="timeline">
                {i.history.map((h: any) => (
                  <div key={h.id}>
                    <span />
                    <strong>{human(h.toStatus)}</strong>
                    <small>{date(h.createdAt)}</small>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      ) : (
        <p className="empty">Loading incident…</p>
      )}
    </>
  );
}
