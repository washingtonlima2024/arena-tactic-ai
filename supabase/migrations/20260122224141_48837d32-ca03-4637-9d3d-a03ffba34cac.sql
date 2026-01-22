-- Insert default AI provider priorities
INSERT INTO api_settings (id, setting_key, setting_value, is_encrypted, created_at, updated_at)
VALUES 
  (gen_random_uuid(), 'ai_provider_lovable_priority', '1', false, now(), now()),
  (gen_random_uuid(), 'ai_provider_gemini_priority', '2', false, now(), now()),
  (gen_random_uuid(), 'ai_provider_openai_priority', '0', false, now(), now()),
  (gen_random_uuid(), 'ai_provider_ollama_priority', '0', false, now(), now()),
  (gen_random_uuid(), 'openai_enabled', 'true', false, now(), now())
ON CONFLICT (setting_key) DO UPDATE SET 
  setting_value = EXCLUDED.setting_value,
  updated_at = now();