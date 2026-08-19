-- Estende cloudFolders e cloudFiles (não apaga nada, só adiciona colunas)
ALTER TABLE `cloudFolders` ADD `deletedAt` timestamp;
--> statement-breakpoint
ALTER TABLE `cloudFolders` ADD `deletedBy` varchar(100);
--> statement-breakpoint
ALTER TABLE `cloudFiles` MODIFY `fileUrl` text;
--> statement-breakpoint
ALTER TABLE `cloudFiles` ADD `r2Key` text;
--> statement-breakpoint
ALTER TABLE `cloudFiles` ADD `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP;
--> statement-breakpoint
ALTER TABLE `cloudFiles` ADD `deletedAt` timestamp;
--> statement-breakpoint
ALTER TABLE `cloudFiles` ADD `deletedBy` varchar(100);
--> statement-breakpoint
CREATE TABLE `cloudFavorites` (
	`id` varchar(64) NOT NULL,
	`contractSlug` varchar(60) NOT NULL,
	`username` varchar(100) NOT NULL,
	`fileId` varchar(64),
	`folderId` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `cloudFavorites_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `cloudShares` (
	`id` varchar(64) NOT NULL,
	`contractSlug` varchar(60) NOT NULL,
	`fileId` varchar(64),
	`folderId` varchar(64),
	`itemName` varchar(255) NOT NULL,
	`sharedBy` varchar(100) NOT NULL,
	`sharedWith` varchar(100) NOT NULL,
	`permission` enum('view','download','edit') NOT NULL DEFAULT 'view',
	`expiresAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `cloudShares_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `cloudStorageConfig` (
	`contractSlug` varchar(60) NOT NULL,
	`limitBytes` bigint NOT NULL DEFAULT 10737418240,
	`usedBytes` bigint NOT NULL DEFAULT 0,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `cloudStorageConfig_contractSlug` PRIMARY KEY(`contractSlug`)
);
