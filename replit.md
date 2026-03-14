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
- Phone Auth: On web, uses Firebase JS SDK's `RecaptchaVerifier` + `signInWithPhoneNumber`. On native (Expo Go), uses a WebView-based reCAPTCHA flow: backend serves `/api/auth/phone/webview` with Firebase JS SDK, the WebView handles reCAPTCHA and returns a `verificationId`, then the native app uses `PhoneAuthProvider.credential(verificationId, code)` + `signInWithCredential`. Backend also exposes `/api/auth/phone/send-code` and `/api/auth/phone/verify-code` REST endpoints (rate-limited, 3 req/min per IP/phone).
- Email Auth: Full flow with email verification after signup. Unverified users are shown verification screen on both signup and login.
- Account Linking: Phone users can add email+password from Settings. Backend syncs linked credentials.