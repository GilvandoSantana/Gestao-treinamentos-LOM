ALTER TABLE `employees` ADD `dismissed` boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE `employees` ADD `dismissedAt` timestamp NULL;
