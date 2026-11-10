import React from "react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Bell, X } from "lucide-react";
import { Badge } from "../components/ui";
import { ErrorBox } from "../components/ui";
import { Heading } from "../components/ui";
import { useData } from "../hooks/useData";
import { useAuth } from "../contexts/AuthContext";
import { post, setToken } from "../services/api";
import { labels, date } from "../utils/format";

export function UserList() {
  const { data, error, reload } = useData("/users");
  const [err, setErr] = useState("");
  const [selected, setSelected] = useState<any>(null);
  const { user } = useAuth();
  return (
    <>
      <Heading
        title="Team & access"
        description="Manage account permissions using the principle of least privilege."
      />
      <ErrorBox error={error || err} />
      <section className="panel table-wrap">
        <table>
          <thead>
            <tr>
              <th>Team member</th>
              <th>Email</th>
              <th>Role</th>
              <th>Account</th>
              <th>Access</th>
            </tr>
          </thead>
          <tbody>
            {data?.data.map((u: any) => (
              <tr key={u.id}>
                <td>
                  <strong>{u.name}</strong>
                </td>
                <td>{u.email}</td>
                <td>{labels[u.role]}</td>
                <td>
                  <Badge value={u.active ? "ACTIVE" : "DISABLED"} />
                </td>
                <td>
                  <button
                    disabled={u.id === user!.id}
                    onClick={() => setSelected(u)}
                  >
                    Manage access
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {selected && (
        <div className="modal-backdrop">
          <section
            className="panel modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="access-title"
          >
            <button
              className="close"
              aria-label="Close"
              onClick={() => setSelected(null)}
            >
              <X size={20} />
            </button>
            <h2 id="access-title">Manage {selected.name}</h2>
            <p>Changing access revokes this user’s active sessions.</p>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                try {
                  await post(
                    "/users/" + selected.id,
                    { role: f.get("role"), active: f.get("active") === "true" },
                    "PATCH",
                  );
                  setSelected(null);
                  await reload();
                } catch (e) {
                  setErr((e as Error).message);
                }
              }}
            >
              <label>
                Role
                <select name="role" defaultValue={selected.role}>
                  {Object.entries(labels).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Account status
                <select name="active" defaultValue={String(selected.active)}>
                  <option value="true">Active</option>
                  <option value="false">Disabled</option>
                </select>
              </label>
              <button className="primary">Confirm access change</button>
            </form>
          </section>
        </div>
      )}
    </>
  );
}

export function Notifications() {
  const { data, error, reload } = useData("/notifications");
  const [err, setErr] = useState("");
  return (
    <>
      <Heading
        title="Notifications"
        description="Stay informed about integrity findings and investigation needs."
      />
      <ErrorBox error={error || err} />
      <section className="panel">
        {data?.data.length ? (
          data.data.map((n: any) => (
            <div className="activity-row" key={n.id}>
              <span className="activity-icon">
                <Bell size={19} />
              </span>
              <div>
                <Link to="/findings">
                  <strong>{n.title}</strong>
                </Link>
                <small>{date(n.createdAt)}</small>
              </div>
              {!n.readAt ? (
                <button
                  onClick={async () => {
                    try {
                      await post("/notifications/" + n.id, {}, "PATCH");
                      await reload();
                    } catch (e) {
                      setErr((e as Error).message);
                    }
                  }}
                >
                  Mark as read
                </button>
              ) : (
                <Badge value="READ" />
              )}
            </div>
          ))
        ) : (
          <div className="empty">
            <Bell size={28} />
            <h2>You’re up to date</h2>
            <p>New notifications will appear here.</p>
          </div>
        )}
      </section>
    </>
  );
}

export function Profile() {
  const { user, setUser } = useAuth();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  return (
    <>
      <Heading
        title="My account"
        description="Keep your profile and account security up to date."
      />
      <ErrorBox error={error} />
      {message && (
        <p className="success-message" role="status">
          {message}
        </p>
      )}
      <div className="form-layout">
        <section className="panel">
          <h2>Profile details</h2>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                const r = await post(
                  "/auth/profile",
                  { name: new FormData(e.currentTarget).get("name") },
                  "PATCH",
                );
                setUser(r.data);
                setMessage("Profile updated.");
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            <label>
              Full name
              <input
                name="name"
                defaultValue={user!.name}
                minLength={2}
                maxLength={80}
                required
              />
            </label>
            <label>
              Email address
              <input value={user!.email} readOnly />
            </label>
            <label>
              Assigned role
              <input value={labels[user!.role]} readOnly />
            </label>
            <button className="primary">Save profile</button>
          </form>
        </section>
        <section className="panel">
          <h2>Change password</h2>
          <p>Changing your password signs you out of all sessions.</p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              try {
                await post("/auth/password", {
                  currentPassword: f.get("currentPassword"),
                  newPassword: f.get("newPassword"),
                });
                setToken();
                setUser(null);
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            <label>
              Current password
              <input
                name="currentPassword"
                type="password"
                required
                autoComplete="current-password"
              />
            </label>
            <label>
              New password
              <input
                name="newPassword"
                type="password"
                minLength={12}
                maxLength={128}
                required
                autoComplete="new-password"
              />
            </label>
            <button className="primary">Change password & sign out</button>
          </form>
        </section>
      </div>
    </>
  );
}
