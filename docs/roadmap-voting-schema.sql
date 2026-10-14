-- Apply to the website's dedicated D1 database; never to desktop/profile data.
CREATE TABLE IF NOT EXISTS roadmap_votes (
  feature_id TEXT NOT NULL,
  voter_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  PRIMARY KEY (feature_id, voter_id)
);
CREATE INDEX IF NOT EXISTS roadmap_votes_expiry ON roadmap_votes(expires_at);
CREATE TABLE IF NOT EXISTS roadmap_vote_limits (
  voter_id TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  attempts INTEGER NOT NULL
);
