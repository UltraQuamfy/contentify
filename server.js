require('dotenv').config();
const express = require('express');
const cors = require('cors');
const QRCode = require('qrcode');
const crypto = require('crypto');

const CheqdService = require('./services/cheqd');
const DatabaseService = require('./services/database');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize services
const db = new DatabaseService(process.env.DATABASE_URL);

// Middleware
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*'
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Error handler
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// ============================================================================
// ROUTES
// ============================================================================

// Health check
app.get('/health', asyncHandler(async (req, res) => {
  const dbHealth = await db.healthCheck();
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    database: dbHealth ? 'connected' : 'disconnected'
  });
}));

// Get platform statistics
app.get('/api/stats', asyncHandler(async (req, res) => {
  const stats = await db.getPlatformStats();
  res.json(stats);
}));

// Get all supported AI providers
app.get('/api/providers', asyncHandler(async (req, res) => {
  const providers = await db.getAllAIProviders();
  res.json(providers);
}));

// ============================================================================
// CREDENTIAL CREATION
// ============================================================================

app.post('/api/credentials/create', asyncHandler(async (req, res) => {
  const {
    content,
    aiProvider = 'claude',
    paymentAmount = 0.5,
    cheqdApiKey,
    userApiKey
  } = req.body;

  // Validation
  if (!content || content.trim().length === 0) {
    return res.status(400).json({ error: 'Content is required' });
  }

  if (!cheqdApiKey) {
    return res.status(400).json({ error: 'cheqd API key is required' });
  }

  if (paymentAmount < 0.1 || paymentAmount > 100) {
    return res.status(400).json({ error: 'Payment amount must be between 0.1 and 100 CHEQ' });
  }

  try {
    // Initialize cheqd service with user's API key
    const cheqd = new CheqdService(cheqdApiKey, process.env.CHEQD_NETWORK || 'testnet');

    // Get or create user (for demo, using API key as identifier)
    let user;
    if (userApiKey) {
      user = await db.getUserByApiKey(userApiKey);
      if (!user) {
        user = await db.createUser(null, userApiKey);
      }
    }

    // Get AI provider from database
    let provider = await db.getAIProvider(aiProvider);
    if (!provider) {
      return res.status(400).json({ error: `Unknown AI provider: ${aiProvider}` });
    }

    // Get or create DID for this AI provider
    const { did, keys } = await cheqd.getOrCreateAIProviderDID(
      provider.display_name,
      provider.issuer_did,
      provider.issuer_keys
    );

    // Update provider with DID if it was just created
    if (!provider.issuer_did) {
      provider = await db.updateAIProviderDID(provider.id, did, keys);
    }

    // Create verifiable credential
    const {
      credential,
      statusList,
      contentHash,
      authenticityScore
    } = await cheqd.createContentCredential({
      content,
      aiProviderName: provider.display_name,
      aiProviderDID: did,
      aiProviderKeys: keys,
      paymentAmount
    });

    // Generate QR code
    const qrData = JSON.stringify({
      credentialId: credential.id,
      issuer: provider.display_name,
      issuerDID: did,
      network: `cheqd-${process.env.CHEQD_NETWORK || 'testnet'}`,
      timestamp: credential.issuanceDate,
      authenticityScore: authenticityScore,
      contentHash: contentHash.substring(0, 16) + '...',
      paymentRails: {
        verificationCost: `${paymentAmount} CHEQ`,
        paymentAddress: statusList.paymentAddress
      },
      verify: `${process.env.APP_URL || 'https://contentify.app'}/verify/${credential.id}`
    }, null, 2);

    const qrCodeDataUrl = await QRCode.toDataURL(qrData, {
      errorCorrectionLevel: 'H',
      width: 300,
      color: {
        dark: '#6366f1',
        light: '#ffffff'
      }
    });

    // Save to database
    let dbCredential = null;
    if (user) {
      dbCredential = await db.createCredential({
        userId: user.id,
        aiProviderId: provider.id,
        credentialId: credential.id,
        issuerDid: did,
        contentHash: contentHash,
        contentPreview: content.substring(0, 200),
        authenticityScore: authenticityScore,
        paymentAmount: paymentAmount,
        paymentAddress: statusList.paymentAddress,
        statusListUrl: statusList.statusListCredential,
        metadata: {
          credential: credential,
          qrCode: qrCodeDataUrl
        }
      });

      // Decrement user credits
      await db.decrementUserCredits(user.id);

      // Record analytics
      await db.recordAnalyticsEvent(user.id, 'credential_created', {
        aiProvider: aiProvider,
        authenticityScore: authenticityScore,
        paymentAmount: paymentAmount
      });
    }

    // Return response
    res.json({
      success: true,
      credential: {
        id: credential.id,
        issuerDID: did,
        issuerName: provider.display_name,
        contentHash: contentHash,
        authenticityScore: authenticityScore,
        timestamp: credential.issuanceDate,
        paymentRails: {
          enabled: true,
          verificationCost: `${paymentAmount} CHEQ`,
          paymentAddress: statusList.paymentAddress
        },
        statusListUrl: statusList.statusListCredential,
        verificationUrl: `${process.env.APP_URL || 'https://contentify.app'}/verify/${credential.id}`
      },
      qrCode: qrCodeDataUrl,
      fullCredential: credential
    });

  } catch (error) {
    console.error('Error creating credential:', error);
    res.status(500).json({
      error: 'Failed to create credential',
      message: error.message
    });
  }
}));

