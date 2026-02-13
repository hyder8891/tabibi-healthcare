const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY;
const IDENTITY_TOOLKIT_URL = "https://identitytoolkit.googleapis.com/v1";

interface FirebaseSignUpResponse {
  idToken: string;
  email: string;
  refreshToken: string;
  expiresIn: string;
  localId: string;
}

interface FirebaseError {
  error: {
    code: number;
    message: string;
    errors: Array<{ message: string; domain: string; reason: string }>;
  };
}

export async function firebaseCreateUser(email: string, password: string): Promise<FirebaseSignUpResponse> {
  const res = await globalThis.fetch(
    `${IDENTITY_TOOLKIT_URL}/accounts:signUp?key=${FIREBASE_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        password,
        returnSecureToken: true,
      }),
    },
  );

  const data = await res.json();
  if (!res.ok) {
    const err = data as FirebaseError;
    throw new Error(err.error?.message || "Firebase signup failed");
  }
  return data as FirebaseSignUpResponse;
}

export async function firebaseSendVerificationEmail(idToken: string): Promise<void> {
  const res = await globalThis.fetch(
    `${IDENTITY_TOOLKIT_URL}/accounts:sendOobCode?key=${FIREBASE_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requestType: "VERIFY_EMAIL",
        idToken,
      }),
    },
  );

  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error?.message || "Failed to send verification email");
  }
}

export async function firebaseCheckEmailVerified(idToken: string): Promise<boolean> {
  const res = await globalThis.fetch(
    `${IDENTITY_TOOLKIT_URL}/accounts:lookup?key=${FIREBASE_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    },
  );

  if (!res.ok) return false;

  const data = await res.json();
  const users = data.users;
  if (!users || users.length === 0) return false;
  return users[0].emailVerified === true;
}

export async function firebaseRefreshToken(refreshToken: string): Promise<string> {
  const res = await globalThis.fetch(
    `https://securetoken.googleapis.com/v1/token?key=${FIREBASE_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    },
  );

  if (!res.ok) throw new Error("Failed to refresh token");
  const data = await res.json();
  return data.id_token;
}

export async function firebaseDeleteUser(idToken: string): Promise<void> {
  try {
    await globalThis.fetch(
      `${IDENTITY_TOOLKIT_URL}/accounts:delete?key=${FIREBASE_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      },
    );
  } catch {}
}

export function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}
