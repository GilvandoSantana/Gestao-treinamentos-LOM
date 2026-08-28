CREATE TABLE `epiRoleItems` (
	`id` varchar(64) NOT NULL,
	`contractSlug` varchar(40) NOT NULL,
	`role` varchar(255) NOT NULL,
	`sortOrder` int NOT NULL DEFAULT 0,
	`quantity` int NOT NULL DEFAULT 1,
	`specification` varchar(255) NOT NULL,
	`ca` varchar(50),
	`responsibleName` varchar(150),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `epiRoleItems_id` PRIMARY KEY(`id`)
);
