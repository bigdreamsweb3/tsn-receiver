import assert from "node:assert/strict";
import { attachmentParams } from "./attachment-params.mjs";
import { createCaseDependencies } from "./create-case-dependencies.mjs";
import { createReadyWork } from "./create-ready-work.mjs";
import { readWork } from "./read-work.mjs";
import { signFundingVerification } from "./sign-funding-verification.mjs";

function observeQueueQueries(collection) {
  const queries = [];
  const where = collection.where.bind(collection);
  const observe = query => ({
    where: (...args) => observe(query.where(...args)),
    orderBy: (...args) => observe(query.orderBy(...args)),
    startAfter: (...args) => observe(query.startAfter(...args)),
    limit: (...args) => observe(query.limit(...args)),
    get() {
      queries.push(query.filters);
      return query.get();
    },
  });
  collection.where = (...args) => observe(where(...args));
  return queries;
}

export async function signedFundingNodeQueryTest(fixture) {
  const context = createCaseDependencies(fixture);
  const { work } = await createReadyWork(context, "signed-node-query");
  await context.attach(attachmentParams(work));
  const collection = context.dependencies.workCollection;
  const queries = observeQueueQueries(collection);
  const fundingKind = ["kind", "==", "AUTHORIZED_FUNDING"];
  const combinedQuery = [["status", "in", ["RECEIVED", "NODE_VERIFYING"]], fundingKind];

  const leased = await context.leaseNode("first-node", ["AUTHORIZED_FUNDING"], "SIGNED_DEPOSIT");
  assert.equal(leased.id, work.id);
  assert.deepEqual(queries.splice(0), [combinedQuery]);

  const stored = await readWork(context, work.id);
  await collection.doc(work.id).set({ ...stored, nodeLease: { ...stored.nodeLease, expiresAt: new Date(0).toISOString() } });
  const reclaimed = await context.leaseNode("next-node", ["AUTHORIZED_FUNDING"], "SIGNED_DEPOSIT");
  assert.equal(reclaimed?.id, work.id);
  assert.equal(reclaimed.nodeLease.owner, "next-node");
  assert.equal(reclaimed.stateVersion, leased.stateVersion + 2);
  assert.deepEqual(queries, [combinedQuery, [["status", "==", "RECEIVED"], fundingKind]]);
}

export async function fundingCrankerQueryTest(fixture) {
  const context = createCaseDependencies(fixture);
  const { work } = await createReadyWork(context, "signed-cranker-query");
  await context.attach(attachmentParams(work));
  const nodeLease = await context.leaseNode("synthetic-node", ["AUTHORIZED_FUNDING"], "SIGNED_DEPOSIT");
  await context.transition({ id: work.id, actor: "node", owner: "synthetic-node", expectedVersion: nodeLease.stateVersion,
    status: "VERIFIED", evidence: signFundingVerification(context, nodeLease) });

  const collection = context.dependencies.workCollection;
  const expiresAt = new Date(0).toISOString();
  const native = { id: "expired-native-lease", kind: "TIN_DEBIT", status: "CRANKER_LEASED", stateVersion: 5, payload: {},
    crankerLease: { owner: "old-native-cranker", expiresAt, leaseId: "expired-native-lease", version: 5 } };
  await collection.doc(native.id).set(native);
  const queries = observeQueueQueries(collection);
  const fundingKind = ["kind", "==", "AUTHORIZED_FUNDING"];
  const combinedQuery = [["status", "in", ["VERIFIED", "CRANKER_LEASED"]], fundingKind];

  const leased = await context.leaseCranker("first-cranker", ["AUTHORIZED_FUNDING"]);
  assert.equal(leased.id, work.id);
  assert.deepEqual(queries.splice(0), [combinedQuery]);
  assert.deepEqual(await readWork(context, native.id), native);

  const stored = await readWork(context, work.id);
  await collection.doc(work.id).set({ ...stored, crankerLease: { ...stored.crankerLease, expiresAt } });
  const reclaimed = await context.leaseCranker("next-cranker", ["AUTHORIZED_FUNDING"]);
  assert.equal(reclaimed?.id, work.id);
  assert.equal(reclaimed.crankerLease.owner, "next-cranker");
  assert.equal(reclaimed.stateVersion, leased.stateVersion + 2);
  assert.deepEqual(queries, [combinedQuery, [["status", "==", "VERIFIED"], fundingKind]]);
  assert.deepEqual(await readWork(context, native.id), native);

  assert.equal(await context.leaseCranker("native-cranker", ["TIN_DEBIT"]), null);
  const requeued = await readWork(context, native.id);
  assert.equal(requeued.status, "RECEIVED");
  assert.equal(requeued.stateVersion, native.stateVersion + 1);
  assert.equal(requeued.crankerLease, null);
}
