ALTER TABLE conversations
  ADD CONSTRAINT conversations_selected_model_supported
  CHECK (selected_model IN ('openai:gpt-4.1-mini', 'anthropic:claude-haiku-4-5-20251001'));
