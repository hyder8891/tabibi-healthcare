import { type User, type InsertUser, users, type Order, type InsertOrder, orders, auditLogs, patientProfiles, type InsertPatientProfile, type PatientProfileRow } from "@shared/schema";
import { eq, desc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-serverless";
import { Pool } from "@neondatabase/serverless";
import { encrypt, decrypt } from "./encryption";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is required");
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on("error", (err: Error) => {
  console.error("Unexpected database pool error:", err.message);
});

export const db = drizzle(pool);

function encryptOrder(order: InsertOrder): InsertOrder {
  return {
    ...order,
    medicineName: order.medicineName ? encrypt(order.medicineName) : order.medicineName,
    medicineDosage: order.medicineDosage ? encrypt(order.medicineDosage) : order.medicineDosage,
    patientName: order.patientName ? encrypt(order.patientName) : order.patientName,
    patientPhone: order.patientPhone ? encrypt(order.patientPhone) : order.patientPhone,
    notes: order.notes ? encrypt(order.notes) : order.notes,
    deliveryAddress: order.deliveryAddress ? encrypt(order.deliveryAddress) : order.deliveryAddress,
    pharmacyPhone: order.pharmacyPhone ? encrypt(order.pharmacyPhone) : order.pharmacyPhone,
    pharmacyAddress: order.pharmacyAddress ? encrypt(order.pharmacyAddress) : order.pharmacyAddress,
    medicineFrequency: order.medicineFrequency ? encrypt(order.medicineFrequency) : order.medicineFrequency,
  };
}

function safeDecrypt(value: string): string;
function safeDecrypt(value: null): null;
function safeDecrypt(value: string | null): string | null;
function safeDecrypt(value: string | null): string | null {
  if (!value) return value;
  try {
    return decrypt(value);
  } catch {
    return value;
  }
}

function decryptOrder(order: Order): Order {
  return {
    ...order,
    medicineName: safeDecrypt(order.medicineName) as string,
    medicineDosage: safeDecrypt(order.medicineDosage) as string,
    patientName: safeDecrypt(order.patientName) as string,
    patientPhone: safeDecrypt(order.patientPhone) as string,
    notes: safeDecrypt(order.notes),
    deliveryAddress: safeDecrypt(order.deliveryAddress),
    pharmacyPhone: safeDecrypt(order.pharmacyPhone),
    pharmacyAddress: safeDecrypt(order.pharmacyAddress),
    medicineFrequency: safeDecrypt(order.medicineFrequency),
  };
}

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByPhone(phone: string): Promise<User | undefined>;
  getUserByFirebaseUid(uid: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, data: Partial<InsertUser>): Promise<User>;
  createOrder(order: InsertOrder): Promise<Order>;
  getOrder(id: string): Promise<Order | undefined>;
  getUserOrders(userId: string): Promise<Order[]>;
  updateOrder(id: string, data: Partial<InsertOrder>): Promise<Order>;
  getPatientProfile(userId: string): Promise<PatientProfileRow | undefined>;
  upsertPatientProfile(userId: string, data: Partial<InsertPatientProfile>): Promise<PatientProfileRow>;
  logAuditEvent(event: { userId?: string; action: string; resourceType: string; resourceId?: string; metadata?: string; ipAddress?: string }): Promise<void>;
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

  async getUserByFirebaseUid(uid: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.firebaseUid, uid));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async updateUser(id: string, data: Partial<InsertUser>): Promise<User> {
    const [user] = await db.update(users).set(data).where(eq(users.id, id)).returning();
    return user;
  }

  async createOrder(order: InsertOrder): Promise<Order> {
    const encryptedOrder = encryptOrder(order);
    const [newOrder] = await db.insert(orders).values(encryptedOrder).returning();
    return decryptOrder(newOrder);
  }

  async getOrder(id: string): Promise<Order | undefined> {
    const [order] = await db.select().from(orders).where(eq(orders.id, id));
    return order ? decryptOrder(order) : undefined;
  }

  async getUserOrders(userId: string): Promise<Order[]> {
    const userOrders = await db.select().from(orders).where(eq(orders.userId, userId)).orderBy(desc(orders.createdAt));
    return userOrders.map(decryptOrder);
  }

  async updateOrder(id: string, data: Partial<InsertOrder>): Promise<Order> {
    const encryptedData = encryptOrder(data as InsertOrder) as Partial<InsertOrder>;
    const [order] = await db.update(orders).set({ ...encryptedData, updatedAt: new Date() }).where(eq(orders.id, id)).returning();
    return decryptOrder(order);
  }

  async getPatientProfile(userId: string): Promise<PatientProfileRow | undefined> {
    const [profile] = await db.select().from(patientProfiles).where(eq(patientProfiles.userId, userId));
    return profile;
  }

  async upsertPatientProfile(userId: string, data: Partial<InsertPatientProfile>): Promise<PatientProfileRow> {
    const existing = await this.getPatientProfile(userId);
    if (existing) {
      const [updated] = await db.update(patientProfiles)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(patientProfiles.userId, userId))
        .returning();
      return updated;
    }
    try {
      const [created] = await db.insert(patientProfiles)
        .values({ ...data, userId })
        .returning();
      return created;
    } catch (err: unknown) {
      if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "23505") {
        const [updated] = await db.update(patientProfiles)
          .set({ ...data, updatedAt: new Date() })
          .where(eq(patientProfiles.userId, userId))
          .returning();
        return updated;
      }
      throw err;
    }
  }

  async logAuditEvent(event: { userId?: string; action: string; resourceType: string; resourceId?: string; metadata?: string; ipAddress?: string }): Promise<void> {
    try {
      await db.insert(auditLogs).values(event);
    } catch (err) {
      console.error("Audit log error:", err instanceof Error ? err.message : "Unknown");
    }
  }
}

export const storage = new DatabaseStorage();
