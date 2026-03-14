# voxpoll
Test Repository for campaign
=======
# VoxPoll AI 🎙️
> Tamil Nadu AI Voice Survey Platform

| Layer          | Service         | Purpose                              |
|----------------|-----------------|--------------------------------------|
| Telephony      | **Exotel**      | Outbound calls to Indian numbers     |
| Voice (TTS)    | **ElevenLabs**  | Natural Tamil speech generation      |
| Speech-to-Text | **Whisper**     | Accurate Tamil/Tanglish transcription|
| Sentiment      | **Gemini**      | AI sentiment: positive/neutral/neg   |
| Hosting        | **Firebase**    | Frontend SPA hosting                 |
| Backend        | Google Cloud Run| Node.js API server                   |

---

## Call Flow

```
Contact picks up Exotel call
  → ExoML plays ElevenLabs Tamil greeting (village-specific)
  → ExoML plays ElevenLabs survey question
  → Records response (up to 90 seconds)
  → Exotel sends recording URL to backend
  → Backend downloads recording → Whisper transcribes
  → Gemini classifies sentiment (positive / neutral / negative)
  → Result stored → Frontend polls → Analytics updates
```

---

## Project Structure

```
voxpoll/
├── .gitignore
├── README.md
├── frontend/
│   ├── src/
│   │   ├── App.jsx        Full React application
│   │   └── main.jsx       Entry point
│   ├── index.html
│   ├── vite.config.js
│   ├── firebase.json
│   ├── .firebaserc        ← update YOUR_FIREBASE_PROJECT_ID
│   └── package.json
└── backend/
    ├── server.js          Exotel + ElevenLabs + Whisper + Gemini
    ├── package.json
    ├── Dockerfile
    └── .env.example       ← copy to .env, fill in values
```

---

## Getting Your 4 API Keys

### 1. Exotel (Telephony)
1. **exotel.com** → Sign up → complete KYC (1–2 business days)
2. Dashboard → **Settings → API** → copy Account SID + API Token
3. Buy a virtual number → copy the number as Caller ID
4. Format: `0XXXXXXXXXX` (10 digits with leading zero)

### 2. ElevenLabs (TTS)
1. **elevenlabs.io** → Sign up (free: 10,000 chars/month)
2. Profile → **API Key** → copy
3. Voice Library → pick voice → copy Voice ID

### 3. Whisper (Speech-to-Text)
1. **platform.openai.com/api-keys** → Create new secret key
2. Starts with `sk-proj-...`
3. This uses OpenAI's Whisper model — billed per minute of audio

### 4. Gemini (Sentiment)
1. **aistudio.google.com** → Get API Key → Create API key
2. Starts with `AIzaSy...`
3. Free tier: 15 requests/minute, 1 million tokens/day

---

## Local Development

```bash
# Backend
cd backend
npm install
cp .env.example .env
# Fill in all values in .env
npm run dev     # → http://localhost:3001

# Frontend (new terminal)
cd frontend
npm install
npm run dev     # → http://localhost:5173
```

Vite proxies `/api/*` → `localhost:3001` automatically.

---

## Deploy Backend → Google Cloud Run

```bash
cd backend

gcloud auth login
gcloud config set project YOUR_GCP_PROJECT_ID

gcloud run deploy voxpoll-api \
  --source . \
  --region asia-south1 \
  --allow-unauthenticated \
  --set-env-vars="\
EXOTEL_SID=xxx,\
EXOTEL_TOKEN=xxx,\
EXOTEL_CALLER_ID=0XXXXXXXXXX,\
ELEVENLABS_KEY=xxx,\
ELEVENLABS_VOICE_ID=pNInz6obpgDQGcFmaJgB,\
WHISPER_KEY=sk-proj-xxx,\
GEMINI_KEY=AIzaSy-xxx,\
PUBLIC_URL=https://api.yourdomain.com,\
FRONTEND_URL=https://survey.yourdomain.com"
```

---

## Deploy Frontend → Firebase

```bash
cd frontend
npm install -g firebase-tools
firebase login

# Edit .firebaserc → replace YOUR_FIREBASE_PROJECT_ID

echo "VITE_API_URL=https://api.yourdomain.com" > .env
npm run build
firebase deploy --only hosting
```

---

## Configure Exotel Webhook

Exotel Dashboard → **Apps** → Create App (type: Passthru):
```
App URL: https://api.yourdomain.com/exotel/app
Method:  GET
```
Assign this app to your virtual number under **Phone Numbers**.

---

## Git Setup

```bash
git init
git remote add origin git@github.com:YOUR_USERNAME/voxpoll.git
git add .
git status      # ← confirm backend/.env is NOT listed
git commit -m "feat: VoxPoll AI — Exotel + ElevenLabs + Whisper + Gemini"
git push -u origin main
```

---

## Environment Variables

| Variable               | Service     | Where to get                              |
|------------------------|-------------|-------------------------------------------|
| `EXOTEL_SID`           | Exotel      | Dashboard → Settings → API               |
| `EXOTEL_TOKEN`         | Exotel      | Dashboard → Settings → API               |
| `EXOTEL_CALLER_ID`     | Exotel      | Phone Numbers (format: 0XXXXXXXXXX)      |
| `ELEVENLABS_KEY`       | ElevenLabs  | elevenlabs.io → Profile → API Key        |
| `ELEVENLABS_VOICE_ID`  | ElevenLabs  | elevenlabs.io → Voice Library            |
| `WHISPER_KEY`          | OpenAI      | platform.openai.com/api-keys             |
| `GEMINI_KEY`           | Google      | aistudio.google.com → Get API Key        |
| `PUBLIC_URL`           | Backend     | Your Cloud Run / custom domain URL       |
| `FRONTEND_URL`         | CORS        | Your Firebase hosted URL                 |

---

## Security Checklist
- [ ] `backend/.env` in `.gitignore` ✅
- [ ] `backend/audio_cache/` in `.gitignore` ✅
- [ ] GitHub repo is **private** ✅
- [ ] No keys hardcoded in source ✅
- [ ] Cloud Run env vars set via CLI only ✅
