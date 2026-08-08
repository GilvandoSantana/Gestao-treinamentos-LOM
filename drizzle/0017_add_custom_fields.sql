ALTER TABLE `employees` ADD `customFields` text;
--> statement-breakpoint
CREATE TABLE `contractCustomFields` (
	`id` varchar(64) NOT NULL,
	`contractSlug` varchar(60) NOT NULL,
	`fieldKey` varchar(60) NOT NULL,
	`label` varchar(120) NOT NULL,
	`fieldType` varchar(20) NOT NULL DEFAULT 'text',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `contractCustomFields_id` PRIMARY KEY(`id`)
);
