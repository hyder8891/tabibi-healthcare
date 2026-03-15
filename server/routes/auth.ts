import type { Express, Request, Response } from "express";
import { randomInt } from "crypto";
import { storage } from "../storage";
import { verifyFirebaseToken } from "../firebase-auth";
import { requireAuth } from "./middleware";
import { adminAuth } from "../firebase-admin";
import { sendSMSViaTwilio } from "../twilio";

const FIREBASE_API_KEY = process.env.EXPO_PUBLIC_FIREBASE_API_KEY || process.env.FIREBASE_API_KEY || "";
const IDENTITY_TOOLKIT_URL = "https://identitytoolkit.googleapis.com/v1";

function mapFirebaseErrorToFriendly(rawCode: string): string {
  const upper = rawCode.toUpperCase();
  if (upper.includes("INVALID_SESSION_INFO") || upper.includes("TOO_LONG_SESSION_INFO"))
    return "SESSION_INVALID";
  if (upper.includes("SESSION_EXPIRED"))
    return "SESSION_EXPIRED";
  if (upper.includes("INVALID_CODE") || upper.includes("INVALID_TEMPORARY_PROOF"))
    return "INVALID_CODE";
  if (upper.includes("QUOTA_EXCEEDED") || upper.includes("TOO_MANY_ATTEMPTS"))
    return "TOO_MANY_ATTEMPTS";
  if (upper.includes("INVALID_PHONE_NUMBER") || upper.includes("MISSING_PHONE_NUMBER"))
    return "INVALID_PHONE_NUMBER";
  if (upper.includes("CAPTCHA") || upper.includes("RECAPTCHA"))
    return "CAPTCHA_FAILED";
  if (upper.includes("BLOCKED") || upper.includes("ADMIN_ONLY"))
    return "BLOCKED";
  if (upper.includes("USER_DISABLED"))
    return "USER_DISABLED";
  return "UNKNOWN_ERROR";
}

const phoneRateLimits = new Map<string, { count: number; resetAt: number }>();
const PHONE_RATE_LIMIT_WINDOW = 60 * 1000;
const PHONE_RATE_LIMIT_MAX = 3;

function checkPhoneRateLimit(key: string): boolean {
  const now = Date.now();
  const entry = phoneRateLimits.get(key);
  if (!entry || now > entry.resetAt) {
    phoneRateLimits.set(key, { count: 1, resetAt: now + PHONE_RATE_LIMIT_WINDOW });
    return true;
  }
  if (entry.count >= PHONE_RATE_LIMIT_MAX) return false;
  entry.count++;
  return true;
}

const otpStore = new Map<string, { code: string; expiresAt: number; attempts: number }>();
const OTP_EXPIRY_MS = 5 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;

function generateOTP(): string {
  return randomInt(100000, 1000000).toString();
}

async function sendOTPViaTwilio(phoneNumber: string): Promise<boolean> {
  const otp = generateOTP();
  otpStore.set(phoneNumber, {
    code: otp,
    expiresAt: Date.now() + OTP_EXPIRY_MS,
    attempts: 0,
  });

  const sent = await sendSMSViaTwilio(phoneNumber, otp);
  if (!sent) {
    otpStore.delete(phoneNumber);
  }
  return sent;
}

