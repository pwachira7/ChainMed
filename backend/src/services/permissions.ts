import type { Role } from "@prisma/client";
export const permissions: Record<Role, readonly string[]> = {
  ADMIN: [
    "incident:create",
    "incident:read",
    "incident:manage",
    "audit:read",
    "audit:verify",
    "finding:manage",
    "users:manage",
    "report:read",
  ],
  STAFF: ["incident:read", "incident:manage"],
  AUDITOR: ["audit:read", "audit:verify", "finding:manage", "report:read"],
  CITIZEN: ["incident:create", "incident:read"],
};
export const allowed = (role: Role, permission: string) =>
  permissions[role].includes(permission);
export const transitions: Record<string, string[]> = {
  SUBMITTED: ["UNDER_REVIEW"],
  UNDER_REVIEW: ["ASSIGNED"],
  ASSIGNED: ["IN_PROGRESS"],
  IN_PROGRESS: ["RESOLVED"],
  RESOLVED: ["IN_PROGRESS", "CLOSED"],
  CLOSED: [],
};
export function canReadIncident(
  user: { id: string; role: Role },
  incident: { reporterId: string; assigneeId: string | null },
) {
  return (
    user.role === "ADMIN" ||
    (user.role === "CITIZEN" && incident.reporterId === user.id) ||
    (user.role === "STAFF" && incident.assigneeId === user.id)
  );
}
