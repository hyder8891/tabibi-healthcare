import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, real, boolean, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  firebaseUid: text("firebase_uid").unique(),
  email: text("email").unique(),
  phone: text("phone").unique(),
  name: text("name"),
  photoUrl: text("photo_url"),
  authProvider: text("auth_provider").default("email"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  firebaseUid: true,
  email: true,
  phone: true,
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
}, (t) => [
  index("orders_user_id_idx").on(t.userId),
]);

export const insertOrderSchema = createInsertSchema(orders).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof orders.$inferSelect;

export const auditLogs = pgTable("audit_logs", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id"),
  action: text("action").notNull(),
  resourceType: text("resource_type").notNull(),
  resourceId: text("resource_id"),
  metadata: text("metadata"),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const healthProfiles = pgTable("health_profiles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id).unique(),
  chronicConditions: text("chronic_conditions"),
  medicationHistory: text("medication_history"),
  allergyDetails: text("allergy_details"),
  familyHistory: text("family_history"),
  vitalTrends: text("vital_trends"),
  riskFactors: text("risk_factors"),
  assessmentCount: integer("assessment_count").notNull().default(0),
  lastConditions: text("last_conditions"),
  preferredPharmacies: text("preferred_pharmacies"),
  region: text("region"),
  updatedAt: timestamp("updated_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertHealthProfileSchema = createInsertSchema(healthProfiles).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertHealthProfile = z.infer<typeof insertHealthProfileSchema>;
export type HealthProfile = typeof healthProfiles.$inferSelect;

export const healthEvents = pgTable("health_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  eventType: text("event_type").notNull(),
  category: text("category").notNull(),
  eventData: text("event_data"),
  tags: text("tags"),
  outcome: text("outcome"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("health_events_user_id_idx").on(t.userId),
]);

export const insertHealthEventSchema = createInsertSchema(healthEvents).omit({ id: true, createdAt: true });
export type InsertHealthEvent = z.infer<typeof insertHealthEventSchema>;
export type HealthEvent = typeof healthEvents.$inferSelect;

export const populationAnalytics = pgTable("population_analytics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  period: text("period").notNull(),
  periodDate: text("period_date").notNull(),
  category: text("category").notNull(),
  itemName: text("item_name").notNull(),
  itemNameAr: text("item_name_ar"),
  count: integer("count").notNull().default(1),
  region: text("region"),
  metadata: text("metadata"),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => [
  index("pop_analytics_period_category_idx").on(t.period, t.category),
]);

export const insertPopulationAnalyticSchema = createInsertSchema(populationAnalytics).omit({ id: true, updatedAt: true });
export type InsertPopulationAnalytic = z.infer<typeof insertPopulationAnalyticSchema>;
export type PopulationAnalytic = typeof populationAnalytics.$inferSelect;

export const iraqiHealthKnowledge = pgTable("iraqi_health_knowledge", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  category: text("category").notNull(),
  nameEn: text("name_en").notNull(),
  nameAr: text("name_ar").notNull(),
  data: text("data").notNull(),
  prevalenceRank: integer("prevalence_rank"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertIraqiHealthKnowledgeSchema = createInsertSchema(iraqiHealthKnowledge).omit({ id: true, createdAt: true });
export type InsertIraqiHealthKnowledge = z.infer<typeof insertIraqiHealthKnowledgeSchema>;
export type IraqiHealthKnowledge = typeof iraqiHealthKnowledge.$inferSelect;
