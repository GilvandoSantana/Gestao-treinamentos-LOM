ALTER TABLE `cloudFiles` ADD `lockedBy` varchar(100);
--> statement-breakpoint
ALTER TABLE `cloudFiles` ADD `lockedAt` timestamp;
