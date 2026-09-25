ALTER TABLE workspaces ADD COLUMN page_generation uuid;
ALTER TABLE workspaces ADD COLUMN close_after timestamptz;

CREATE TABLE files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  filename text NOT NULL CHECK (length(filename) BETWEEN 1 AND 255),
  content_type text NOT NULL,
  source_bytes bytea NOT NULL,
  byte_size integer NOT NULL CHECK (byte_size > 0),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'chunked', 'embedded', 'failed')),
  error_message text,
  chunk_count integer NOT NULL DEFAULT 0 CHECK (chunk_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, workspace_id)
);
CREATE INDEX files_workspace_created_idx ON files (workspace_id, created_at DESC);

CREATE TABLE chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  file_id uuid NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  chunk_index integer NOT NULL CHECK (chunk_index >= 0),
  content text NOT NULL CHECK (length(content) > 0),
  embedding vector(1536) NOT NULL,
  start_char integer NOT NULL CHECK (start_char >= 0),
  end_char integer NOT NULL CHECK (end_char > start_char),
  page_number integer CHECK (page_number IS NULL OR page_number > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (file_id, chunk_index),
  FOREIGN KEY (file_id, workspace_id) REFERENCES files(id, workspace_id) ON DELETE CASCADE
);
CREATE INDEX chunks_workspace_file_idx ON chunks (workspace_id, file_id, chunk_index);
CREATE INDEX chunks_embedding_hnsw_idx ON chunks USING hnsw (embedding vector_cosine_ops);

CREATE TABLE conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  file_id uuid REFERENCES files(id) ON DELETE RESTRICT,
  source_filename text NOT NULL,
  source_removed_at timestamptz,
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 160),
  selected_model text NOT NULL DEFAULT 'openai:gpt-4.1-mini',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX conversations_workspace_updated_idx ON conversations (workspace_id, updated_at DESC);

CREATE TABLE messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  citations jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(citations) = 'array'),
  model_used text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX messages_conversation_created_idx ON messages (conversation_id, created_at);
