ALTER TABLE `employees` ADD `leader` varchar(120);
--> statement-breakpoint
ALTER TABLE `employees` ADD `area` varchar(120);
--> statement-breakpoint
ALTER TABLE `contracts` ADD `rqaEnabled` boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE `contracts` ADD `rqaMetaIndividual` int NOT NULL DEFAULT 2;
--> statement-breakpoint
CREATE TABLE `rqaEntries` (
	`id` varchar(64) NOT NULL,
	`employeeId` varchar(64) NOT NULL,
	`yearMonth` varchar(7) NOT NULL,
	`quantidade` int NOT NULL DEFAULT 0,
	`situacao` varchar(20) NOT NULL DEFAULT 'ATIVO',
	`updatedBy` varchar(120),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `rqaEntries_id` PRIMARY KEY(`id`),
	CONSTRAINT `rqaEntries_employeeId_yearMonth_unique` UNIQUE(`employeeId`,`yearMonth`)
);
