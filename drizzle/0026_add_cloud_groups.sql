-- cloudShares.sharedWith passa a ser opcional: um compartilhamento agora é
-- com uma pessoa (sharedWith) OU com um grupo (sharedWithGroupId).
ALTER TABLE `cloudShares` MODIFY `sharedWith` varchar(100);
--> statement-breakpoint
ALTER TABLE `cloudShares` ADD `sharedWithGroupId` varchar(64);
--> statement-breakpoint
CREATE TABLE `cloudGroups` (
	`id` varchar(64) NOT NULL,
	`contractSlug` varchar(60) NOT NULL,
	`name` varchar(120) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `cloudGroups_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `cloudGroupMembers` (
	`id` varchar(64) NOT NULL,
	`groupId` varchar(64) NOT NULL,
	`username` varchar(100) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `cloudGroupMembers_id` PRIMARY KEY(`id`)
);
