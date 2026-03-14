import admin from "firebase-admin";

function parseServiceAccountKey(): admin.ServiceAccount | null {
  let raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw) return null;

  raw = raw.trim();
  if (raw.startsWith("{") && !raw.endsWith("}")) {
    raw = raw + "}";
  }

  try {
    return JSON.parse(raw);
  } catch {
    try {
      const fixed = raw.replace(/\n/g, "\\n");
      return JSON.parse(fixed);
    } catch {
      try {
        const base64 = Buffer.from(raw, "base64").toString("utf-8");
        return JSON.parse(base64);
      } catch {
        console.error("Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY");
        return null;
      }
    }
  }
}

if (!admin.apps.length) {
  const serviceAccount = parseServiceAccountKey();
  if (serviceAccount) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    console.log("Firebase Admin SDK initialized with service account");
  } else {
    admin.initializeApp({
      projectId:
        process.env.FIREBASE_PROJECT_ID ||
        process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
    });
    console.warn("Firebase Admin SDK initialized without service account (limited functionality)");
  }
}

export const adminAuth = admin.auth();

export async function getAdminAccessToken(): Promise<string | null> {
  try {
    const credential = admin.app().options.credential;
    if (!credential) return null;
    const token = await credential.getAccessToken();
    return token?.access_token || null;
  } catch {
    return null;
  }
}
