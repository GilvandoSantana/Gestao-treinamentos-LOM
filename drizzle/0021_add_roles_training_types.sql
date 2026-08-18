CREATE TABLE `customRoles` (
	`id` varchar(64) NOT NULL,
	`name` varchar(120) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `customRoles_id` PRIMARY KEY(`id`),
	CONSTRAINT `customRoles_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `trainingTypes` (
	`id` varchar(64) NOT NULL,
	`name` varchar(150) NOT NULL,
	`validityMonths` int NOT NULL DEFAULT 12,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `trainingTypes_id` PRIMARY KEY(`id`),
	CONSTRAINT `trainingTypes_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
INSERT INTO `trainingTypes` (`id`, `name`, `validityMonths`) VALUES
	(UUID(), 'ASO', 12),
	(UUID(), 'Bloqueio e Etiquetagem', 12),
	(UUID(), 'Direção Defensiva', 12),
	(UUID(), 'Equipamentos Móveis', 12),
	(UUID(), 'Movimentação de Carga', 12),
	(UUID(), 'Produtos Químicos', 12),
	(UUID(), 'Proteção de Máquinas', 12),
	(UUID(), 'SEP', 12),
	(UUID(), 'Trabalho a Quente', 12),
	(UUID(), 'Trabalho com Eletricidade', 12),
	(UUID(), 'Trabalho em Altura', 12);
