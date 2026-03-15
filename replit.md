# Tabibi - Active Healthcare Navigator

## Overview
Tabibi is a mobile-first healthcare navigation app that provides AI-powered symptom assessment, medication scanning via OCR, drug interaction checking, and hyper-local care routing. It aims to offer accessible, AI-driven healthcare guidance and services to users.

## User Preferences
I prefer simple language.
I want iterative development.
Ask before making major changes.
I prefer detailed explanations.
Do not make changes to the folder Z.
Do not make changes to the file Y.

## System Architecture
Tabibi uses Expo (React Native) for a mobile-first frontend and Express.js with TypeScript for its backend. Authentication is handled by Firebase, utilizing stateless Bearer tokens and jose JWKS verification. The application leverages Gemini 2.5 Flash for conversational AI symptom assessment and Gemini 2.5 Pro for advanced tasks like medical imaging analysis, medication OCR, and drug interaction checks. PostgreSQL (Neon) with Drizzle ORM serves as the database, employing AES-256-GCM encryption for sensitive data. Local storage uses expo-secure-store for tokens and encrypted AsyncStorage for health data. Mapping and location services are powered by `expo-location` and Google Places API with caching.

The frontend is structured with tab navigation for core features like Home, History, and Settings. Key screens include AI-powered symptom assessment, medication scanning, assessment results, nearby facility routing, a non-contact heart rate monitor (rPPG), and a multi-step pharmacy ordering system. UI/UX emphasizes a clean design with a teal-orange-red color palette and DM Sans font.

The backend features a modular route structure for authentication, AI services, rPPG processing, geolocation, and order management. It includes middleware for authentication and Zod validation. Sensitive database fields are encrypted using AES-256-GCM. A worker thread (`server/rppg-worker.js`) handles CPU-intensive rPPG signal processing using the POS (Plane-Orthogonal-to-Skin) algorithm with overlap-weighted windowing, zero-phase bandpass filtering (filtfilt forward-backward IIR), and FFT peak detection. The client-side heart rate monitor (`app/heart-rate.tsx`) uses the same signal processing pipeline for finger PPG (via back camera + flash) and face rPPG (via front camera). Finger detection uses tightened red-dominance thresholds with a manual fallback when auto-detection is unavailable. The disease matching system (`server/utils/diseaseMatch.ts`) loads Iraq's 73-disease epidemiological trigger database (`server/utils/iraq_epi_triggers.json`) and matches user conversation text against symptom triggers with Arabic/English synonym support, injecting the top 3 matched disease suspects (with screening questions and key tests) into the AI system prompt.

The application supports key features such as smart symptom assessment with emergency red flag detection, medication scanning with drug interaction checking, actionable care plans, hyper-local care routing, pediatric mode, and bilingual support (English/Arabic). It also includes a non-contact heart rate monitor and OTC medicine ordering with tracking.

The AI assessment uses an adaptive phased clinical interview (Phase 0: red flag screening, Phase 1: SOCRATES core, Phase 2: systems review, Phase 3: context/risk) with tiered question budgets (6-8 simple, 10-14 moderate, 15-20 complex, hard cap 20). The assessment screen includes a progress bar showing step count. Local health data encryption uses ENC2: prefix with UTF-8-aware XOR cipher (TextEncoder/TextDecoder) to properly handle Arabic text.

The assessment pipeline includes a **Gemini Pro validation layer**: after Flash streams the conversational assessment and generates the final JSON, the server extracts the assessment JSON and sends it to Gemini 2.5 Pro for clinical validation before delivering to the patient. Pro checks severity-triage alignment, differential plausibility, medication-allergy cross-checks, and medication-condition appropriateness. After Pro validation, **deterministic post-processing rules** enforce hard clinical constraints: severity-triage alignment (severe→immediate/within-hours), ER urgency text detection (Arabic+English patterns auto-escalate to severe), pediatric Aspirin filtering (under 16), allergy-based medication stripping, and Gate 1 referral-only condition enforcement (disables OTC medicines for cancer, fractures, stroke, etc.). The Pro validation has a 15-second timeout; if exceeded, Flash's original JSON is used with only deterministic rules applied. The client receives the validated assessment via a `validatedAssessment` SSE event before the `done` event, with fallback to Flash JSON parsing if the validated event is missing. SSE parsing uses buffered event splitting (split on `\n\n`) to handle TCP chunk boundaries safely.

## External Dependencies
- **Expo SDK**: Core framework for React Native development.
- **React Native**: Frontend UI library.
- **Express.js**: Backend web application framework.
- **Firebase Authentication**: User authentication services (email/password, phone OTP, Google Sign-In).
- **Google Gemini API**: AI models (2.5 Flash for chat, 2.5 Pro for vision/advanced tasks).
- **PostgreSQL (Neon)**: Relational database.
- **Drizzle ORM**: Object-Relational Mapper for database interaction.
- **expo-secure-store**: Secure local storage for sensitive data.
- **AsyncStorage**: Local storage for application data.
- **expo-location**: Device location services.
- **Google Places API**: Location-based search and details for facilities.
- **@expo/vector-icons**: Icon library.
- **jose library**: JSON Web Signature and Encryption for token verification.
- **expo-auth-session**: Google Sign-In via OAuth browser flow (works in Expo Go).
- **expo-web-browser**: Browser session management for auth flows.
- **@react-native-google-signin/google-signin**: Native Google Sign-In (requires EAS dev build, fallback only).

## Auth Architecture Notes
- Google Sign-In: Uses `expo-auth-session/providers/google` with `useIdTokenAuthRequest` on native (Expo Go compatible), `signInWithPopup` on web. Both exchange credentials via Firebase `signInWithCredential`.
- Phone Auth (Native - Dev Build): Uses `@react-native-firebase/auth` native SDK for phone verification. Firebase handles SMS delivery natively via Play Integrity (Android) and APNs (iOS) — no reCAPTCHA, no Twilio needed. Requires EAS development build (not Expo Go). After native Firebase verifies the phone, the app syncs with the backend via `/api/auth/firebase`. The native Firebase SDK is conditionally loaded (`require()` with try/catch) and Metro is configured to skip `@react-native-firebase/*` on web platform (see `metro.config.js`).
- Phone Auth (Native - Expo Go Fallback): Uses Firebase Admin SDK + Twilio SMS on the backend. Flow: app sends phone number to `/api/auth/phone/send-code` → backend generates 6-digit OTP (stored in-memory with 5-min expiry) → sends real SMS via Twilio (`server/twilio.ts`) → app enters code → sends to `/api/auth/phone/verify-code` → backend verifies OTP, creates/gets Firebase user → client signs in with `signInWithCustomToken()`. Rate-limited (3 req/min per IP/phone). Dev fallback: if Twilio fails in development mode, OTP is logged to server console. NOTE: Twilio account is trial-only; can only send to pre-verified numbers.
- Phone Auth (Web): Uses Firebase JS SDK's `RecaptchaVerifier` + `signInWithPhoneNumber` (client-side reCAPTCHA).
- Email Auth: Full flow with email verification after signup. Unverified users are shown verification screen on both signup and login.
- Account Linking: Phone users can add email+password from Settings. Backend syncs linked credentials.
- Firebase Admin SDK: Initialized in `server/firebase-admin.ts` from `FIREBASE_SERVICE_ACCOUNT_KEY` secret (JSON). Handles robust parsing of truncated or newline-mangled JSON.
- Native Firebase Config: `google-services.json` (Android) present. `GoogleService-Info.plist` (iOS) needs to be downloaded from Firebase Console and placed in project root.