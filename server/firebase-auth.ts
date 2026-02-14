import { createRemoteJWKSet, jwtVerify } from "jose";

const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID;
if (!FIREBASE_PROJECT_ID) {
  throw new Error("FIREBASE_PROJECT_ID environment variable is required");
}

const JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com")
);

export interface FirebaseTokenPayload {
  uid: string;
  email?: string;
  name?: string;
  picture?: string;
  phone_number?: string;
  firebase: {
    sign_in_provider: string;
  };
}

export async function verifyFirebaseToken(idToken: string): Promise<FirebaseTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(idToken, JWKS, {
      issuer: `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`,
      audience: FIREBASE_PROJECT_ID,
    });
    return {
      uid: payload.sub!,
      email: payload.email as string | undefined,
      name: payload.name as string | undefined,
      picture: payload.picture as string | undefined,
      phone_number: payload.phone_number as string | undefined,
      firebase: {
        sign_in_provider: (payload.firebase as any)?.sign_in_provider || "unknown",
      },
    };
  } catch (error) {
    console.error("Firebase token verification failed:", error instanceof Error ? error.message : "Unknown");
    return null;
  }
}
