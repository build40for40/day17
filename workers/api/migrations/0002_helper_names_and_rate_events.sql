ALTER TABLE memberships ADD COLUMN name TEXT;

UPDATE memberships SET name = (SELECT name FROM people WHERE people.id = memberships.person_id) WHERE role = 'helper';

CREATE TABLE rate_events (
  key TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX rate_events_key ON rate_events (key, created_at);
CREATE INDEX rate_events_created ON rate_events (created_at);
