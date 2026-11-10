import React from "react";
import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Brand } from "./components/ui";
import { AuthPage } from "./pages/Auth";
import { ResetPage } from "./pages/Auth";
import { Shell } from "./layouts/Shell";
import { Context } from "./contexts/AuthContext";
import { restore, User } from "./services/api";

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    restore()
      .then(setUser)
      .catch(() => {})
      .finally(() => setLoading(false));
    const expire = () => setUser(null);
    window.addEventListener("session-expired", expire);
    return () => window.removeEventListener("session-expired", expire);
  }, []);
  if (loading)
    return (
      <div className="splash">
        <Brand />
        <p>Opening your secure workspace…</p>
      </div>
    );
  return (
    <Context.Provider value={{ user, setUser }}>
      <BrowserRouter>
        <Routes>
          <Route
            path="/login"
            element={user ? <Navigate to="/" /> : <AuthPage />}
          />
          <Route
            path="/register"
            element={user ? <Navigate to="/" /> : <AuthPage register />}
          />
          <Route path="/reset" element={<ResetPage />} />
          <Route
            path="/*"
            element={user ? <Shell /> : <Navigate to="/login" replace />}
          />
        </Routes>
      </BrowserRouter>
    </Context.Provider>
  );
}
