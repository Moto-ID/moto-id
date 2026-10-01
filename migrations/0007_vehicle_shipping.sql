-- Shipping address for posting the physical Moto ID plate, captured as part
-- of vehicle registration itself (the "order form"). See src/routes/vehicles.ts
-- (register-vehicle form) and src/lib/email.ts (sendOrderNotificationEmail).
ALTER TABLE vehicles ADD COLUMN ship_name TEXT;
ALTER TABLE vehicles ADD COLUMN ship_address_line1 TEXT;
ALTER TABLE vehicles ADD COLUMN ship_address_line2 TEXT;
ALTER TABLE vehicles ADD COLUMN ship_city TEXT;
ALTER TABLE vehicles ADD COLUMN ship_postal_code TEXT;
ALTER TABLE vehicles ADD COLUMN ship_country TEXT;
