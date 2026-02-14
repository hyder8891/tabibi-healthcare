# Mydoc Pharmacy Integration - Server Setup Guide

## Overview

This guide provides step-by-step instructions for setting up the backend server that integrates the Al-Waseet delivery API with the Mydoc medical assessment application.

---

## Prerequisites

Before starting, ensure you have the following installed:

- **Node.js** (v16 or higher)
- **npm** or **yarn**
- **PostgreSQL** (v12 or higher)
- **Redis** (for caching and job queues)
- **Git**

---

## Step 1: Project Setup

### 1.1 Initialize Node.js Project

```bash
mkdir mydoc-pharmacy-backend
cd mydoc-pharmacy-backend
npm init -y
```

### 1.2 Install Dependencies

```bash
npm install express cors dotenv axios prisma @prisma/client
npm install twilio bull redis
npm install jsonwebtoken bcryptjs
npm install --save-dev nodemon
```

**Key Dependencies:**

| Package | Purpose |
|---------|---------|
| `express` | Web framework |
| `axios` | HTTP client for API calls |
| `@prisma/client` | Database ORM |
| `twilio` | WhatsApp messaging |
| `bull` | Job queue for background tasks |
| `redis` | Caching and session store |
| `jsonwebtoken` | User authentication |
| `bcryptjs` | Password hashing |

### 1.3 Create Directory Structure

```
mydoc-pharmacy-backend/
├── src/
│   ├── services/
│   │   ├── alWaseetService.js
│   │   ├── messagingService.js
│   │   ├── orderService.js
│   │   ├── pharmacyService.js
│   │   └── orchestrationService.js
│   ├── routes/
│   │   ├── pharmacies.js
│   │   ├── orders.js
│   │   ├── webhooks.js
│   │   └── reference.js
│   ├── middleware/
│   │   ├── auth.js
│   │   └── errorHandler.js
│   ├── controllers/
│   │   ├── orderController.js
│   │   └── pharmacyController.js
│   ├── config/
│   │   ├── database.js
│   │   └── env.js
│   └── app.js
├── prisma/
│   └── schema.prisma
├── .env
├── .env.example
├── server.js
└── package.json
```

---

## Step 2: Environment Configuration

### 2.1 Create `.env` File

```bash
cp .env.example .env
```

### 2.2 Fill in Environment Variables

```env
# Server Configuration
NODE_ENV=development
PORT=3000
API_BASE_URL=http://localhost:3000

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/mydoc_pharmacy

# Redis
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET=your-super-secret-jwt-key-change-this
JWT_EXPIRY=24h

# Al-Waseet API
AL_WASEET_BASE_URL=https://api.alwaseet-iq.net/v1/merchant
AL_WASEET_USERNAME=your_merchant_username
AL_WASEET_PASSWORD=your_merchant_password

# Twilio (WhatsApp)
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_WHATSAPP_NUMBER=whatsapp:+1234567890

# Google Maps API
GOOGLE_MAPS_API_KEY=your_google_maps_api_key

# Encryption
ENCRYPTION_KEY=your-encryption-key-for-sensitive-data

# Logging
LOG_LEVEL=info
```

### 2.3 Create `.env.example`

Create a template for other developers:

```env
NODE_ENV=development
PORT=3000
API_BASE_URL=http://localhost:3000

DATABASE_URL=postgresql://user:password@localhost:5432/mydoc_pharmacy
REDIS_URL=redis://localhost:6379

JWT_SECRET=your-secret-key
JWT_EXPIRY=24h

AL_WASEET_BASE_URL=https://api.alwaseet-iq.net/v1/merchant
AL_WASEET_USERNAME=your_username
AL_WASEET_PASSWORD=your_password

TWILIO_ACCOUNT_SID=your_sid
TWILIO_AUTH_TOKEN=your_token
TWILIO_WHATSAPP_NUMBER=whatsapp:+1234567890

GOOGLE_MAPS_API_KEY=your_key
ENCRYPTION_KEY=your_encryption_key
LOG_LEVEL=info
```

---

## Step 3: Database Setup

### 3.1 Initialize Prisma

```bash
npx prisma init
```

### 3.2 Configure Database Connection

Edit `prisma/schema.prisma`:

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model User {
  id        String   @id @default(cuid())
  phone     String   @unique
  name      String
  email     String?
  address   String?
  cityId    Int?
  regionId  Int?
  latitude  Float?
  longitude Float?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  assessments Assessment[]
  orders      Order[]
}

model Assessment {
  id                  String   @id @default(cuid())
  userId              String
  user                User     @relation(fields: [userId], references: [id])
  symptoms            String[]
  assessmentResult    String
  recommendedMedicine String
  dosage              String
  severityLevel       String
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt

  orders Order[]
}

model Pharmacy {
  id              String   @id @default(cuid())
  name            String
  phone           String
  whatsapp        String
  address         String
  cityId          Int
  regionId        Int
  latitude        Float
  longitude       Float
  operatingHours  Json?
  deliveryZones   Int[]
  codEnabled      Boolean  @default(true)
  averageRating   Float?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  orders      Order[]
  credentials PharmacyAlWaseetCredentials?
}

