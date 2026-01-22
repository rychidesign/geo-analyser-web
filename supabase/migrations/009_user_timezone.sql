-- Add timezone support to user settings
-- Store timezone in user_settings table under a special "_profile" provider

-- Add timezone to existing users (default to Europe/Prague)
INSERT INTO user_settings (user_id, provider, config)
SELECT 
  id as user_id,
  '_profile' as provider,
  jsonb_build_object('timezone', 'Europe/Prague') as config
FROM auth.users
WHERE id NOT IN (
  SELECT user_id FROM user_settings WHERE provider = '_profile'
);

-- Add comment
COMMENT ON TABLE user_settings IS 'Stores user settings including API keys (encrypted) and preferences like timezone (provider: _profile)';
