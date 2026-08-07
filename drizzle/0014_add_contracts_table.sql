CREATE TABLE `contracts` (
	`id` varchar(64) NOT NULL,
	`slug` varchar(60) NOT NULL,
	`name` varchar(120) NOT NULL,
	`preposition` varchar(2) NOT NULL DEFAULT 'do',
	`deleted` boolean NOT NULL DEFAULT false,
	`deletedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `contracts_id` PRIMARY KEY(`id`),
	CONSTRAINT `contracts_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
-- Semente com os 7 contratos que já existiam como lista fixa no código, para
-- os dados já cadastrados (employees/admins/safetySheets.contract) continuarem
-- resolvendo normalmente.
INSERT INTO `contracts` (`id`, `slug`, `name`, `preposition`) VALUES
	('c0000000-0000-4000-8000-000000000001', 'lom', 'LOM', 'do'),
	('c0000000-0000-4000-8000-000000000002', 'reflorestamento', 'Reflorestamento', 'do'),
	('c0000000-0000-4000-8000-000000000003', 'convergencia', 'Convergência', 'da'),
	('c0000000-0000-4000-8000-000000000004', 'construcao-civil', 'Construção Civil', 'da'),
	('c0000000-0000-4000-8000-000000000005', 'geomecanica', 'Geomecânica', 'da'),
	('c0000000-0000-4000-8000-000000000006', 'conjunto-mecanizado', 'Conjunto Mecanizado', 'do'),
	('c0000000-0000-4000-8000-000000000007', 'integridade-estrutural', 'Integridade Estrutural', 'da');
