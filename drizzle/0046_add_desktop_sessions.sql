CREATE TABLE `desktopSessions` (
	`id` varchar(64) NOT NULL,
	`username` varchar(255) NOT NULL,
	`adminId` varchar(64),
	`deviceName` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`revokedAt` timestamp,
	CONSTRAINT `desktopSessions_id` PRIMARY KEY(`id`)
);