// ============================================================================
// CREDENTIAL VERIFICATION
// ============================================================================

app.get('/api/credentials/:credentialId', asyncHandler(async (req, res) => {
  const { credentialId } = req.params;

  const credential = await db.getCredential(credentialId);

  if (!credential) {
    return res.status(404).json({ error: 'Credential not found' });
  }

  res.json({
    id: credential.credential_id,
    issuerDID: credential.issuer_did,
    aiProvider: credential.ai_provider_name,
    contentHash: credential.content_hash,
    authenticityScore: credential.authenticity_score,
    paymentAmount: credential.payment_amount,
    paymentAddress: credential.payment_address,
    status: credential.status,
    verificationCount: credential.verification_count,
    revenueEarned: credential.revenue_earned,
    createdAt: credential.created_at,
    statusListUrl: credential.status_list_url,
    metadata: credential.metadata
  });
}));

app.post('/api/credentials/:credentialId/verify', asyncHandler(async (req, res) => {
  const { credentialId } = req.params;
  const { verifierAddress, paymentTxHash } = req.body;

  if (!verifierAddress) {
    return res.status(400).json({ error: 'Verifier address is required' });
  }

  const credential = await db.getCredential(credentialId);

  if (!credential) {
    return res.status(404).json({ error: 'Credential not found' });
  }

  // Record verification
  await db.recordVerification(
    credentialId,
    verifierAddress,
    credential.payment_amount,
    paymentTxHash
  );

  // Update credential stats
  await db.incrementVerificationCount(credentialId, credential.payment_amount);

  res.json({
    success: true,
    message: 'Verification recorded',
    credential: {
      id: credential.credential_id,
      status: credential.status,
      authenticityScore: credential.authenticity_score
    }
  });
}));

// ============================================================================
// USER DASHBOARD
// ============================================================================

app.get('/api/user/credentials', asyncHandler(async (req, res) => {
  const { apiKey } = req.query;

  if (!apiKey) {
    return res.status(401).json({ error: 'API key required' });
  }

  const user = await db.getUserByApiKey(apiKey);

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const credentials = await db.getUserCredentials(user.id);
  const stats = await db.getUserStats(user.id);

  res.json({
    user: {
      email: user.email,
      plan: user.plan,
      creditsRemaining: user.credits_remaining
    },
    stats: stats,
    credentials: credentials
  });
}));

// ============================================================================
// ERROR HANDLING
// ============================================================================

app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ============================================================================
// START SERVER
// ============================================================================

app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════╗
║                                                   ║
║   🔐 Contentify Backend Server                   ║
║                                                   ║
║   Port: ${PORT}                                      ║
║   Environment: ${process.env.NODE_ENV || 'development'}                       ║
║   Network: cheqd ${process.env.CHEQD_NETWORK || 'testnet'}                     ║
║                                                   ║
║   Endpoints:                                      ║
║   - GET  /health                                  ║
║   - GET  /api/stats                               ║
║   - GET  /api/providers                           ║
║   - POST /api/credentials/create                  ║
║   - GET  /api/credentials/:id                     ║
║   - POST /api/credentials/:id/verify              ║
║   - GET  /api/user/credentials                    ║
║                                                   ║
╚═══════════════════════════════════════════════════╝
  `);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing server...');
  await db.close();
  process.exit(0);
});