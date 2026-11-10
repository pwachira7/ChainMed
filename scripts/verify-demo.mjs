import dotenv from "dotenv";
dotenv.config();
if (process.env.NODE_ENV !== "development")
  throw new Error("Demo helper is development-only");
const base = "http://localhost:" + (process.env.PORT || 4000) + "/api";
const login = await fetch(base + "/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    email: "auditor@chainmed.demo",
    password: process.env.SEED_PASSWORD,
  }),
});
if (!login.ok)
  throw new Error(
    "Demo auditor sign-in failed; seed accounts and verify SEED_PASSWORD",
  );
const {
  data: { accessToken },
} = await login.json();
const ids = process.argv.slice(2);
const response = await fetch(base + "/audit/verify", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: "Bearer " + accessToken,
  },
  body: JSON.stringify(ids.length ? { ids } : {}),
});
if (!response.ok)
  throw new Error("Verification request failed: " + response.status);
const { data } = await response.json();
console.log(
  JSON.stringify(
    {
      executedAt: new Date().toISOString(),
      runId: data.id,
      results: data.results,
    },
    null,
    2,
  ),
);
