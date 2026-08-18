CREATE TABLE `purchaseRequests` (
	`id` varchar(64) NOT NULL,
	`contract` varchar(40) NOT NULL DEFAULT 'lom',
	`registro` varchar(20) NOT NULL,
	`items` text NOT NULL,
	`priority` enum('baixa','normal','alta','urgente','emergencial') NOT NULL DEFAULT 'normal',
	`status` enum('pendente','aprovada','em_processo','concluida','cancelada','expirada') NOT NULL DEFAULT 'pendente',
	`cancelReason` text,
	`requestedBy` varchar(100),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`expiresAt` timestamp,
	CONSTRAINT `purchaseRequests_id` PRIMARY KEY(`id`)
);
