const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY;
if (!FIREBASE_API_KEY) {
  throw new Error("FIREBASE_API_KEY environment variable is required");
}

const IDENTITY_TOOLKIT_URL = "https://identitytoolkit.googleapis.com/v1";

interface FirebaseUserInfo {
  localId: string;
  email?: string;
  displayName?: string;
  photoUrl?: string;
  phoneNumber?: string;
  emailVerified?: boolean;
  providerUserInfo?: Array<{
    providerId: string;
    federatedId?: string;
  }>;
}

export async function verifyFirebaseToken(idToken: string): Promise<FirebaseUserInfo | null> {
  try {
    const res = await globalThis.fetch(
      `${IDENTITY_TOOLKIT_URL}/accounts:lookup?key=${FIREBASE_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      },
    );

    if (!res.ok) {
      const errorText = await res.text();
      console.error(`Firebase token verification failed: ${res.status} - ${errorText}`);
      return null;
    }

    const data = await res.json();
    const users = data.users;
    if (!users || users.length === 0) return null;
    return users[0] as FirebaseUserInfo;
  } catch (error) {
    console.error("Firebase token verification error:", error instanceof Error ? error.message : "Unknown error");
    return null;
  }
}
