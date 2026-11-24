CREATE TABLE households (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE people (
  id TEXT PRIMARY KEY,
  phone TEXT NOT NULL UNIQUE,
  name TEXT,
  opted_out_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE memberships (
  household_id TEXT NOT NULL REFERENCES households (id) ON DELETE CASCADE,
  person_id TEXT NOT NULL REFERENCES people (id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'helper')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (household_id, person_id)
);

CREATE INDEX memberships_person ON memberships (person_id);
CREATE UNIQUE INDEX memberships_one_owned_household ON memberships (person_id) WHERE role = 'owner';

CREATE TABLE signals (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households (id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('sms', 'web')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'solved')),
  opened_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  solved_at TEXT
);

CREATE UNIQUE INDEX signals_one_open_per_household ON signals (household_id) WHERE status = 'open';
CREATE INDEX signals_household_opened ON signals (household_id, opened_at);
CREATE INDEX signals_status_opened ON signals (status, opened_at);

CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  household_id TEXT REFERENCES households (id) ON DELETE CASCADE,
  signal_id TEXT REFERENCES signals (id) ON DELETE CASCADE,
  person_id TEXT REFERENCES people (id) ON DELETE SET NULL,
  phone TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('in', 'out')),
  kind TEXT NOT NULL,
  body TEXT NOT NULL,
  provider_id TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE UNIQUE INDEX messages_provider_id ON messages (provider_id) WHERE provider_id IS NOT NULL;
CREATE INDEX messages_household ON messages (household_id, created_at);
CREATE INDEX messages_phone ON messages (phone, kind);

CREATE TABLE verifications (
  id INTEGER PRIMARY KEY,
  phone TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX verifications_phone ON verifications (phone, created_at);

CREATE TRIGGER memberships_forget_unattached_people
AFTER DELETE ON memberships
WHEN NOT EXISTS (SELECT 1 FROM memberships WHERE person_id = OLD.person_id)
BEGIN
  DELETE FROM people WHERE id = OLD.person_id AND opted_out_at IS NULL;
  UPDATE people SET name = NULL WHERE id = OLD.person_id;
END;
