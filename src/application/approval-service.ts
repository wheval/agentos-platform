import {
  ActionRequestSchema,
  ApprovalSchema,
  PolicySchema,
  type ActionRequest,
  type Approval,
  type Policy,
} from "@/domain/schemas";

export type ApprovalThresholdResult =
  | {
      status: "satisfied";
      approvedCount: number;
      requiredCount: number;
      remainingCount: 0;
    }
  | {
      status: "pending";
      approvedCount: number;
      requiredCount: number;
      remainingCount: number;
    }
  | {
      status: "rejected";
      approvedCount: number;
      requiredCount: number;
      remainingCount: number;
      rejectedBy: string;
    };

export function evaluateApprovalThreshold(input: {
  request: ActionRequest;
  policy: Policy;
  approvals: Approval[];
}): ApprovalThresholdResult {
  const request = ActionRequestSchema.parse(input.request);
  const policy = PolicySchema.parse(input.policy);
  const approvals = input.approvals.map((approval) =>
    ApprovalSchema.parse(approval),
  );

  if (request.policyId !== policy.id) {
    throw new Error("Cannot evaluate approvals against a different policy");
  }

  const authorizedApprovers = new Set(policy.approvalRule.approverIds);
  const latestDecisionByApprover = new Map<string, Approval>();

  for (const approval of approvals) {
    if (
      approval.actionRequestId === request.id &&
      authorizedApprovers.has(approval.approverId)
    ) {
      const previous = latestDecisionByApprover.get(approval.approverId);
      if (!previous || previous.createdAt < approval.createdAt) {
        latestDecisionByApprover.set(approval.approverId, approval);
      }
    }
  }

  const decisions = [...latestDecisionByApprover.values()];
  const rejection = decisions.find((approval) => approval.decision === "rejected");
  const approvedCount = decisions.filter(
    (approval) => approval.decision === "approved",
  ).length;
  const requiredCount = policy.approvalRule.threshold;
  const remainingCount = Math.max(requiredCount - approvedCount, 0);

  if (rejection) {
    return {
      status: "rejected",
      approvedCount,
      requiredCount,
      remainingCount,
      rejectedBy: rejection.approverId,
    };
  }

  if (approvedCount >= requiredCount) {
    return {
      status: "satisfied",
      approvedCount,
      requiredCount,
      remainingCount: 0,
    };
  }

  return {
    status: "pending",
    approvedCount,
    requiredCount,
    remainingCount,
  };
}
