// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  VoxPoll AI — Backend                                                   ║
// ║  Exotel · ElevenLabs · Whisper · Gemini · Firestore                    ║
// ║  Interactive AI conversation engine — Gemini answers live questions    ║
// ╚══════════════════════════════════════════════════════════════════════════╝
//
//  npm install
//  cp .env.example .env  →  fill values
//  Place Firebase service account at: backend/firebase-service-account.json
//  node server.js
//
//  CALL FLOW (interactive):
//  Exotel dials → call connects → ExoML plays greeting (ElevenLabs)
//  → plays survey question → records user response (max 30s)
//  → /api/exotel/turn: Whisper transcribes → Gemini decides reply or end
//  → ElevenLabs voices reply → ExoML plays it → records next turn
//  → loop until Gemini signals END or max turns reached
//  → full conversation saved to Firestore

"use strict";

const express   = require("express");
const axios     = require("axios");
const cors      = require("cors");
const fs        = require("fs");
const path      = require("path");
const crypto    = require("crypto");
const FormData  = require("form-data");
const admin     = require("firebase-admin");
require("dotenv").config();

// ═════════════════════════════════════════════════════════════════════════════
// FIRESTORE
// ═════════════════════════════════════════════════════════════════════════════
const SERVICE_ACCOUNT_PATH = path.join(__dirname, "firebase-service-account.json");
if (!admin.apps.length) {
  if (fs.existsSync(SERVICE_ACCOUNT_PATH)) {
    admin.initializeApp({ credential: admin.credential.cert(require(SERVICE_ACCOUNT_PATH)) });
    console.log("[Firestore] ✓ Service account file");
  } else if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const json = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT, "base64").toString());
    admin.initializeApp({ credential: admin.credential.cert(json) });
    console.log("[Firestore] ✓ FIREBASE_SERVICE_ACCOUNT env var");
  } else {
    admin.initializeApp();
    console.log("[Firestore] ✓ Application Default Credentials");
  }
}

const db        = admin.firestore();
const TS        = () => admin.firestore.FieldValue.serverTimestamp();
const CALLS     = "calls";
const CAMPAIGNS = "campaigns";
const CONTACTS  = "contacts";
const RESULTS   = "results";

const saveCall   = (sid, data)   => db.collection(CALLS).doc(sid).set({ ...data, updatedAt: TS() }, { merge: true });
const getCall    = async sid     => { const d = await db.collection(CALLS).doc(sid).get(); return d.exists ? d.data() : null; };
const updateCall = (sid, fields) => db.collection(CALLS).doc(sid).set({ ...fields, updatedAt: TS() }, { merge: true });
const saveResult = async (sid, data) => {
  const { whisperKey, geminiKey, ...safe } = data;
  await db.collection(RESULTS).doc(sid).set({ ...safe, completedAt: TS(), completedAtISO: new Date().toISOString() }, { merge: true });
};

// ═════════════════════════════════════════════════════════════════════════════
// EXPRESS
// ═════════════════════════════════════════════════════════════════════════════
const app = express();
app.set("trust proxy", 1); // needed behind ngrok / Cloud Run