model Order {
  id                         String   @id @default(cuid())
  userId                     String
  user                       User     @relation(fields: [userId], references: [id])
  pharmacyId                 String
  pharmacy                   Pharmacy @relation(fields: [pharmacyId], references: [id])
  assessmentId               String
  assessment                 Assessment @relation(fields: [assessmentId], references: [id])
  medicineName               String
  quantity                   Int
  price                      Float
  deliveryFee                Float   @default(0)
  totalPrice                 Float
  alWaseetOrderId            String?
  status                     String  @default("pending_pharmacy_confirmation")
  pharmacyConfirmationStatus String  @default("pending")
  paymentMethod              String  @default("cod")
  deliveryAddress            String
  deliveryDate               DateTime?
  createdAt                  DateTime @default(now())
  updatedAt                  DateTime @updatedAt

  messages Message[]
}

model Message {
  id          String   @id @default(cuid())
  orderId     String
  order       Order    @relation(fields: [orderId], references: [id])
  pharmacyId  String
  messageType String
  content     String
  status      String
  sentAt      DateTime?
  deliveredAt DateTime?
  response    String?
  responseAt  DateTime?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

model PharmacyAlWaseetCredentials {
  id                 String   @id @default(cuid())
  pharmacyId         String   @unique
  pharmacy           Pharmacy @relation(fields: [pharmacyId], references: [id])
  merchantUsername   String
  merchantPassword   String   // Encrypted
  authToken          String?  // Encrypted
  tokenExpiresAt     DateTime?
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt
}
```

### 3.3 Run Migrations

```bash
npx prisma migrate dev --name init
```

### 3.4 Generate Prisma Client

```bash
npx prisma generate
```

---

## Step 4: Create Server Application

### 4.1 Create Main Server File (`server.js`)

```javascript
require('dotenv').config();
const app = require('./src/app');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`✓ Server running on port ${PORT}`);
  console.log(`✓ Environment: ${process.env.NODE_ENV}`);
});
```

### 4.2 Create Express App (`src/app.js`)

```javascript
const express = require('express');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');
const Redis = require('redis');

// Import services
const {
  AlWaseetService,
  MessagingService,
  OrderService,
  PharmacyService,
  OrderOrchestrationService,
} = require('./services');

// Import routes
const pharmacyRoutes = require('./routes/pharmacies');
const orderRoutes = require('./routes/orders');
const webhookRoutes = require('./routes/webhooks');
const referenceRoutes = require('./routes/reference');

// Import middleware
const { errorHandler } = require('./middleware/errorHandler');

const app = express();

// Initialize Prisma
const prisma = new PrismaClient();

