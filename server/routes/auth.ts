import type { Express, Request, Response } from "express";
import { storage } from "../storage";
import { verifyFirebaseToken } from "../firebase-auth";

export function registerAuthRoutes(app: Express): void {
  app.post("/api/auth/firebase", async (req: Request, res: Response) => {
    try {
      const { idToken } = req.body;
      if (!idToken) {
        return res.status(400).json({ message: "Firebase ID token is required" });
      }

      const firebaseUser = await verifyFirebaseToken(idToken);
      if (!firebaseUser) {
        return res.status(401).json({ message: "Invalid or expired token" });
      }

      let user = await storage.getUserByFirebaseUid(firebaseUser.localId);

      if (!user) {
        if (firebaseUser.email) {
          user = await storage.getUserByEmail(firebaseUser.email);
        }

        if (user) {
          user = await storage.updateUser(user.id, {
            firebaseUid: firebaseUser.localId,
            photoUrl: firebaseUser.photoUrl || undefined,
            authProvider: firebaseUser.providerUserInfo?.[0]?.providerId || "email",
          });
        } else {
          user = await storage.createUser({
            firebaseUid: firebaseUser.localId,
            email: firebaseUser.email || null,
            phone: firebaseUser.phoneNumber || null,
            name: firebaseUser.displayName || null,
            photoUrl: firebaseUser.photoUrl || null,
            authProvider: firebaseUser.providerUserInfo?.[0]?.providerId || "email",
          });
        }
      } else {
        if (firebaseUser.displayName || firebaseUser.photoUrl) {
          user = await storage.updateUser(user.id, {
            name: firebaseUser.displayName || user.name,
            photoUrl: firebaseUser.photoUrl || user.photoUrl,
          });
        }
      }

      req.session.userId = user.id;
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

  app.post("/api/auth/logout", (req: Request, res: Response) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ message: "Failed to log out" });
      }
      res.clearCookie("connect.sid");
      return res.json({ ok: true });
    });
  });

  app.get("/api/auth/me", async (req: Request, res: Response) => {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    const user = await storage.getUser(req.session.userId);
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
}
