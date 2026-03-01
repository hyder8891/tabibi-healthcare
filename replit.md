# Tabibi - Active Healthcare Navigator

## Overview
Tabibi is a mobile-first healthcare navigation app built with Expo (React Native) and Express. It provides AI-powered symptom assessment, medication scanning via OCR, drug interaction checking, and hyper-local care routing to nearby pharmacies, labs, and clinics.

## Tech Stack
- **Frontend**: Expo SDK 54, React Native, Expo Router (file-based routing)
- **Backend**: Express.js with TypeScript on port 5000
- **Auth**: Firebase Authentication (stateless Bearer token, jose JWKS verification)
- **AI**: Gemini 2.5 Flash for conversational symptom assessment (streaming SSE), Gemini 2.5 Pro for medical imaging analysis, medication OCR, and drug interaction checking
- **Database**: PostgreSQL (Neon) with Drizzle ORM, AES-256-GCM encryption for sensitive fields
- **Storage**: expo-secure-store for auth tokens, encrypted AsyncStorage for health data (XOR cipher with device-specific key)
- **Maps**: expo-location for GPS, Google Places API with in-memory caching
- **Font**: DM Sans (Google Fonts)
- **Icons**: @expo/vector-icons (Ionicons, MaterialCommunityIcons)

## Architecture
### Frontend (Expo App - Port 8081)
- `app/(tabs)/` - Tab navigation: Home, History, Settings
- `app/assessment.tsx` - AI-powered symptom chat with streaming
- `app/scan.tsx` - Medication scanner using camera/gallery + Gemini vision
- `app/results.tsx` - Assessment results with care recommendations
- `app/routing.tsx` - Nearby facility finder with capability filtering
- `app/heart-rate.tsx` - Heart rate monitor: video-based finger PPG on mobile (back camera + flash, recordAsync → expo-video-thumbnails frame extraction at 10fps), face-based rPPG on web
- `app/order.tsx` - Multi-step pharmacy order flow (pharmacy selection → delivery details → confirmation)
- `app/orders.tsx` - Order history and tracking with status badges
- `components/` - MessageBubble, EmergencyOverlay, RecommendationCard, FacilityCard, AssessmentCard
- `contexts/SettingsContext.tsx` - Language (EN/AR) and pediatric mode settings
- `contexts/AuthContext.tsx` - Auth state with Firebase listener, Bearer token management via expo-secure-store
- `lib/storage.ts` - Encrypted AsyncStorage helpers for assessments, medications; plain AsyncStorage for profile, settings
- `lib/types.ts` - TypeScript interfaces for all data models
- `lib/query-client.ts` - API client with automatic Bearer token injection via setAuthTokenGetter

### Backend (Express - Port 5000)
**Modular route structure** (`server/routes/`):
- `middleware.ts` - requireAuth (Bearer token verification via jose JWKS), Zod validation helpers
- `auth.ts` - POST /api/auth/firebase (verify + upsert user), GET /api/auth/me
- `ai.ts` - POST /api/assess (SSE streaming via Gemini 2.5 Flash), POST /api/analyze-medication (Gemini 2.5 Pro), POST /api/check-interactions (Gemini 2.5 Pro)
- `rppg.ts` - POST /api/process-rppg (delegated to Worker Thread for non-blocking processing)
- `geo.ts` - GET /api/nearby-facilities (cached 5min), GET /api/place-details/:placeId (cached 1hr), GET /api/place-photo/:ref
- `orders.ts` - CRUD + cancel for medicine delivery orders

**Security & Infrastructure** (`server/`):
- `firebase-auth.ts` - jose JWKS-based Firebase JWT verification with Google's public keys (automatic key rotation)
- `encryption.ts` - AES-256-GCM encryption for sensitive DB columns (order patient data, medicine info, addresses)
- `rppg-worker.js` - Worker Thread for CPU-intensive rPPG signal processing (10s timeout)
- `storage.ts` - Drizzle ORM data access layer with encrypt/decrypt on order fields

### Authentication (Stateless Bearer Token)
- **Flow**: Firebase Auth on frontend → getIdToken() → Authorization: Bearer header → backend jose JWKS verification
- **Email/Password**: Firebase JS SDK handles registration + login
- **Phone OTP**: Firebase `signInWithPhoneNumber` — web uses invisible reCAPTCHA, native uses Firebase app verification
- **Google Sign-In**: Web uses `signInWithPopup`, native uses `@react-native-google-signin/google-signin` → `signInWithCredential`
- **Forgot Password**: Firebase `sendPasswordResetEmail`
- **Token verification**: jose library with remote JWKS from `https://www.googleapis.com/service_account/v1/jwk/securetoken@system.gserviceaccount.com`
- **No server-side sessions**: Fully stateless, no express-session dependency
- **Secure storage**: Auth tokens and user data stored in expo-secure-store (not AsyncStorage)
- `lib/firebase.ts` - Firebase client SDK initialization and auth exports

