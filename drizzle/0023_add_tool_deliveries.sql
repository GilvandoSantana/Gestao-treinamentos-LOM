CREATE TABLE `toolDeliveries` (
	`id` varchar(64) NOT NULL,
	`contract` varchar(40) NOT NULL DEFAULT 'lom',
	`employeeId` varchar(64) NOT NULL,
	`employeeName` varchar(255) NOT NULL,
	`itemId` varchar(64) NOT NULL,
	`itemCode` varchar(100) NOT NULL,
	`itemName` varchar(255) NOT NULL,
	`quantity` decimal(12,2) NOT NULL,
	`status` enum('entregue','devolvido') NOT NULL DEFAULT 'entregue',
	`obs` text,
	`returnObs` text,
	`deliveredBy` varchar(100),
	`deliveredAt` timestamp NOT NULL DEFAULT (now()),
	`returnedAt` timestamp,
	CONSTRAINT `toolDeliveries_id` PRIMARY KEY(`id`)
);
