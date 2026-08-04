-- Remove eventuais registros orfaos antes de travar a integridade referencial,
-- caso existam trainings/certificates/auditLogs/emailNotifications apontando
-- para employees ou trainings que ja foram excluidos anteriormente (o app so
-- fazia cascade manual parcial ate aqui).
DELETE FROM `trainings` WHERE `employeeId` NOT IN (SELECT `id` FROM `employees`);
--> statement-breakpoint
DELETE FROM `auditLogs` WHERE `employeeId` NOT IN (SELECT `id` FROM `employees`);
--> statement-breakpoint
DELETE FROM `certificates` WHERE `employeeId` NOT IN (SELECT `id` FROM `employees`) OR `trainingId` NOT IN (SELECT `id` FROM `trainings`);
--> statement-breakpoint
DELETE FROM `emailNotifications` WHERE `employeeId` NOT IN (SELECT `id` FROM `employees`) OR `trainingId` NOT IN (SELECT `id` FROM `trainings`);
--> statement-breakpoint
ALTER TABLE `trainings` ADD CONSTRAINT `trainings_employeeId_employees_id_fk` FOREIGN KEY (`employeeId`) REFERENCES `employees`(`id`) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE `auditLogs` ADD CONSTRAINT `auditLogs_employeeId_employees_id_fk` FOREIGN KEY (`employeeId`) REFERENCES `employees`(`id`) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE `certificates` ADD CONSTRAINT `certificates_trainingId_trainings_id_fk` FOREIGN KEY (`trainingId`) REFERENCES `trainings`(`id`) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE `certificates` ADD CONSTRAINT `certificates_employeeId_employees_id_fk` FOREIGN KEY (`employeeId`) REFERENCES `employees`(`id`) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE `emailNotifications` ADD CONSTRAINT `emailNotifications_trainingId_trainings_id_fk` FOREIGN KEY (`trainingId`) REFERENCES `trainings`(`id`) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE `emailNotifications` ADD CONSTRAINT `emailNotifications_employeeId_employees_id_fk` FOREIGN KEY (`employeeId`) REFERENCES `employees`(`id`) ON DELETE CASCADE;
