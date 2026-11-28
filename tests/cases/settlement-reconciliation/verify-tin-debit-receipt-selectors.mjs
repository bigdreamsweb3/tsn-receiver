import assert from "node:assert/strict";
import { sign } from "node:crypto";
import { PublicKey } from "@solana/web3.js";
import { b58 } from "./b58.mjs";
import { hash } from "./hash.mjs";
import { uint } from "./uint.mjs";

export function verifyTinDebitReceiptSelectors(assertSettlementReceipt, fixture) {
    const { TSNP, TCAP, TIP, GPRU, payer, authority, operatorKey, motherKey, mother } = fixture;
    const derive = (program, seed, ...other) => PublicKey.findProgramAddressSync([Buffer.from(seed), ...other], program)[0];
    const assetEntry = new PublicKey(Buffer.alloc(32, 5));
    const authorizationDigest = Buffer.alloc(32, 1);
    const accounts = {
        authority, motherEscrow: derive(TSNP, "tsn_mother_escrow"), tcapProgram: TCAP, tsnProgram: TSNP,
        config: derive(TCAP, "tcap:global-config:v1"), assetEntry, commitmentRoot: derive(TCAP, "tcap:commitment-root:v1"),
        reserveState: derive(TCAP, "tcap:reserve-state:v1", assetEntry.toBuffer()),
        authorizationSigner: derive(TSNP, "tsn:tcap-authorization:v1", authorizationDigest),
        tipRouteRoot: derive(TIP, "tip:route-merkle-root:v1"), tinDebitVerifier: derive(GPRU, "gpru:tin-debit-verifier:v1"),
        instructions: new PublicKey("Sysvar1nstructions1111111111111111111111111"), gpruProgram: GPRU,
    };
    const instructionKeys = Object.values(accounts);
    const memoProgram = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
    const keys = [payer, authority, accounts.commitmentRoot,
        ...instructionKeys.filter(key => !key.equals(authority) && !key.equals(accounts.commitmentRoot)), memoProgram];
    const keyIndex = key => keys.findIndex(candidate => candidate.equals(key));
    const publicInputs = Array.from({ length: 26 }, (_, index) => Buffer.alloc(32, index + 2));
    const memoPayloads = ["a".repeat(582), "b".repeat(582)];
    const transition = {
        ...Object.fromEntries(Object.entries(accounts).map(([name, key]) => [name, key.toBase58()])),
        authorizationDigest: authorizationDigest.toString("hex"),
        tcapRootSequence: "1", memoPayloads, proof: { publicInputs: publicInputs.map(input => input.toString("hex")),
            proofA: "00".repeat(64), proofB: "00".repeat(128), proofC: "00".repeat(64) },
    };
    const work = { kind: "TIN_DEBIT", authorization: { transition } };
    const rootData = Buffer.alloc(124);
    hash("account:TcapCommitmentRootStateV1").copy(rootData, 0, 0, 8);
    publicInputs[1].copy(rootData, 12);
    publicInputs[0].copy(rootData, 44);
    uint(1, 8).copy(rootData, 80);
    const root = { owner: TCAP.toBase58(), data: [rootData.toString("base64"), "base64"] };
    const makeReceipt = name => {
        const statement = Buffer.concat([hash(`global:${name}`).subarray(0, 8), authorizationDigest, ...publicInputs, Buffer.alloc(256)]);
        const header = (program, count, size) => Buffer.concat([Buffer.from([keyIndex(program), count]), uint(size, 2)]);
        const message = Buffer.concat([
            Buffer.from([0x81, 2, 1, keys.length - 3]), uint(12, 4), Buffer.alloc(32), Buffer.from([3, keys.length]),
            ...keys.map(key => key.toBuffer()), uint(1400000, 4), uint(64 * 1024 * 1024, 4),
            header(TSNP, instructionKeys.length, statement.length), header(memoProgram, 1, 582), header(memoProgram, 1, 582),
            Buffer.from(instructionKeys.map(keyIndex)), statement,
            ...memoPayloads.flatMap(memo => [Buffer.from([1]), Buffer.from(memo, "ascii")]),
        ]);
        const payerSignature = sign(null, message, operatorKey.privateKey);
        const wire = Buffer.concat([message, payerSignature, sign(null, message, motherKey.privateKey)]);
        return { signature: b58(payerSignature), wire,
            receipt: { version: 1, slot: 100, meta: { err: null }, transaction: [wire.toString("base64"), "base64"] } };
    };
    const read = (candidate, signed) => assertSettlementReceipt(candidate, signed.signature, signed.receipt, mother, root);
    assert.equal(read(work, makeReceipt("tin_debit_v1")).stage, "TCAP_GPRU_TIN_DEBIT_V1_CONFIRMED");
    const historical = makeReceipt("tsn_register_tcap_tin_debit_authorization_v1");
    assert.throws(() => read(work, historical), /TIN_DEBIT_RECEIPT_STATEMENT_INVALID/);
    const checkpoint = { signature: historical.signature, blockhash: PublicKey.default.toBase58(),
        wireBytes: historical.wire.length, wireSha256: hash(historical.wire).toString("hex") };
    assert.equal(read({ ...work, result: checkpoint }, historical).stage, "TCAP_GPRU_TIN_DEBIT_V1_CONFIRMED");
    assert.throws(() => read({ ...work, result: { ...checkpoint, wireBytes: checkpoint.wireBytes + 1 } }, historical),
        /SETTLEMENT_LATE_REPORT_SUBMISSION_MISMATCH/);
}
