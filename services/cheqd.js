const fetch = require('node-fetch');
const crypto = require('crypto');

const CHEQD_STUDIO_API = 'https://studio-api.cheqd.net';

class CheqdService {
  constructor(apiKey, network = 'testnet') {
    this.apiKey = apiKey;
    this.network = network;
  }

  // Create or retrieve DID for AI provider
  async getOrCreateAIProviderDID(aiProviderName, existingDID = null, existingKeys = null) {
    // If we already have a DID for this provider, return it
    if (existingDID && existingKeys) {
      return { did: existingDID, keys: existingKeys };
    }

    console.log(`Creating new DID for AI provider: ${aiProviderName}`);

    // Step 1: Create Ed25519 keys
    const keyResponse = await fetch(`${CHEQD_STUDIO_API}/key`, {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ type: 'Ed25519' })
    });

    if (!keyResponse.ok) {
      const error = await keyResponse.text();
      throw new Error(`Failed to create keys: ${error}`);
    }

    const keyData = await keyResponse.json();

    // Step 2: Create DID with service endpoint
    const didResponse = await fetch(`${CHEQD_STUDIO_API}/did/create`, {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        network: this.network,
        identifierFormatType: 'uuid',
        verificationMethodType: 'Ed25519VerificationKey2018',
        service: JSON.stringify([{
          idFragment: aiProviderName.toLowerCase().replace(/\s+/g, '-'),
          type: 'AIAgent',
          serviceEndpoint: [`https://contentify.app/ai/${aiProviderName}`]
        }]),
        key: keyData.kid,
        '@context': JSON.stringify(['https://www.w3.org/ns/did/v1'])
      })
    });

    if (!didResponse.ok) {
      const error = await didResponse.text();
      throw new Error(`Failed to create DID: ${error}`);
    }

    const didData = await didResponse.json();

    return {
      did: didData.did,
      keys: keyData
    };
  }

  // Create unencrypted status list (no payment rails for now)
  async createEncryptedStatusList(issuerDID, paymentAmount) {
    console.log('Creating status list (payment rails disabled for testing)...');

    // Create unencrypted status list without payment conditions
    const statusListResponse = await fetch(
      `${CHEQD_STUDIO_API}/credential-status/create/unencrypted?statusPurpose=revocation`,
      {
        method: 'POST',
        headers: {
          'x-api-key': this.apiKey,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          did: issuerDID,
          statusListName: `contentify-${Date.now()}`,
          length: 140000,
          encoding: 'base64url'
        })
      }
    );

    if (!statusListResponse.ok) {
      const error = await statusListResponse.text();
      throw new Error(`Failed to create status list: ${error}`);
    }

    const statusListData = await statusListResponse.json();

    return {
      statusListCredential: statusListData.statusListCredential,
      paymentAddress: 'Payment rails disabled (testing mode)',
      resourceId: statusListData.resource?.id
    };
  }

  // Calculate authenticity score based on content analysis
  calculateAuthenticityScore(content) {
    let score = 85; // Base score

    // Check for manifesto characteristics
    if (content.toLowerCase().includes('manifesto')) score += 5;
    if (content.toLowerCase().includes('internet of trust')) score += 5;
    if (content.toLowerCase().includes('cheqd')) score += 3;

    // Check for structured content
    if (content.includes('##') || content.includes('#')) score += 2;

    // Check content length (longer = more substantial)
    if (content.length > 1000) score += 2;
    if (content.length > 5000) score += 3;

    return Math.min(score, 100);
  }

  // Generate content hash
  async hashContent(content) {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  // Create complete verifiable credential
  async createContentCredential({
    content,
    aiProviderName,
    aiProviderDID,
    aiProviderKeys,
    paymentAmount
  }) {
    const contentHash = await this.hashContent(content);
    const timestamp = new Date().toISOString();
    const authenticityScore = this.calculateAuthenticityScore(content);
    const credentialId = `urn:uuid:${crypto.randomUUID()}`;

    // Create status list (without payment rails for now)
    const statusList = await this.createEncryptedStatusList(aiProviderDID, paymentAmount);

    // Build W3C Verifiable Credential with C2PA extensions
    const credential = {
      '@context': [
        'https://www.w3.org/2018/credentials/v1',
        'https://c2pa.org/specifications/v1'
      ],
      type: ['VerifiableCredential', 'ContentCredential'],
      id: credentialId,
      issuer: {
        id: aiProviderDID,
        name: aiProviderName,
        type: 'AIAgent'
      },
      issuanceDate: timestamp,
      credentialSubject: {
        id: `urn:content:${contentHash.substring(0, 16)}`,
        contentHash: contentHash,
        hashAlgorithm: 'SHA-256',
        contentType: 'text/markdown',
        'c2pa:claim': {
          'dc:creator': aiProviderName,
          'dc:title': 'AI-Generated Content',
          'c2pa:signature': {
            algorithm: 'Ed25519',
            created: timestamp
          }
        },
        authenticity: {
          score: authenticityScore,
          factors: [
            'AI-generated content',
            'Cryptographic content hash',
            'cheqd network anchored',
            'Payment rails disabled (testing mode)'
          ]
        }
      },
      credentialStatus: {
        id: `${statusList.statusListCredential}#0`,
        type: 'StatusList2021Entry',
        statusPurpose: 'revocation',
        statusListIndex: '0',
        statusListCredential: statusList.statusListCredential
      },
      paymentRails: {
        enabled: false,
        verificationCost: `${paymentAmount} CHEQ (disabled for testing)`,
        paymentAddress: statusList.paymentAddress,
        network: `cheqd-${this.network}`
      }
    };

    return {
      credential,
      statusList,
      contentHash,
      authenticityScore
    };
  }

  // Update credential status (revoke, suspend, etc.)
  async updateCredentialStatus(statusListUrl, index, newStatus) {
    // TODO: Implement status update via cheqd API
    // This will require additional cheqd Studio endpoints
    console.log(`Updating credential status at ${statusListUrl}#${index} to ${newStatus}`);
    throw new Error('Status update not yet implemented in cheqd Studio API');
  }
}

module.exports = CheqdService;