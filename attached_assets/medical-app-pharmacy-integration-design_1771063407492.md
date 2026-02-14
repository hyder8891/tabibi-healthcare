# Medical App Pharmacy Integration System Design

## Executive Summary

This document outlines the comprehensive architecture for integrating pharmacy medicine ordering functionality into a medical app. The system enables patients to order AI-recommended medicines from nearby pharmacies using Al-Waseet's delivery service with Cash-on-Delivery (COD) payment.

---

## 1. System Overview

### 1.1 User Journey Flow

```
Patient AI Assessment → Medicine Recommendation → Find Nearest Pharmacy → 
Contact Pharmacy → Confirm Order → Al-Waseet Delivery Order Creation → 
Order Tracking → Delivery & Payment
```

### 1.2 Key Components

1. **AI Assessment Module** - Evaluates symptoms and recommends medicines
2. **Pharmacy Discovery Service** - Locates nearby pharmacies (Google Maps API)
3. **Pharmacy Contact System** - Automatic messaging to pharmacy
4. **Order Management** - Creates Al-Waseet delivery orders
5. **Tracking & Notification** - Real-time delivery tracking

---

## 2. Architecture Overview

### 2.1 System Layers

```
┌─────────────────────────────────────────────────────────┐
│                    Patient Mobile App                    │
│  (AI Assessment → Pharmacy Discovery → Order Placement)  │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│                  Backend Server (Node.js)               │
│  - Authentication & User Management                     │
│  - AI Assessment Processing                             │
│  - Pharmacy Data Management                             │
│  - Order Orchestration                                  │
│  - Messaging Service                                    │
└──────────────────────┬──────────────────────────────────┘
                       │
        ┌──────────────┼──────────────┬──────────────┐
        │              │              │              │
┌───────▼────┐ ┌──────▼─────┐ ┌─────▼──────┐ ┌────▼──────┐
│ Google Maps│ │ Al-Waseet  │ │  Pharmacy  │ │ Messaging │
│    API     │ │    API     │ │  Database  │ │  Service  │
└────────────┘ └────────────┘ └────────────┘ └───────────┘
```

### 2.2 Data Flow

```
1. Patient Completes Assessment
   ↓
2. AI Generates Recommendation (Medicine + Dosage)
   ↓
3. Patient Requests Nearest Pharmacy
   ↓
4. System Fetches Pharmacy List (Google Maps)
   ↓
5. Patient Selects Pharmacy
   ↓
6. System Sends Automatic Message to Pharmacy
   ↓
7. Pharmacy Confirms Availability
   ↓
8. Patient Confirms Order
   ↓
9. Backend Creates Al-Waseet Order
   ↓
10. Al-Waseet Assigns Delivery
    ↓
11. Real-time Tracking & Notification
```

---

## 3. Pharmacy Discovery Module

### 3.1 Google Maps API Integration

**Recommended Approach:** Use Google Places API instead of basic Maps API for better pharmacy-specific results.

#### Key APIs:
- **Google Places API** - Search for pharmacies
- **Google Maps Geocoding API** - Convert addresses to coordinates
- **Google Maps Distance Matrix API** - Calculate delivery feasibility

#### Implementation Steps:

1. **Get Patient Location**
   - Request GPS coordinates from device
   - Fallback to address-based geocoding

2. **Search Nearby Pharmacies**
   ```
   Query: "pharmacy" or "medicine store"
   Radius: 5-15 km (configurable)
   Location: Patient's coordinates
   ```

3. **Filter & Sort Results**
   - Filter by operating hours
   - Sort by distance
   - Check pharmacy ratings
   - Verify delivery availability

4. **Display on Map**
   - Show pharmacy locations
   - Display distance and ETA
   - Show contact information
   - Display pharmacy hours

#### Alternative/Complementary Approach: Pharmacy Database

Maintain a local database of pharmacy partners with:
- Pharmacy name and address
- Contact information (phone, WhatsApp)
- Operating hours
- Available medicines inventory
- Delivery zones
- COD support status

**Benefits:**
- Faster response times
- Better control over pharmacy quality
- Direct integration with Al-Waseet
- Inventory management

---

## 4. Automatic Messaging System

### 4.1 Pharmacy Contact Methods

