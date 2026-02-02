CREATE TABLE "device_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requester_user_id" text NOT NULL,
	"target_user_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"distance_meters" numeric(10, 2),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"latitude" numeric(10, 8) NOT NULL,
	"longitude" numeric(11, 8) NOT NULL,
	"accuracy" numeric(10, 2),
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_locations_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "device_connections" ADD CONSTRAINT "device_connections_requester_user_id_user_id_fk" FOREIGN KEY ("requester_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_connections" ADD CONSTRAINT "device_connections_target_user_id_user_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_locations" ADD CONSTRAINT "user_locations_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "device_connections_requester_user_id_idx" ON "device_connections" USING btree ("requester_user_id");--> statement-breakpoint
CREATE INDEX "device_connections_target_user_id_idx" ON "device_connections" USING btree ("target_user_id");--> statement-breakpoint
CREATE INDEX "device_connections_status_idx" ON "device_connections" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "device_connections_unique_pair" ON "device_connections" USING btree ("requester_user_id","target_user_id");--> statement-breakpoint
CREATE INDEX "user_locations_user_id_idx" ON "user_locations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_locations_coords_idx" ON "user_locations" USING btree ("latitude","longitude");