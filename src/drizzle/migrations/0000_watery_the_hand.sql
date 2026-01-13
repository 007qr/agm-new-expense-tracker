CREATE TYPE "public"."entity_type" AS ENUM('payroll', 'cash');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('paid', 'pending', 'advance');--> statement-breakpoint
CREATE TYPE "public"."transaction_type" AS ENUM('credit', 'debit');--> statement-breakpoint
CREATE TABLE "destination" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"is_warehouse" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "destination_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "entity" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" "entity_type" NOT NULL,
	"unit" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entity_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "entity_variant" (
	"id" text PRIMARY KEY NOT NULL,
	"entity_id" text,
	"entity_length" numeric(18, 6),
	"entity_width" numeric(18, 6),
	"entity_height" numeric(18, 6),
	"entity_thickness" numeric(18, 6),
	"thickness_unit" text,
	"dimension_unit" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entity_variant_warehouse" (
	"id" text PRIMARY KEY NOT NULL,
	"entity_id" text,
	"entity_length" numeric(18, 6),
	"entity_width" numeric(18, 6),
	"entity_height" numeric(18, 6),
	"entity_thickness" numeric(18, 6),
	"thickness_unit" text,
	"dimension_unit" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entity_warehouse" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" "entity_type" NOT NULL,
	"unit" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entity_warehouse_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "transaction" (
	"id" text PRIMARY KEY NOT NULL,
	"entity_id" text,
	"entity_variant_id" text,
	"destination_id" text,
	"status" "payment_status" NOT NULL,
	"transportation_cost_id" text,
	"quantity" numeric(18, 6),
	"type" "transaction_type",
	"rate" numeric(18, 6),
	"amount" numeric(18, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transportation_cost" (
	"id" text PRIMARY KEY NOT NULL,
	"entity_id" text,
	"vehicle_type" text DEFAULT '',
	"reg_no" text DEFAULT '' NOT NULL,
	"cost" numeric(18, 2) DEFAULT '0' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "warehouse_transaction" (
	"id" text PRIMARY KEY NOT NULL,
	"entity_id" text,
	"entity_variant_id" text,
	"source_id" text,
	"destination_id" text,
	"quantity" numeric(18, 6),
	"type" "transaction_type",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" bigint,
	"refresh_token_expires_at" bigint,
	"scope" text,
	"password" text,
	"created_at" bigint DEFAULT (extract(epoch from now()) * 1000)::bigint NOT NULL,
	"updated_at" bigint DEFAULT (extract(epoch from now()) * 1000)::bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" bigint NOT NULL,
	"token" text NOT NULL,
	"created_at" bigint DEFAULT (extract(epoch from now()) * 1000)::bigint NOT NULL,
	"updated_at" bigint DEFAULT (extract(epoch from now()) * 1000)::bigint NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" text DEFAULT 'user' NOT NULL,
	"created_at" bigint DEFAULT (extract(epoch from now()) * 1000)::bigint NOT NULL,
	"updated_at" bigint DEFAULT (extract(epoch from now()) * 1000)::bigint NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" bigint NOT NULL,
	"created_at" bigint DEFAULT (extract(epoch from now()) * 1000)::bigint NOT NULL,
	"updated_at" bigint DEFAULT (extract(epoch from now()) * 1000)::bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "entity_variant" ADD CONSTRAINT "entity_variant_entity_id_entity_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entity"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_variant_warehouse" ADD CONSTRAINT "entity_variant_warehouse_entity_id_entity_warehouse_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entity_warehouse"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_entity_id_entity_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entity"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_entity_variant_id_entity_variant_id_fk" FOREIGN KEY ("entity_variant_id") REFERENCES "public"."entity_variant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_destination_id_destination_id_fk" FOREIGN KEY ("destination_id") REFERENCES "public"."destination"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_transportation_cost_id_transportation_cost_id_fk" FOREIGN KEY ("transportation_cost_id") REFERENCES "public"."transportation_cost"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transportation_cost" ADD CONSTRAINT "transportation_cost_entity_id_entity_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entity"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_transaction" ADD CONSTRAINT "warehouse_transaction_entity_id_entity_warehouse_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entity_warehouse"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_transaction" ADD CONSTRAINT "warehouse_transaction_entity_variant_id_entity_variant_warehouse_id_fk" FOREIGN KEY ("entity_variant_id") REFERENCES "public"."entity_variant_warehouse"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_transaction" ADD CONSTRAINT "warehouse_transaction_source_id_destination_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."destination"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_transaction" ADD CONSTRAINT "warehouse_transaction_destination_id_destination_id_fk" FOREIGN KEY ("destination_id") REFERENCES "public"."destination"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "entity_variant_entity_id_idx" ON "entity_variant" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "entity_variant_warehouse_entity_id_idx" ON "entity_variant_warehouse" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "transaction_entity_id_idx" ON "transaction" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "transaction_destination_id_idx" ON "transaction" USING btree ("destination_id");--> statement-breakpoint
CREATE INDEX "transaction_created_at_idx" ON "transaction" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "warehouse_transaction_entity_id_idx" ON "warehouse_transaction" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "warehouse_transaction_source_id_idx" ON "warehouse_transaction" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "warehouse_transaction_destination_id_idx" ON "warehouse_transaction" USING btree ("destination_id");--> statement-breakpoint
CREATE INDEX "warehouse_transaction_created_at_idx" ON "warehouse_transaction" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");