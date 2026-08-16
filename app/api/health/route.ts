import { NextResponse } from "next/server";
import { db } from "../../../lib/firebase";
export const runtime = "nodejs";
export async function GET() {
  try {
    await db
      .collection(process.env.TSN_RECEIVER_STATE_COLLECTION ?? "tsn_receiver_state")
      .limit(1)
      .get();
    return NextResponse.json({ service: "TSN_RECEIVER", storage: "FIREBASE", status: "READY" });
  } catch (error) {
    console.error("TSN Receiver Firebase health check failed", error);
    return NextResponse.json(
      { service: "TSN_RECEIVER", storage: "FIREBASE", status: "DEGRADED" },
      { status: 503 },
    );
  }
}
