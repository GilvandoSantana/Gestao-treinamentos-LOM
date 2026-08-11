CREATE TABLE `invoiceCategories` (
	`id` varchar(64) NOT NULL,
	`name` varchar(120) NOT NULL,
	`color` varchar(20) NOT NULL DEFAULT '#3b82f6',
	`isDefault` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `invoiceCategories_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `invoiceSettings` (
	`contract` varchar(40) NOT NULL,
	`monthlyLimit` decimal(12,2) DEFAULT '5000',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `invoiceSettings_contract` PRIMARY KEY(`contract`)
);
--> statement-breakpoint
-- Categorias padrão, iguais para todos os contratos.
INSERT INTO `invoiceCategories` (`id`, `name`, `color`, `isDefault`) VALUES
	(UUID(), 'Combustível', '#f59e0b', true),
	(UUID(), 'Manutenção', '#ef4444', true),
	(UUID(), 'Escritório', '#3b82f6', true),
	(UUID(), 'Alimentação', '#10b981', true),
	(UUID(), 'Transporte', '#8b5cf6', true),
	(UUID(), 'Serviços', '#06b6d4', true),
	(UUID(), 'Equipamentos', '#f97316', true),
	(UUID(), 'Outros', '#64748b', true);
