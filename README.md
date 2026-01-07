# Contentify Backend

**Verifiable credentials for AI-generated content**

Production-ready Node.js backend with cheqd integration, payment rails, and PostgreSQL database.

---

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ 
- PostgreSQL 14+
- cheqd Studio API key ([Get one here](https://studio.cheqd.io))

### Installation
```bash
# Clone repository
git clone https://github.com/yourusername/contentify.git
cd contentify/backend

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your credentials

# Start development server
npm run dev

# Or start production server
npm start
```

---

## 📚 API Documentation

### Base URL
```
Development: http://localhost:3000
Production: https://api.contentify.app
```

### Endpoints

#### **Health Check**
```http
GET /health
```

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-07T12:00:00.000Z",
  "database": "connected"
}
```

---

#### **Create Credential**
```http
POST /api/credentials/create
Content-Type: application/json
```

**Request Body:**
```json
{
  "content": "Your content here...",
  "aiProvider": "claude",
  "paymentAmount": 0.5,
  "cheqdApiKey": "your_cheqd_api_key"
}
```

**Response:**
```json
{
  "success": true,
  "credential": {
    "id": "urn:uuid:...",
    "issuerDID": "did:cheqd:testnet:...",
    "issuerName": "Claude (Anthropic)",
    "contentHash": "abc123...",
    "authenticityScore": 95,
    "paymentRails": {
      "enabled": true,
      "verificationCost": "0.5 CHEQ",
      "paymentAddress": "cheqd1..."
    }
  },
  "qrCode": "data:image/png;base64,..."
}
```

---

## 🗄️ Database Schema

- **users** - User accounts, API keys
- **ai_providers** - Supported AI systems (Claude, GPT, Gemini)
- **credentials** - All issued credentials
- **verifications** - Verification tracking
- **analytics** - Usage events

---

## 🚀 Deployment

### Railway (Recommended)

1. Push to GitHub
2. Connect Railway to your repo
3. Add environment variables
4. Deploy automatically

### Environment Variables

Required:
- `CHEQD_API_KEY` - Your cheqd Studio API key
- `DATABASE_URL` - PostgreSQL connection string
- `CHEQD_NETWORK` - testnet or mainnet
- `PORT` - 3000
- `NODE_ENV` - production

---

## 🔐 Security

- Environment variables for sensitive data
- CORS configured
- SQL injection protection
- Input validation

---

## 📊 Features

✅ Real cheqd DID integration  
✅ Payment rails for verification  
✅ C2PA content credentials  
✅ Multi-AI provider support  
✅ QR code generation  
✅ User analytics  

---

## 🛠️ Development
```bash
# Install dependencies
npm install

# Run locally
npm start

# Access at
http://localhost:3000
```

---

## 📄 License

MIT License

---

## 🔗 Links

- [cheqd Documentation](https://docs.cheqd.io)
- [GitHub Repository](https://github.com/yourusername/contentify)
- [Live Demo](https://contentify.app)

---

Built with ❤️ for the Internet of Trust