import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { responseJson } from "./response-json.mjs";

/** Public status releases an exact pre-signing failure without exposing private evidence. */
export async function tinDebitStatusTest(fixture) {
  const rejected = { ...fixture.contract.createReceivedWork({ id: "rejected-debit", kind: "TIN_DEBIT", payload: { paymentId: "rejected-debit" } }),
    status: "REJECTED", nodeLease: null, crankerLease: null };
  const failedBeforeAuthorization = { status: "FAILED", verification: { verificationType: "TSN_TIN_DEBIT_V1" },
    authorization: null, result: { reason: "TIN_DEBIT_AUTHORIZATION_LEASE_INVALID" } };
  for (const [patch, expected] of [
    [{}, true],
    [{ payload: { paymentId: "different-debit" } }, false],
    [{ kind: "TIN_OPERATION" }, undefined],
    [{ status: "FAILED" }, false],
    [{ status: "SUBMITTED" }, false],
    [{ nodeLease: { owner: "node", expiresAt: new Date(0).toISOString() } }, false],
    [{ crankerLease: { owner: "cranker", expiresAt: new Date(0).toISOString() } }, false],
    [{ authorization: { kind: "TSN_TCAP_GPRU_TIN_DEBIT_AUTHORIZATION_V1" } }, false],
    [{ result: { signature: "unresolved-signed-attempt" } }, false],
    [{ retryHistory: [{ previousStatus: "CRANKER_LEASED" }] }, false],
    [{ nonExecutionHistory: [{ kind: "EXPIRED_UNCHANGED_ROOT" }] }, false],
    [failedBeforeAuthorization, true],
    [{ ...failedBeforeAuthorization, verification: null }, false],
    [{ ...failedBeforeAuthorization, authorization: { kind: "TSN_TCAP_GPRU_TIN_DEBIT_AUTHORIZATION_V1" } }, false],
    [{ ...failedBeforeAuthorization, result: { ...failedBeforeAuthorization.result, signature: "signed-attempt" } }, false],
    [{ ...failedBeforeAuthorization, result: { reason: "TSN_STORE_TRANSPORT_UNAVAILABLE" } }, false],
    [{ ...failedBeforeAuthorization, retryHistory: [{ previousStatus: "CRANKER_LEASED" }] }, false],
    [{ ...failedBeforeAuthorization, crankerLease: { owner: "cranker", expiresAt: new Date(0).toISOString() } }, false],
  ]) {
    const work = { ...rejected, ...patch };
    const response = await fixture.getPublicStatus({ NextResponse: { json: responseJson }, createHash, getWork: async () => work },
      {}, { params: Promise.resolve({ id: work.id }) });
    assert.equal(response.data.safeToReplace, expected, JSON.stringify(patch));
    assert.doesNotMatch(JSON.stringify(response.data), /payloadCommitment|authorizationCommitment|retryHistory|nonExecutionHistory|senderOpening|TIN_DEBIT_AUTHORIZATION_LEASE_INVALID/);
  }
}
