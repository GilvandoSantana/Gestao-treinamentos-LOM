CREATE TABLE `pendingSignups` (
	`id` varchar(64) NOT NULL,
	`organizationName` varchar(120) NOT NULL,
	`organizationSlug` varchar(60) NOT NULL,
	`adminUsername` varchar(100) NOT NULL,
	`passwordHash` varchar(255) NOT NULL,
	`email` varchar(255) NOT NULL,
	`token` varchar(128) NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `pendingSignups_id` PRIMARY KEY(`id`),
	CONSTRAINT `pendingSignups_token_unique` UNIQUE(`token`)
);
