CREATE TABLE users (
  telegram_id INTEGER PRIMARY KEY,
  nickname TEXT NOT NULL,
  scarf_color TEXT NOT NULL DEFAULT '#8B4513',
  hat_style TEXT NOT NULL DEFAULT 'none',
  is_founder INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);

CREATE TABLE houses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_telegram_id INTEGER NOT NULL UNIQUE REFERENCES users(telegram_id),
  shape INTEGER NOT NULL CHECK (shape IN (1, 2, 3)),
  x REAL NOT NULL,
  y REAL NOT NULL,
  placed_at INTEGER NOT NULL
);

CREATE TABLE placed_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  house_id INTEGER NOT NULL REFERENCES houses(id),
  item_type TEXT NOT NULL,
  slot INTEGER NOT NULL,
  placed_at INTEGER NOT NULL
);

CREATE TABLE resource_nodes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK (type IN ('branch', 'stone', 'mushroom', 'berry')),
  x REAL NOT NULL,
  y REAL NOT NULL,
  available INTEGER NOT NULL DEFAULT 1,
  respawns_at INTEGER
);

CREATE TABLE inventory (
  telegram_id INTEGER NOT NULL REFERENCES users(telegram_id),
  item_type TEXT NOT NULL,
  qty INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (telegram_id, item_type)
);

CREATE TABLE gifts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_telegram_id INTEGER NOT NULL REFERENCES users(telegram_id),
  to_house_id INTEGER NOT NULL REFERENCES houses(id),
  item_type TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE follows (
  follower_telegram_id INTEGER NOT NULL REFERENCES users(telegram_id),
  followee_telegram_id INTEGER NOT NULL REFERENCES users(telegram_id),
  PRIMARY KEY (follower_telegram_id, followee_telegram_id)
);

CREATE INDEX idx_houses_owner ON houses(owner_telegram_id);
CREATE INDEX idx_gifts_to_house ON gifts(to_house_id);
CREATE INDEX idx_gifts_from_created ON gifts(from_telegram_id, created_at);
