import type { Express, Request, Response } from "express";
import { storage } from "../storage";
import { verifyFirebaseToken } from "../firebase-auth";
import { requireAuth } from "./middleware";

const FIREBASE_API_KEY = process.env.EXPO_PUBLIC_FIREBASE_API_KEY || process.env.FIREBASE_API_KEY || "";
const IDENTITY_TOOLKIT_URL = "https://identitytoolkit.googleapis.com/v1";

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
          user = await storage.createUser({
            firebaseUid: firebaseUser.uid,
            email: firebaseUser.email || null,
            phone: firebaseUser.phone_number || null,
            name: firebaseUser.name || null,
            photoUrl: firebaseUser.picture || null,
            authProvider: firebaseUser.firebase.sign_in_provider || "email",
          });
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
      if (!FIREBASE_API_KEY) {
        return res.status(500).json({ message: "Firebase API key not configured" });
      }

      const response = await fetch(
        `${IDENTITY_TOOLKIT_URL}/accounts:sendVerificationCode?key=${FIREBASE_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phoneNumber,
            ...(recaptchaToken ? { recaptchaToken } : {}),
          }),
        }
      );

      const data = await response.json();
      if (!response.ok) {
        const errorCode = data?.error?.message || "UNKNOWN_ERROR";
        console.error("Firebase sendVerificationCode error:", errorCode);
        return res.status(response.status).json({ message: errorCode });
      }

      return res.json({ sessionInfo: data.sessionInfo });
    } catch (error: unknown) {
      console.error("Phone send code error:", error instanceof Error ? error.message : "Unknown");
      return res.status(500).json({ message: "Failed to send verification code" });
    }
  });

  app.post("/api/auth/phone/verify-code", async (req: Request, res: Response) => {
    try {
      const { sessionInfo, code } = req.body;
      if (!sessionInfo || !code) {
        return res.status(400).json({ message: "Session info and code are required" });
      }
      const ip = req.ip || req.socket.remoteAddress || "unknown";
      if (!checkPhoneRateLimit(`verify:${ip}`)) {
        return res.status(429).json({ message: "Too many verification attempts. Please wait." });
      }
      if (!FIREBASE_API_KEY) {
        return res.status(500).json({ message: "Firebase API key not configured" });
      }

      const response = await fetch(
        `${IDENTITY_TOOLKIT_URL}/accounts:signInWithPhoneNumber?key=${FIREBASE_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionInfo,
            code,
          }),
        }
      );

      const data = await response.json();
      if (!response.ok) {
        const errorCode = data?.error?.message || "UNKNOWN_ERROR";
        console.error("Firebase signInWithPhoneNumber error:", errorCode);
        return res.status(response.status).json({ message: errorCode });
      }

      return res.json({
        idToken: data.idToken,
        refreshToken: data.refreshToken,
        localId: data.localId,
        phoneNumber: data.phoneNumber,
      });
    } catch (error: unknown) {
      console.error("Phone verify code error:", error instanceof Error ? error.message : "Unknown");
      return res.status(500).json({ message: "Failed to verify code" });
    }
  });

  app.get("/api/auth/phone/webview", (req: Request, res: Response) => {
    const phone = req.query.phone as string || "";
    const apiKey = FIREBASE_API_KEY;
    const authDomain = process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || "";
    const projectId = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || "";

    const html = `<!DOCTYPE html>
<html><head>
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Phone Verification</title>
<style>
*{box-sizing:border-box}
body{display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f8f9fa;font-family:-apple-system,system-ui,sans-serif}
.container{text-align:center;padding:24px;max-width:360px;width:100%}
.status{margin-top:16px;color:#555;font-size:15px;line-height:1.4}
.spinner{display:inline-block;width:32px;height:32px;border:3px solid #e0e0e0;border-top-color:#1a73e8;border-radius:50%;animation:spin .8s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
#recaptcha-container{display:flex;justify-content:center;margin:16px 0}
</style>
</head><body>
<div class="container">
<div class="spinner" id="spinner"></div>
<p class="status" id="status">Preparing verification...</p>
<div id="recaptcha-container"></div>
</div>
<script type="module">
import{initializeApp}from"https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import{getAuth,signInWithPhoneNumber,RecaptchaVerifier}from"https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";

const app=initializeApp({apiKey:"${apiKey}",authDomain:"${authDomain}",projectId:"${projectId}"});
const auth=getAuth(app);
const phone=decodeURIComponent("${encodeURIComponent(phone)}");

function post(msg){
  if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(JSON.stringify(msg));
}

try{
  document.getElementById('status').textContent='Verifying you are human...';
  const verifier=new RecaptchaVerifier(auth,'recaptcha-container',{size:'invisible'});
  await verifier.render();
  document.getElementById('status').textContent='Sending code to '+phone+'...';
  const confirmation=await signInWithPhoneNumber(auth,phone,verifier);
  document.getElementById('spinner').style.display='none';
  document.getElementById('status').textContent='Code sent!';
  post({type:'success',verificationId:confirmation.verificationId});
}catch(err){
  document.getElementById('spinner').style.display='none';
  document.getElementById('status').textContent='Error: '+(err.message||'Unknown error');
  post({type:'error',message:err.code||err.message||'Unknown error'});
}
</script>
</body></html>`;
    res.setHeader("Content-Type", "text/html");
    return res.send(html);
  });
}
