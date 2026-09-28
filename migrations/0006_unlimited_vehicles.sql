-- Lets specific accounts (e.g. the business owner's own account, for demos
-- and testing) register any number of vehicles without needing a Moto ID Kit
-- credit and without ever being routed to checkout.
--
-- Defaults to 0 (off) for every existing and future user; nothing changes for
-- ordinary customers, who still need a paid credit per vehicle_credits.
ALTER TABLE users ADD COLUMN unlimited_vehicles INTEGER NOT NULL DEFAULT 0;
