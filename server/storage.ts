import { type User, type InsertUser, users, type Order, type InsertOrder, orders, auditLogs } from "@shared/schema";
import { eq, desc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-serverless";
import { Pool } from "@neondatabase/serverless";
import { encrypt, decrypt } from "./encryption";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is required");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on("error", (err: Error) => {
  console.error("Unexpected database pool error:", err.message);
});

const db = drizzle(pool);

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

function decryptOrder(order: Order): Order {
  return {
    ...order,
    medicineName: order.medicineName ? decrypt(order.medicineName) : order.medicineName,
    medicineDosage: order.medicineDosage ? decrypt(order.medicineDosage) : order.medicineDosage,
    patientName: order.patientName ? decrypt(order.patientName) : order.patientName,
    patientPhone: order.patientPhone ? decrypt(order.patientPhone) : order.patientPhone,
    notes: order.notes ? decrypt(order.notes) : order.notes,
    deliveryAddress: order.deliveryAddress ? decrypt(order.deliveryAddress) : order.deliveryAddress,
    pharmacyPhone: order.pharmacyPhone ? decrypt(order.pharmacyPhone) : order.pharmacyPhone,
    pharmacyAddress: order.pharmacyAddress ? decrypt(order.pharmacyAddress) : order.pharmacyAddress,
    medicineFrequency: order.medicineFrequency ? decrypt(order.medicineFrequency) : order.medicineFrequency,
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
    const [order] = await db.update(orders).set(encryptedData).where(eq(orders.id, id)).returning();
    return decryptOrder(order);
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
