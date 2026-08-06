-- Divisão por contrato. Tudo que já existia pertence ao contrato LOM.
ALTER TABLE `employees` ADD `contract` varchar(40) NOT NULL DEFAULT 'lom';
--> statement-breakpoint
ALTER TABLE `admins` ADD `contract` varchar(40) NOT NULL DEFAULT 'lom';
--> statement-breakpoint
ALTER TABLE `safetySheets` ADD `contract` varchar(40) NOT NULL DEFAULT 'lom';
