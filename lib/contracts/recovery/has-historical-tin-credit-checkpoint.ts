import { HISTORICAL_TIN_CREDIT_AUTHORIZATION_KIND, HISTORICAL_TIN_CREDIT_SIGNED_STAGE } from "../constants";
import type { ReceiverWork } from "../models";

/** Recognize the stored generation for recovery. Each caller still validates the full checkpoint. */
export function hasHistoricalTinCreditCheckpoint(work: ReceiverWork): boolean {
  return work.kind === "SETTLEMENT" && work.authorization?.kind === HISTORICAL_TIN_CREDIT_AUTHORIZATION_KIND
    && work.result?.stage === HISTORICAL_TIN_CREDIT_SIGNED_STAGE && Boolean(work.result.signature);
}
