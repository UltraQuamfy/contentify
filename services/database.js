const { Pool } = require('pg');

class DatabaseService {
  constructor(connectionString) {
    this.pool = new Pool({
      connectionString: connectionString,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });
  }

  async createUser(email, apiKey) {
    const query = `INSERT INTO users (email, api_key) VALUES ($1, $2) RETURNING *`;
    const result = await this.pool.query(query, [email, apiKey]);
    return result.rows[0];
  }

  async getUserByApiKey(apiKey) {
    const query = 'SELECT * FROM users WHERE api_key = $1';
    const result = await this.pool.query(query, [apiKey]);
    return result.rows[0];
  }

  async updateUserCheqdKey(userId, cheqdApiKey) {
    const query = `UPDATE users SET cheqd_api_key = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *`;
    const result = await this.pool.query(query, [cheqdApiKey, userId]);
    return result.rows[0];
  }

  async decrementUserCredits(userId) {
    const query = `UPDATE users SET credits_remaining = credits_remaining - 1, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND credits_remaining > 0 RETURNING *`;
    const result = await this.pool.query(query, [userId]);
    return result.rows[0];
  }

  async getAIProvider(name) {
    const query = 'SELECT * FROM ai_providers WHERE name = $1 AND active = true';
    const result = await this.pool.query(query, [name]);
    return result.rows[0];
  }

  async getAllAIProviders() {
    const query = 'SELECT * FROM ai_providers WHERE active = true ORDER BY display_name';
    const result = await this.pool.query(query);
    return result.rows;
  }

  async updateAIProviderDID(providerId, did, keys) {
    const query = `UPDATE ai_providers SET issuer_did = $1, issuer_keys = $2 WHERE id = $3 RETURNING *`;
    const result = await this.pool.query(query, [did, JSON.stringify(keys), providerId]);
    return result.rows[0];
  }

  async createCredential({ userId, aiProviderId, credentialId, issuerDid, contentHash, contentPreview, authenticityScore, paymentAmount, paymentAddress, statusListUrl, metadata }) {
    const query = `INSERT INTO credentials (user_id, ai_provider_id, credential_id, issuer_did, content_hash, content_preview, authenticity_score, payment_amount, payment_address, status_list_url, metadata) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`;
    const result = await this.pool.query(query, [userId, aiProviderId, credentialId, issuerDid, contentHash, contentPreview, authenticityScore, paymentAmount, paymentAddress, statusListUrl, JSON.stringify(metadata)]);
    return result.rows[0];
  }

  async getCredential(credentialId) {
    const query = `SELECT c.*, u.email as user_email, ap.display_name as ai_provider_name FROM credentials c LEFT JOIN users u ON c.user_id = u.id LEFT JOIN ai_providers ap ON c.ai_provider_id = ap.id WHERE c.credential_id = $1`;
    const result = await this.pool.query(query, [credentialId]);
    return result.rows[0];
  }

  async getUserCredentials(userId, limit = 50, offset = 0) {
    const query = `SELECT c.*, ap.display_name as ai_provider_name FROM credentials c LEFT JOIN ai_providers ap ON c.ai_provider_id = ap.id WHERE c.user_id = $1 ORDER BY c.created_at DESC LIMIT $2 OFFSET $3`;
    const result = await this.pool.query(query, [userId, limit, offset]);
    return result.rows;
  }

  async updateCredentialStatus(credentialId, status) {
    const query = `UPDATE credentials SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE credential_id = $2 RETURNING *`;
    const result = await this.pool.query(query, [status, credentialId]);
    return result.rows[0];
  }

  async incrementVerificationCount(credentialId, paymentAmount) {
    const query = `UPDATE credentials SET verification_count = verification_count + 1, revenue_earned = revenue_earned + $1, updated_at = CURRENT_TIMESTAMP WHERE credential_id = $2 RETURNING *`;
    const result = await this.pool.query(query, [paymentAmount, credentialId]);
    return result.rows[0];
  }

  async recordVerification(credentialId, verifierAddress, paymentAmount, txHash) {
    const query = `INSERT INTO verifications (credential_id, verifier_address, payment_amount, payment_tx_hash) SELECT id, $2, $3, $4 FROM credentials WHERE credential_id = $1 RETURNING *`;
    const result = await this.pool.query(query, [credentialId, verifierAddress, paymentAmount, txHash]);
    return result.rows[0];
  }

  async getCredentialVerifications(credentialId) {
    const query = `SELECT v.* FROM verifications v JOIN credentials c ON v.credential_id = c.id WHERE c.credential_id = $1 ORDER BY v.verified_at DESC`;
    const result = await this.pool.query(query, [credentialId]);
    return result.rows;
  }

  async recordAnalyticsEvent(userId, eventType, eventData) {
    const query = `INSERT INTO analytics (user_id, event_type, event_data) VALUES ($1, $2, $3) RETURNING *`;
    const result = await this.pool.query(query, [userId, eventType, JSON.stringify(eventData)]);
    return result.rows[0];
  }

  async getUserStats(userId) {
    const query = `SELECT COUNT(*) as total_credentials, SUM(verification_count) as total_verifications, SUM(revenue_earned) as total_revenue, AVG(authenticity_score) as avg_authenticity_score FROM credentials WHERE user_id = $1`;
    const result = await this.pool.query(query, [userId]);
    return result.rows[0];
  }

  async getPlatformStats() {
    const query = `SELECT COUNT(DISTINCT u.id) as total_users, COUNT(c.id) as total_credentials, SUM(c.verification_count) as total_verifications, SUM(c.revenue_earned) as total_revenue, COUNT(DISTINCT ap.id) as active_ai_providers FROM users u LEFT JOIN credentials c ON u.id = c.user_id CROSS JOIN ai_providers ap WHERE ap.active = true`;
    const result = await this.pool.query(query);
    return result.rows[0];
  }

  async healthCheck() {
    const query = 'SELECT NOW()';
    const result = await this.pool.query(query);
    return result.rows[0];
  }

  async close() {
    await this.pool.end();
  }
}

module.exports = DatabaseService;