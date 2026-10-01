-- Settings > Notifications: a real, stored preference for future marketing
-- emails. Off by default for every account (opt-in, not opt-out), matching
-- the Privacy Policy's "no third-party trackers, nothing you didn't agree
-- to" stance. Transactional emails (password resets, ownership-transfer
-- invitations) are never gated by this flag — they're required for the
-- account/feature they belong to to work at all, so there is deliberately
-- no way to opt out of those from this page.
ALTER TABLE users ADD COLUMN marketing_opt_in INTEGER NOT NULL DEFAULT 0;
