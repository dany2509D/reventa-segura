ALTER TABLE "users" ADD COLUMN "totp_last_step" bigint;--> statement-breakpoint
CREATE UNIQUE INDEX "disputes_one_open_per_order_uq" ON "disputes" USING btree ("order_id") WHERE "disputes"."status" = 'open';--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_one_charge_per_order_uq" ON "ledger_entries" USING btree ("order_id") WHERE "ledger_entries"."kind" = 'charge';--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_one_refund_per_order_uq" ON "ledger_entries" USING btree ("order_id") WHERE "ledger_entries"."kind" = 'refund';--> statement-breakpoint
CREATE INDEX "otp_codes_created_at_idx" ON "otp_codes" USING btree ("created_at");--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_face_value_positive" CHECK ("events"."face_value_cents" > 0);--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_radius_range" CHECK ("events"."radius_m" between 50 and 5000);--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_ask_positive" CHECK ("listings"."ask_cents" > 0);--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_price_positive" CHECK ("orders"."price_cents" > 0);--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_fee_non_negative" CHECK ("orders"."fee_cents" >= 0);--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_amount_positive" CHECK ("payouts"."amount_cents" > 0);