CREATE EXTENSION IF NOT EXISTS vector;

-- Every later file/conversation must reference its owning workspace.
-- Possession of an id alone never grants access: authenticate the hashed token.
CREATE TABLE workspaces (
  id uuid PRIMARY KEY,
  access_token_hash text NOT NULL UNIQUE
    CHECK (access_token_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  CHECK (expires_at > created_at)
);

CREATE INDEX workspaces_expires_at_idx ON workspaces (expires_at);
