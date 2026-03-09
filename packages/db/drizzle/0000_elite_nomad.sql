CREATE TABLE "alerts" (
	"id" serial PRIMARY KEY NOT NULL,
	"search_id" integer NOT NULL,
	"result_id" integer,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"search_id" integer NOT NULL,
	"channel" text NOT NULL,
	"destination" text,
	"is_enabled" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "results" (
	"id" serial PRIMARY KEY NOT NULL,
	"search_id" integer NOT NULL,
	"marketplace" text,
	"external_id" text,
	"title" text,
	"price" text,
	"currency" text,
	"price_num" numeric(12, 2),
	"shipping_num" numeric(12, 2),
	"total_price" numeric(12, 2),
	"listing_url" text,
	"image_url" text,
	"location" text,
	"condition" text,
	"seller_username" text,
	"found_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "searches" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"search_item" text NOT NULL,
	"location" text,
	"category" text,
	"max_price" numeric(12, 2),
	"status" text DEFAULT 'active',
	"plan_tier" text DEFAULT 'free',
	"marketplaces" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"next_refresh_at" timestamp with time zone,
	"last_found_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"password_hash" text,
	"is_admin" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_search_id_searches_id_fk" FOREIGN KEY ("search_id") REFERENCES "public"."searches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_result_id_results_id_fk" FOREIGN KEY ("result_id") REFERENCES "public"."results"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_settings" ADD CONSTRAINT "notification_settings_search_id_searches_id_fk" FOREIGN KEY ("search_id") REFERENCES "public"."searches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "results" ADD CONSTRAINT "results_search_id_searches_id_fk" FOREIGN KEY ("search_id") REFERENCES "public"."searches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "searches" ADD CONSTRAINT "searches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;