## Key Features
1. Smart Symptom Assessment (conversational AI with adaptive questioning)
2. Emergency Red Flag Detection (auto-detects critical symptoms)
3. Medication Scanner (camera OCR with drug info extraction)
4. Drug Interaction Checking
5. Actionable Care Plans (OTC meds or lab tests)
6. Hyper-Local Care Routing (pharmacies, labs, clinics, hospitals)
7. Pediatric Mode (weight-based dosage calculations)
8. Bilingual Support (English/Arabic)
9. Non-Contact Heart Rate Monitor (rPPG via front camera, POS algorithm, FFT analysis)
10. OTC Medicine Ordering (pharmacy selection via Google Places, delivery details, WhatsApp/call confirmation, order tracking)

## Color Palette
- Primary: #0F766E (teal)
- Accent: #F97316 (orange)
- Emergency: #DC2626 (red)
- Background: #F1F5F4

## Recent Changes
- Mar 1, 2026: Google Play Store readiness audit (22 findings addressed). Created eas.json (development/preview/production build profiles). Updated app.json: versionCode 1, minSdkVersion 23, targetSdkVersion 34, expo-camera/expo-location/expo-image-picker plugins with permission descriptions, expo-build-properties plugin, expo-router origin changed from replit.com to tabibi.health. Implemented native Google Sign-In (@react-native-google-signin/google-signin) and native phone OTP (Firebase app verification) in AuthContext.tsx. Added ALLOWED_ORIGINS CORS support for production deployment. Added GET /health endpoint with DB connectivity check. Added GET /privacy and GET /terms pages (bilingual EN/AR). Encrypted local health data storage (assessments + medications) with XOR cipher using device-specific key from SecureStore. Added database indexes on health_events, orders, population_analytics tables. Robust video file cleanup with try/finally in heart rate monitor. Flashlight disclosure in heart rate instructions. Added esbuild to devDependencies.
- Feb 22, 2026: Removed MedGemma 4B (too small, leaked thinking blocks, refused images, ignored system prompts). Switched to dual Gemini model architecture: Gemini 2.5 Flash for conversational symptom Q&A (fast streaming SSE), Gemini 2.5 Pro for all clinical decision-making (medical image analysis, medication OCR scanning, drug interaction checking, final assessment recommendations). Deleted server/medgemma.ts.
- Feb 21, 2026: Security audit remediation (23 findings) - mandatory ENCRYPTION_KEY (no DATABASE_URL fallback), decrypt() throws on malformed data, all PHI fields encrypted (lastConditions, vitalTrends, preferredPharmacies), profile field sanitization in AI prompts, bounded Zod schemas (no z.any()), geo coordinate validation (-90..90, -180..180), rPPG RGB validation (0..255+finite), rate limiters on geo/rPPG/Avicenna routes, SSE client disconnect handling, atomic SQL increments for counters with race-condition handling, order state machine enforcement (valid transitions only), DB pool consolidation (single shared pool), DB indexes on health_events/orders/population_analytics, generic error responses (no Google API internals leaked), React Query staleTime=5min with 2-retry exponential backoff excluding 4xx, AbortController cleanup on orders screen, rPPG worker concurrency cap via p-limit.
- Feb 21, 2026: Consolidated medicine ordering - single "Order Selected" button instead of per-medicine buttons, checkboxes to deselect medicines already at home, multi-medicine WhatsApp message and order submission. Geo-aware facility search keywords (Arabic+English for MENA region, English-only globally). Expanded AI medication guidance: condition-appropriate drug classes (NSAIDs for inflammation, antispasmodics for colic, antihistamines for allergies, etc.), expanded Iraqi brand list (Voltaren, Buscopan, Cataflam, Claritine, Imodium, Duspatalin, Zantac, ORS), specific test names required (never vague "medical imaging"), deeper assessment questioning (5-7 questions minimum for complex conditions).
- Feb 16, 2026: Video-based heart rate capture for accurate 30fps data. Replaced takePictureAsync loop (1.6fps) with recordAsync for 25s video at native 30fps, then extract frames at 10fps using expo-video-thumbnails (250 frames total, batch of 5). Raw RGB from 1x1 pixel resize per frame. Video file (10-30MB) deleted immediately after extraction. Manual "Start Recording" button with fallback if takePictureAsync fails in video mode. Autocorrelation minLag fixed to enforce 40-180 BPM range. UI shows recording countdown → frame analysis progress with valid frame count.
- Feb 16, 2026: Heart rate accuracy fix for low-fps mobile capture (~1.6fps). Added cubic spline interpolation to upsample signals from raw fps to 10fps before FFT/autocorrelation analysis, solving Nyquist limit issue (0.8Hz=48BPM max at 1.6fps). Added peak-counting BPM method (zero-crossing) as 5th/6th estimator. Fixed autocorrelation Infinity bug (minLag=0). Relaxed measurement-phase finger detection (brightness>=15, r>=g*0.8) for dark finger-on-camera frames. Increased FFT zero-padding from 4x to 8x. Fixed flash not re-enabling for second measurement (force off/on cycle). Widened agreement tolerance to 8 BPM with averaged group BPM.
- Feb 15, 2026: Major heart rate accuracy overhaul - 8x8 pixel resize with 5-frame rolling average RGB smoothing, dual-channel PPG (red+green processed simultaneously), multi-method BPM estimation (FFT + autocorrelation on both channels with cross-validation), EMA smoothing (α=0.3) for stable live BPM display, tighter finger detection thresholds (brightness 15-230, red-dominance), 10-frame grace period, 25s measurement with 35 min samples, min BPM raised to 50. Refactored shared signal processing functions (detrendSignal, normalizeSignal, bandpassFilter, computeFFTBpm, autocorrelation).
- Feb 15, 2026: Redesigned heart rate monitor with dual-mode approach: finger-on-camera with back camera + flash (enableTorch) for mobile (pulse oximeter style), face-based rPPG for web. Camera locked to `facing="back"` to prevent multi-lens switching on multi-camera phones. Red/green circle indicator for finger detection (auto-starts measurement when finger confirmed over 3 consecutive frames). Live BPM estimation during 15s measurement, finger-lost detection with visual feedback. Separate signal processing: simple red-channel FFT peak detection for finger mode, POS+FFT algorithm for face mode.
- Feb 15, 2026: Fixed heart rate monitor PNG parser with color type detection (RGB vs RGBA) and optimized confidence thresholds. Added green-channel fallback algorithm, proper signal validation (no more fake 45 BPM), increased measurement to 20s, real-time sample counter, "no reading" UI state with tips when signal too weak.
- Feb 15, 2026: Removed inaccurate AI-generated medicine prices (govPriceIQD). Redesigned medicine recommendation cards with clean table-style layout - separate labeled rows for active ingredient, class, dosage, frequency, duration with icons, and dedicated warning box. Kept Iraqi brand localization (localBrand field).
- Feb 14, 2026: Iraq localization - AI recommends Iraqi-preferred medicine brands (SDI Samarra, Brufen, Amoxil, Glucophage, etc.), displays local Arabic brand names in RecommendationCard UI. Updated MedicineRecommendation type with localBrand field.
- Feb 14, 2026: Security audit hardening - AI prompt injection sanitization (13 regex patterns), tightened Zod validation ranges (age≤120, weight≤300, height≤250, content≤5000), image mime-type validation, security headers (HSTS, X-Frame-Options, CSP-adjacent), encrypted pharmacyPhone/pharmacyAddress/medicineFrequency in orders, removed legacy password column, audit logging table with order create/cancel tracking.
- Feb 14, 2026: Added OTC medicine ordering feature - database orders table, backend API routes (CRUD + cancel), multi-step order flow UI (pharmacy selection → delivery details → confirmation with WhatsApp/call), order history/tracking screen with status badges, "Order for Delivery" buttons on assessment results, "My Orders" quick action on home screen.
- Feb 14, 2026: Enhanced facility cards with phone numbers, WhatsApp/SMS/call buttons via Place Details API. Added photo proxy to hide API key. Added requireAuth middleware on AI endpoints. Added rate limiting, Zod input validation, sanitized error logging, session cookie security, DB pool config.
- Feb 14, 2026: Migrated to full Firebase Authentication - email/password, Google sign-in, forgot password. Removed bcrypt/custom auth. Backend verifies Firebase ID tokens via REST API. Database schema updated with firebase_uid, photo_url, auth_provider fields.
- Feb 14, 2026: Production security hardening - stateless Bearer token auth (jose JWKS), AES-256-GCM encryption for sensitive order fields, Worker Thread for rPPG processing, Google Maps API caching (5min nearby/1hr details), modular route controllers, removed express-session dependency, expo-secure-store for auth tokens, reduced DB pool (max: 5).
- Feb 13, 2026: Added non-contact heart rate monitor (rPPG) feature with POS algorithm, FFT-based BPM detection, pulse waveform visualization, confidence scoring
- Feb 13, 2026: Initial build of Tabibi app with all core features
