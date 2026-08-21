CREATE TABLE `cloudFileVersions` (
	`id` varchar(64) NOT NULL,
	`fileId` varchar(64) NOT NULL,
	`r2Key` text,
	`fileUrl` text,
	`fileSize` int,
	`mimeType` varchar(100),
	`uploadedBy` varchar(100),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `cloudFileVersions_id` PRIMARY KEY(`id`)
);
