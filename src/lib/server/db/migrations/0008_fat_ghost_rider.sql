ALTER TABLE `tracks` ADD `last_sync_attempt` integer;--> statement-breakpoint
ALTER TABLE `tracks` ADD `sync_failure_reason` text;--> statement-breakpoint
ALTER TABLE `tracks` ADD `retry_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `tracks` ADD `next_retry_at` integer;