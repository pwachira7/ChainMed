import { describe, it, expect } from "vitest";
import { canonical, sha256 } from "../backend/src/utils/security.js";
import {
  allowed,
  canReadIncident,
  transitions,
} from "../backend/src/services/permissions.js";
import { chainId, fromChainId } from "../backend/src/services/blockchain.js";
describe("deterministic commitments and least privilege", () => {
  it("reproduces canonical payload despite key insertion order", () => {
    expect(canonical({ z: 2, a: { y: 1, b: 0 } })).toBe(
      canonical({ a: { b: 0, y: 1 }, z: 2 }),
    );
    expect(sha256("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
  it("encodes UUIDs losslessly into bytes32", () => {
    const id = "8f532c01-2130-4f05-bf19-112233445566";
    expect(chainId(id)).toHaveLength(66);
    expect(fromChainId(chainId(id))).toBe(id);
  });
  it("denies public audit access and auditor operational writes", () => {
    expect(allowed("CITIZEN", "audit:read")).toBe(false);
    expect(allowed("AUDITOR", "incident:manage")).toBe(false);
    expect(allowed("AUDITOR", "finding:manage")).toBe(true);
  });
  it("limits citizens and staff to their own or assigned incidents", () => {
    expect(
      canReadIncident(
        { id: "a", role: "CITIZEN" },
        { reporterId: "b", assigneeId: null },
      ),
    ).toBe(false);
    expect(
      canReadIncident(
        { id: "a", role: "STAFF" },
        { reporterId: "b", assigneeId: "a" },
      ),
    ).toBe(true);
    expect(transitions.SUBMITTED).not.toContain("CLOSED");
  });
});