app.use(cors({ origin: process.env.FRONTEND_URL || "*" }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── ngrok: skip browser warning interstitial ─────────────────────────────────
// ngrok shows an HTML warning page to non-browser HTTP clients (Twilio webhooks,
// audio fetches) unless the request carries this header.
// We add it on all RESPONSES so ngrok's tunnel passes content through cleanly.
app.use((_req, res, next) => {
  res.setHeader("ngrok-skip-browser-warning", "true");
  res.setHeader("Access-Control-Allow-Origin", "*");
  next();
});

const AUDIO_DIR = path.join(__dirname, "audio_cache");
if (!fs.existsSync(AUDIO_DIR)) fs.mkdirSync(AUDIO_DIR, { recursive: true });
app.use("/audio", (_req, res, next) => {
  res.setHeader("ngrok-skip-browser-warning", "true");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.setHeader("Content-Type", "audio/mpeg");
  next();
}, express.static(AUDIO_DIR));

// Serve hold silence audio (used while AI is processing)
app.get("/hold_silence.mp3", (_req, res) => {
  const silencePath = path.join(__dirname, "hold_silence.mp3");
  res.setHeader("Content-Type", "audio/mpeg");
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.setHeader("ngrok-skip-browser-warning", "true");
  res.sendFile(silencePath);
});

// ═════════════════════════════════════════════════════════════════════════════
// 1. ELEVENLABS — Tamil TTS (cached by content hash)
// ═════════════════════════════════════════════════════════════════════════════
async function generateAudio(text, apiKey, voiceId) {
  const key   = apiKey  || process.env.ELEVENLABS_KEY;
  const voice = voiceId || process.env.ELEVENLABS_VOICE_ID || "pNInz6obpgDQGcFmaJgB";
  if (!key || !text?.trim()) return null;

  const hash     = crypto.createHash("md5").update(`${voice}:${text}`).digest("hex");
  const filename = `${hash}.mp3`;
  const filepath = path.join(AUDIO_DIR, filename);

  if (fs.existsSync(filepath)) return `${process.env.PUBLIC_URL}/audio/${filename}`;

  try {
    const res = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${voice}`,
      { text, model_id: "eleven_multilingual_v2",
        voice_settings: { stability: 0.60, similarity_boost: 0.80, style: 0.20, use_speaker_boost: true } },
      { headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
        responseType: "arraybuffer", timeout: 20000 }
    );
    fs.writeFileSync(filepath, Buffer.from(res.data));
    console.log(`[ElevenLabs] Generated → ${filename}`);
    return `${process.env.PUBLIC_URL}/audio/${filename}`;
  } catch (e) {
    console.error("[ElevenLabs]", e.response?.status, e.message);
    return null;
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// 2. WHISPER — Transcribe a recording URL (Tamil / Tanglish)
// ═════════════════════════════════════════════════════════════════════════════
async function transcribeRecording(recordingUrl, apiKey) {
  const key = apiKey || process.env.WHISPER_KEY;
  if (!key || !recordingUrl) return "";
  try {
    const provider    = (process.env.TELEPHONY_PROVIDER || "exotel").toLowerCase();
    const twilioSid   = process.env.TWILIO_SID;
    const twilioToken = process.env.TWILIO_TOKEN;

    // Twilio: ensure URL ends with .mp3 and wait briefly for recording to be ready
    let fetchUrl = recordingUrl;
    if (provider === "twilio") {
      if (!fetchUrl.endsWith(".mp3")) fetchUrl = fetchUrl + ".mp3";
      // Twilio recordings usually ready within 0.5s after webhook fires
      await new Promise(r => setTimeout(r, 500));
    }

    const axiosOpts = { responseType: "arraybuffer", timeout: 30000 };
    if (provider === "twilio" && twilioSid && twilioToken) {
      axiosOpts.auth = { username: twilioSid, password: twilioToken };
    }

    console.log(`[Whisper] Downloading: ${fetchUrl}`);
    const audioRes = await axios.get(fetchUrl, axiosOpts);

    // Detect if Twilio returned XML error instead of audio
    const first4 = Buffer.from(audioRes.data).slice(0, 4).toString("utf8");
    if (first4.startsWith("<?xm") || first4.startsWith("<Twi")) {
      const xmlBody = Buffer.from(audioRes.data).toString("utf8").slice(0, 300);
      console.error(`[Whisper] Got XML instead of audio — recording not ready or auth failed: ${xmlBody}`);
      return "";
    }

    console.log(`[Whisper] Downloaded ${audioRes.data.byteLength} bytes (audio OK)`);
    const tmpPath  = path.join(AUDIO_DIR, `rec_${Date.now()}.mp3`);
    fs.writeFileSync(tmpPath, Buffer.from(audioRes.data));
    const form = new FormData();
    form.append("file", fs.createReadStream(tmpPath), { filename: "recording.mp3", contentType: "audio/mpeg" });
    form.append("model", "whisper-1");
    form.append("language", "ta");
    // Use Groq (free) if GROQ_KEY is set, otherwise fall back to OpenAI Whisper
    const groqKey = process.env.GROQ_KEY;
    let transcript = "";

    if (groqKey) {
      console.log("[Whisper] Using Groq (free tier)");
      // Groq uses whisper-large-v3 — must build a fresh FormData (can't mutate model field)
      const groqForm = new FormData();
      groqForm.append("file", fs.createReadStream(tmpPath), { filename: "recording.mp3", contentType: "audio/mpeg" });
      groqForm.append("model", "whisper-large-v3");
      groqForm.append("language", "ta");
      const groqRes = await axios.post("https://api.groq.com/openai/v1/audio/transcriptions", groqForm, {
        headers: { Authorization: `Bearer ${groqKey}`, ...groqForm.getHeaders() }, timeout: 60000,
      });
      transcript = groqRes.data?.text?.trim() || "";
    } else {
      const res = await axios.post("https://api.openai.com/v1/audio/transcriptions", form, {
        headers: { Authorization: `Bearer ${key}`, ...form.getHeaders() }, timeout: 60000,
      });
      transcript = res.data?.text?.trim() || "";
    }

    console.log(`[Whisper] Transcribed: "${transcript}"`);
    fs.unlinkSync(tmpPath);

    // ── Hallucination cleaner ─────────────────────────────────────────────────
    // Whisper sometimes adds Cyrillic/Greek/random chars when audio is noisy.
    // Strategy: STRIP exotic chars and keep Tamil + English words, don't reject outright.
    if (transcript) {
      // Step 1: Remove exotic chars (keep Tamil U+0B80-U+0BFF, ASCII printable, spaces)
      const cleaned = transcript
        .replace(/[^\u0B80-\u0BFF\u0020-\u007E\n]/g, "")  // strip non-Tamil non-ASCII
        .replace(/\s+/g, " ")                               // collapse whitespace
        .trim();

      const tamilChars = (cleaned.match(/[\u0B80-\u0BFF]/g) || []).length;
      const totalClean = cleaned.replace(/ /g, "").length;

      // Fully reject only if: nothing left after cleaning, or pure noise phrases
      const noisePatterns = [/thank you for watching/i, /subscribe/i, /business calendar/i, /\[music\]/i];
      const isNoise = noisePatterns.some(p => p.test(cleaned));

      if (!cleaned || totalClean < 3 || isNoise) {
        console.warn(`[Whisper] Rejected — nothing usable after cleaning (original: "${transcript.slice(0,60)}")`);
        return "";
      }

      if (cleaned !== transcript) {
        console.log(`[Whisper] Cleaned transcript — removed exotic chars. Tamil:${tamilChars} chars remaining`);
        transcript = cleaned;
      }
    }

    return transcript;
  } catch (e) {
    console.error("[Whisper] ERROR:", e.response?.status, JSON.stringify(e.response?.data) || e.message);
    return "";
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// 3. AI CONVERSATION ENGINE — OpenRouter (replaces Gemini)
//
//  OpenRouter provides access to many LLMs via a single OpenAI-compatible API.
//  Model: google/gemma-3-27b-it:free  (free tier, no billing needed)
//  Fallback: mistralai/mistral-7b-instruct:free
//
//  Set OPENROUTER_KEY=sk-or-v1-xxx in .env
//  Get key free at: openrouter.ai/keys
// ═════════════════════════════════════════════════════════════════════════════

// ── AI backend router ────────────────────────────────────────────────────────
// Priority: Gemini first (free 15 req/min), OpenRouter as fallback (needs credits)
// Get Gemini key free: aistudio.google.com → Get API Key → starts with AIzaSy...

async function callGemini({ systemPrompt, maxTokens = 256, temperature = 0.3 }) {
  const key = process.env.GEMINI_KEY;
  if (!key) return null;
  // Models confirmed available for this project
  const models = [
    "gemini-2.5-flash-lite",  // faster for short conversational replies
    "gemini-2.5-flash",       // fallback if lite unavailable
  ];
  for (const model of models) {
    try {
      console.log(`[AI] Trying Gemini model: ${model}`);
      const res = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
        {
          contents: [{ parts: [{ text: systemPrompt }] }],
          generationConfig: { maxOutputTokens: maxTokens + 512, temperature, topP: 0.85 }, // +512 for thinking buffer
        },
        { headers: { "Content-Type": "application/json" }, timeout: 45000 }
      );
      const result = res.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
      if (result) { console.log(`[AI] Gemini success: ${model}`); return result; }
    } catch (e) {
      const status = e.response?.status;
      const errMsg = e.response?.data?.error?.message || e.message || "";
      console.warn(`[AI] Gemini ${model} failed (${status}) — ${errMsg.slice(0,80)}`);
      if (status === 404 || status === 429) continue; // try next model
      throw e; // unexpected error
    }
  }
  console.error("[AI] All Gemini models failed");
  return "";
}

async function callOpenRouter({ systemPrompt, maxTokens = 256, temperature = 0.3 }) {
  const key   = process.env.OPENROUTER_KEY;
  const model = process.env.OPENROUTER_MODEL || "meta-llama/llama-3.3-70b-instruct";
  if (!key) return null;
  const res = await axios.post(
    "https://openrouter.ai/api/v1/chat/completions",
    { model, messages: [{ role: "user", content: systemPrompt }], max_tokens: maxTokens, temperature },
    {
      headers: {
        "Authorization": `Bearer ${key}`,
        "Content-Type":  "application/json",
        "HTTP-Referer":  process.env.PUBLIC_URL || "https://voxpoll.ai",
        "X-Title":       "VoxPoll AI",
      },
      timeout: 25000,
    }
  );
  return res.data?.choices?.[0]?.message?.content?.trim() || "";
}

// Main AI entry point — Gemini first (free), OpenRouter fallback
async function openRouterChat({ systemPrompt, maxTokens = 256, temperature = 0.3 }) {
  // 1. Gemini — free tier, 15 RPM, works out of the box
  if (process.env.GEMINI_KEY) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        console.log(`[AI] Using Gemini (attempt ${attempt})`);
        const result = await callGemini({ systemPrompt, maxTokens, temperature });
        if (result) return result;
        break;
      } catch (e) {
        const status = e.response?.status;
        const msg    = e.response?.data?.error?.message || e.message || "";
        // Extract retry delay from Gemini error message e.g. "retry in 10.25s"
        const retryMatch = msg.match(/retry in ([\d.]+)s/i);
        const retryDelay = retryMatch ? Math.ceil(parseFloat(retryMatch[1])) * 1000 : 0;
        if (status === 429 && attempt === 1 && retryDelay > 0 && retryDelay < 20000) {
          console.warn(`[AI] Gemini rate limited — waiting ${retryDelay}ms then retrying`);
          await new Promise(r => setTimeout(r, retryDelay));
        } else {
          console.warn(`[AI] Gemini failed (${status}) — trying OpenRouter`);
          break;
        }
      }
    }
  }

  // 2. OpenRouter — needs credits but reliable when funded
  if (process.env.OPENROUTER_KEY) {
    try {
      const model = process.env.OPENROUTER_MODEL || "meta-llama/llama-3.3-70b-instruct";
      console.log(`[AI] Using OpenRouter: ${model}`);
      const result = await callOpenRouter({ systemPrompt, maxTokens, temperature });
      if (result) return result;
    } catch (e) {
      console.warn(`[AI] OpenRouter failed (${e.response?.status})`);
    }
  }

  console.error("[AI] All AI backends failed. Set GEMINI_KEY (free at aistudio.google.com) or fund OPENROUTER_KEY");
  return "";
}

async function geminiConversationTurn({ userText, surveyQuestion, context, history, geminiKey, contactName }) {
  // Debug: log context so we can confirm it's arriving
  const ctxLen = (context || "").trim().length;
  console.log(`[AI] Context KB: ${ctxLen} chars | Question: "${(surveyQuestion||"").slice(0,60)}"`);
  if (ctxLen === 0) console.warn("[AI] WARNING: context/FAQ is EMPTY — agent has no knowledge base!");

  const turnsLeft   = Math.max(0, 3 - history.length);
  const isLastChance = turnsLeft <= 1;

  // Render conversation history clearly
  const historyText = history.length > 0
    ? history.map((h, i) => `[Turn ${i + 1}]\nAI  : ${h.aiReply || h.ai}\nUser: ${h.user}`).join("\n\n")
    : "(This is the very first response from the citizen.)";

  // Classify what the user said to guide Gemini's decision
  const systemPrompt = `
═══════════════════════════════════════════════════════
ROLE
═══════════════════════════════════════════════════════
You are a polite, warm AI phone survey agent working for the Tamil Nadu government.
You are speaking with ${contactName || "a citizen"} over a voice phone call.
${contactName ? `Address them as "${contactName.split(" ")[0]}" when it feels natural (not every reply).` : ""}
Your SOLE purpose is to collect their genuine opinion on the survey question below.

═══════════════════════════════════════════════════════
SURVEY QUESTION  (what you must get their opinion on)
═══════════════════════════════════════════════════════
${surveyQuestion}

═══════════════════════════════════════════════════════
KNOWLEDGE BASE / FAQ  — READ THIS CAREFULLY BEFORE RESPONDING
═══════════════════════════════════════════════════════
The following facts and FAQs are your ONLY source of truth.
When the citizen asks ANY question, search this section first and answer from it.
Do NOT say you don't know if the answer is here.

${context?.trim() || "No additional facts provided. If asked anything factual, say you don't have that information."}

[END OF KNOWLEDGE BASE]

═══════════════════════════════════════════════════════
CONVERSATION SO FAR
═══════════════════════════════════════════════════════
${historyText}

USER JUST SAID:
"${userText}"

═══════════════════════════════════════════════════════
DECISION RULES  — follow in order, stop at first match
═══════════════════════════════════════════════════════

RULE 1 — OPINION GIVEN
IF the user expressed a clear stance. Look for these signals:
• Support: "ஆதரிக்கிறேன்", "விரும்புகிறேன்", "ஆமாம்", "சம்மதம்", "நல்லது", "வேண்டும்", "ஆதரிக்கிறோம்"
• Oppose:  "எதிர்க்கிறேன்", "வேண்டாம்", "ஒப்புக்கொள்ளவில்லை", "இல்லை"
• Any clear statement of supporting or opposing the survey topic
→ Acknowledge their view warmly in ONE sentence (e.g. "உங்கள் ஆதரவை பதிவு செய்தோம், நன்றி!").
→ Thank them and END the call immediately. Do NOT ask more questions.
→ Set sentiment = "positive" if support, "negative" if oppose, "neutral" if mixed.

RULE 2 — FACTUAL QUESTION ASKED
IF the user asked a factual question OR if their message contains question words like
"என்ன" (what), "ஏன்" (why), "எப்படி" (how), "பயன்கள்" (benefits), "நன்மை", "தீமை",
"யார்" (who), "எங்கே" (where), "கேள்வி" (question):
→ IF the answer is clearly in the Knowledge Base: answer in 1-2 short Tamil sentences,
   then ask for their opinion on the survey question.
→ IF only partially in KB: give what you know, say the rest is unknown, then ask opinion.
→ IF not in KB at all: say "அந்த விவரம் என்னிடம் இல்லை", then ask opinion.
→ Do NOT invent facts. Only cite the Knowledge Base.

RULE 3 — VAGUE / GARBLED / UNCLEAR RESPONSE
IF the user said something very short (under 5 meaningful words) or completely unclear:
→ Ask them once: "நீங்கள் இந்தக் கோரிக்கையை ஆதரிக்கிறீர்களா அல்லது எதிர்க்கிறீர்களா?"
→ Accept whatever they say next as their final answer — do NOT ask again.
NOTE: If you already asked this question once in conversation history, accept the next answer.

RULE 4 — GOING OFF TOPIC
IF the user is talking about something unrelated to the survey:
→ Acknowledge briefly (one short phrase), then redirect to the survey question.

RULE 5 — HOSTILITY OR FRUSTRATION
IF the user sounds annoyed or refuses:
→ Apologise for the interruption in one sentence, thank them for their time, END.
→ Set sentiment = "negative".

RULE 6 — TIME LIMIT
IF turns_remaining = ${turnsLeft} and this is ${isLastChance ? "THE LAST TURN" : "getting close"}:
→ ${isLastChance
    ? "This is the last chance. If no clear opinion yet, politely ask one final direct question: do they support or oppose? Then end regardless of response."
    : "Start wrapping up — if they've given any view, end after this turn."}

═══════════════════════════════════════════════════════
LANGUAGE RULES
═══════════════════════════════════════════════════════
- Match the citizen's language exactly:
  • They speak Tamil → reply in Tamil script
  • They speak English → reply in English
  • They mix Tamil + English (Tanglish) → match that mix
- NEVER use bullet points, numbered lists, or headers in the reply.
  This is a spoken phone call — replies must sound natural when read aloud.
- Keep replies to 1–3 sentences maximum. Brevity is essential.

═══════════════════════════════════════════════════════
OUTPUT FORMAT  — YOU MUST RESPOND WITH ONLY THIS JSON. NO OTHER TEXT.
═══════════════════════════════════════════════════════
CRITICAL: Your ENTIRE response must be a single JSON object. No preamble. No explanation. No Tamil text outside the JSON. Start your response with { and end with }.

{"reply":"<spoken reply in 1-3 sentences>","end":<true or false>,"sentiment":"<positive|neutral|negative>"}

Example of correct output:
{"reply":"பட்டியல் வெளியேற்றம் என்பது SC பட்டியலிலிருந்து விலக கோரும் கோரிக்கையாகும். நீங்கள் ஆதரிக்கிறீர்களா?","end":false,"sentiment":"neutral"}
`.trim();

  try {
    console.log(`[AI] OpenRouter conversation turn | model: ${process.env.OPENROUTER_MODEL || "google/gemma-3-27b-it:free"}`);
    const raw = await openRouterChat({ systemPrompt, maxTokens: 400, temperature: 0.1 }); // short replies only
    if (!raw) throw new Error("Empty response from OpenRouter");

    // Strip thinking tags (gemini-2.5 uses <think>...</think> before actual response)
    const noThink = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
    // Normalise smart/curly quotes → straight quotes (gemini-2.5-flash uses these)
    const normalised = noThink
      .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"')  // curly double quotes
      .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'"); // curly single quotes
    const clean = normalised.replace(/```json|```/g, "").trim();

    // Log full raw for debugging
    console.log(`[AI] Raw (${clean.length} chars): ${clean.replace(/\n/g," ").slice(0,300)}`);

    // ── Parse response ────────────────────────────────────────────────────────
    // gemini-2.5-flash returns multiline JSON with Tamil text — parse carefully
    let replyText = null, endVal = false, sentVal = "neutral";

    // Flatten newlines so JSON.parse works on multiline Tamil strings
    let flat = "";
    for (let i = 0; i < clean.length; i++) {
      const ch = clean[i];
      flat += (ch === "\n" || ch === "\r") ? " " : ch;
    }

    // Try JSON.parse first
    try {
      const s = flat.indexOf("{"), e = flat.lastIndexOf("}");
      if (s !== -1 && e !== -1) {
        const parsed = JSON.parse(flat.slice(s, e + 1));
        if (parsed.reply) {
          replyText = String(parsed.reply).trim();
          endVal    = parsed.end === true;
          sentVal   = parsed.sentiment || "neutral";
        }
      }
    } catch(jsonErr) {
      console.warn(`[AI] JSON.parse failed: ${jsonErr.message.slice(0,60)}`);
    }

    // Fallback: extract each field with targeted regex on the flattened string
    if (!replyText) {
      // "end" and "sentiment" are always short — extract from END of string
      const endMatch  = flat.match(/"end"\s*:\s*(true|false)/);
      endVal = endMatch ? endMatch[1] === "true" : false;
      const sentMatch = flat.match(/"sentiment"\s*:\s*"(positive|neutral|negative)"/);
      sentVal = sentMatch ? sentMatch[1] : "neutral";

      // "reply" — find opening quote after "reply": then find its closing quote
      // Closing quote is the LAST " that appears BEFORE the next field key
      const replyKeyIdx = flat.indexOf('"reply"');
      if (replyKeyIdx !== -1) {
        const colonIdx = flat.indexOf(':', replyKeyIdx);
        const openQuote = flat.indexOf('"', colonIdx + 1);
        if (openQuote !== -1) {
          // Closing quote: walk backwards from "end" or "sentiment" or end-of-object
          const nextKeyIdx = Math.min(
            flat.indexOf('"end"',    openQuote + 1) !== -1 ? flat.indexOf('"end"',    openQuote + 1) : flat.length,
            flat.indexOf('"sentiment"', openQuote + 1) !== -1 ? flat.indexOf('"sentiment"', openQuote + 1) : flat.length
          );
          const closeQuote = flat.lastIndexOf('"', nextKeyIdx - 1);
          if (closeQuote > openQuote) {
            replyText = flat.slice(openQuote + 1, closeQuote).trim();
          }
        }
      }
      if (replyText) console.log(`[AI] Fallback extraction — reply: "${replyText.slice(0,50)}..." end:${endVal}`);
    }

    if (replyText) {
      console.log(`[AI] Reply: "${replyText.slice(0,60)}..." | end: ${endVal} | sentiment: ${sentVal}`);
      return { reply: replyText, end: endVal, sentiment: sentVal };
    }

    // JSON extraction failed — but clean has actual Tamil text from Gemini
    // Use it directly as the reply rather than a hardcoded goodbye
    if (clean.length > 10 && !clean.includes('"reply"')) {
      // Gemini returned plain text — use it as the spoken reply, keep conversation going
      const plainReply = clean.slice(0, 300).trim();
      console.warn(`[AI] Plain text response — using as reply: "${plainReply.slice(0,60)}..."`);
      return { reply: plainReply, end: false, sentiment: "neutral" };
    }

    // Nothing usable at all
    console.warn(`[AI] All extraction failed — ending call`);
    return { reply: "நன்றி! உங்கள் கருத்திற்கு மிக்க நன்றி. வணக்கம்!", end: true, sentiment: "neutral" };

  } catch (e) {
    console.error("[AI conversation] ERROR:", e.response?.data || e.message);
    return { reply: "மன்னிக்கவும், தொழில்நுட்ப சிக்கல். நன்றி!", end: true, sentiment: "neutral" };
  }
}

// Sentiment analysis for the full conversation transcript (called at end)
async function analyseFullConversation(turns, surveyQuestion, context, geminiKey) {
  const key = geminiKey || process.env.GEMINI_KEY;
  if (!key || !turns.length) return "neutral";

  const transcript = turns
    .map(t => `User: ${t.user}`)
    .filter(t => t !== "User: (silence)")
    .join("\n");

  if (!transcript.trim()) return "neutral";

  try {
    const sentimentPrompt = `
Survey question asked: "${surveyQuestion}"

What the citizen said across the call:
${transcript}

Based on the citizen's ACTUAL STANCE toward the survey topic, classify their sentiment.

RULES:
- "positive"  = supports, approves, agrees, or expresses enthusiasm
- "negative"  = opposes, criticises, rejects, or expresses frustration about the topic
- "neutral"   = uncertain, conditional, no clear opinion, or off-topic throughout
- Ignore polite filler words ("sari", "okay", "hmm") — focus on substantive statements
- If the citizen raised concerns BUT still expressed overall support → "positive"
- If the citizen asked questions only and never gave an opinion → "neutral"

Reply with ONLY one word: positive, neutral, or negative
`.trim();

    const raw = await openRouterChat({ systemPrompt: sentimentPrompt, maxTokens: 5, temperature: 0 });
    const result = ["positive", "neutral", "negative"].find(s => (raw||"").toLowerCase().includes(s)) || "neutral";
    console.log(`[AI] Sentiment analysis: "${result}"`);
    return result;
  } catch (e) {
    console.error("[AI sentiment] ERROR:", e.message);
    return "neutral";
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// 4. TELEPHONY — Initiate outbound call (provider-agnostic)
// =============================================================================
// Supports three providers — set TELEPHONY_PROVIDER in .env:
//   "twilio"  — US/global, good for testing; Indian +91 numbers available
//   "plivo"   — Indian +91 numbers, easy signup, no KYC wait
//   "exotel"  (default) — best for India production, requires KYC
//
// PLIVO SETUP (recommended while Twilio +91 and Exotel KYC are pending):
//   1. Sign up free at plivo.com (no KYC)
//   2. Buy an Indian +91 number (~$0.80/month)
//   3. Set in .env:
//      TELEPHONY_PROVIDER=plivo
//      PLIVO_AUTH_ID=MAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
//      PLIVO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
//      PLIVO_CALLER_ID=+91XXXXXXXXXX    (your Plivo Indian number)
// =============================================================================
async function placeOutboundCall({ to, callerId, sid, token, appUrl, statusUrl, customField }) {
  const provider = (process.env.TELEPHONY_PROVIDER || "exotel").toLowerCase();

  if (provider === "twilio") {
    return makeTwilioCall({ to, callerId, sid, token, appUrl, statusUrl });
  }

  if (provider === "plivo") {
    return makePlivoCall({ to, appUrl, statusUrl });
  }

  // ── EXOTEL ────────────────────────────────────────────────────────────────
  const form = new FormData();
  form.append("From",                    to);
  form.append("To",                      callerId);
  form.append("CallerId",                callerId);
  form.append("Url",                     appUrl);
  form.append("StatusCallback",          statusUrl);
  form.append("StatusCallbackEvents[0]", "terminal");
  if (customField) form.append("CustomField", customField);

  const apiKey    = process.env.EXOTEL_API_KEY || sid;
  const subdomain = process.env.EXOTEL_SUBDOMAIN || "api.exotel.com";
  const callUrl   = `https://${subdomain}/v1/Accounts/${sid}/Calls/connect`;

  console.log("[Exotel] Placing call | URL: %s | From: %s | To: %s", callUrl, to, callerId);
  console.log("[Exotel] Auth: SID=%s | APIKey=%s | Token=%s...%s (len %d)",
    sid, apiKey, token?.slice(0,4), token?.slice(-4), token?.length ?? 0);
  console.log("[Exotel] AppUrl: %s", appUrl);

  try {
    const res = await axios.post(callUrl, form,
      { auth: { username: apiKey, password: token }, headers: form.getHeaders(), timeout: 20000 });
    console.log("[Exotel] SUCCESS | CallSid: %s | Status: %s", res.data?.Call?.Sid, res.data?.Call?.Status);
    return res.data?.Call;
  } catch (err) {
    const status = err.response?.status;
    const raw    = err.response?.data || "";
    let exoMsg = "(no message)", exoCode = "(no code)";
    if (typeof raw === "string" && raw.includes("<RestException>")) {
      const m = raw.match(/<Message>([\s\S]*?)<\/Message>/);
      const c = raw.match(/<Code>([\s\S]*?)<\/Code>/);
      if (m) exoMsg  = m[1].trim();
      if (c) exoCode = c[1].trim();
    } else if (raw?.RestException) {
      exoMsg  = raw.RestException.Message || exoMsg;
      exoCode = raw.RestException.Code    || exoCode;
    }
    const hints = {
      "34009": "403/34009 = Virtual number not assigned to a Passthru app OR account KYC not complete",
      "34010": "401/34010 = Wrong API Key — set EXOTEL_API_KEY in .env (different from Account SID)",
      "34011": "403/34011 = Trial account: destination number not in Verified Caller IDs whitelist",
    };
    console.error("[Exotel] FAILED | HTTP %d | Code: %s | %s", status, exoCode, exoMsg);
    if (hints[exoCode]) console.error("[Exotel] HINT:", hints[exoCode]);
    throw err;
  }
}

// ── TWILIO — drop-in replacement for Exotel during testing ────────────────────
async function makeTwilioCall({ to, callerId, sid, token, appUrl, statusUrl }) {
  // Twilio expects E.164 format: +917708142959
  const fmt = (n) => {
    n = String(n).replace(/\D/g, "");
    if (n.length === 10) return `+91${n}`;           // Indian mobile
    if (n.length === 11 && n.startsWith("0")) return `+91${n.slice(1)}`;
    if (!n.startsWith("+")) return `+${n}`;
    return n;
  };
  const toE164       = fmt(to);
  const callerE164   = fmt(callerId);
  const twilioSid    = sid   || process.env.TWILIO_SID;
  const twilioToken  = token || process.env.TWILIO_TOKEN;
  const callUrl      = `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Calls.json`;

  console.log("[Twilio] Placing call | From: %s | To: %s", callerE164, toE164);
  console.log("[Twilio] AppUrl: %s", appUrl);

  const form = new FormData();
  form.append("From",           callerE164);
  form.append("To",             toE164);
  form.append("Url",            appUrl);
  form.append("StatusCallback", statusUrl);
  form.append("StatusCallbackEvent", "completed");

  try {
    const res = await axios.post(callUrl, form,
      { auth: { username: twilioSid, password: twilioToken }, headers: form.getHeaders(), timeout: 20000 });
    console.log("[Twilio] SUCCESS | CallSid: %s | Status: %s", res.data?.sid, res.data?.status);
    // Normalise to Exotel-style response shape so rest of code works unchanged
    return { Sid: res.data?.sid, Status: res.data?.status };
  } catch (err) {
    const status = err.response?.status;
    const body   = err.response?.data || {};
    console.error("[Twilio] FAILED | HTTP %d | Code: %s | %s", status, body.code, body.message);
    throw err;
  }
}

// ── PLIVO — Indian +91 numbers, no KYC wait ──────────────────────────────────
async function makePlivoCall({ to, appUrl, statusUrl }) {
  const authId    = process.env.PLIVO_AUTH_ID;
  const authToken = process.env.PLIVO_AUTH_TOKEN;
  const callerId  = process.env.PLIVO_CALLER_ID;

  if (!authId || !authToken || !callerId) {
    throw new Error("Plivo credentials missing — set PLIVO_AUTH_ID, PLIVO_AUTH_TOKEN, PLIVO_CALLER_ID in .env");
  }

  // Plivo expects E.164 format
  const fmt = (n) => {
    n = String(n).replace(/\D/g, "");
    if (n.length === 10) return `+91${n}`;
    if (n.length === 11 && n.startsWith("0")) return `+91${n.slice(1)}`;
    if (!n.startsWith("+")) return `+${n}`;
    return n;
  };
  const toE164  = fmt(to);
  const fromE164 = fmt(callerId);

  console.log("[Plivo] Placing call | From: %s | To: %s", fromE164, toE164);
  console.log("[Plivo] AppUrl: %s", appUrl);

  try {
    const res = await axios.post(
      `https://api.plivo.com/v1/Account/${authId}/Call/`,
      {
        from:             fromE164,
        to:               toE164,
        answer_url:       appUrl,
        answer_method:    "POST",
        hangup_url:       statusUrl,
        hangup_method:    "POST",
        time_limit:       130,
      },
      {
        auth: { username: authId, password: authToken },
        headers: { "Content-Type": "application/json" },
        timeout: 45000,
      }
    );
    console.log("[Plivo] SUCCESS | RequestUUID: %s", res.data?.request_uuid);
    // Normalise to Exotel-style response shape
    return { Sid: res.data?.request_uuid, Status: "queued" };
  } catch (err) {
    const status = err.response?.status;
    const body   = err.response?.data || {};
    console.error("[Plivo] FAILED | HTTP %d | %s", status, JSON.stringify(body));
    throw err;
  }
}

function escapeXml(s = "") {
  return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;");
}

// Provider-aware <Say> tag — Twilio and Exotel have slightly different syntax
function sayXml(text) {
  const isTwilio = (process.env.TELEPHONY_PROVIDER || "exotel").toLowerCase() === "twilio";
  return isTwilio
    ? `<Say language="ta-IN">${escapeXml(text)}</Say>`
    : sayXml(text);
}

// Convenience: play audio if URL exists, else speak text
function playOrSayXml(audioUrl, text) {
  return audioUrl ? `<Play>${audioUrl}</Play>` : sayXml(text);
}

// ─── Call status normaliser ───────────────────────────────────────────────────
// Maps Exotel raw statuses → our 5 display statuses
// completed        → "completed"      (full conversation finished)
// busy             → "call-busy"      (line busy)
// no-answer        → "no-answer"      (rang but user did not pick up)
// failed           → "not-reachable"  (number unreachable / switched off)
// disconnected     → "disconnected"   (user hung up mid-call)
// in-progress/null → "in-progress"
function mapCallStatus(exotelStatus, hasTurns) {
  const s = (exotelStatus || "").toLowerCase().replace(/[_\s]/g, "-");
  if (s === "completed"  && hasTurns)  return "completed";
  if (s === "completed"  && !hasTurns) return "no-answer";   // connected but no speech
  if (s === "busy")                    return "call-busy";
  if (s === "no-answer")               return "no-answer";
  if (s === "failed")                  return "not-reachable";
  if (s === "canceled")                return "not-reachable";
  if (s.includes("disconnect"))        return "disconnected";
  return s || "unknown";
}

// Per-turn record max lengths (seconds) — allow longer for FAQ answers
const TURN_MAX_LENGTH = [30, 25, 20];
const MAX_TURNS       = 4;           // allow one extra turn for FAQ questions
const CALL_MAX_SEC    = 180;         // 3 minutes — enough for FAQ + opinion

// ═════════════════════════════════════════════════════════════════════════════
// ── USER MANAGEMENT ROUTES ───────────────────────────────────────────────────
// ═════════════════════════════════════════════════════════════════════════════
const USERS = "users";

// Login
app.post("/api/auth/login", async (req, res) => {
  try {
    const { username, passwordHash } = req.body;
    if (!username || !passwordHash) return res.status(400).json({ success: false, error: "Missing credentials" });

    // Auto-seed default admin if collection is empty
    const allUsers = await db.collection(USERS).get();
    if (allUsers.empty) {
      const crypto = require("crypto");
      const defaultHash = crypto.createHash("sha256").update("Admin@2024!").digest("hex");
      await db.collection(USERS).doc("admin").set({
        username: "admin", passwordHash: defaultHash,
        displayName: "Administrator", role: "admin",
        createdBy: "system", createdAt: new Date().toISOString(), active: true,
      });
    }

    const doc = await db.collection(USERS).doc(username).get();
    if (!doc.exists) return res.json({ success: false, error: "Invalid username or password" });
    const user = doc.data();
    if (user.active === false) return res.json({ success: false, error: "Account is disabled. Contact admin." });
    if (user.passwordHash !== passwordHash) return res.json({ success: false, error: "Invalid username or password" });

    const { passwordHash: _, ...safeUser } = user;
    res.json({ success: true, user: safeUser });
  } catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

// List all users (admin only in UI, but route is open for simplicity)
app.get("/api/users", async (req, res) => {
  try {
    const snap = await db.collection(USERS).get();
    const users = snap.docs.map(d => { const { passwordHash, ...safe } = d.data(); return safe; });
    res.json(users.sort((a,b) => a.role==="admin" ? -1 : 1));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Get single user
app.get("/api/users/:username", async (req, res) => {
  try {
    const doc = await db.collection(USERS).doc(req.params.username).get();
    if (!doc.exists) return res.status(404).json({ error: "Not found" });
    const { passwordHash, ...safe } = doc.data();
    res.json(safe);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Create user
app.post("/api/users", async (req, res) => {
  try {
    const { username, passwordHash, displayName, role, createdBy, createdAt, active } = req.body;
    if (!username || !passwordHash) return res.status(400).json({ error: "username and passwordHash required" });
    const existing = await db.collection(USERS).doc(username).get();
    if (existing.exists) return res.status(409).json({ error: `Username "${username}" already exists` });
    await db.collection(USERS).doc(username).set({ username, passwordHash, displayName: displayName||username, role: role||"support", createdBy: createdBy||"admin", createdAt: createdAt||new Date().toISOString(), active: active !== false });
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Toggle user active/disabled
app.post("/api/users/:username/toggle", async (req, res) => {
  try {
    const doc = await db.collection(USERS).doc(req.params.username).get();
    if (!doc.exists) return res.status(404).json({ error: "Not found" });
    const current = doc.data().active !== false;
    await db.collection(USERS).doc(req.params.username).update({ active: !current });
    res.json({ success: true, active: !current });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Change password
app.post("/api/users/:username/password", async (req, res) => {
  try {
    const { passwordHash } = req.body;
    if (!passwordHash) return res.status(400).json({ error: "passwordHash required" });
    await db.collection(USERS).doc(req.params.username).update({ passwordHash });
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Delete user
app.delete("/api/users/:username", async (req, res) => {
  try {
    if (req.params.username === "admin") return res.status(403).json({ error: "Cannot delete default admin" });
    await db.collection(USERS).doc(req.params.username).delete();
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ═════════════════════════════════════════════════════════════════════════════
// ── CAMPAIGNS CRUD ────────────────────────────────────────────────────────────
// ═════════════════════════════════════════════════════════════════════════════
app.get("/api/campaigns", async (req, res) => {
  try { const snap = await db.collection(CAMPAIGNS).orderBy("createdAt","desc").get(); res.json(snap.docs.map(d=>({id:d.id,...d.data()}))); }
  catch(e){ res.status(500).json({error:e.message}); }
});
app.post("/api/campaigns", async (req, res) => {
  try {
    const { title, question, context, maxCalls, targetGroup, campaignWelcomeSpeech } = req.body;
    if (!title||!question) return res.status(400).json({error:"title and question required"});
    const ref = await db.collection(CAMPAIGNS).add({ title, question, context:context||"", maxCalls:maxCalls||20, targetGroup:targetGroup||"", campaignWelcomeSpeech:campaignWelcomeSpeech||"", status:"draft", createdAt:TS() });
    res.json({ id:ref.id, title, question, status:"draft" });
  } catch(e){ res.status(500).json({error:e.message}); }
});
app.patch("/api/campaigns/:id", async (req, res) => {
  try { await db.collection(CAMPAIGNS).doc(req.params.id).set({...req.body, updatedAt:TS()},{merge:true}); res.json({ok:true}); }
  catch(e){ res.status(500).json({error:e.message}); }
});
app.delete("/api/campaigns/:id", async (req, res) => {
  try { await db.collection(CAMPAIGNS).doc(req.params.id).delete(); res.json({ok:true}); }
  catch(e){ res.status(500).json({error:e.message}); }
});

// ── CONTACTS CRUD ─────────────────────────────────────────────────────────────
app.get("/api/contacts", async (req, res) => {
  try { const snap = await db.collection(CONTACTS).orderBy("createdAt","asc").get(); res.json(snap.docs.map(d=>({id:d.id,...d.data()}))); }
  catch(e){ res.status(500).json({error:e.message}); }
});
app.post("/api/contacts/bulk", async (req, res) => {
  try {
    const { contacts } = req.body;
    if (!Array.isArray(contacts)) return res.status(400).json({error:"contacts array required"});
    const existing = await db.collection(CONTACTS).get();
    const delBatch = db.batch(); existing.docs.forEach(d=>delBatch.delete(d.ref)); await delBatch.commit();
    for (let i=0;i<contacts.length;i+=500) {
      const batch=db.batch();
      contacts.slice(i,i+500).forEach(c=>batch.set(db.collection(CONTACTS).doc(),{...c,createdAt:TS()}));
      await batch.commit();
    }
    res.json({saved:contacts.length});
  } catch(e){ res.status(500).json({error:e.message}); }
});
app.delete("/api/contacts", async (req, res) => {
  try { const snap=await db.collection(CONTACTS).get(); const b=db.batch(); snap.docs.forEach(d=>b.delete(d.ref)); await b.commit(); res.json({deleted:snap.size}); }
  catch(e){ res.status(500).json({error:e.message}); }
});

// ── RESULTS ───────────────────────────────────────────────────────────────────
app.get("/api/results", async (req, res) => {
  try {
    let q = db.collection(RESULTS).orderBy("completedAt","desc");
    if (req.query.campaignId) q = q.where("campaignId","==",req.query.campaignId);
    const snap = await q.get();
    res.json(snap.docs.map(d=>({id:d.id,...d.data()})));
  } catch(e){ res.status(500).json({error:e.message}); }
});
app.post("/api/results", async (req, res) => {
  try {
    const data = req.body;
    const ref  = data.id ? db.collection(RESULTS).doc(String(data.id)) : db.collection(RESULTS).doc();
    await ref.set({...data, completedAt:TS()},{merge:true});
    res.json({id:ref.id,ok:true});
  } catch(e){ res.status(500).json({error:e.message}); }
});
app.delete("/api/results", async (req, res) => {
  try { const snap=await db.collection(RESULTS).get(); const b=db.batch(); snap.docs.forEach(d=>b.delete(d.ref)); await b.commit(); res.json({deleted:snap.size}); }
  catch(e){ res.status(500).json({error:e.message}); }
});

// ═════════════════════════════════════════════════════════════════════════════
// SEND PRE-CALL SMS — warns recipient so they don't ignore the unknown number
// Only fires when SEND_PRECALL_SMS=true in .env
// ═════════════════════════════════════════════════════════════════════════════
async function sendPreCallSms(toE164, name, callerDisplay) {
  if (process.env.SEND_PRECALL_SMS !== "true") return;
  const sid   = process.env.TWILIO_SID;
  const token = process.env.TWILIO_TOKEN;
  const from  = process.env.TWILIO_SMS_FROM || process.env.TWILIO_CALLER_ID;
  if (!sid || !token || !from) return;

  const firstName = (name || "").split(" ")[0] || "அன்பரே";
  const msg = `வணக்கம் ${firstName}! தமிழ்நாடு அரசின் கருத்துகணிப்பு AI அழைப்பு ${callerDisplay || "இந்த எண்ணிலிருந்து"} சிறிது நேரத்தில் வரும். தயவுசெய்து அழைப்பை ஏற்றுக்கொள்ளுங்கள். (Govt survey call incoming — please attend)`;

  try {
    const form = new FormData();
    form.append("To",   toE164);
    form.append("From", from);
    form.append("Body", msg);
    await axios.post(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      form,
      { auth: { username: sid, password: token }, headers: form.getHeaders(), timeout: 10000 }
    );
    console.log(`[SMS] Pre-call SMS sent to ${toE164}`);
  } catch (e) {
    console.warn(`[SMS] Failed to send pre-call SMS: ${e.response?.data?.message || e.message}`);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// INITIATE CALL
// ═════════════════════════════════════════════════════════════════════════════
app.post("/api/calls/initiate", async (req, res) => {
  const { to, name, district, village, groupName,
          greeting, question, context, campaignId,
          elevenLabsKey, elevenLabsVoiceId, whisperKey, geminiKey } = req.body;

  if (!to) return res.status(400).json({error:"Phone number required"});

  // ── Telephony credentials always come from env vars (never from frontend) ──
  const provider  = (process.env.TELEPHONY_PROVIDER || "exotel").toLowerCase();
  const sid       = provider === "twilio" ? process.env.TWILIO_SID
                  : provider === "plivo"  ? process.env.PLIVO_AUTH_ID
                  : process.env.EXOTEL_SID;
  const token     = provider === "twilio" ? process.env.TWILIO_TOKEN
                  : provider === "plivo"  ? process.env.PLIVO_AUTH_TOKEN
                  : process.env.EXOTEL_TOKEN;
  const callerId  = provider === "twilio" ? process.env.TWILIO_CALLER_ID
                  : provider === "plivo"  ? process.env.PLIVO_CALLER_ID
                  : process.env.EXOTEL_CALLER_ID;

  console.log(`[Telephony] Provider: ${provider} | SID: ${sid} | CallerID: ${callerId}`);
  if (!sid||!token||!callerId) return res.status(400).json({error:`${provider} credentials missing in .env`});

  try {
    const elKey   = elevenLabsKey    || process.env.ELEVENLABS_KEY;
    const elVoice = elevenLabsVoiceId || process.env.ELEVENLABS_VOICE_ID;

    // Personalise greeting with the contact's name
    // e.g. "வணக்கம்!" → "வணக்கம் Karthik அவர்களே!"
    const firstName = (name || "").split(" ")[0].trim();
    const personalGreeting = greeting
      ? (firstName ? `வணக்கம் ${firstName} அவர்களே! ${greeting}` : greeting)
      : (firstName ? `வணக்கம் ${firstName} அவர்களே!` : "வணக்கம்!");

    // Pre-generate greeting audio with personalised text
    const greetingAudioUrl = await generateAudio(personalGreeting, elKey, elVoice);

    // Log context size so we can confirm FAQ is being passed
    const ctxSize = (context || "").length;
    console.log(`[Initiate] context/FAQ size: ${ctxSize} chars for campaign ${campaignId}`);
    if (ctxSize === 0) console.warn("[Initiate] WARNING: No context/FAQ provided — agent will not answer questions!");

    const tempId   = `tmp_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
    const callData = {
      callSid: tempId, to, name, district, village, groupName,
      greeting: personalGreeting, question, context: context || "",
      campaignId, greetingAudioUrl,
      elevenLabsKey: elKey   || "",
      elevenLabsVoiceId: elVoice || "",
      whisperKey: whisperKey || process.env.WHISPER_KEY || "",
      geminiKey:  geminiKey  || process.env.GEMINI_KEY  || "",
      // Conversation state
      turns: [],          // [{ai, user, audioUrl}]
      turnCount: 0,
      maxTurns: 3,        // max back-and-forth turns
      silenceCount: 0,    // consecutive silent turns
      retryCount: 0,      // empty-transcript retries (max 1)
      status: "initiated",
      startTime: Date.now(),
    };
    await saveCall(tempId, callData);

    // Format number per provider
    // Exotel: 0XXXXXXXXXX  |  Twilio/Plivo: +91XXXXXXXXXX (E.164)
    const digits = to.replace(/\D/g, "");
    const normalised10 = digits.length === 10 ? digits
      : digits.length === 11 && digits.startsWith("0") ? digits.slice(1)
      : digits.length === 12 && digits.startsWith("91") ? digits.slice(2)
      : digits.length === 13 && digits.startsWith("091") ? digits.slice(3)
      : digits;
    const formattedTo = (provider === "twilio" || provider === "plivo")
      ? `+91${normalised10}` : `0${normalised10}`;
    console.log(`[Telephony] Calling ${to} → formatted as ${formattedTo}`);

    // Send pre-call SMS if enabled — gives recipient a heads-up about the unknown number
    const callerDisplay = callerId.startsWith("+1") ? "an international number (TN Govt survey)" : callerId;
    await sendPreCallSms(formattedTo, name, callerDisplay);
    if (process.env.SEND_PRECALL_SMS === "true") {
      console.log(`[SMS] Waiting 15s after SMS before dialling...`);
      await new Promise(r => setTimeout(r, 15000)); // give them time to read the SMS
    }

    const callResult = await placeOutboundCall({
      to: formattedTo, callerId, sid, token,
      appUrl:      `${process.env.PUBLIC_URL}/exotel/app?tempId=${tempId}`,
      statusUrl:   `${process.env.PUBLIC_URL}/api/exotel/status?tempId=${tempId}`,
      customField: tempId,
    });

    const realSid = callResult?.Sid || tempId;
    if (realSid !== tempId) {
      await saveCall(realSid, {...callData, callSid:realSid});
      await db.collection(CALLS).doc(tempId).delete();
    }

    console.log(`[Exotel] Call ${realSid} → ${to} (${name}, ${village})`);
    res.json({callSid:realSid, status:"initiated", greetingAudioUrl});
  } catch(err) {
    const httpStatus = err.response?.status;
    const body       = err.response?.data;
    const exoMsg     = body?.RestException?.Message || body?.message || err.message;
    const exoCode    = body?.RestException?.Code    || "";
    const hint =
      httpStatus === 401 ? "401 Unauthorized — check your Exotel Account SID and API Token (not account password)" :
      httpStatus === 400 ? "400 Bad Request — check the phone number format and virtual number" :
      httpStatus === 403 ? "403 Forbidden — your Exotel account may not have outbound calling enabled" :
      httpStatus === 404 ? "404 Not Found — Account SID may be wrong" : "";
    const fullMsg = [exoCode && `Code ${exoCode}`, exoMsg, hint].filter(Boolean).join(" | ");
    console.error("[Exotel] Call failed: HTTP %d | %s", httpStatus, fullMsg);
    res.status(500).json({ error: fullMsg, httpStatus, exoCode, hint });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// EXOTEL/APP — ExoML served when call first connects
// Plays greeting + asks the survey question + starts recording
// ═════════════════════════════════════════════════════════════════════════════
app.all("/exotel/app", async (req, res) => {
  const tempId  = req.query.tempId || req.body.CustomField;
  // Twilio sends CallSid in body; Exotel sends CallSid in body too
  const callSid = req.body.CallSid || req.body.callsid || tempId;

  console.log(`[App] Webhook received | tempId: ${tempId} | callSid: ${callSid}`);
  console.log(`[App] Body keys: ${Object.keys(req.body).join(", ")}`);

  // Migrate call data from tempId → real callSid
  let callData = await getCall(callSid);
  if (!callData && tempId && tempId !== callSid) {
    console.log(`[App] callSid not found, trying tempId: ${tempId}`);
    const tmp = await getCall(tempId);
    if (tmp) {
      await saveCall(callSid, {...tmp, callSid});
      await db.collection(CALLS).doc(tempId).delete().catch(()=>{});
      callData = {...tmp, callSid};
      console.log(`[App] Migrated call data: ${tempId} → ${callSid}`);
    }
  }
  if (!callData) {
    console.error(`[App] No call data found for callSid=${callSid} tempId=${tempId}`);
    callData = {};
  }
  await updateCall(callSid, {status:"answered"});

  const elKey       = callData.elevenLabsKey;
  const elVoice     = callData.elevenLabsVoiceId;
  const greeting    = callData.greeting  || "வணக்கம்!";
  const question    = callData.question  || "உங்கள் கருத்தை சொல்லுங்கள்.";
  const instruction = "உங்கள் கருத்தை சொல்லுங்கள். பேசி முடித்தவுடன் நிறுத்துங்கள்.";

  // Generate audio for question (greeting was pre-generated during initiate)
  const greetingAudio = callData.greetingAudioUrl;
  const questionAudio = await generateAudio(question, elKey, elVoice);

  const turnUrl = `${process.env.PUBLIC_URL}/api/exotel/turn?callSid=${callSid}&amp;turn=0`;

  const provider = (process.env.TELEPHONY_PROVIDER || "exotel").toLowerCase();
  const isTwilio  = provider === "twilio";

  // Twilio TwiML uses <Play> and <Say> without voice/language attrs for basic use
  // Exotel ExoML uses <Say voice="male" language="ta-IN">
  // Both support <Play> for audio URLs and <Record> identically
  const sayTag = (text) => isTwilio
    ? `<Say language="ta-IN">${escapeXml(text)}</Say>`
    : sayXml(text);

  // Use global playOrSayXml helper

  // For Twilio: if audio URL is on the same ngrok host, use <Say> instead of <Play>
  // Twilio fetching audio from ngrok can fail silently — <Say> is more reliable for testing
  const useNativeSay = isTwilio && (process.env.FORCE_SAY === "true" || !greetingAudio);
  const greetingXml  = (isTwilio && greetingAudio)  ? `<Play>${greetingAudio}</Play>`  : sayXml(greeting);
  const questionXml  = (isTwilio && questionAudio)  ? `<Play>${questionAudio}</Play>`  : sayXml(question);

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${greetingXml}
  <Pause length="1"/>
  ${questionXml}
  ${sayXml(instruction)}
  <Record
    action="${turnUrl}"
    method="POST"
    maxLength="${TURN_MAX_LENGTH[0]}"
    finishOnKey="${isTwilio ? "" : "#"}"
    playBeep="true"
    timeout="2"
  />
</Response>`;

  console.log(`[${isTwilio?"TwiML":"ExoML"}] Served for ${callSid}`);
  console.log(`[${isTwilio?"TwiML":"ExoML"}] greetingAudio: ${greetingAudio || "none (using Say)"}`);
  console.log(`[${isTwilio?"TwiML":"ExoML"}] questionAudio: ${questionAudio || "none (using Say)"}`);
  console.log(`[${isTwilio?"TwiML":"ExoML"}] turnUrl: ${turnUrl}`);
  console.log(`[${isTwilio?"TwiML":"ExoML"}] Full TwiML:\n${twiml}`);
  res.type("text/xml").send(twiml);
});

// ═════════════════════════════════════════════════════════════════════════════
// /api/exotel/turn — the INTERACTIVE CONVERSATION LOOP
//
// Called by Exotel after every recording.
// 1. Download + transcribe recording (Whisper)
// 2. Feed to Gemini with full context + history → get reply
// 3. Generate reply audio (ElevenLabs)
// 4. If end=false → play reply + record next turn (loop)
// 5. If end=true  → play reply + thank you + hangup
// 6. Save full conversation to Firestore
// ═════════════════════════════════════════════════════════════════════════════
// ── In-memory store for processed AI replies (keyed by callSid+turn) ────────
const pendingReplies = new Map(); // key: "callSid:turn" → {twiml, ready}

// ── /api/exotel/reply — polled by Twilio <Redirect> until AI reply is ready ─
app.all("/api/exotel/reply", async (req, res) => {
  const callSid    = req.query.callSid;
  const turnNumber = parseInt(req.query.turn || "0", 10);
  const key        = `${callSid}:${turnNumber}`;
  const entry      = pendingReplies.get(key);

  if (entry?.ready) {
    pendingReplies.delete(key);
    return res.type("text/xml").send(entry.twiml);
  }

  // Not ready yet — check how long we've been waiting
  const waitedMs = entry ? (Date.now() - (entry.startedAt || Date.now())) : 0;
  if (waitedMs > 30000) {
    // Took too long — end gracefully
    pendingReplies.delete(key);
    return res.type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="ta-IN">மன்னிக்கவும், சிறிது தாமதம் ஏற்பட்டது. நன்றி. வணக்கம்!</Say>
  <Hangup/>
</Response>`);
  }

  // Not ready — use Gather to wait another 8s then check again
  const retryUrl = `${process.env.PUBLIC_URL}/api/exotel/reply?callSid=${encodeURIComponent(callSid)}&turn=${turnNumber}`;
  console.log(`[Reply] ${callSid} turn ${turnNumber} — not ready (${Math.round(waitedMs/1000)}s elapsed), waiting 8s more`);
  return res.type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather action="${retryUrl}" method="POST" timeout="8" numDigits="1">
    <Pause length="7"/>
  </Gather>
  <Redirect method="POST">${retryUrl}</Redirect>
</Response>`);
});

app.post("/api/exotel/turn", async (req, res) => {
  const callSid    = req.query.callSid;
  const turnNumber = parseInt(req.query.turn || "0", 10);
  const recordingUrl = req.body.RecordingUrl || req.body.recording_url || "";
  const recordingSid = req.body.RecordingSid || "";

  console.log(`[Turn ${turnNumber}] ${callSid} | recording: ${recordingUrl || "none"} | sid: ${recordingSid}`);

  const callData = await getCall(callSid);
  if (!callData) {
    console.error(`[Turn] No call data for ${callSid}`);
    return res.type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>`);
  }

  const { elevenLabsKey, elevenLabsVoiceId: elevenLabsVoiceIdPre } = callData;
  const isWaiting = req.query.waiting === "1";

  // ── Waiting poll: called by silence+Record chain while AI processes ───────
  // Check if pendingReplies has the AI reply ready. If yes, serve it.
  // If not, play another silence and chain another short Record.
  if (isWaiting) {
    const key   = `${callSid}:${turnNumber}`;
    const entry = pendingReplies.get(key);
    if (entry?.ready) {
      pendingReplies.delete(key);
      console.log(`[Wait] ${callSid} turn ${turnNumber} — AI reply ready, serving`);
      return res.type("text/xml").send(entry.twiml);
    }
    // Not ready yet — chain another silence recording
    const waitedMs = entry ? (Date.now() - (entry.startedAt || Date.now())) : 0;
    console.log(`[Wait] ${callSid} turn ${turnNumber} — not ready (${Math.round(waitedMs/1000)}s), chaining silence`);
    if (waitedMs > 30000) {
      // Timeout — end call gracefully
      pendingReplies.delete(key);
      return res.type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="ta-IN">மன்னிக்கவும், சிறிது தாமதம். நன்றி. வணக்கம்!</Say>
  <Hangup/>
</Response>`);
    }
    const waitUrl    = `${process.env.PUBLIC_URL}/api/exotel/turn?callSid=${encodeURIComponent(callSid)}&amp;turn=${turnNumber}&amp;waiting=1`;
    const silenceUrl = `${process.env.PUBLIC_URL}/hold_silence.mp3`;
    return res.type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Play>${silenceUrl}</Play>
  <Record
    action="${waitUrl}"
    method="POST"
    maxLength="5"
    finishOnKey=""
    timeout="4"
  />
</Response>`);
  }

  // ── Quick path: if no recording, respond immediately with retry prompt ────
  // This avoids the 20s Pause for cases where recording was empty
  if (!recordingUrl) {
    console.log(`[Turn ${turnNumber}] No recording URL — asking to speak`);
    const noAudioMsg = "மன்னிக்கவும், உங்கள் பதில் கேட்கவில்லை. தயவுசெய்து மீண்டும் பேசுங்கள்.";
    const noAudioXml = `<Say language="ta-IN">${escapeXml(noAudioMsg)}</Say>`;
    const retryUrl   = `${process.env.PUBLIC_URL}/api/exotel/turn?callSid=${encodeURIComponent(callSid)}&amp;turn=${turnNumber}`;
    return res.type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${noAudioXml}
  <Record action="${retryUrl}" method="POST" maxLength="30" finishOnKey="" playBeep="true" timeout="2"/>
</Response>`);
  }

  // ── Respond to Twilio IMMEDIATELY — must happen within 1s ────────────────
  // CRITICAL: No awaits before this send — Twilio times out at 15s
  // Strategy: Play silence for 20s (covers Whisper+Gemini+ElevenLabs time),
  // then <Redirect> to /api/exotel/reply to get the ready TwiML.
  const replyUrl = `${process.env.PUBLIC_URL}/api/exotel/reply?callSid=${encodeURIComponent(callSid)}&turn=${turnNumber}`;
  const key = `${callSid}:${turnNumber}`;
  pendingReplies.set(key, { ready: false, startedAt: Date.now() });

  // THE ONLY WORKING TWILIO PATTERN after <Record> action:
  // Play silence audio + chain a new <Record> pointing back to /turn?waiting=1
  // When that "waiting" record fires, check if AI reply is ready.
  // If ready → serve AI reply. If not → chain another silence recording.
  const waitUrl    = `${process.env.PUBLIC_URL}/api/exotel/turn?callSid=${encodeURIComponent(callSid)}&amp;turn=${turnNumber}&amp;waiting=1`;
  const silenceUrl = `${process.env.PUBLIC_URL}/hold_silence.mp3`;
  res.type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Play>${silenceUrl}</Play>
  <Record
    action="${waitUrl}"
    method="POST"
    maxLength="5"
    finishOnKey=""
    timeout="4"
  />
</Response>`);

  // ── Now process async (Whisper + Gemini + ElevenLabs) in background ──────
  (async () => {
  try {

  const { question, context, elevenLabsKey, elevenLabsVoiceId, whisperKey, geminiKey,
          name, turns = [], startTime } = callData;
  const maxTurns = MAX_TURNS;

  // ── Time budget guard — if we are already past 100s, close the call ────────
  const elapsedSec = startTime ? Math.floor((Date.now() - startTime) / 1000) : 0;
  const timeRemaining = CALL_MAX_SEC - elapsedSec;
  console.log(`[Turn ${turnNumber}] elapsed: ${elapsedSec}s / remaining: ${timeRemaining}s`);
  if (timeRemaining < 20) {
    // Not enough time left for another turn — wrap up immediately
    const fullTranscript = turns.map(t=>`User: ${t.user}\nAI: ${t.aiReply}`).join("\n");
    const sentiment = turns.length > 0
      ? await analyseFullConversation(turns, question, callData.context, geminiKey).catch(()=>"neutral")
      : "neutral";
    const callStatus = turns.length > 0 ? "completed" : "disconnected";
    await updateCall(callSid, { status: callStatus, sentiment, transcript: fullTranscript });
    await saveResult(callSid, { ...callData, turns, transcript: fullTranscript, sentiment, status: callStatus }).catch(()=>{});
    const timeoutMsg = "நேரம் முடிந்து விட்டது. நன்றி!";
    const timeoutAudio = await generateAudio(timeoutMsg, elevenLabsKey, elevenLabsVoiceId);
    pendingReplies.set(key, { ready: true, twiml: `<?xml version="1.0" encoding="UTF-8"?><Response>${timeoutAudio?`<Play>${timeoutAudio}</Play>`:sayXml(timeoutMsg)}<Hangup/></Response>` }); return;
  }

  // ── Step 1: Check recording duration — detect silence early ─────────────────
  // Exotel sends RecordingDuration (seconds). If 0 or very short and no URL,
  // the user said nothing — end the call immediately with a polite goodbye
  // rather than wasting time on Whisper + Gemini + waiting.
  const recDuration = parseInt(req.body.RecordingDuration || req.body.recording_duration || "0", 10);
  const silenceCount = callData.silenceCount || 0;

  const isSilent = !recordingUrl || recDuration === 0;

  if (isSilent) {
    const newSilenceCount = silenceCount + 1;
    console.log(`[Turn ${turnNumber}] Silence detected (count: ${newSilenceCount})`);

    if (newSilenceCount >= 2 || turnNumber === 0) {
      // First turn silence OR two consecutive silences → end the call now
      const goodbyeMsg = turnNumber === 0
        ? "வணக்கம்! உங்கள் நேரத்திற்கு நன்றி. தொடர்பு கொண்டதற்கு மிக்க நன்றி. வணக்கம்!"
        : "சரி, தொடர்ந்து பேச முடியவில்லை. உங்கள் நேரத்திற்கு நன்றி. வணக்கம்!";

      const goodbyeAudio = await generateAudio(goodbyeMsg, elevenLabsKey, elevenLabsVoiceId);
      const callStatus   = turns.length > 0 ? "completed" : "no-answer";
      const fullTx       = turns.map(t=>`User: ${t.user}\nAI: ${t.aiReply}`).join("\n");
      const sentiment    = turns.length > 0
        ? await analyseFullConversation(turns, question, callData.context, geminiKey).catch(()=>"neutral")
        : "none";

      await updateCall(callSid, { status: callStatus, sentiment, transcript: fullTx });
      await saveResult(callSid, { ...callData, turns, transcript: fullTx, sentiment, status: callStatus }).catch(()=>{});

      console.log(`[Turn ${turnNumber}] Exiting on silence → status: ${callStatus}`);
      pendingReplies.set(key, { ready: true, twiml: `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${goodbyeAudio ? `<Play>${goodbyeAudio}</Play>` : sayXml(goodbyeMsg)}
  <Hangup/>
</Response>` }); return;
    }

    // First silence on turn > 0 — give one more chance with a prompt
    const retryMsg   = "மன்னிக்கவும், நான் கேட்கவில்லை. உங்கள் கருத்தை சொல்லுங்கள்.";
    const retryAudio = await generateAudio(retryMsg, elevenLabsKey, elevenLabsVoiceId);
    const nextTurnUrl = `${process.env.PUBLIC_URL}/api/exotel/turn?callSid=${callSid}&amp;turn=${turnNumber + 1}`;
    await updateCall(callSid, { silenceCount: newSilenceCount });

    pendingReplies.set(key, { ready: true, twiml: `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${retryAudio ? `<Play>${retryAudio}</Play>` : sayXml(retryMsg)}
  <Pause length="1"/>
  <Record
    action="${nextTurnUrl}"
    method="POST"
    maxLength="${TURN_MAX_LENGTH[turnNumber + 1] || 15}"
    finishOnKey=""
    playBeep="true"
    timeout="2"
  />
</Response>` }); return;
  }

  // Reset silence counter since we have audio
  await updateCall(callSid, { silenceCount: 0 });

  // ── Step 2: Transcribe what user said ─────────────────────────────────────
  let userText = "";
  if (recordingUrl) {
    userText = await transcribeRecording(recordingUrl, whisperKey);
    console.log(`[Turn ${turnNumber}] User said: "${userText}"`);
  }

  // ── Keyword extraction — opinion words AND FAQ question words ─────────────
  // Whisper phone audio produces garbled Tamil+English. We extract the signal:
  // 1. If opinion keyword found → clean to clear opinion statement for Gemini
  // 2. If FAQ question keyword found → preserve original text (Gemini will answer from KB)
  // 3. If neither and too garbled → ask to repeat
  if (userText.trim()) {
    const supportWords = ["ஆதரிக்கிறேன்","ஆதரிக்கின்றேன்","ஆதரிக்கிறோம்","விரும்புகிறேன்",
                          "விரும்பிக்கிறேன்","விரும்பிக்கிறோம்","சம்மதம்","ஆமாம்",
                          "ஒப்புக்கொள்கிறேன்","நல்லது","வேண்டும்","உறும்பிக்கின்றேன்",
                          "ஆதரவு","ஆதரிப்பு","ஆதரிக்கின்றோம்","அதிடிக்கின்றேன்",
                          "விரும்புறேன்","விரும்புறோம்","வேணும்","சம்மதிக்கிறேன்",
                          "ஆதரிக்க","ஆமா","ஆதரிக்குறேன்","ஆதரிக்கிறார்கள்"];
    const opposeWords  = ["எதிர்க்கிறேன்","எதிர்க்கின்றேன்","வேண்டாம்","ஒப்புக்கொள்ளவில்லை",
                          "சம்மதமில்லை","ஆதரிக்கவில்லை","விரும்பவில்லை","கூடாது",
                          "எதிர்ப்பு","எதிர்க்குறேன்","வேண்டாண்டா"];
    // FAQ question words — if present, pass full text to Gemini to answer from KB
    // FAQ keywords — Tamil script + ALL Tanglish/Romanised variants Whisper produces
    const faqWords     = [
      // Tamil question words
      "என்ன","ஏன்","எப்படி","எப்போது","யார்","எங்கே","எங்க","என்னன்னு","என்னங்க","என்னா",
      // Benefits / details
      "பயன்கள்","பயன்","நன்மை","தீமை","கேள்வி","விளக்க","விளக்கம்","சொல்லுங்கள்","சொல்லு",
      "தெரியுமா","தெரியும்","புரியலை","புரியவில்லை","அர்த்தம்","விவரம்",
      // Topic words — Tamil
      "பட்டியல்","வெளியேற்றம்","வெளியேத்தம்","பட்டிய","எஸ்சி","ஓபிசி","இட ஒதுக்கீடு",
      // Tanglish — what Whisper produces when user speaks Tamil in English letters
      "pattiyal","pattial","pattiyel","pattiyil",
      "veliyetram","veliyettram","veliyetram","veliyeedram","veliyeetram","velietram",
      "veliyatram","veli yetram","veli etram",
      "payangal","payankal","payan","payanum","palanam","benefits",
      "yena","yenna","enna","yendral","endral","yennu","ennu","yenu",
      "sollunga","sollu","solunga","vilagam","vilagamum","vilagappadu",
      "oadukirathu","nadakkirathu","aagum","aavadu",
      "sc pattial","sc list","obc","reservation","aarakatchi","aarakkapu",
    ];

    const hasSupport = supportWords.some(w => userText.toLowerCase().includes(w));
    const hasOppose  = opposeWords.some(w => userText.toLowerCase().includes(w));

    // FAQ only triggers on TRUE question words — NOT topic words like பட்டியல்
    // Topic words appear in support statements too, so they must NOT trigger FAQ
    const questionOnlyWords = [
      "என்ன","ஏன்","எப்படி","எப்போது","யார்","எங்கே","என்னன்னு","என்னங்க","என்னா",
      "பயன்கள்","நன்மை","தீமை","கேள்வி","விளக்கம்","தெரியுமா","புரியவில்லை",
      "yena","yenna","enna","yendral","endral","yennu","ennu","yenu",
      "payangal","payankal","benefits","vilagam","vilagappadu",
      "yar","yaru","yen ","yepdi","eppadi",
      "korikkay","korikkai","nadakkiradhu","nadakkirathu","nilai","tharpotha",
    ];
    // hasFAQ only if a QUESTION word is present AND no clear opinion
    const hasFAQ = !hasSupport && !hasOppose &&
      questionOnlyWords.some(w => userText.toLowerCase().includes(w.toLowerCase()));

    if (hasSupport) {
      // Support wins — even if FAQ words present in same sentence
      const opinionSignal = "நான் இதை ஆதரிக்கிறேன்";
      console.log(`[Turn ${turnNumber}] Opinion → SUPPORT — passing cleaned signal`);
      userText = opinionSignal;
    } else if (hasOppose) {
      // Oppose wins
      const opinionSignal = "நான் இதை எதிர்க்கிறேன்";
      console.log(`[Turn ${turnNumber}] Opinion → OPPOSE — passing cleaned signal`);
      userText = opinionSignal;
    } else if (hasFAQ) {
      // FAQ question detected — keep original text so Gemini can answer from KB
      // But strip obvious garbage (long English words, URLs) to help Gemini
      // For FAQ questions asked in Tanglish, preserve ALL words
      // (the user is asking a question — every word matters for Gemini to understand)
      // Only strip obvious garbage: URLs, numbers, isolated symbols
      const cleaned = userText
        .replace(/https?:\/\/\S+/g, "")      // strip URLs
        .replace(/\b\d{5,}\b/g, "")           // strip long numbers
        .replace(/[\u0400-\u04FF\u0370-\u03FF\u3040-\u30FF]/g, "") // strip Cyrillic/Greek/Japanese
        .replace(/\s{2,}/g, " ")
        .trim();
      const finalText = cleaned.length > 5 ? cleaned : userText;
      // Build a clean Tamil question for Gemini to answer
      const geminiQuestion = `பின்வரும் கேள்விக்கு பதில் சொல்லுங்கள்: "${finalText}"`;
      console.log(`[Turn ${turnNumber}] FAQ detected — question: "${finalText.slice(0,80)}"`);
      userText = geminiQuestion;
    } else {
      // No signal — check if too garbled
      const tamilCharCount = (userText.match(/[\u0B80-\u0BFF]/g) || []).length;
      const totalChars = userText.replace(/\s/g, "").length;
      const tamilRatio = totalChars > 0 ? tamilCharCount / totalChars : 0;
      // Only reject if almost no Tamil at all (noise/silence)
      // Valid short Tamil words like "வணக்கம்" (7 chars) must pass through to Gemini
      if (tamilCharCount < 4 || (tamilRatio < 0.2 && tamilCharCount < 10)) {
        console.log(`[Turn ${turnNumber}] Garbled (${tamilCharCount} Tamil, ratio ${tamilRatio.toFixed(2)}) — asking to repeat`);
        userText = "";
      } else {
        console.log(`[Turn ${turnNumber}] Short/valid Tamil (${tamilCharCount} chars) — passing to Gemini`);
      }
    }
  }

  // Whisper returned empty — give user ONE retry with clear instructions
  // Track retries in callData so we don't loop forever
  if (!userText.trim()) {
    const retryCount = callData.retryCount || 0;

    if (retryCount === 0) {
      // First empty/garbled — ask them to repeat clearly
      console.log(`[Turn ${turnNumber}] Empty transcript — giving user retry with instructions`);
      await updateCall(callSid, { retryCount: 1 });

      const retryMsg   = "மன்னிக்கவும். தயவுசெய்து மெதுவாகவும் தெளிவாகவும் பேசுங்கள். உங்கள் கருத்தை சொல்லுங்கள்.";
      const retryAudio = await generateAudio(retryMsg, elevenLabsKey, elevenLabsVoiceId).catch(()=>null);
      const retryUrl   = `${process.env.PUBLIC_URL}/api/exotel/turn?callSid=${encodeURIComponent(callSid)}&amp;turn=${turnNumber}`;

      // Mark ready immediately — Twilio will pick this up at /reply after the Pause
      console.log(`[Turn ${turnNumber}] Retry TwiML ready — will serve at /reply`);
      pendingReplies.set(key, { ready: true, startedAt: Date.now(), twiml: `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${retryAudio ? `<Play>${retryAudio}</Play>` : `<Say language="ta-IN">${escapeXml(retryMsg)}</Say>`}
  <Pause length="1"/>
  <Record
    action="${retryUrl}"
    method="POST"
    maxLength="30"
    finishOnKey=""
    playBeep="true"
    timeout="2"
  />
</Response>` }); return;
    }

    // Second empty — give up gracefully
    const goodbyeMsg = "புரியவில்லை. உங்கள் நேரத்திற்கு நன்றி. வணக்கம்!";
    const callStatus = turns.length > 0 ? "completed" : "no-answer";
    const fullTx     = turns.map(t=>`User: ${t.user}\nAI: ${t.aiReply}`).join("\n");
    const [goodbyeAudio, sentiment] = await Promise.all([
      generateAudio(goodbyeMsg, elevenLabsKey, elevenLabsVoiceId),
      turns.length > 0
        ? analyseFullConversation(turns, question, callData.context, geminiKey).catch(()=>"neutral")
        : Promise.resolve("none"),
    ]);
    await updateCall(callSid, { status: callStatus, sentiment, transcript: fullTx });
    await saveResult(callSid, { ...callData, turns, transcript: fullTx, sentiment, status: callStatus }).catch(()=>{});
    console.log(`[Turn ${turnNumber}] Second empty transcript — hanging up`);
    pendingReplies.set(key, { ready: true, twiml: `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${goodbyeAudio ? `<Play>${goodbyeAudio}</Play>` : sayXml(goodbyeMsg)}
  <Hangup/>
</Response>` }); return;
  }

  // ── Step 2+3: AI reply + ElevenLabs TTS — run IN PARALLEL to save 2-4s ─────
  // geminiConversationTurn and generateAudio are independent until we have the reply text,
  // so we fire the AI first, then as soon as we have the reply text we immediately
  // kick off ElevenLabs — the key trick is to NOT await AI before starting TTS.
  const aiResult = await geminiConversationTurn({
    userText,
    surveyQuestion: question,
    context,
    history:        turns,
    geminiKey,
    contactName:    name,
  });
  const { reply, end, sentiment } = aiResult;
  console.log(`[Turn ${turnNumber}] AI → "${reply.slice(0,60)}…" | end: ${end}`);

  // Start TTS immediately after AI text arrives — don't wait for Firestore writes
  const replyAudioUrl = await generateAudio(reply, elevenLabsKey, elevenLabsVoiceId);

  // ── Step 4: Save this turn to Firestore ───────────────────────────────────
  const updatedTurns = [...turns, {
    turn:        turnNumber,
    ai:          turns.length === 0 ? question : (turns[turns.length-1]?.aiReply || ""),
    user:        userText,
    aiReply:     reply,
    audioUrl:    replyAudioUrl,      // AI reply audio (ElevenLabs)
    userAudioUrl: recordingUrl || "" // User's voice recording (Twilio/Plivo/Exotel)
  }];
  await updateCall(callSid, { turns: updatedTurns, turnCount: turnNumber + 1 });

  // ── Step 5: Should we end the call? ──────────────────────────────────────
  const shouldEnd = end || (turnNumber + 1) >= maxTurns;

  if (shouldEnd) {
    const thankYou       = "உங்கள் மதிப்புமிக்க கருத்துக்கு மிக்க நன்றி. வணக்கம்!";
    const fullTranscript = updatedTurns.map(t=>`User: ${t.user}\nAI: ${t.aiReply}`).join("\n");

    // Run sentiment analysis + thank-you TTS in parallel — saves ~2-3s
    const [finalSentiment, thankAudio] = await Promise.all([
      analyseFullConversation(updatedTurns, question, context, geminiKey).catch(()=>"neutral"),
      generateAudio(thankYou, elevenLabsKey, elevenLabsVoiceId),
    ]);

    // Fire-and-forget Firestore writes — don't block the HTTP response
    updateCall(callSid, { status: "completed", sentiment: finalSentiment, transcript: fullTranscript }).catch(()=>{});
    saveResult(callSid, { ...callData, turns: updatedTurns, transcript: fullTranscript, sentiment: finalSentiment, status: "completed" }).catch(()=>{});

    console.log(`[Turn ${turnNumber}] Call ended | sentiment: ${finalSentiment}`);

    const forceSayEnd = process.env.FORCE_SAY === "true";
    const endProvider  = (process.env.TELEPHONY_PROVIDER||"exotel").toLowerCase() === "twilio";
    const endReplyXml = (endProvider && replyAudioUrl && !forceSayEnd)
      ? `<Play>${replyAudioUrl}</Play>`
      : `<Say language="ta-IN">${escapeXml(reply)}</Say>`;
    const endThankXml = (endProvider && thankAudio && !forceSayEnd)
      ? `<Play>${thankAudio}</Play>`
      : `<Say language="ta-IN">${escapeXml(thankYou)}</Say>`;

    // Store end TwiML in pendingReplies for Twilio to pick up via /api/exotel/reply
    pendingReplies.set(key, { ready: true, twiml: `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${endReplyXml}
  <Pause length="1"/>
  ${endThankXml}
  <Hangup/>
</Response>` });
    return;
  }

  // ── Step 6: Continue conversation — play reply + record next turn ─────────
  const nextTurnUrl = `${process.env.PUBLIC_URL}/api/exotel/turn?callSid=${encodeURIComponent(callSid)}&amp;turn=${turnNumber + 1}`;
  const isTwilioProvider = (process.env.TELEPHONY_PROVIDER||"exotel").toLowerCase() === "twilio";
  const promptText = "உங்கள் பதிலை சொல்லுங்கள்.";

  // For Twilio: use <Say> if FORCE_SAY=true (avoids ngrok audio fetch issues during testing)
  const forceSay = process.env.FORCE_SAY === "true";
  const replyXml = (isTwilioProvider && replyAudioUrl && !forceSay)
    ? `<Play>${replyAudioUrl}</Play>`
    : `<Say language="ta-IN">${escapeXml(reply)}</Say>`;

  // Store continue TwiML in pendingReplies for Twilio to pick up
  pendingReplies.set(key, { ready: true, twiml: `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${replyXml}
  <Pause length="1"/>
  <Say language="ta-IN">${escapeXml(promptText)}</Say>
  <Record
    action="${nextTurnUrl}"
    method="POST"
    maxLength="${TURN_MAX_LENGTH[turnNumber + 1] || 20}"
    finishOnKey=""
    playBeep="true"
    timeout="2"
  />
</Response>` });

  } catch (err) {
    console.error(`[Turn ${turnNumber}] Async processing error:`, err.message);
    // Store error fallback TwiML so the call ends gracefully
    pendingReplies.set(key, { ready: true, twiml: `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="ta-IN">மன்னிக்கவும், தொழில்நுட்ப சிக்கல் ஏற்பட்டது. நன்றி.</Say>
  <Hangup/>
</Response>` });
  }
  })(); // end async IIFE
});

// ═════════════════════════════════════════════════════════════════════════════
// RETRY ENGINE
// Retries once for: not-reachable (failed/canceled) and disconnected (abrupt)
// Waits 30s before retrying so the network can recover.
// Max 1 retry — tracked via retryCount on callData.
// ═════════════════════════════════════════════════════════════════════════════
const RETRY_DELAY_MS      = 30_000;   // 30 second wait before retry
const RETRY_STATUSES      = ["not-reachable", "disconnected"];
const MAX_RETRIES         = 1;

async function scheduleRetry(originalCallSid, callData) {
  if ((callData.retryCount || 0) >= MAX_RETRIES) {
    console.log(`[Retry] ${originalCallSid} — max retries reached, skipping`);
    return;
  }

  console.log(`[Retry] Scheduling retry for ${originalCallSid} in ${RETRY_DELAY_MS / 1000}s`);

  setTimeout(async () => {
    try {
      const sid      = callData.elevenLabsSid || process.env.EXOTEL_SID;
      const token    = callData.elevenLabsToken || process.env.EXOTEL_TOKEN;

      // Re-read settings from Firestore (in case they changed)
      const settingsDoc = await db.collection("settings").doc("app").get();
      const settings    = settingsDoc.exists ? settingsDoc.data() : {};

      const exotelSid      = settings.exotelSid      || process.env.EXOTEL_SID;
      const exotelToken    = settings.exotelToken    || process.env.EXOTEL_TOKEN;
      const exotelCallerId = settings.exotelCallerId || process.env.EXOTEL_CALLER_ID;

      if (!exotelSid || !exotelToken || !exotelCallerId) {
        console.error("[Retry] Missing Exotel credentials — aborting retry");
        return;
      }

      const tempId   = `retry_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
      const retryData = {
        ...callData,
        callSid:      tempId,
        status:       "initiated",
        turns:        [],
        turnCount:    0,
        silenceCount: 0,
        startTime:    Date.now(),
        retryCount:   (callData.retryCount || 0) + 1,
        originalCallSid,
        isRetry:      true,
      };
      await saveCall(tempId, retryData);

      const to       = callData.to || "";
      const exoTo    = to.startsWith("+91") ? "0"+to.slice(3)
        : to.startsWith("91") && to.length===12 ? "0"+to.slice(2) : to;

      const callResult = await placeOutboundCall({
        to:        exoTo,
        callerId:  exotelCallerId,
        sid:       exotelSid,
        token:     exotelToken,
        appUrl:    `${process.env.PUBLIC_URL}/exotel/app?tempId=${tempId}`,
        statusUrl: `${process.env.PUBLIC_URL}/api/exotel/status?tempId=${tempId}`,
        customField: tempId,
      });

      const realSid = callResult?.Sid || tempId;
      if (realSid !== tempId) {
        await saveCall(realSid, { ...retryData, callSid: realSid });
        await db.collection(CALLS).doc(tempId).delete();
      }

      console.log(`[Retry] ✓ Retry call ${realSid} → ${to} (original: ${originalCallSid})`);
    } catch (err) {
      console.error("[Retry] Failed to place retry call:", err.message);
    }
  }, RETRY_DELAY_MS);
}

// ═════════════════════════════════════════════════════════════════════════════
// STATUS WEBHOOK — terminal call status from Exotel
// ═════════════════════════════════════════════════════════════════════════════
app.post("/api/exotel/status", async (req, res) => {
  const { tempId } = req.query;
  const callSid    = req.body.CallSid || tempId;
  const rawStatus  = req.body.Status  || req.body.CallStatus || "";
  const duration   = parseInt(req.body.Duration || "0", 10);

  const callData   = await getCall(callSid).catch(()=>null);
  const hasTurns   = (callData?.turns?.length || 0) > 0;
  const mappedStatus = mapCallStatus(rawStatus, hasTurns);

  // For Twilio: if call duration is very short (<5s) and status=completed with no turns,
  // it likely means Twilio finished playing audio and the Record action hasn't fired yet.
  // Log it but don't immediately mark as no-answer — the turn webhook may still come.
  console.log(`[Status] ${callSid}: raw="${rawStatus}" → "${mappedStatus}" | ${duration}s | turns: ${callData?.turns?.length || 0} | callStatus in DB: ${callData?.status}`);

  const durationStr = duration
    ? `${Math.floor(duration/60)}:${String(duration%60).padStart(2,"0")}`
    : "0:00";

  console.log(`[Status] ${callSid}: raw="${rawStatus}" → "${mappedStatus}" | ${duration}s | turns: ${callData?.turns?.length || 0}`);

  const update = {
    callStatus:    rawStatus,
    status:        mappedStatus,
    callStatusRaw: rawStatus,
    duration:      durationStr,
  };

  // ── Handle terminal statuses ──────────────────────────────────────────────
  const terminalStatuses = ["completed","no-answer","failed","busy","canceled"];
  if (terminalStatuses.includes(rawStatus.toLowerCase())) {

    // If status=completed but turns=0, the async AI processing may still be running.
    // With Whisper+Gemini+ElevenLabs the total can be 15-25s.
    // Wait up to 30s in two stages before giving up.
    if (rawStatus.toLowerCase() === "completed" && !hasTurns && duration < 60) {
      // Check if there is a pending reply being processed right now
      const hasPending = [...pendingReplies.keys()].some(k => k.startsWith(callSid));
      const waitMsg = hasPending ? "AI processing in flight" : "turn may still arrive";
      console.log(`[Status] ${callSid}: turns=0 duration=${duration}s (${waitMsg}) — waiting up to 30s…`);

      // Poll every 5s for up to 30s
      for (let i = 0; i < 6; i++) {
        await new Promise(r => setTimeout(r, 5000));
        const refreshed = await getCall(callSid).catch(() => null);
        if ((refreshed?.turns?.length || 0) > 0) {
          console.log(`[Status] ${callSid}: turn arrived after ${(i+1)*5}s — skipping no-answer save`);
          return res.sendStatus(200);
        }
        // Also check if result was already saved by the turn handler
        const existingResult = await db.collection(RESULTS).doc(callSid).get().catch(()=>null);
        if (existingResult?.exists && existingResult.data()?.status === "completed") {
          console.log(`[Status] ${callSid}: result already saved by turn handler — skipping`);
          return res.sendStatus(200);
        }
      }
      console.log(`[Status] ${callSid}: still no turns after 30s — saving as no-answer`);
    }

    if (mappedStatus === "completed" && hasTurns && callData.status !== "completed") {
      // Call connected + had conversation but status webhook fired before /turn finished
      const fullTranscript = callData.turns.map(t=>`User: ${t.user}\nAI: ${t.aiReply}`).join("\n");
      const sentiment = await analyseFullConversation(
        callData.turns, callData.question, callData.context, callData.geminiKey
      ).catch(()=>"neutral");
      update.status     = "completed";
      update.transcript = fullTranscript;
      update.sentiment  = sentiment;
      await saveResult(callSid, {...callData, ...update, duration:durationStr}).catch(()=>{});

    } else if (mappedStatus !== "completed") {
      // Before saving no-answer, check if turn handler already saved a completed result
      const existingResult = await db.collection(RESULTS).doc(callSid).get().catch(()=>null);
      if (existingResult?.exists && existingResult.data()?.status === "completed") {
        console.log(`[Status] ${callSid}: completed result already exists — not overwriting with ${mappedStatus}`);
        return res.sendStatus(200);
      }
      // Call never answered or failed — save a result row so it appears in the UI
      const resultData = {
        ...(callData || {}),
        callSid,
        status:        mappedStatus,
        callStatusRaw: rawStatus,
        duration:      durationStr,
        turns:         [],
        transcript:    "",
        sentiment:     "none",
        time:          new Date().toLocaleTimeString(),
        completedAt:   new Date().toISOString(),
      };
      if (!resultData.name && tempId) resultData.name = tempId;
      await saveResult(callSid, resultData).catch(()=>{});
      console.log(`[Status] Saved non-answer result for ${callSid}: ${mappedStatus}`);

      // ── Trigger retry for not-reachable and disconnected-before-answer ──────
      if (callData && RETRY_STATUSES.includes(mappedStatus) && !callData.isRetry) {
        // Only retry if user never answered (no turns) for disconnected
        const shouldRetry = mappedStatus === "not-reachable" ||
          (mappedStatus === "disconnected" && !hasTurns);
        if (shouldRetry) {
          await updateCall(callSid, { retryScheduled: true });
          scheduleRetry(callSid, callData);   // fire-and-forget with 30s delay
          console.log(`[Status] Retry scheduled for ${callSid} (${mappedStatus})`);
        }
      }
    }
  }

  // ── Detect mid-call disconnect (user hung up with partial turns) ──────────
  if (rawStatus.toLowerCase() === "completed" && hasTurns && callData?.status !== "completed") {
    update.status = "disconnected";
    const fullTranscript = callData.turns.map(t=>`User: ${t.user}\nAI: ${t.aiReply}`).join("\n");
    const sentiment = await analyseFullConversation(
      callData.turns, callData.question, callData.context, callData.geminiKey
    ).catch(()=>"neutral");
    update.transcript = fullTranscript;
    update.sentiment  = sentiment;
    await saveResult(callSid, {...callData, ...update, duration:durationStr}).catch(()=>{});
    console.log(`[Status] Mid-call disconnect for ${callSid}`);
    // Note: mid-call disconnects (user WAS talking) are NOT retried —
    // user was reachable, they chose to hang up.
  }

  if (callSid) await updateCall(callSid, update).catch(()=>{});
  res.sendStatus(200);
});

// GET /api/calls/:callSid
app.get("/api/calls/:callSid", async (req, res) => {
  try {
    const d = await getCall(req.params.callSid);
    if (!d) return res.status(404).json({error:"Not found"});
    const { whisperKey, geminiKey, elevenLabsKey, ...safe } = d;
    res.json(safe);
  } catch(e){ res.status(500).json({error:e.message}); }
});

// ═════════════════════════════════════════════════════════════════════════════
// SETTINGS
// ═════════════════════════════════════════════════════════════════════════════
const SETTINGS_DOC = () => db.collection("settings").doc("app");
app.get("/api/settings", async (req, res) => {
  try { const doc=await SETTINGS_DOC().get(); res.json(doc.exists?doc.data():{}); }
  catch(e){ res.status(500).json({error:e.message}); }
});
app.post("/api/settings", async (req, res) => {
  try {
    const allowed=["exotelSid","exotelToken","exotelCallerId","backendUrl","elevenLabsKey","elevenLabsVoiceId","whisperKey","geminiKey","useSimulation"];
    const data={}; allowed.forEach(k=>{if(req.body[k]!==undefined)data[k]=req.body[k];});
    await SETTINGS_DOC().set({...data,updatedAt:TS()},{merge:true});
    res.json({ok:true});
  } catch(e){ res.status(500).json({error:e.message}); }
});

// ═════════════════════════════════════════════════════════════════════════════
// TTS PREVIEW
// ═════════════════════════════════════════════════════════════════════════════
app.post("/api/tts/preview", async (req, res) => {
  const { text, elevenLabsKey, elevenLabsVoiceId } = req.body;
  if (!text) return res.status(400).json({error:"text required"});
  try { res.json({audioUrl: await generateAudio(text, elevenLabsKey, elevenLabsVoiceId)}); }
  catch(e){ res.status(500).json({error:e.message}); }
});

// ═════════════════════════════════════════════════════════════════════════════
// HEALTH
// ═════════════════════════════════════════════════════════════════════════════
app.get("/api/health", async (req, res) => {
  try {
    const [calls,results,campaigns,contacts] = await Promise.all([
      db.collection(CALLS).count().get().then(s=>s.data().count),
      db.collection(RESULTS).count().get().then(s=>s.data().count),
      db.collection(CAMPAIGNS).count().get().then(s=>s.data().count),
      db.collection(CONTACTS).count().get().then(s=>s.data().count),
    ]);
    res.json({
      status:"ok", firestore:"✓ connected",
      mode: "interactive-conversation",
      db:{calls,results,campaigns,contacts},
      exotel:!!process.env.EXOTEL_SID, elevenLabs:!!process.env.ELEVENLABS_KEY,
      whisper:!!process.env.WHISPER_KEY, gemini:!!process.env.GEMINI_KEY,
      audioCache: fs.readdirSync(AUDIO_DIR).filter(f=>f.endsWith(".mp3")).length,
    });
  } catch(e){ res.status(500).json({status:"error",firestore:e.message}); }
});

// ═════════════════════════════════════════════════════════════════════════════
// RECORDING PROXY — streams user voice recordings to the browser
// Needed because Twilio/Plivo recording URLs require Basic Auth.
// Frontend calls: GET /api/recording/proxy?url=<encodedRecordingUrl>
// ═════════════════════════════════════════════════════════════════════════════
app.get("/api/recording/proxy", async (req, res) => {
  const rawUrl = req.query.url;
  if (!rawUrl) return res.status(400).json({ error: "url param required" });

  try {
    const url = decodeURIComponent(rawUrl);
    const fetchUrl = (url.includes("api.twilio.com") && !url.endsWith(".mp3"))
      ? url + ".mp3" : url;

    const opts = { responseType: "stream", timeout: 30000 };
    const provider = (process.env.TELEPHONY_PROVIDER || "exotel").toLowerCase();
    if ((provider === "twilio" || url.includes("api.twilio.com")) && process.env.TWILIO_SID) {
      opts.auth = { username: process.env.TWILIO_SID, password: process.env.TWILIO_TOKEN };
    } else if (provider === "plivo" && process.env.PLIVO_AUTH_ID) {
      opts.auth = { username: process.env.PLIVO_AUTH_ID, password: process.env.PLIVO_AUTH_TOKEN };
    }

    console.log(`[Proxy] Streaming recording: ${fetchUrl}`);
    const audioRes = await axios.get(fetchUrl, opts);
    res.setHeader("Content-Type", audioRes.headers["content-type"] || "audio/mpeg");
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.setHeader("Access-Control-Allow-Origin", "*");
    audioRes.data.pipe(res);
  } catch (e) {
    console.error("[Proxy] Failed:", e.response?.status, e.message);
    res.status(502).json({ error: "Could not fetch recording" });
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
app.listen(PORT, async () => {
  // Pre-cache "please wait" audio so first call does not pay ElevenLabs latency
  if (process.env.ELEVENLABS_KEY) {
    generateAudio(
      "ஒரு நிமிடம் தயவுசெய்து காத்திருங்கள்.",
      process.env.ELEVENLABS_KEY,
      process.env.ELEVENLABS_VOICE_ID || "pNInz6obpgDQGcFmaJgB"
    ).then(url => console.log("   Wait audio: pre-cached", url))
     .catch(() => console.log("   Wait audio: will generate on first call"));
  }
  const provider  = (process.env.TELEPHONY_PROVIDER || "exotel").toUpperCase();
  const publicUrl = process.env.PUBLIC_URL || "";
  const urlOk     = publicUrl && !publicUrl.includes("yourdomain");
  const twilioOk  = process.env.TWILIO_SID && process.env.TWILIO_TOKEN && process.env.TWILIO_CALLER_ID;
  const plivoOk   = process.env.PLIVO_AUTH_ID && process.env.PLIVO_AUTH_TOKEN && process.env.PLIVO_CALLER_ID;
  const exotelOk  = process.env.EXOTEL_SID && process.env.EXOTEL_TOKEN;
  const providerStatus = provider === "TWILIO" ? (twilioOk ? "✓" : "✗ TWILIO_SID/TOKEN/CALLER_ID missing")
                       : provider === "PLIVO"  ? (plivoOk  ? "✓" : "✗ PLIVO_AUTH_ID/AUTH_TOKEN/CALLER_ID missing")
                       : (exotelOk ? "✓" : "✗ EXOTEL_SID/TOKEN missing");

  console.log("\n🎙️  VoxPoll AI Backend :" + PORT);
  console.log("   Provider:   " + provider + " " + providerStatus);
  console.log("   ElevenLabs: " + (process.env.ELEVENLABS_KEY ? "✓" : "✗ missing"));
  console.log("   Whisper:    " + (process.env.WHISPER_KEY    ? "✓" : "✗ missing"));
  const hasGemini = !!process.env.GEMINI_KEY;
  const hasOR     = !!process.env.OPENROUTER_KEY;
  const aiLabel   = hasGemini
    ? "Gemini 1.5 Flash ✓ (free)" + (hasOR ? " + OpenRouter fallback ✓" : "")
    : hasOR ? "OpenRouter ✓ (add GEMINI_KEY for free tier)"
    : "✗ missing — set GEMINI_KEY free at aistudio.google.com";
  console.log("   AI (LLM):   " + aiLabel);
  console.log("   Public URL: " + (urlOk ? publicUrl : "⚠  NOT SET — webhook calls will fail!"));
  if (!urlOk) {
    console.log("\n   👉 Run: ngrok http " + PORT);
    console.log("      Then set PUBLIC_URL=https://xxxx.ngrok-free.app in .env and restart\n");
  }
});