#### Option 1: WhatsApp API (Recommended)
- **Service:** Twilio WhatsApp Business API or Meta WhatsApp Business API
- **Advantages:**
  - Direct messaging to pharmacy
  - High delivery rate
  - Automatic message templates
  - Read receipts and delivery confirmation
  - Easy for pharmacy staff to respond

#### Option 2: SMS
- **Service:** Twilio SMS or AWS SNS
- **Advantages:**
  - Universal compatibility
  - Reliable delivery
  - Lower cost than WhatsApp

#### Option 3: Direct API Integration
- **Direct integration with pharmacy management systems**
- **Requires pharmacy cooperation**

### 4.2 Message Template

**WhatsApp/SMS Message Template:**

```
Subject: New Medicine Order Request

Hello [Pharmacy Name],

A patient has requested to order the following medicine:

Medicine: [Medicine Name]
Dosage: [Dosage]
Quantity: [Quantity]
Patient Name: [Patient Name]
Patient Phone: [Patient Phone]
Delivery Address: [Address]
Preferred Delivery Date: [Date]

This order will be delivered via Al-Waseet (COD).

Please confirm availability and price:
- Reply "YES" to confirm
- Reply "NO" if unavailable
- Or provide custom price

Order ID: [Order ID]
App: Mydoc - Medical Assessment App

---
```

### 4.3 Message Flow

```
1. Patient Confirms Order
   ↓
2. System Creates Order Record (Status: Pending Pharmacy Confirmation)
   ↓
3. System Sends WhatsApp/SMS to Pharmacy
   ↓
4. Pharmacy Receives Message
   ↓
5. Pharmacy Responds (YES/NO/Custom Price)
   ↓
6. System Receives Response
   ↓
7. If YES → Create Al-Waseet Order
   If NO → Suggest Alternative Pharmacy
   If Custom Price → Ask Patient Confirmation
```

---

## 5. Al-Waseet Order Integration

### 5.1 Order Creation Workflow

**Step 1: Prepare Order Data**
```
Order Details:
- order_id: Generated by app
- client_name: Patient name
- client_mobile: Patient phone (+964XXXXXXXXXX)
- city_id: Pharmacy city (from Al-Waseet Cities API)
- region_id: Pharmacy region (from Al-Waseet Regions API)
- location: Delivery address (patient's address)
- type_name: "Medicine - [Medicine Name]"
- items_number: Quantity
- price: Total price (medicine + delivery)
- package_size: Small/Medium/Large (from Al-Waseet Package Sizes API)
- merchant_notes: "Pharmacy: [Name], Order ID: [ID]"
- replacement: 0 (not a replacement order)
```

**Step 2: Authenticate with Al-Waseet**
```
1. Call Login Endpoint with pharmacy credentials
2. Obtain authentication token
3. Store token securely on backend
```

**Step 3: Create Order**
```
1. Call Edit Order or Create Order endpoint
2. Pass all required parameters
3. Receive order confirmation with QR code
4. Store Al-Waseet order ID in app database
```

**Step 4: Track Order**
```
1. Poll Al-Waseet API for order status updates
2. Update app database with status changes
3. Send notifications to patient
4. Display tracking information in app
```

### 5.2 Al-Waseet API Endpoints Used

| Endpoint | Purpose | When Used |
|----------|---------|-----------|
| `/login` | Get authentication token | At app startup |
| `/citys` | Get available cities | During setup |
| `/regions` | Get regions for city | During setup |
| `/package-sizes` | Get package sizes | During setup |
| `/create-order` | Create new delivery order | When patient confirms |
| `/edit-order` | Modify existing order | If patient changes details |
| `/retrieve-orders` | Get order details | For tracking |
| `/get-orders-statuses` | Get order status | For real-time updates |

---

## 6. Database Schema

### 6.1 Core Tables

#### Users Table
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY,
  phone VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  address TEXT,
  city_id INT,
  region_id INT,
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

