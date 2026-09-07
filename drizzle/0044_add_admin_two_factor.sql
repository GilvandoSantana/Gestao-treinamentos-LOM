ALTER TABLE `admins` ADD `twoFactorSecret` varchar(64);
--> statement-breakpoint
ALTER TABLE `admins` ADD `twoFactorBackupCodes` text;
