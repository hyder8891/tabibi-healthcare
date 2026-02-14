import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  firebaseUid: text("firebase_uid").unique(),
  email: text("email").unique(),
  phone: text("phone").unique(),
  password: text("password"),
  name: text("name"),
  photoUrl: text("photo_url"),
  authProvider: text("auth_provider").default("email"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  firebaseUid: true,
  email: true,
  phone: true,
  password: true,
  name: true,
  photoUrl: true,
  authProvider: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export const orders = pgTable("orders", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  pharmacyName: text("pharmacy_name").notNull(),
  pharmacyPhone: text("pharmacy_phone"),
  pharmacyAddress: text("pharmacy_address"),
  pharmacyPlaceId: text("pharmacy_place_id"),
  medicineName: text("medicine_name").notNull(),
  medicineDosage: text("medicine_dosage"),
  medicineFrequency: text("medicine_frequency"),
  quantity: integer("quantity").notNull().default(1),
  price: real("price"),
  deliveryFee: real("delivery_fee"),
  totalPrice: real("total_price"),
  deliveryAddress: text("delivery_address"),
  deliveryCityId: text("delivery_city_id"),
  deliveryRegionId: text("delivery_region_id"),
  patientName: text("patient_name"),
  patientPhone: text("patient_phone"),
  alWaseetOrderId: text("al_waseet_order_id"),
  status: text("status").notNull().default("pending"),
  pharmacyConfirmed: text("pharmacy_confirmed").default("pending"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertOrderSchema = createInsertSchema(orders).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof orders.$inferSelect;
