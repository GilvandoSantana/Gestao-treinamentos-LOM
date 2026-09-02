CREATE TABLE `desktopInstaller` (
	`id` int AUTO_INCREMENT NOT NULL,
	`r2Key` varchar(255) NOT NULL,
	`fileName` varchar(255) NOT NULL,
	`version` varchar(50) NOT NULL,
	`fileSize` bigint NOT NULL,
	`uploadedAt` timestamp NOT NULL DEFAULT (now()),
	`uploadedBy` varchar(255) NOT NULL,
	CONSTRAINT `desktopInstaller_id` PRIMARY KEY(`id`)
);