export function registerAuthRoutes(app: Express): void {
  app.post("/api/auth/firebase", async (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith("Bearer ")) {
        return res.status(400).json({ message: "Authorization header required" });
      }
      const token = authHeader.slice(7);

      const firebaseUser = await verifyFirebaseToken(token);
      if (!firebaseUser) {
        return res.status(401).json({ message: "Invalid or expired token" });
      }

      let user = await storage.getUserByFirebaseUid(firebaseUser.uid);

      if (!user) {
        if (firebaseUser.email) {
          user = await storage.getUserByEmail(firebaseUser.email);
        }

        if (user) {
          user = await storage.updateUser(user.id, {
            firebaseUid: firebaseUser.uid,
            photoUrl: firebaseUser.picture || undefined,
            authProvider: firebaseUser.firebase.sign_in_provider || "email",
          });
        } else {
          try {
            user = await storage.createUser({
              firebaseUid: firebaseUser.uid,
              email: firebaseUser.email || null,
              phone: firebaseUser.phone_number || null,
              name: firebaseUser.name || null,
              photoUrl: firebaseUser.picture || null,
              authProvider: firebaseUser.firebase.sign_in_provider || "email",
            });
          } catch (createErr: unknown) {
            const errMsg = createErr instanceof Error ? createErr.message : "";
            if (errMsg.includes("users_email_unique") && firebaseUser.email) {
              user = await storage.getUserByEmail(firebaseUser.email);
              if (user) {
                user = await storage.updateUser(user.id, {
                  firebaseUid: firebaseUser.uid,
                  photoUrl: firebaseUser.picture || undefined,
                  authProvider: firebaseUser.firebase.sign_in_provider || "email",
                });
              } else {
                throw createErr;
              }
            } else {
              throw createErr;
            }
          }
        }
      } else {
        const updates: Record<string, any> = {};
        if (firebaseUser.name && firebaseUser.name !== user.name) updates.name = firebaseUser.name;
        if (firebaseUser.picture && firebaseUser.picture !== user.photoUrl) updates.photoUrl = firebaseUser.picture;
        if (firebaseUser.email && !user.email) updates.email = firebaseUser.email;
        if (firebaseUser.phone_number && !user.phone) updates.phone = firebaseUser.phone_number;
        if (Object.keys(updates).length > 0) {
          user = await storage.updateUser(user.id, updates);
        }
      }

      return res.json({
        id: user.id,
        email: user.email,
        phone: user.phone,
        name: user.name,
        photoUrl: user.photoUrl,
        authProvider: user.authProvider,
      });
    } catch (error) {
      console.error("Firebase auth error:", error instanceof Error ? error.message : "Unknown error");
      return res.status(500).json({ message: "Authentication failed" });
    }
  });

  app.post("/api/auth/logout", (_req: Request, res: Response) => {
    return res.json({ ok: true });
  });

  app.get("/api/auth/me", requireAuth, async (req: Request, res: Response) => {
    const user = await storage.getUser(req.userId!);
    if (!user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    return res.json({
      id: user.id,
      email: user.email,
      phone: user.phone,
      name: user.name,
      photoUrl: user.photoUrl,
      authProvider: user.authProvider,
    });
  });

  app.post("/api/auth/phone/send-code", async (req: Request, res: Response) => {
    try {
      const { phoneNumber, recaptchaToken } = req.body;
      if (!phoneNumber) {
        return res.status(400).json({ message: "Phone number is required" });
      }
      const ip = req.ip || req.socket.remoteAddress || "unknown";
      if (!checkPhoneRateLimit(`ip:${ip}`) || !checkPhoneRateLimit(`phone:${phoneNumber}`)) {
        return res.status(429).json({ message: "Too many requests. Please wait before trying again." });
      }

      if (recaptchaToken && FIREBASE_API_KEY) {
        try {
          const response = await fetch(
            `${IDENTITY_TOOLKIT_URL}/accounts:sendVerificationCode?key=${FIREBASE_API_KEY}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ phoneNumber, recaptchaToken }),
            }
          );
          const data = await response.json();
          if (response.ok) {
            return res.json({ sessionInfo: data.sessionInfo });
          }
          const rawCode = data?.error?.message || "UNKNOWN_ERROR";
          console.warn("Firebase sendVerificationCode failed, falling back to Twilio:", rawCode);
        } catch (err: unknown) {
          console.warn("Firebase reCAPTCHA path error, falling back to Twilio:", err instanceof Error ? err.message : "Unknown");
        }
      }

      const sent = await sendOTPViaTwilio(phoneNumber);
      if (sent) {
        return res.json({ method: "otp", message: "Verification code sent" });
      }

      const isDev = process.env.NODE_ENV === "development";
      if (isDev) {
        const otp = generateOTP();
        otpStore.set(phoneNumber, {
          code: otp,
          expiresAt: Date.now() + OTP_EXPIRY_MS,
          attempts: 0,
        });
        console.log(`[DEV OTP] Code for ${phoneNumber}: ${otp}`);
        return res.json({ method: "otp", message: "Verification code sent" });
      }

      console.error("SMS delivery failed. Twilio and all fallbacks exhausted.");
      return res.status(503).json({ message: "SMS service not available. Please try again later." });
    } catch (error: unknown) {
      console.error("Phone send code error:", error instanceof Error ? error.message : "Unknown");
      return res.status(500).json({ message: "Failed to send verification code" });
    }
  });

  app.post("/api/auth/phone/verify-code", async (req: Request, res: Response) => {
    try {
      const { phoneNumber, sessionInfo, code, displayName } = req.body;
      if (!code) {
        return res.status(400).json({ message: "Verification code is required" });
      }
      const ip = req.ip || req.socket.remoteAddress || "unknown";
      if (!checkPhoneRateLimit(`verify:${ip}`)) {
        return res.status(429).json({ message: "Too many verification attempts. Please wait." });
      }

      if (sessionInfo) {
        if (!FIREBASE_API_KEY) {
          return res.status(500).json({ message: "Firebase API key not configured" });
        }
        const response = await fetch(
          `${IDENTITY_TOOLKIT_URL}/accounts:signInWithPhoneNumber?key=${FIREBASE_API_KEY}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionInfo, code }),
          }
        );
        const data = await response.json();
        if (!response.ok) {
          const rawCode = data?.error?.message || "UNKNOWN_ERROR";
          console.error("Firebase signInWithPhoneNumber error:", rawCode);
          return res.status(response.status).json({ message: mapFirebaseErrorToFriendly(rawCode) });
        }
        const uid = data.localId;
        if (displayName) {
          try {
            await adminAuth.updateUser(uid, { displayName });
          } catch {}
        }
        const customToken = await adminAuth.createCustomToken(uid);
        return res.json({ customToken, uid });
      }

      if (!phoneNumber) {
        return res.status(400).json({ message: "Phone number is required" });
      }

      const stored = otpStore.get(phoneNumber);
      if (!stored) {
        return res.status(400).json({ message: "No verification code found. Please request a new one." });
      }
      if (Date.now() > stored.expiresAt) {
        otpStore.delete(phoneNumber);
        return res.status(400).json({ message: "Verification code expired. Please request a new one." });
      }
      if (stored.attempts >= OTP_MAX_ATTEMPTS) {
        otpStore.delete(phoneNumber);
        return res.status(429).json({ message: "Too many failed attempts. Please request a new code." });
      }
      stored.attempts++;

      if (stored.code !== code) {
        return res.status(400).json({ message: "Invalid verification code. Please try again." });
      }

      otpStore.delete(phoneNumber);

      let firebaseUser;
      try {
        firebaseUser = await adminAuth.getUserByPhoneNumber(phoneNumber);
      } catch {
        firebaseUser = await adminAuth.createUser({
          phoneNumber,
          ...(displayName ? { displayName } : {}),
        });
      }

      if (displayName && !firebaseUser.displayName) {
        await adminAuth.updateUser(firebaseUser.uid, { displayName });
      }

      const customToken = await adminAuth.createCustomToken(firebaseUser.uid);

      return res.json({ customToken, uid: firebaseUser.uid });
    } catch (error: unknown) {
      console.error("Phone verify code error:", error instanceof Error ? error.message : "Unknown");
      return res.status(500).json({ message: "Failed to verify code" });
    }
  });
}
