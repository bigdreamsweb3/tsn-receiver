import test, { after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { compileReceiverFixture } from "./support/compile-receiver-fixture.mjs";

const directory = await mkdtemp(path.join(os.tmpdir(), "tsn-debit-authorization-"));
after(() => rm(directory, { recursive: true, force: true }));
await compileReceiverFixture(directory, ["http/api/cranker/work/POST.ts"]);
const { POST } = await import(pathToFileURL(path.join(directory, "http/api/cranker/work/POST.mjs")));

function harness(response = new Response(JSON.stringify({ kind: "TSN_TCAP_GPRU_TIN_DEBIT_AUTHORIZATION_V1" }))) {
  const calls = [];
  const work = { id: "synthetic-debit", kind: "TIN_DEBIT", status: "CRANKER_LEASED", stateVersion: 4,
    payload: {}, crankerLease: { owner: "synthetic-operator", leaseId: "synthetic-debit", version: 4, expiresAt: "2030-01-01T00:00:00.000Z" },
    verification: { verificationType: "TSN_TIN_DEBIT_V1", verifiedPayload: { tcapTinDebitTransition: { proof: "synthetic" } } } };
  const dependencies = {
    authenticateCrankerRequest: async () => "synthetic-operator",
    enforceCrankerLeaseRateLimit: async () => {},
    leaseForCranker: async () => work,
    requestNodeAuthorization: async (route, body) => { calls.push({ route, body }); return { configured: true, response }; },
    crankerAuthorizationForWork: (input, authorization) => {
      assert.equal(input, work);
      return { ...authorization, leaseId: work.id, leaseVersion: 4, leaseExpiresAt: work.crankerLease.expiresAt };
    },
    attachCrankerAuthorization: async params => { calls.push(params); return { ...work, stateVersion: 5, authorization: params.authorization }; },
    verifiedPayloadForWork: input => input.verification.verifiedPayload,
    crankerExecutionPayload: (_kind, payload) => payload,
    retryLeasedSettlementFundingRoot: async params => { calls.push(params); return { id: work.id, status: "RECEIVED", stateVersion: 5 }; },
    NATIVE_REVERIFY_REASONS: new Set(["TCAP_SHARED_REPLAY_ROOT_CHANGED_BEFORE_SETTLEMENT"]),
    NextResponse: { json: (data, options) => ({ data, status: options?.status ?? 200 }) },
  };
  const request = { text: async () => JSON.stringify({ supportedKinds: ["TIN_DEBIT"] }) };
  return { dependencies, request, calls, work };
}

test("TIN-Debit lease obtains and attaches current Node authorization before returning work", async () => {
  const h = harness();
  const result = await POST(h.dependencies, h.request);
  assert.equal(result.status, 200);
  assert.deepEqual(h.calls[0], { route: "/internal/settlement-authorizations/settlement",
    body: { workId: h.work.id, crankerPubkey: "synthetic-operator" } });
  assert.equal(h.calls[1].expectedVersion, 4);
  assert.equal(result.data.work.authorization.kind, "TSN_TCAP_GPRU_TIN_DEBIT_AUTHORIZATION_V1");
  assert.equal(result.data.work.authorization.leaseVersion, result.data.work.crankerLease.version);
  assert.deepEqual(result.data.work.payload, {});
});

test("unavailable Node authorization requeues the leased debit and returns no executable work", async () => {
  const h = harness(null);
  const result = await POST(h.dependencies, h.request);
  assert.equal(result.status, 200);
  assert.equal(result.data.work, null);
  assert.equal(h.calls[1].reason, "TSN_NODE_SIGNING_SERVICE_UNAVAILABLE");
  assert.equal(h.calls[1].expectedVersion, h.work.stateVersion);
});

test("Node root-change rejection requeues debit under the same authenticated lease", async () => {
  const h = harness(new Response(JSON.stringify({ detail: "TCAP_SHARED_REPLAY_ROOT_CHANGED_BEFORE_SETTLEMENT" }), { status: 409 }));
  const result = await POST(h.dependencies, h.request);
  assert.equal(result.data.work, null);
  assert.equal(h.calls[1].reason, "TCAP_SHARED_REPLAY_ROOT_CHANGED_BEFORE_SETTLEMENT");
});
