ALTER TABLE `warehouseItems` ADD `marca` varchar(150);
--> statement-breakpoint
ALTER TABLE `warehouseItems` ADD `modelo` varchar(150);
--> statement-breakpoint
ALTER TABLE `warehouseItems` ADD `categoria` varchar(100);
--> statement-breakpoint
ALTER TABLE `warehouseItems` ADD `observacoes` text;
--> statement-breakpoint
ALTER TABLE `warehouseItems` ADD `tamanho` varchar(30);
--> statement-breakpoint
ALTER TABLE `warehouseItems` ADD `periodicidadeTrocaMeses` int;
--> statement-breakpoint
ALTER TABLE `warehouseItems` ADD `numeroSerie` varchar(100);
--> statement-breakpoint
ALTER TABLE `warehouseItems` ADD `dataAquisicao` varchar(10);
--> statement-breakpoint
ALTER TABLE `warehouseItems` ADD `estadoConservacao` enum('novo','bom','regular','ruim');
--> statement-breakpoint
ALTER TABLE `warehouseItems` ADD `estoqueMaximo` decimal(12,2);
