import { evaluateApprovalThreshold } from "@/application/approval-service";
import { describe, expect, it } from "vitest";
import { buildApproval, buildPolicy, buildRequest, isoAt } from "./fixtures";

const dualControl = buildPolicy({
  approvalRule: { threshold: 2, approverIds: ["usr_maya", "usr_omar", "usr_nora"] },
});

describe("evaluateApprovalThreshold", () => {
  it("stays pending until the threshold is reached", () => {
    const result = evaluateApprovalThreshold({
      request: buildRequest({ state: "pending_approval" }),
      policy: dualControl,
      approvals: [buildApproval()],
    });

    expect(result.status).toBe("pending");
    expect(result.approvedCount).toBe(1);
    expect(result.requiredCount).toBe(2);
    expect(result.remainingCount).toBe(1);
  });

  it("is satisfied once enough distinct approvers agree", () => {
    const result = evaluateApprovalThreshold({
      request: buildRequest({ state: "pending_approval" }),
      policy: dualControl,
      approvals: [
        buildApproval(),
        buildApproval({
          id: "apr_omar",
          approverId: "usr_omar",
          approverName: "Omar Haddad",
          createdAt: isoAt(2),
        }),
      ],
    });

    expect(result.status).toBe("satisfied");
    expect(result.remainingCount).toBe(0);
  });

  it("does not let one approver satisfy a two-person rule", () => {
    const result = evaluateApprovalThreshold({
      request: buildRequest({ state: "pending_approval" }),
      policy: dualControl,
      approvals: [
        buildApproval(),
        buildApproval({ id: "apr_maya_again", createdAt: isoAt(5) }),
      ],
    });

    expect(result.status).toBe("pending");
    expect(result.approvedCount).toBe(1);
  });

  it("ignores approvals from people the policy does not name", () => {
    const result = evaluateApprovalThreshold({
      request: buildRequest({ state: "pending_approval" }),
      policy: buildPolicy(),
      approvals: [
        buildApproval({ id: "apr_stranger", approverId: "usr_stranger" }),
      ],
    });

    expect(result.status).toBe("pending");
    expect(result.approvedCount).toBe(0);
  });

  it("ignores approvals recorded against a different request", () => {
    const result = evaluateApprovalThreshold({
      request: buildRequest({ state: "pending_approval" }),
      policy: buildPolicy(),
      approvals: [buildApproval({ actionRequestId: "req_other_9999" })],
    });

    expect(result.approvedCount).toBe(0);
  });

  it("treats any rejection as decisive", () => {
    const result = evaluateApprovalThreshold({
      request: buildRequest({ state: "pending_approval" }),
      policy: dualControl,
      approvals: [
        buildApproval(),
        buildApproval({
          id: "apr_nora",
          approverId: "usr_nora",
          approverName: "Nora Singh",
          decision: "rejected",
          reason: "Vendor is under review.",
          createdAt: isoAt(3),
        }),
      ],
    });

    expect(result.status).toBe("rejected");
    expect(result.status === "rejected" && result.rejectedBy).toBe("usr_nora");
  });

  it("honours an approver's latest decision, not their first", () => {
    const reversed = evaluateApprovalThreshold({
      request: buildRequest({ state: "pending_approval" }),
      policy: buildPolicy(),
      approvals: [
        buildApproval({ id: "apr_first", createdAt: isoAt(1) }),
        buildApproval({
          id: "apr_second",
          decision: "rejected",
          reason: "Changed my mind after seeing the invoice.",
          createdAt: isoAt(4),
        }),
      ],
    });

    expect(reversed.status).toBe("rejected");
  });

  it("refuses to compare a request against an unrelated policy", () => {
    expect(() =>
      evaluateApprovalThreshold({
        request: buildRequest({ policyId: "pol_other" }),
        policy: buildPolicy(),
        approvals: [],
      }),
    ).toThrow(/different policy/i);
  });

  it("is immediately satisfied when no approval is required", () => {
    const result = evaluateApprovalThreshold({
      request: buildRequest(),
      policy: buildPolicy({
        approvalRule: { threshold: 0, approverIds: [] },
      }),
      approvals: [],
    });

    expect(result.status).toBe("satisfied");
  });
});
