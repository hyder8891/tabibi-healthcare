import { type User, type InsertUser, users, verificationCodes } from "@shared/schema";
import { eq, and, gt } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-serverless";
import { Pool } from "@neondatabase/serverless";

const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
const db = drizzle(pool);

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByPhone(phone: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  createVerificationCode(identifier: string, identifierType: string, code: string, firebaseIdToken?: string): Promise<void>;
  getVerificationCode(identifier: string, code: string): Promise<any | undefined>;
  markVerified(identifier: string): Promise<void>;
  isVerified(identifier: string): Promise<boolean>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async getUserByPhone(phone: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.phone, phone));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async createVerificationCode(identifier: string, identifierType: string, code: string, firebaseIdToken?: string): Promise<void> {
    await db.delete(verificationCodes).where(eq(verificationCodes.identifier, identifier));
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await db.insert(verificationCodes).values({
      identifier,
      identifierType,
      code,
      firebaseIdToken: firebaseIdToken || null,
      expiresAt,
      verified: false,
    });
  }

  async getVerificationCode(identifier: string, code: string): Promise<any | undefined> {
    const [record] = await db
      .select()
      .from(verificationCodes)
      .where(
        and(
          eq(verificationCodes.identifier, identifier),
          eq(verificationCodes.code, code),
          gt(verificationCodes.expiresAt, new Date()),
        ),
      );
    return record;
  }

  async markVerified(identifier: string): Promise<void> {
    await db
      .update(verificationCodes)
      .set({ verified: true })
      .where(eq(verificationCodes.identifier, identifier));
  }

  async isVerified(identifier: string): Promise<boolean> {
    const [record] = await db
      .select()
      .from(verificationCodes)
      .where(
        and(
          eq(verificationCodes.identifier, identifier),
          eq(verificationCodes.verified, true),
        ),
      );
    return !!record;
  }
}

export const storage = new DatabaseStorage();
