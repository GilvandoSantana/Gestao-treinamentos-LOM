ALTER TABLE `contracts` ADD `pgrFileUrl` text;
--> statement-breakpoint
ALTER TABLE `contracts` ADD `pgrFileName` varchar(255);
--> statement-breakpoint
ALTER TABLE `contracts` ADD `pgrUploadedAt` timestamp;