// Initialize Redis
const redisClient = Redis.createClient({
  url: process.env.REDIS_URL,
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Initialize services
const alWaseetService = new AlWaseetService({
  baseURL: process.env.AL_WASEET_BASE_URL,
  username: process.env.AL_WASEET_USERNAME,
  password: process.env.AL_WASEET_PASSWORD,
});

const messagingService = new MessagingService({
  accountSid: process.env.TWILIO_ACCOUNT_SID,
  authToken: process.env.TWILIO_AUTH_TOKEN,
  whatsappNumber: process.env.TWILIO_WHATSAPP_NUMBER,
});

const orderService = new OrderService(prisma);
const pharmacyService = new PharmacyService(prisma);

const orchestrationService = new OrderOrchestrationService(
  alWaseetService,
  messagingService,
  orderService,
  pharmacyService
);

// Attach services to app for use in routes
app.locals.prisma = prisma;
app.locals.redis = redisClient;
app.locals.alWaseetService = alWaseetService;
app.locals.messagingService = messagingService;
app.locals.orderService = orderService;
app.locals.pharmacyService = pharmacyService;
app.locals.orchestrationService = orchestrationService;

// Routes
app.use('/api/pharmacies', pharmacyRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/reference', referenceRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

// Error handling middleware
app.use(errorHandler);

module.exports = app;
```

---

## Step 5: Running the Server

### 5.1 Update `package.json` Scripts

```json
{
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js",
    "migrate": "prisma migrate dev",
    "seed": "node prisma/seed.js"
  }
}
```

### 5.2 Start Development Server

```bash
npm run dev
```

Expected output:
```
✓ Server running on port 3000
✓ Environment: development
```

---

## Step 6: Testing the Integration

### 6.1 Test Al-Waseet Connection

```bash
curl http://localhost:3000/api/reference/cities
```

Expected response:
```json
{
  "success": true,
  "count": 10,
  "data": [
    { "id": "1", "city_name": "Baghdad" },
    { "id": "2", "city_name": "Basra" }
  ]
}
```

### 6.2 Test Pharmacy Search

```bash
curl "http://localhost:3000/api/pharmacies/nearby?latitude=33.3128&longitude=44.3615&radius=10"
```

### 6.3 Test Order Creation

```bash
curl -X POST http://localhost:3000/api/orders \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "pharmacyId": "pharmacy-id",
    "assessmentId": "assessment-id",
    "medicineName": "Paracetamol",
    "dosage": "500mg",
    "quantity": 2,
    "price": 5000,
    "deliveryFee": 2000,
    "deliveryAddress": "123 Main St, Baghdad"
  }'
```

---

## Step 7: Deployment

### 7.1 Deploy to Google Cloud Platform (GCP)

#### Option A: Cloud Run (Recommended for Serverless)

```bash
# Install Google Cloud SDK
curl https://sdk.cloud.google.com | bash

# Authenticate
gcloud auth login

# Create a Dockerfile
cat > Dockerfile << 'EOF'
FROM node:16-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 3000

CMD ["npm", "start"]
EOF

# Deploy to Cloud Run
gcloud run deploy mydoc-pharmacy-backend \
  --source . \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars DATABASE_URL=your_database_url,REDIS_URL=your_redis_url
```

#### Option B: App Engine

```bash
# Create app.yaml
cat > app.yaml << 'EOF'
runtime: nodejs16

env: standard

env_variables:
  DATABASE_URL: "your_database_url"
  REDIS_URL: "your_redis_url"
  AL_WASEET_USERNAME: "your_username"
  AL_WASEET_PASSWORD: "your_password"
  TWILIO_ACCOUNT_SID: "your_sid"
  TWILIO_AUTH_TOKEN: "your_token"
EOF

# Deploy
gcloud app deploy
```

### 7.2 Set Up Cloud SQL (PostgreSQL)

```bash
# Create Cloud SQL instance
gcloud sql instances create mydoc-pharmacy-db \
  --database-version=POSTGRES_13 \
  --tier=db-f1-micro \
  --region=us-central1

# Create database
gcloud sql databases create mydoc_pharmacy \
  --instance=mydoc-pharmacy-db

# Create user
gcloud sql users create mydoc_user \
  --instance=mydoc-pharmacy-db \
  --password=your_secure_password
```

### 7.3 Set Up Cloud Memorystore (Redis)

```bash
# Create Redis instance
gcloud redis instances create mydoc-pharmacy-cache \
  --size=1 \
  --region=us-central1
```

---

## Step 8: Monitoring and Logging

### 8.1 Enable Cloud Logging

```bash
# View logs
gcloud app logs read --limit 50

# Stream logs
gcloud app logs read -f
```

### 8.2 Set Up Alerts

Create alerts for:
- High error rates
- Database connection failures
- Al-Waseet API failures
- Twilio messaging failures

---

## Troubleshooting

### Issue: Database Connection Failed

**Solution:**
```bash
# Check DATABASE_URL format
echo $DATABASE_URL

# Test connection
psql $DATABASE_URL -c "SELECT 1"
```

### Issue: Al-Waseet Authentication Failed

**Solution:**
```bash
# Verify credentials
echo $AL_WASEET_USERNAME
echo $AL_WASEET_PASSWORD

# Test with curl
curl -X POST https://api.alwaseet-iq.net/v1/merchant/login \
  -d "username=$AL_WASEET_USERNAME&password=$AL_WASEET_PASSWORD"
```

### Issue: Twilio WhatsApp Not Sending

**Solution:**
```bash
# Verify Twilio credentials
echo $TWILIO_ACCOUNT_SID
echo $TWILIO_AUTH_TOKEN

# Check WhatsApp sandbox status
# Visit: https://console.twilio.com/develop/sms/try-it-out/whatsapp
```

---

## Security Checklist

- [ ] Use strong, randomly generated JWT_SECRET
- [ ] Encrypt sensitive data in database (passwords, tokens)
- [ ] Use HTTPS only in production
- [ ] Implement rate limiting on API endpoints
- [ ] Validate and sanitize all user inputs
- [ ] Use environment variables for all secrets
- [ ] Enable database backups
- [ ] Set up VPC for database access
- [ ] Enable API authentication on all endpoints
- [ ] Implement CORS properly
- [ ] Use prepared statements to prevent SQL injection
- [ ] Regularly update dependencies

---

## Next Steps

1. **Implement Frontend:** Build React Native or Flutter mobile app
2. **Add Analytics:** Track order metrics and user behavior
3. **Implement Notifications:** Set up push notifications for order updates
4. **Add Admin Dashboard:** Create pharmacy and order management interface
5. **Implement Payment Integration:** Add online payment options
6. **Set Up CI/CD:** Automate testing and deployment

---

## Support & Resources

- **Al-Waseet API Docs:** https://al-waseet.com/apis-main/index
- **Twilio Docs:** https://www.twilio.com/docs/whatsapp
- **Prisma Docs:** https://www.prisma.io/docs/
- **Express.js Docs:** https://expressjs.com/
- **GCP Documentation:** https://cloud.google.com/docs

---

## Document Information
- **Version:** 1.0
- **Created:** February 14, 2026
- **Last Updated:** February 14, 2026
