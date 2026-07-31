import { evaluateApprovalThreshold } from "@/application/approval-service";
import { describe, expect, it } from "vitest";
import {
  buildApproval,
  buildPolicy,
  buildRequest,
} from "./fixtures";

describe("evaluateApprovalThreshold", () => {
  it("satisfies a two-person threshold with distinct authorized approvers", () => {
    const result = evaluateApprovalThreshold({
      request: buildRequest(),
      policy: buildPolicy({
        approvalRule: {
          threshold: 2,
          approverIds: ["usr_maya", "usr_omar"],
        },
      }),
      approvals: [
        buildApproval(),
        buildApproval({
          id: "apr_omar",
          approverId: "usr_omar",
          approverName: "Omar Haddad",
        }),
      ],
    });

    expect(result).toEqual({
      status: "satisfied",
      approvedCount: 2,
      requiredCount: 2,
      remainingCount: 0,
    });
  });

  it("does not count duplicate or unauthorized approvals", () => {
    const result = evaluateApprovalThreshold({
      request: buildRequest(),
      policy: buildPolicy({
        approvalRule: {
          threshold: 2,
          approverIds: ["usr_maya", "usr_omar"],
        },
      }),
      approvals: [
        buildApproval(),
        buildApproval({ id: "apr_maya_duplicate" }),
        buildApproval({
          id: "apr_outsider",
          approverId: "usr_outsider",
          approverName: "Outside reviewer",
        }),
      ],
    });

    expect(result).toMatchObject({
      status: "pending",
      approvedCount: 1,
      remainingCount: 1,
    });
  });

  it("treats an authorized rejection as decisive", () => {
    const result = evaluateApprovalThreshold({
      request: buildRequest(),
      policy: buildPolicy(),
      approvals: [
        buildApproval({
          decision: "rejected",
          reason: "Invoice evidence is incomplete",
        }),
      ],
    });

    expect(result).toMatchObject({
      status: "rejected",
      rejectedBy: "usr_maya",
    });
  });

  it("immediately satisfies a policy with no approval requirement", () => {
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
