export const labels: Record<string, string> = {
  ADMIN: "System administrator",
  STAFF: "Care staff",
  AUDITOR: "Auditor",
  CITIZEN: "Community member",
};
export const human = (s: string) =>
  s
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^./, (x) => x.toUpperCase());
export const date = (s: string) => new Date(s).toLocaleString();
