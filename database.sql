-- ============================================================================
-- CONTENTIFY DATABASE SCHEMA
-- PostgreSQL 14+
-- 
-- Copy this entire file and paste into Supabase SQL Editor
-- ============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE,
  api_key VARCHAR(255) UNIQUE NOT NULL,
  cheqd_api_key VARCHAR(255),
  plan VARCHAR(50) DEFAULT 'free',
  credits_remaining INTEGER DEFAULT 10,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- AI Providers table (Claude, GPT, Gemini, etc.)
CREATE TABLE ai_providers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) UNIQUE NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  issuer_did VARCHAR(255) UNIQUE,
  issuer_keys JSONB,
  description TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Credentials table
CREATE TABLE credentials (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  ai_provider_id UUID REFERENCES ai_providers(id),
  credential_id VARCHAR(255) UNIQUE NOT NULL,
  issuer_did VARCHAR(255) NOT NULL,
  content_hash VARCHAR(64) NOT NULL,
  content_preview TEXT,
  authenticity_score INTEGER CHECK (authenticity_score >= 0 AND authenticity_score <= 100),
  payment_amount DECIMAL(10, 2) DEFAULT 0.5,
  payment_address VARCHAR(255),
  status_list_url TEXT,
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'suspended')),
  verification_count INTEGER DEFAULT 0,
  revenue_earned DECIMAL(10, 2) DEFAULT 0.0,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Verifications table (track who verified and when)
CREATE TABLE verifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  credential_id UUID REFERENCES credentials(id) ON DELETE CASCADE,
  verifier_address VARCHAR(255),
  payment_amount DECIMAL(10, 2),
  payment_tx_hash VARCHAR(255),
  verified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Usage analytics
CREATE TABLE analytics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  event_type VARCHAR(50) NOT NULL,
  event_data JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_credentials_user_id ON credentials(user_id);
CREATE INDEX idx_credentials_credential_id ON credentials(credential_id);
CREATE INDEX idx_credentials_created_at ON credentials(created_at DESC);
CREATE INDEX idx_verifications_credential_id ON verifications(credential_id);
CREATE INDEX idx_analytics_user_id ON analytics(user_id);
CREATE INDEX idx_analytics_created_at ON analytics(created_at DESC);

-- Insert default AI providers
INSERT INTO ai_providers (name, display_name, description) VALUES
  ('claude', 'Claude (Anthropic)', 'Anthropic AI assistant - Claude Sonnet 4'),
  ('gpt-4', 'ChatGPT (OpenAI)', 'OpenAI GPT-4 and GPT-4 Turbo'),
  ('gemini', 'Gemini (Google)', 'Google Gemini Pro and Ultra'),
  ('custom', 'Custom AI', 'User-defined AI agent or model');

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_credentials_updated_at BEFORE UPDATE ON credentials
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();