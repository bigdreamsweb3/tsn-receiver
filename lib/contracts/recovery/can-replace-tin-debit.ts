import type { ReceiverWork } from "../models";
import { hasResolvedNonExecution } from "./has-resolved-non-execution";

/** Allow a new debit after a known pre-signing stop or finalized nonexecution recovery. */
export function canReplaceTinDebit(work: ReceiverWork): boolean {
  if (work.kind !== "TIN_DEBIT" || work.payload.paymentId !== work.id || work.nodeLease || work.crankerLease) return false;
  if (work.status === "FAILED" && hasResolvedNonExecution(work)) return true;
  if ((work.authorization && Object.keys(work.authorization).length > 0)
      || work.retryHistory?.length || work.nonExecutionHistory?.length || work.nonExecutionResolution) return false;
  if (work.status === "REJECTED") return !work.result || Object.keys(work.result).length === 0;

  // The old Cranker returned this exact error before requesting a Mother signature.
  // A persisted debit checkpoint requires an attached authorization.
  return work.status === "FAILED" && work.verification?.verificationType === "TSN_TIN_DEBIT_V1"
    && work.result?.reason === "TIN_DEBIT_AUTHORIZATION_LEASE_INVALID"
    && Object.keys(work.result).length === 1;
}
