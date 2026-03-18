CREATE TABLE `certificates` (
	`id` varchar(64) NOT NULL,
	`trainingId` varchar(64) NOT NULL,
	`employeeId` varchar(64) NOT NULL,
	`fileName` varchar(255) NOT NULL,
	`fileUrl` text NOT NULL,
	`fileSize` int,
	`mimeType` varchar(100),
	`uploadedAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `certificates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `employees` ADD `registration` varchar(50);--> statement-breakpoint
ALTER TABLE `employees` ADD `educationLevel` varchar(100);--> statement-breakpoint
ALTER TABLE `employees` ADD `age` int;