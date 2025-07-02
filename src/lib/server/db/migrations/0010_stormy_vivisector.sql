CREATE TABLE `sync_attempts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`library_id` text NOT NULL,
	`start_time` integer NOT NULL,
	`end_time` integer,
	`status` text NOT NULL,
	`total_tracks` integer NOT NULL,
	`processed_tracks` integer NOT NULL,
	`synced_tracks` integer NOT NULL,
	`failed_tracks` integer NOT NULL,
	`results_json` text
);
