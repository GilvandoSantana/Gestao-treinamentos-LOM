ALTER TABLE `employees` ADD `cpf` varchar(14);
--> statement-breakpoint
ALTER TABLE `contracts` ADD `companyName` varchar(255);
--> statement-breakpoint
CREATE TABLE `osRoleConfig` (
	`id` varchar(64) NOT NULL,
	`contractSlug` varchar(40) NOT NULL,
	`role` varchar(255) NOT NULL,
	`area` varchar(255),
	`setorTrabalho` varchar(255),
	`maquinasEquipamentos` text,
	`tarefas` text,
	`agentesFisicos` text,
	`agentesQuimicos` text,
	`agentesBiologicos` text,
	`agentesErgonomicos` text,
	`agentesAcidentes` text,
	`medidasAdministrativas` text,
	`medidasEngenharia` text,
	`episMinimos` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `osRoleConfig_id` PRIMARY KEY(`id`)
);
