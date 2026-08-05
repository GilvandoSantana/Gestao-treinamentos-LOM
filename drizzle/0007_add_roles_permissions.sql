ALTER TABLE `admins` ADD `role` varchar(20) NOT NULL DEFAULT 'user';
--> statement-breakpoint
ALTER TABLE `admins` ADD `permissions` text;
--> statement-breakpoint
-- Contas que já existiam foram criadas antes de haver distinção de papel, e
-- na prática tinham acesso total. Promove todas a administrador principal
-- para não tirar acesso de ninguém de surpresa neste deploy.
UPDATE `admins` SET `role` = 'admin' WHERE `role` = 'user';
