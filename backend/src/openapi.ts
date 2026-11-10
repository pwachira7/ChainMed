const text = { type: "string" };
const uuid = { type: "string", format: "uuid" };
const roles = ["ADMIN", "STAFF", "AUDITOR", "CITIZEN"];
const statuses = [
  "SUBMITTED",
  "UNDER_REVIEW",
  "ASSIGNED",
  "IN_PROGRESS",
  "RESOLVED",
  "CLOSED",
];
const urgency = { type: "string", enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"] };
const object = (
  properties: Record<string, unknown>,
  required: string[] = [],
) => ({ type: "object", additionalProperties: false, properties, required });
const password = { type: "string", minLength: 12, maxLength: 128 };
const email = { type: "string", format: "email", maxLength: 254 };
const name = { type: "string", minLength: 2, maxLength: 80 };
const bodies: Record<string, unknown> = {
  "post /auth/register": object({ name, email, password }, [
    "name",
    "email",
    "password",
  ]),
  "post /auth/login": object(
    { email, password: { type: "string", minLength: 1, maxLength: 128 } },
    ["email", "password"],
  ),
  "post /auth/refresh": object({}),
  "post /auth/logout": object({}),
  "patch /auth/profile": object({ name }, ["name"]),
  "post /auth/password": object(
    { currentPassword: text, newPassword: password },
    ["currentPassword", "newPassword"],
  ),
  "post /auth/forgot-password": object({ email }, ["email"]),
  "post /auth/reset-password": object(
    {
      token: { type: "string", minLength: 64, maxLength: 64 },
      newPassword: password,
    },
    ["token", "newPassword"],
  ),
  "post /incidents": object(
    {
      category: {
        type: "string",
        enum: [
          "Medical emergency",
          "Safety concern",
          "Care assistance",
          "Welfare check",
          "Other",
        ],
      },
      description: { type: "string", minLength: 10, maxLength: 5000 },
      location: { type: "string", minLength: 3, maxLength: 200 },
      contact: { type: "string", maxLength: 100 },
      urgency,
    },
    ["category", "description", "location", "urgency"],
  ),
  "patch /incidents/{id}": object(
    {
      version: { type: "integer", minimum: 0 },
      status: { type: "string", enum: statuses },
      assigneeId: uuid,
      urgency,
    },
    ["version"],
  ),
  "post /incidents/{id}/notes": object(
    { text: { type: "string", minLength: 3, maxLength: 3000 } },
    ["text"],
  ),
  "post /audit/verify": object({
    ids: { type: "array", items: uuid, minItems: 1, maxItems: 100 },
  }),
  "patch /findings/{id}": object(
    {
      status: {
        type: "string",
        enum: ["ACKNOWLEDGED", "CLOSED", "FALSE_ALARM"],
      },
      note: { type: "string", minLength: 10, maxLength: 3000 },
    },
    ["status", "note"],
  ),
  "patch /users/{id}": object({
    role: { type: "string", enum: roles },
    active: { type: "boolean" },
  }),
  "patch /notifications/{id}": object({}),
};
const errorResponse = (description: string) => ({
  description,
  content: {
    "application/json": { schema: { $ref: "#/components/schemas/Error" } },
  },
});
const routes: Record<string, string[]> = {
  "/auth/register": ["post"],
  "/auth/login": ["post"],
  "/auth/refresh": ["post"],
  "/auth/logout": ["post"],
  "/auth/me": ["get"],
  "/auth/profile": ["patch"],
  "/auth/password": ["post"],
  "/auth/forgot-password": ["post"],
  "/auth/reset-password": ["post"],
  "/incidents": ["get", "post"],
  "/incidents/{id}": ["get", "patch"],
  "/incidents/{id}/notes": ["post"],
  "/audit": ["get"],
  "/audit/summary": ["get"],
  "/audit/verify": ["post"],
  "/audit/{id}": ["get"],
  "/audit/reports/{format}": ["get"],
  "/findings": ["get"],
  "/findings/{id}": ["patch"],
  "/users": ["get"],
  "/users/{id}": ["patch"],
  "/users/permissions": ["get"],
  "/staff": ["get"],
  "/notifications": ["get"],
  "/notifications/{id}": ["patch"],
};
const publicRoutes = new Set([
  "/auth/register",
  "/auth/login",
  "/auth/refresh",
  "/auth/forgot-password",
  "/auth/reset-password",
]);
const paths: Record<string, unknown> = {};
const parameter = (name: string, schema: unknown = text) => ({
  in: "query",
  name,
  schema,
});
for (const [path, methods] of Object.entries(routes)) {
  paths[path] = Object.fromEntries(
    methods.map((method) => {
      const paged =
        ["/incidents", "/audit", "/findings"].includes(path) &&
        method === "get";
      const parameters: unknown[] = Array.from(
        path.matchAll(/\{(.*?)\}/g),
        (m) => ({
          in: "path",
          name: m[1],
          required: true,
          schema:
            m[1] === "format" ? { type: "string", enum: ["csv", "pdf"] } : uuid,
        }),
      );
      if (paged)
        parameters.push(
          parameter("page", { type: "integer", minimum: 1, default: 1 }),
          parameter("limit", {
            type: "integer",
            minimum: 1,
            maximum: 100,
            default: 20,
          }),
        );
      if (path === "/incidents" && method === "get")
        parameters.push(
          parameter("q"),
          parameter("status", { type: "string", enum: statuses }),
          parameter("sort", { type: "string", enum: ["newest", "oldest"] }),
        );
      if (
        (path === "/audit" || path.startsWith("/audit/reports/")) &&
        method === "get"
      )
        parameters.push(
          ...["q", "role", "actorId", "action", "resourceType"].map((n) =>
            parameter(n),
          ),
          parameter("from", { type: "string", format: "date-time" }),
          parameter("to", { type: "string", format: "date-time" }),
        );
      if (path === "/audit" && method === "get")
        parameters.push(
          parameter("integrity", {
            type: "string",
            enum: [
              "VERIFIED",
              "HASH_MISMATCH",
              "MISSING_BLOCKCHAIN_ANCHOR",
              "PENDING_CONFIRMATION",
              "MISSING_OFF_CHAIN_RECORD",
              "VERIFICATION_ERROR",
            ],
          }),
          parameter("sort", { type: "string", enum: ["newest", "oldest"] }),
        );
      if (path === "/findings" && method === "get")
        parameters.push(
          parameter("status", {
            type: "string",
            enum: ["OPEN", "ACKNOWLEDGED", "CLOSED", "FALSE_ALARM"],
          }),
        );
      if (path === "/incidents" && method === "post")
        parameters.push({
          in: "header",
          name: "Idempotency-Key",
          required: true,
          schema: uuid,
        });
      if (["/auth/refresh", "/auth/logout"].includes(path))
        parameters.push({
          in: "header",
          name: "Origin",
          required: true,
          schema: text,
          description:
            "Must exactly match WEB_ORIGIN. Browsers set this header automatically.",
        });
      const body = bodies[method + " " + path];
      const responses: Record<string, unknown> = {
        "200": {
          description: "Successful response",
          content: {
            "application/json": {
              schema: object(
                {
                  data: {},
                  pagination: object({
                    page: { type: "integer" },
                    limit: { type: "integer" },
                    total: { type: "integer" },
                  }),
                },
                ["data"],
              ),
            },
          },
        },
        "400": errorResponse("Invalid input or transition"),
        "401": errorResponse("Authentication required"),
        "403": errorResponse("Permission denied or untrusted Origin"),
        "404": errorResponse("Not found or inaccessible"),
        "409": errorResponse(
          "Duplicate, version conflict or invalid access change",
        ),
        "429": errorResponse("Rate limit"),
        "503": errorResponse(
          "Required infrastructure or production reset delivery unavailable",
        ),
      };
      if (
        method === "post" &&
        ["/auth/register", "/incidents", "/incidents/{id}/notes"].includes(path)
      ) {
        responses["201"] = responses["200"];
        delete responses["200"];
      }
      if (path.startsWith("/audit/reports/"))
        responses["200"] = {
          description: "Redacted filtered export, maximum 5000 records",
          content: {
            "text/csv": { schema: { type: "string" } },
            "application/pdf": { schema: { type: "string", format: "binary" } },
          },
        };
      return [
        method,
        {
          tags: [path.split("/")[1]],
          summary: method.toUpperCase() + " " + path,
          description:
            path.startsWith("/audit") || path.startsWith("/findings")
              ? "Administrator or auditor permission required. See the RBAC matrix and API guide."
              : path.startsWith("/users")
                ? "Administrator only."
                : "See docs/api/README.md for ownership rules and lifecycle requirements.",
          security: publicRoutes.has(path) ? [] : [{ bearerAuth: [] }],
          parameters,
          ...(body
            ? {
                requestBody: {
                  required: true,
                  content: { "application/json": { schema: body } },
                },
              }
            : {}),
          responses,
        },
      ];
    }),
  );
}
export const openapi = {
  openapi: "3.0.3",
  info: {
    title: "ChainMed API",
    version: "1.0.0",
    description:
      "Care operations, automatic evidence capture, blockchain integrity and investigation feedback.",
  },
  servers: [{ url: "/api" }],
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
    },
    schemas: {
      Error: object(
        {
          error: object(
            {
              message: text,
              requestId: text,
              details: { type: "array", items: { type: "object" } },
            },
            ["message"],
          ),
        },
        ["error"],
      ),
    },
  },
  paths,
};
