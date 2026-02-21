ALTER TABLE "transaction" DROP CONSTRAINT "transaction_destination_id_destination_id_fk";
--> statement-breakpoint
DROP INDEX "transaction_destination_id_idx";--> statement-breakpoint
ALTER TABLE "transaction" DROP COLUMN "destination_id";