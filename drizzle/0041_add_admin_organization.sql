ALTER TABLE `admins` ADD `organizationId` varchar(64);
--> statement-breakpoint
UPDATE `admins` SET `organizationId` = '76242633-4bf5-477f-b2e8-05f388777654' WHERE `organizationId` IS NULL;
--> statement-breakpoint
ALTER TABLE `admins` DROP INDEX `admins_username_unique`;
--> statement-breakpoint
ALTER TABLE `admins` ADD CONSTRAINT `admins_organizationId_username_unique` UNIQUE(`organizationId`, `username`);
