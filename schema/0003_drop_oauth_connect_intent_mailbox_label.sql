ALTER TABLE oauth_connect_intents
  ADD COLUMN IF NOT EXISTS asset_id TEXT NULL;

UPDATE oauth_connect_intents
SET asset_id = COALESCE(asset_id, mailbox_label)
WHERE asset_id IS NULL;

ALTER TABLE oauth_connect_intents
  DROP COLUMN IF EXISTS mailbox_label;
