CREATE TABLE `organizations` (
	`id` varchar(64) NOT NULL,
	`slug` varchar(60) NOT NULL,
	`name` varchar(120) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `organizations_id` PRIMARY KEY(`id`),
	CONSTRAINT `organizations_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
ALTER TABLE `contracts` ADD `organizationId` varchar(64);
--> statement-breakpoint
INSERT IGNORE INTO `organizations` (`id`, `slug`, `name`) VALUES ('76242633-4bf5-477f-b2e8-05f388777654', 'support-mining', 'Support Mining');
--> statement-breakpoint
UPDATE `contracts` SET `organizationId` = '76242633-4bf5-477f-b2e8-05f388777654' WHERE `organizationId` IS NULL;
