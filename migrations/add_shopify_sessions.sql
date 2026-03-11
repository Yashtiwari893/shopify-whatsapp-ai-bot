-- =========================================
-- Migration: Add Shopify Session Storage
-- =========================================

CREATE TABLE IF NOT EXISTS shopify_sessions (
    id TEXT PRIMARY KEY,
    shop TEXT NOT NULL,
    state TEXT NOT NULL,
    isOnline BOOLEAN NOT NULL DEFAULT false,
    scope TEXT,
    expires TIMESTAMPTZ,
    accessToken TEXT NOT NULL,
    userId BIGINT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for faster session lookups
CREATE INDEX IF NOT EXISTS idx_shopify_sessions_shop ON shopify_sessions(shop);
