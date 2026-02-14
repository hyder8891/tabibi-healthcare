# Tabibi - Active Healthcare Navigator

## Overview
Tabibi is a mobile-first healthcare navigation app built with Expo (React Native) and Express. It provides AI-powered symptom assessment, medication scanning via OCR, drug interaction checking, and hyper-local care routing to nearby pharmacies, labs, and clinics.

## Tech Stack
- **Frontend**: Expo SDK 54, React Native, Expo Router (file-based routing)
- **Backend**: Express.js with TypeScript on port 5000
- **AI**: Google Gemini (via Replit AI Integrations) for medical reasoning and OCR
- **Storage**: AsyncStorage for local data persistence
- **Maps**: expo-location for GPS, generated facility data
- **Font**: DM Sans (Google Fonts)
- **Icons**: @expo/vector-icons (Ionicons, MaterialCommunityIcons)

## Architecture
### Frontend (Expo App - Port 8081)
- `app/(tabs)/` - Tab navigation: Home, History, Settings
- `app/assessment.tsx` - AI-powered symptom chat with streaming
- `app/scan.tsx` - Medication scanner using camera/gallery + Gemini vision
- `app/results.tsx` - Assessment results with care recommendations
- `app/routing.tsx` - Nearby facility finder with capability filtering
- `app/heart-rate.tsx` - rPPG heart rate monitor using front camera + POS algorithm
- `components/` - MessageBubble, EmergencyOverlay, RecommendationCard, FacilityCard, AssessmentCard
- `contexts/SettingsContext.tsx` - Language (EN/AR) and pediatric mode settings
- `lib/storage.ts` - AsyncStorage helpers for assessments, profile, medications
- `lib/types.ts` - TypeScript interfaces for all data models

### Backend (Express - Port 5000)
- `POST /api/auth/firebase` - Verify Firebase ID token, create/update user in PostgreSQL, establish session
- `POST /api/auth/logout` - Logout and clear session
- `GET /api/auth/me` - Get current authenticated user
- `POST /api/assess` - SSE streaming assessment with Gemini AI
- `POST /api/analyze-medication` - Image-based medication OCR analysis
- `POST /api/check-interactions` - Drug-drug interaction checking
- `POST /api/process-rppg` - Heart rate estimation from RGB signals using POS algorithm + FFT

### Authentication (Firebase Authentication)
- **Email/Password**: Firebase JS SDK handles registration + login on frontend, backend verifies ID token via REST API
- **Phone OTP**: Firebase `signInWithPhoneNumber` with `RecaptchaVerifier` (invisible reCAPTCHA) on web, sends SMS automatically, 6-digit OTP verification
- **Google Sign-In**: Firebase `signInWithPopup` on web, syncs with backend via ID token
- **Forgot Password**: Firebase `sendPasswordResetEmail` - sends reset link to user's email
- **Auth screen**: Email/Phone identifier toggle, Login/Signup tabs, OTP verification view with 6-digit input boxes, Google sign-in button
- **Backend sync**: After Firebase auth, frontend sends ID token to `/api/auth/firebase` which verifies via Identity Toolkit API, creates/updates user in PostgreSQL, and establishes express-session
- **Session management**: express-session with PostgreSQL store + AsyncStorage persistence on client
- `lib/firebase.ts` - Firebase client SDK initialization and auth exports
- `contexts/AuthContext.tsx` - Auth state management with Firebase `onAuthStateChanged` listener, phone OTP methods
- `server/firebase-auth.ts` - Firebase Identity Toolkit REST API for token verification (no service account needed)

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

## Color Palette
- Primary: #0F766E (teal)
- Accent: #F97316 (orange)
- Emergency: #DC2626 (red)
- Background: #F1F5F4

## Recent Changes
- Feb 14, 2026: Migrated to full Firebase Authentication - email/password, Google sign-in, forgot password. Removed bcrypt/custom auth. Backend verifies Firebase ID tokens via REST API. Database schema updated with firebase_uid, photo_url, auth_provider fields.
- Feb 13, 2026: Added non-contact heart rate monitor (rPPG) feature with POS algorithm, FFT-based BPM detection, pulse waveform visualization, confidence scoring
- Feb 13, 2026: Initial build of Tabibi app with all core features
