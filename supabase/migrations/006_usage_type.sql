-- Add usage_type column to monthly_usage table to differentiate between scan, generation, and evaluation costs
ALTER TABLE monthly_usage 
ADD COLUMN usage_type TEXT NOT NULL DEFAULT 'scan' CHECK (usage_type IN ('scan', 'generation', 'evaluation'));

-- Update unique constraint to include usage_type
ALTER TABLE monthly_usage DROP CONSTRAINT monthly_usage_user_id_month_provider_model_key;
ALTER TABLE monthly_usage ADD CONSTRAINT monthly_usage_user_id_month_provider_model_usage_type_key 
  UNIQUE(user_id, month, provider, model, usage_type);

-- Add comment
COMMENT ON COLUMN monthly_usage.usage_type IS 'Type of API usage: scan (main queries), generation (AI query generation), evaluation (AI result evaluation)';
