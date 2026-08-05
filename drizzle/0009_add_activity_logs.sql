CREATE TABLE `activityLogs` (
	`id` varchar(64) NOT NULL,
	`username` varchar(100) NOT NULL,
	`role` varchar(20) NOT NULL,
	`action` varchar(60) NOT NULL,
	`targetType` varchar(40),
	`targetId` varchar(64),
	`targetName` varchar(255),
	`details` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `activityLogs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `activityLogs_createdAt_idx` ON `activityLogs` (`createdAt`);
