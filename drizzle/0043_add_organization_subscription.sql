ALTER TABLE `organizations` ADD `stripeCustomerId` varchar(255);
--> statement-breakpoint
ALTER TABLE `organizations` ADD `stripeSubscriptionId` varchar(255);
--> statement-breakpoint
ALTER TABLE `organizations` ADD `subscriptionStatus` varchar(50);
