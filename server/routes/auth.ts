import type { Express, Request, Response } from "express";
import { storage } from "../storage";
import { verifyFirebaseToken } from "../firebase-auth";
import { requireAuth } from "./middleware";

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
        if (firebaseUser.name || firebaseUser.picture) {
          user = await storage.updateUser(user.id, {
            name: firebaseUser.name || user.name,
            photoUrl: firebaseUser.picture || user.photoUrl,
          });
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
}
