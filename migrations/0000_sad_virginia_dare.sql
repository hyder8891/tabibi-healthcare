CREATE TABLE "audit_logs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar,
	"action" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" text,
	"metadata" text,
	"ip_address" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "health_events" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"event_type" text NOT NULL,
	"category" text NOT NULL,
	"event_data" text,
	"tags" text,
	"outcome" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "health_profiles" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"chronic_conditions" text,
	"medication_history" text,
	"allergy_details" text,
	"family_history" text,
	"vital_trends" text,
	"risk_factors" text,
	"assessment_count" integer DEFAULT 0 NOT NULL,
	"last_conditions" text,
	"preferred_pharmacies" text,
	"region" text,
	"updated_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "health_profiles_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "iraqi_health_knowledge" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category" text NOT NULL,
	"name_en" text NOT NULL,
	"name_ar" text NOT NULL,
	"data" text NOT NULL,
	"prevalence_rank" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"pharmacy_name" text NOT NULL,
	"pharmacy_phone" text,
	"pharmacy_address" text,
	"pharmacy_place_id" text,
	"medicine_name" text NOT NULL,
	"medicine_dosage" text,
	"medicine_frequency" text,
	"quantity" integer DEFAULT 1 NOT NULL,
	"price" real,
	"delivery_fee" real,
	"total_price" real,
	"delivery_address" text,
	"delivery_city_id" text,
	"delivery_region_id" text,
	"patient_name" text,
	"patient_phone" text,
	"al_waseet_order_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"pharmacy_confirmed" text DEFAULT 'pending',
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "population_analytics" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"period" text NOT NULL,
	"period_date" text NOT NULL,
	"category" text NOT NULL,
	"item_name" text NOT NULL,
	"item_name_ar" text,
	"count" integer DEFAULT 1 NOT NULL,
	"region" text,
	"metadata" text,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"firebase_uid" text,
	"email" text,
	"phone" text,
	"name" text,
	"photo_url" text,
	"auth_provider" text DEFAULT 'email',
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "users_firebase_uid_unique" UNIQUE("firebase_uid"),
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
ALTER TABLE "health_events" ADD CONSTRAINT "health_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_profiles" ADD CONSTRAINT "health_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;