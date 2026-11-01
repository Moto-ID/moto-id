-- The in-platform marketplace: lets a vehicle's owner list it for sale,
-- surfacing its Moto ID provenance (service record count, ownership
-- history) as the differentiator. See listings/listing_inquiries CRUD in
-- src/lib/db.ts and the routes in src/routes/marketplace.ts.
--
-- One row per "for sale" attempt — an owner can relist after a sale falls
-- through or after marking sold, which creates a fresh row rather than
-- reusing the old one, so history isn't lost.
--
-- status lifecycle: pending_payment -> active -> (sold | removed).
-- pending_payment rows that never get paid just sit there harmlessly; they
-- never appear on the public marketplace (only 'active' listings do).
CREATE TABLE IF NOT EXISTS listings (
    id TEXT PRIMARY KEY,
    vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    price_pence INTEGER NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    -- Free-text region hint only (e.g. "Surrey, UK") — never a full postal
    -- address. Optional.
    location TEXT,
    status TEXT NOT NULL DEFAULT 'pending_payment',
    -- Stripe PaymentIntent for the one-time listing fee (not the vehicle's
    -- own sale price, which never touches Stripe).
    payment_intent_id TEXT,
    paid_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_listings_vehicle_id ON listings(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_listings_status ON listings(status);
CREATE INDEX IF NOT EXISTS idx_listings_user_id ON listings(user_id);

-- A buyer's inquiry on a listing. Relayed to the seller by email (see
-- sendListingInquiryEmail in src/lib/email.ts) and also kept here so the
-- seller's own email address never has to be shown publicly, and so an
-- inquiry survives even if the notification email fails to send.
CREATE TABLE IF NOT EXISTS listing_inquiries (
    id TEXT PRIMARY KEY,
    listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_listing_inquiries_listing_id ON listing_inquiries(listing_id);
