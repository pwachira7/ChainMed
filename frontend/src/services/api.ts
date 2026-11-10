export type User = {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "STAFF" | "AUDITOR" | "CITIZEN";
  active: boolean;
};
let token: string | undefined;
let refreshPromise: Promise<User | null> | null = null;
export const setToken = (value?: string) => {
  token = value;
};
export async function restore(): Promise<User | null> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    const res = await fetch("/api/auth/refresh", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    if (!res.ok) {
      token = undefined;
      return null;
    }
    const result = await res.json();
    token = result.data.accessToken;
    return result.data.user as User;
  })().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}
export async function request<T = any>(
  path: string,
  options: RequestInit = {},
  retry = true,
): Promise<T> {
  const res = await fetch("/api" + path, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: "Bearer " + token } : {}),
      ...options.headers,
    },
  });
  if (res.status === 401 && retry && !path.startsWith("/auth/")) {
    if (await restore()) return request(path, options, false);
    window.dispatchEvent(new Event("session-expired"));
  }
  if (!res.ok) {
    const result = await res.json().catch(() => ({}));
    throw new Error(result.error?.message ?? "Request failed");
  }
  return res.json();
}
export const post = (
  path: string,
  body: unknown = {},
  method = "POST",
  headers: Record<string, string> = {},
) => request(path, { method, headers, body: JSON.stringify(body) });
export async function download(format: "csv" | "pdf", query = "") {
  let res = await fetch("/api/audit/reports/" + format + query, {
    headers: { Authorization: "Bearer " + token },
  });
  if (res.status === 401 && (await restore()))
    res = await fetch("/api/audit/reports/" + format + query, {
      headers: { Authorization: "Bearer " + token },
    });
  if (!res.ok) throw new Error("Report download failed");
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = "chainmed-audit." + format;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
