PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_albums` (
	`title` text NOT NULL,
	`uuid` text PRIMARY KEY NOT NULL,
	`image` text,
	`key` text NOT NULL,
	`synced` integer DEFAULT false NOT NULL,
	`summary` text,
	`library` text NOT NULL,
	`artist` text NOT NULL,
	`created_at` integer,
	`updated_at` integer,
	FOREIGN KEY (`library`) REFERENCES `libraries`(`uuid`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`artist`) REFERENCES `artists`(`uuid`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_albums`("title", "uuid", "image", "key", "synced", "summary", "library", "artist", "created_at", "updated_at") SELECT "title", "uuid", "image", "key", "synced", "summary", "library", "artist", "created_at", "updated_at" FROM `albums`;--> statement-breakpoint
DROP TABLE `albums`;--> statement-breakpoint
ALTER TABLE `__new_albums` RENAME TO `albums`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `albums_key_unique` ON `albums` (`key`);--> statement-breakpoint
CREATE TABLE `__new_artists` (
	`title` text NOT NULL,
	`uuid` text PRIMARY KEY NOT NULL,
	`image` text,
	`key` text NOT NULL,
	`synced` integer DEFAULT false NOT NULL,
	`library` text NOT NULL,
	`summary` text,
	`created_at` integer,
	`updated_at` integer,
	FOREIGN KEY (`library`) REFERENCES `libraries`(`uuid`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_artists`("title", "uuid", "image", "key", "synced", "library", "summary", "created_at", "updated_at") SELECT "title", "uuid", "image", "key", "synced", "library", "summary", "created_at", "updated_at" FROM `artists`;--> statement-breakpoint
DROP TABLE `artists`;--> statement-breakpoint
ALTER TABLE `__new_artists` RENAME TO `artists`;--> statement-breakpoint
CREATE UNIQUE INDEX `artists_key_unique` ON `artists` (`key`);--> statement-breakpoint
CREATE TABLE `__new_libraries` (
	`title` text NOT NULL,
	`uuid` text PRIMARY KEY NOT NULL,
	`image` text,
	`path` text NOT NULL,
	`key` text NOT NULL,
	`current_library` integer DEFAULT false NOT NULL,
	`server_name` text NOT NULL,
	`created_at` integer,
	`updated_at` integer,
	FOREIGN KEY (`server_name`) REFERENCES `servers`(`server_name`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_libraries`("title", "uuid", "image", "path", "key", "current_library", "server_name", "created_at", "updated_at") SELECT "title", "uuid", "image", "path", "key", "current_library", "server_name", "created_at", "updated_at" FROM `libraries`;--> statement-breakpoint
DROP TABLE `libraries`;--> statement-breakpoint
ALTER TABLE `__new_libraries` RENAME TO `libraries`;--> statement-breakpoint
CREATE UNIQUE INDEX `libraries_key_unique` ON `libraries` (`key`);