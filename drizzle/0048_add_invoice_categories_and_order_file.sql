-- Categorias novas pedidas pro almoxarifado — as 8 já existentes continuam.
INSERT INTO `invoiceCategories` (`id`, `name`, `color`, `isDefault`) VALUES
	(UUID(), 'Material consumo e EPI', '#22c55e', true),
	(UUID(), 'Ferramentas', '#eab308', true),
	(UUID(), 'Locações', '#0ea5e9', true);
--> statement-breakpoint
ALTER TABLE `invoices` ADD `fileName2` varchar(255);
--> statement-breakpoint
ALTER TABLE `invoices` ADD `fileUrl2` text;
--> statement-breakpoint
ALTER TABLE `invoices` ADD `fileSize2` int;
