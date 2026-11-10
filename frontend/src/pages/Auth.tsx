import React from "react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, ShieldCheck, Link2 } from "lucide-react";
import { ErrorBox } from "../components/ui";
import { Brand } from "../components/ui";
import { useAuth } from "../contexts/AuthContext";
import { post, setToken } from "../services/api";

export function AuthPage({ register = false }: { register?: boolean }) {
  const { setUser } = useAuth();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      if (register) {
        await post("/auth/register", {
          name: f.get("name"),
          email: f.get("email"),
          password: f.get("password"),
        });
        navigate("/login");
      } else {
        const result = await post("/auth/login", {
          email: f.get("email"),
          password: f.get("password"),
        });
        setToken(result.data.accessToken);
        setUser(result.data.user);
        navigate("/");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-page">
      <section className="auth-story">
        <Brand />
        <div>
          <span className="eyebrow">A SAFER STANDARD OF CARE</span>
          <h1>
            Every action matters.
            <br />
            Every record counts.
          </h1>
          <p>
            Coordinate care with confidence. Secure operations, clear
            accountability, and independently verifiable audit trails.
          </p>
          <div className="auth-pills">
            <span>
              <ShieldCheck size={18} /> Role-based access
            </span>
            <span>
              <Link2 size={18} /> Blockchain integrity
            </span>
          </div>
        </div>
        <small>ChainMed · Care operations & integrity platform</small>
      </section>
      <section className="auth-form">
        <div className="auth-card">
          <span className="eyebrow">YOUR SECURE WORKSPACE</span>
          <h2>{register ? "Join your care community" : "Welcome back"}</h2>
          <p>
            {register
              ? "Create an account to report and track care needs."
              : "Sign in to continue to ChainMed."}
          </p>
          <ErrorBox error={error} />
          <form onSubmit={submit}>
            {register && (
              <label>
                Full name
                <input name="name" required minLength={2} autoComplete="name" />
              </label>
            )}
            <label>
              Email address
              <input
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="you@example.com"
              />
            </label>
            <label>
              Password
              <input
                name="password"
                type="password"
                minLength={register ? 12 : 1}
                maxLength={128}
                required
                autoComplete={register ? "new-password" : "current-password"}
              />
            </label>
            {register && <small>Use at least 12 characters.</small>}
            <button className="primary" disabled={busy}>
              {busy
                ? "Please wait…"
                : register
                  ? "Create account"
                  : "Sign in securely"}
              <ArrowRight size={17} />
            </button>
          </form>
          <p className="auth-link">
            {register ? "Already registered?" : "New to ChainMed?"}{" "}
            <Link to={register ? "/login" : "/register"}>
              {register ? "Sign in" : "Create an account"}
            </Link>
          </p>
          {!register && (
            <Link to="/reset" className="subtle">
              Forgot your password?
            </Link>
          )}
        </div>
      </section>
    </div>
  );
}

export function ResetPage() {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [token, setResetToken] = useState("");
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      const r = token
        ? await post("/auth/reset-password", {
            token,
            newPassword: f.get("password"),
          })
        : await post("/auth/forgot-password", { email: f.get("email") });
      setMessage(
        token ? "Password changed. You can now sign in." : r.data.message,
      );
      if (r.data.developmentResetToken)
        setResetToken(r.data.developmentResetToken);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <div className="splash">
      <div className="panel auth-card">
        <Brand />
        <h2>Reset your password</h2>
        <ErrorBox error={error} />
        <p role="status">{message}</p>
        <form onSubmit={submit}>
          {!token ? (
            <label>
              Email
              <input name="email" type="email" required />
            </label>
          ) : (
            <label>
              New password
              <input name="password" type="password" minLength={12} required />
            </label>
          )}
          <button className="primary">
            {token ? "Set new password" : "Request reset"}
          </button>
        </form>
        <Link to="/login">Back to sign in</Link>
      </div>
    </div>
  );
}