#### Assessments Table
```sql
CREATE TABLE assessments (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  symptoms TEXT[],
  assessment_result TEXT,
  recommended_medicine VARCHAR(255),
  dosage VARCHAR(100),
  severity_level VARCHAR(50),
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

#### Pharmacies Table
```sql
CREATE TABLE pharmacies (
  id UUID PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  whatsapp VARCHAR(20),
  address TEXT,
  city_id INT,
  region_id INT,
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  operating_hours JSONB,
  delivery_zones INT[],
  cod_enabled BOOLEAN,
  average_rating DECIMAL(3, 2),
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

#### Orders Table
```sql
CREATE TABLE orders (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  pharmacy_id UUID REFERENCES pharmacies(id),
  assessment_id UUID REFERENCES assessments(id),
  medicine_name VARCHAR(255),
  quantity INT,
  price DECIMAL(10, 2),
  delivery_fee DECIMAL(10, 2),
  total_price DECIMAL(10, 2),
  al_waseet_order_id VARCHAR(255),
  status VARCHAR(50), -- pending, confirmed, in_transit, delivered, cancelled
  pharmacy_confirmation_status VARCHAR(50), -- pending, confirmed, rejected
  payment_method VARCHAR(50), -- cod
  delivery_address TEXT,
  delivery_date DATE,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

#### Messages Table
```sql
CREATE TABLE messages (
  id UUID PRIMARY KEY,
  order_id UUID REFERENCES orders(id),
  pharmacy_id UUID REFERENCES pharmacies(id),
  message_type VARCHAR(50), -- whatsapp, sms, api
  content TEXT,
  status VARCHAR(50), -- sent, delivered, read, failed
  sent_at TIMESTAMP,
  delivered_at TIMESTAMP,
  response TEXT,
  response_at TIMESTAMP
);
```

#### Al-Waseet Credentials Table
```sql
CREATE TABLE al_waseet_credentials (
  id UUID PRIMARY KEY,
  pharmacy_id UUID REFERENCES pharmacies(id),
  merchant_username VARCHAR(255),
  merchant_password VARCHAR(255) ENCRYPTED,
  auth_token VARCHAR(500) ENCRYPTED,
  token_expires_at TIMESTAMP,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

---

## 7. Backend Services Architecture

### 7.1 Core Services

#### 1. Authentication Service
- User registration and login
- Token management
- Session handling

#### 2. Assessment Service
- Process symptom data
- Generate AI recommendations
- Store assessment history

#### 3. Pharmacy Service
- Manage pharmacy database
- Search and filter pharmacies
- Calculate distances
- Manage pharmacy ratings

#### 4. Messaging Service
- Send WhatsApp/SMS messages
- Receive and process responses
- Handle message retries
- Log all communications

#### 5. Order Service
- Create orders
- Manage order status
- Handle order modifications
- Calculate pricing

#### 6. Al-Waseet Integration Service
- Authenticate with Al-Waseet
- Create delivery orders
- Track order status
- Handle errors and retries

#### 7. Notification Service
- Send push notifications
- Send email notifications
- Send SMS/WhatsApp updates

### 7.2 Service Interactions

```
Patient Request
    ↓
Authentication Service (Verify user)
    ↓
Assessment Service (Get recommendation)
    ↓
Pharmacy Service (Find nearby pharmacies)
    ↓
Messaging Service (Contact pharmacy)
    ↓
Order Service (Create order record)
    ↓
Al-Waseet Service (Create delivery order)
    ↓
Notification Service (Notify patient)
    ↓
Tracking Service (Monitor delivery)
```

---

## 8. Security Considerations

### 8.1 Sensitive Data Protection

1. **Al-Waseet Credentials**
   - Store encrypted in database
   - Never expose in client-side code
   - Rotate tokens regularly
   - Use environment variables for secrets

2. **Patient Information**
   - Encrypt PII (Personally Identifiable Information)
   - Comply with healthcare data protection regulations
   - Implement access controls
   - Audit all data access

3. **Pharmacy Information**
   - Verify pharmacy credentials
   - Validate contact information
   - Monitor for fraud

### 8.2 API Security

1. **Backend Proxy Pattern**
   - All external API calls go through backend
   - Frontend never has direct API access
   - Validate all inputs on backend
   - Rate limit API calls

2. **Authentication**
   - Use JWT tokens for user authentication
   - Implement refresh token mechanism
   - Secure token storage

3. **Data Validation**
   - Validate all input data
   - Sanitize user inputs
   - Implement CORS policies
   - Use HTTPS only

---

## 9. Implementation Phases

### Phase 1: Foundation (Weeks 1-2)
- [ ] Set up backend infrastructure
- [ ] Implement user authentication
- [ ] Create database schema
- [ ] Set up Al-Waseet API integration

### Phase 2: Core Features (Weeks 3-4)
- [ ] Implement AI assessment module
- [ ] Integrate Google Maps API
- [ ] Create pharmacy database
- [ ] Implement pharmacy search

### Phase 3: Messaging & Orders (Weeks 5-6)
- [ ] Integrate WhatsApp/SMS service
- [ ] Implement automatic messaging
- [ ] Create order management system
- [ ] Integrate Al-Waseet order creation

### Phase 4: Tracking & Notifications (Weeks 7-8)
- [ ] Implement order tracking
- [ ] Set up notification system
- [ ] Create delivery status updates
- [ ] Implement payment handling

### Phase 5: Testing & Optimization (Weeks 9-10)
- [ ] End-to-end testing
- [ ] Performance optimization
- [ ] Security audit
- [ ] User acceptance testing

---

## 10. Technology Stack Recommendations

### Frontend
- React Native or Flutter (for mobile)
- React.js (for web)
- Google Maps SDK
- Push notification libraries

### Backend
- Node.js with Express.js
- PostgreSQL or MongoDB
- Redis (for caching and sessions)
- Bull (for job queues)

### External Services
- Google Cloud Platform (Maps API, Cloud Storage)
- Twilio (WhatsApp/SMS)
- Al-Waseet API
- Firebase (Push notifications)

### DevOps
- Docker (containerization)
- Kubernetes (orchestration)
- GitHub Actions (CI/CD)
- AWS or GCP (hosting)

---

## 11. Key Success Metrics

1. **User Adoption**
   - Number of medicine orders through app
   - Repeat order rate
   - User retention rate

2. **Operational Efficiency**
   - Average time from assessment to delivery
   - Pharmacy confirmation rate
   - Order cancellation rate

3. **Customer Satisfaction**
   - Patient satisfaction rating
   - Pharmacy satisfaction rating
   - Delivery success rate

4. **Business Metrics**
   - Revenue per order
   - Cost per delivery
   - Profit margin

---

## 12. Risk Mitigation

### Risk 1: Pharmacy Non-Responsiveness
- **Mitigation:** Auto-escalate to next pharmacy if no response in 10 minutes
- **Fallback:** Suggest manual pharmacy contact

### Risk 2: Medicine Unavailability
- **Mitigation:** Check pharmacy inventory before sending message
- **Fallback:** Suggest alternative pharmacies

### Risk 3: Al-Waseet API Failures
- **Mitigation:** Implement retry logic with exponential backoff
- **Fallback:** Manual order creation option

### Risk 4: Incorrect Patient Address
- **Mitigation:** Verify address with patient before order creation
- **Fallback:** Allow address modification before delivery

### Risk 5: Payment Issues
- **Mitigation:** Implement payment verification
- **Fallback:** Contact patient before delivery

---

## 13. Compliance & Regulations

### Healthcare Regulations
- HIPAA compliance (if applicable)
- Local healthcare data protection laws
- Medicine dispensing regulations
- Pharmacy licensing verification

### Payment Regulations
- COD payment verification
- Transaction logging
- Fraud prevention

### Data Protection
- GDPR compliance (if applicable)
- Local data protection laws
- User consent management

---

## 14. Future Enhancements

1. **AI Improvements**
   - Machine learning for better recommendations
   - Integration with medical history
   - Drug interaction checking

2. **Pharmacy Features**
   - Pharmacy inventory management
   - Automated inventory sync
   - Pharmacy analytics dashboard

3. **Payment Options**
   - Online payment integration
   - Digital wallets
   - Insurance integration

4. **Delivery Options**
   - Express delivery
   - Scheduled delivery
   - Pharmacy pickup option

5. **Analytics**
   - Patient health trends
   - Pharmacy performance metrics
   - Delivery analytics

---

## Document Information
- **Version:** 1.0
- **Created:** February 14, 2026
- **Last Updated:** February 14, 2026
- **Status:** Design Phase
