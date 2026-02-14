import type { Request, Response, NextFunction } from "express";
import { verifyFirebaseToken } from "../firebase-auth";
import { storage } from "../storage";

declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Authentication required" });
  }
  const token = authHeader.slice(7);
  const decoded = await verifyFirebaseToken(token);
  if (!decoded) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }

  let user = await storage.getUserByFirebaseUid(decoded.uid);
  if (!user) {
    user = await storage.createUser({
      firebaseUid: decoded.uid,
      email: decoded.email || null,
      phone: decoded.phone_number || null,
      name: decoded.name || null,
      photoUrl: decoded.picture || null,
      authProvider: decoded.firebase.sign_in_provider || "unknown",
    });
  }

  req.userId = user.id;
  next();
};
