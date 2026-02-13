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
- `POST /api/auth/send-verification` - Send email verification (Firebase) or phone OTP
- `POST /api/auth/check-email-verified` - Poll Firebase for email verification status
- `POST /api/auth/verify-phone-otp` - Verify phone OTP code
- `POST /api/auth/resend-verification` - Resend verification email/OTP
- `POST /api/auth/signup` - Create account (requires prior verification)
- `POST /api/auth/login` - Login with email/phone + password
- `POST /api/auth/logout` - Logout and clear session
- `GET /api/auth/me` - Get current authenticated user
- `POST /api/assess` - SSE streaming assessment with Gemini AI
- `POST /api/analyze-medication` - Image-based medication OCR analysis
- `POST /api/check-interactions` - Drug-drug interaction checking
- `POST /api/process-rppg` - Heart rate estimation from RGB signals using POS algorithm + FFT

### Authentication & Verification
- Email signup: Firebase Auth REST API creates user and sends verification email link
- Phone signup: Backend generates 6-digit OTP stored in verification_codes table (dev mode shows code on screen; production SMS delivery requires Twilio)
- After verification, user account is created in PostgreSQL with bcrypt-hashed password
- Sessions managed via express-session with PostgreSQL store + AsyncStorage persistence
- `server/firebase-auth.ts` - Firebase REST API utilities for email verification

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
- Feb 13, 2026: Added signup verification: email verification via Firebase Auth REST API (sends verification link), phone OTP with 6-digit code stored in DB (dev mode shows code on screen)
- Feb 13, 2026: Added non-contact heart rate monitor (rPPG) feature with POS algorithm, FFT-based BPM detection, pulse waveform visualization, confidence scoring
- Feb 13, 2026: Initial build of Tabibi app with all core features
