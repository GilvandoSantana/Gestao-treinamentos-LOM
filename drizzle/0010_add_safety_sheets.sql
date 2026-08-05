CREATE TABLE `safetySheets` (
	`id` varchar(64) NOT NULL,
	`name` varchar(255) NOT NULL,
	`fileName` varchar(255) NOT NULL,
	`fileUrl` text NOT NULL,
	`fileSize` int,
	`roles` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `safetySheets_id` PRIMARY KEY(`id`)
);
