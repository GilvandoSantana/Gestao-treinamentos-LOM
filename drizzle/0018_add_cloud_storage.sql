CREATE TABLE `cloudFolders` (
	`id` varchar(64) NOT NULL,
	`contractSlug` varchar(60) NOT NULL,
	`parentId` varchar(64),
	`name` varchar(255) NOT NULL,
	`createdBy` varchar(100),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `cloudFolders_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `cloudFiles` (
	`id` varchar(64) NOT NULL,
	`contractSlug` varchar(60) NOT NULL,
	`folderId` varchar(64),
	`name` varchar(255) NOT NULL,
	`fileUrl` text NOT NULL,
	`fileSize` int,
	`mimeType` varchar(100),
	`uploadedBy` varchar(100),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `cloudFiles_id` PRIMARY KEY(`id`)
);
