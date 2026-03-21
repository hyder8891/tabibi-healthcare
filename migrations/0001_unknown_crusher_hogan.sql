CREATE TABLE "patient_profiles" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"name" text,
	"age" integer,
	"gender" text,
	"weight" real,
	"height" real,
	"conditions" text,
	"allergies" text,
	"medications" text,
	"onboarding_complete" boolean DEFAULT false,
	"updated_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "patient_profiles_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "patient_profiles" ADD CONSTRAINT "patient_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "health_events_user_id_idx" ON "health_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "health_events_user_created_idx" ON "health_events" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "orders_user_id_idx" ON "orders" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "orders_user_status_idx" ON "orders" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "pop_analytics_period_category_idx" ON "population_analytics" USING btree ("period","category");--> statement-breakpoint
CREATE INDEX "pop_analytics_category_item_idx" ON "population_analytics" USING btree ("category","item_name");