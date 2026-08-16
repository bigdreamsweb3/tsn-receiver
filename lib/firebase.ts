import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

function credential() {
  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n").trim();
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "FIREBASE_SERVER_CONFIG_MISSING: set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY",
    );
  }
  return cert({ projectId, clientEmail, privateKey });
}

const app = getApps()[0] ?? initializeApp({ credential: credential() });
export const db = getFirestore(app);
export const workCollection = db.collection(process.env.TSN_RECEIVER_COLLECTION ?? "tsn_receiver_work");
