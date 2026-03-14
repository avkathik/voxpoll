import { useState, useRef, useEffect } from "react";

const API = import.meta.env.VITE_API_URL || "";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const DISTRICT_GREETINGS = {
  "Chennai":         "வணக்கம் சென்னை மக்களே! விசில் போடு!",
  "Madurai":         "வணக்கம் மண் மணம் மாறாத மதுரை மக்களே!",
  "Coimbatore":      "வணக்கம் கோவை மக்களே! தொழில் நகரின் குரல் கொடுங்கள்!",
  "Tiruchirappalli": "வணக்கம் திருச்சி மக்களே! உங்கள் கருத்து சொல்லுங்கள்!",
  "Salem":           "வணக்கம் சேலம் மக்களே! குரல் கொடுங்கள்!",
  "Tirunelveli":     "வணக்கம் நெல்லை மக்களே! அல்வா நகரின் கருத்து சொல்லுங்கள்!",
  "Erode":           "வணக்கம் ஈரோடு மக்களே! கருத்து சொல்லுங்கள்!",
  "Vellore":         "வணக்கம் வேலூர் மக்களே! கோட்டை நகரின் குரல் கொடுங்கள்!",
  "Thoothukudi":     "வணக்கம் துத்துக்குடி மக்களே! முத்து நகரின் கருத்து சொல்லுங்கள்!",
  "Dindigul":        "வணக்கம் திண்டுக்கல் மக்களே! கருத்து சொல்லுங்கள்!",
  "Thanjavur":       "வணக்கம் தஞ்சாவூர் மக்களே! கலை நகரின் குரல் கொடுங்கள்!",
  "Kanchipuram":     "வணக்கம் காஞ்சி மக்களே! பட்டு நகரின் கருத்து சொல்லுங்கள்!",
  "Namakkal":        "வணக்கம் நாமக்கல் மக்களே! குரல் கொடுங்கள்!",
  "Sivaganga":       "வணக்கம் சிவகங்கை மக்களே! வீர நாட்டின் கருத்து சொல்லுங்கள்!",
  "Ranipet":         "வணக்கம் ராணிப்பேட்டை மக்களே! குரல் கொடுங்கள்!",
};
const DEFAULT_GREETING = "வணக்கம் அன்பான நண்பரே! உங்கள் கருத்து மிகவும் முக்கியம்.";
const DISTRICTS = Object.keys(DISTRICT_GREETINGS);
const SC = { positive: "#22c55e", neutral: "#f59e0b", negative: "#ef4444" };

// Call status display config
const CALL_STATUS = {
  "completed":      { label:"✓ Completed",      color:"#22c55e", bg:"rgba(34,197,94,0.12)",   icon:"✓" },
  "no-answer":      { label:"📵 No Answer",      color:"#f59e0b", bg:"rgba(245,158,11,0.12)",  icon:"📵" },
  "disconnected":   { label:"⚡ Disconnected",   color:"#fb923c", bg:"rgba(251,146,60,0.12)",  icon:"⚡" },
  "not-reachable":  { label:"📴 Not Reachable",  color:"#ef4444", bg:"rgba(239,68,68,0.12)",   icon:"📴" },
  "call-busy":      { label:"🔴 Line Busy",      color:"#f43f5e", bg:"rgba(244,63,94,0.12)",   icon:"🔴" },
  "in-progress":    { label:"📞 In Progress",    color:"#38bdf8", bg:"rgba(56,189,248,0.12)",  icon:"📞" },
  "initiated":      { label:"📲 Dialing…",       color:"#818cf8", bg:"rgba(129,140,248,0.12)", icon:"📲" },
  "answered":       { label:"📞 Connected",      color:"#34d399", bg:"rgba(52,211,153,0.12)",  icon:"📞" },
  "retrying":       { label:"🔄 Retrying…",      color:"#a78bfa", bg:"rgba(167,139,250,0.12)", icon:"🔄" },
};
const getCallStatus = (r) => {
  if (r.status && CALL_STATUS[r.status]) return CALL_STATUS[r.status];
  if (r.status === "completed" || (r.turns?.length > 0 && r.sentiment !== "none"))
    return CALL_STATUS["completed"];
  return CALL_STATUS["no-answer"];
};
// Multi-turn conversation simulations (used when Simulation mode is on)
const MOCK_CONVERSATIONS = [
  { sentiment:"positive", turns:[
    { ai:"நமது மாநிலத்தில் கூடுதல் பெண்கள் விடுதி அமைக்க வேண்டுமா?", user:"Aamaam, romba avasiyam. Namma oorla safety illame irukku." },
    { ai:"Safety பற்றி கொஞ்சம் சொல்லுங்கள் — என்ன பிரச்சனை?", user:"Rathiri ponnum veliye poga bayama irukku. Hostel iruntha safe-a irukkum." },
    { ai:"நன்றி, உங்கள் கருத்தை நாங்கள் பதிவு செய்கிறோம்.", user:"Sarkaaru ivvalavu nallathu pannalaam." },
  ]},
  { sentiment:"positive", turns:[
    { ai:"நமது மாநிலத்தில் கூடுதல் பெண்கள் விடுதி அமைக்க வேண்டுமா?", user:"Nalla yoosanai. Padikka varum ponungalukku upayogamaaga irukkum." },
    { ai:"எந்த மாவட்டங்களில் விடுதி அதிகமாக தேவை என்று நினைக்கிறீர்கள்?", user:"Madurai, Coimbatore-la college romba irukku. Athukkaaga hostel vendum." },
  ]},
  { sentiment:"neutral", turns:[
    { ai:"நமது மாநிலத்தில் கூடுதல் பெண்கள் விடுதி அமைக்க வேண்டுமா?", user:"Sarkaarin theerpu sariya iruntha support pannuven. Ippoludhukku clear illa." },
    { ai:"என்ன தெளிவாக இருக்க வேண்டும் என்று கருதுகிறீர்கள்?", user:"Yosikanum. Athukku munnadi infrastructure fix pannunga." },
    { ai:"புரிகிறது. நிதி எங்கே சரியாக பயன்படுத்தப்பட வேண்டும் என்பது முக்கியம்.", user:"Aamaam, sariyaana planning vendum." },
  ]},
  { sentiment:"negative", turns:[
    { ai:"நமது மாநிலத்தில் கூடுதல் பெண்கள் விடுதி அமைக்க வேண்டுமா?", user:"Panam vastu selavagi poagum. Vera vishayathukku use pannunga." },
    { ai:"எந்த விஷயம் இப்போது அதிக முக்கியம் என்று கருதுகிறீர்கள்?", user:"Roads, schools, hospitals — basics fix pannunga munnaadi." },
  ]},
  { sentiment:"positive", turns:[
    { ai:"நமது மாநிலத்தில் கூடுதல் பெண்கள் விடுதி அமைக்க வேண்டுமா?", user:"Ennoda magal college padikka veliyooru pokiraa. Hostel safe-a irundha romba nalla irukkum." },
    { ai:"விடுதியில் என்ன வசதிகள் இருக்க வேண்டும் என்று நினைக்கிறீர்கள்?", user:"Security, clean rooms, wifi — ivvalavu iruntha போதும்." },
  ]},
  { sentiment:"neutral", turns:[
    { ai:"நமது மாநிலத்தில் கூடுதல் பெண்கள் விடுதி அமைக்க வேண்டுமா?", user:"Idea nalla irukku aana implementation-la konjam doubt irukku." },
    { ai:"என்ன doubt என்று சொல்லுங்கள் — நான் உதவ முயற்சிக்கிறேன்.", user:"Panam pochu but hostel build aagave maatenguthu — usual-a aagidum." },
  ]},
];
const GROUP_COLORS = ["#6366f1","#8b5cf6","#ec4899","#f59e0b","#22c55e","#06b6d4","#f97316","#a855f7","#14b8a6","#ef4444"];
const groupColor = name => GROUP_COLORS[[...( name||"")].reduce((a,c)=>a+c.charCodeAt(0),0) % GROUP_COLORS.length];

// ─── ICONS ────────────────────────────────────────────────────────────────────
const Ic = ({ d, s=18, c="currentColor" }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d={d}/></svg>
);
const P = {
  mic:      "M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3zM19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8",
  dash:     "M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z",
  contacts: "M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 7a4 4 0 100 8 4 4 0 000-8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75",
  campaign: "M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8",
  phone:    "M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81 19.79 19.79 0 010 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L4.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z",
  chart:    "M18 20V10M12 20V4M6 20v-6",
  settings: "M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z",
  logout:   "M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9",
  upload:   "M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12",
  edit:     "M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z",
  check:    "M20 6L9 17l-5-5",
  x:        "M18 6L6 18M6 6l12 12",
  plus:     "M12 5v14M5 12h14",
  play:     "M5 3l14 9-14 9V3z",
  trash:    "M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6",
  info:     "M12 16v-4M12 8h.01M22 12a10 10 0 11-20 0 10 10 0 0120 0z",
  eye:      "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 9a3 3 0 100 6 3 3 0 000-6z",
  eyeoff:   "M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24M1 1l22 22",
  village:  "M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2zM9 22V12h6v10",
  music:    "M9 18V5l12-2v13M9 9l12-2",
  wave:     "M2 12h2M6 8v8M10 6v12M14 9v6M18 7v10M22 12h-2",
  sparkle:  "M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3zM5 17l.75 2.25L8 20l-2.25.75L5 23l-.75-2.25L2 20l2.25-.75L5 17zM19 2l.75 2.25L22 5l-2.25.75L19 8l-.75-2.25L16 5l2.25-.75L19 2z",
  layers:   "M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5",
  volume:   "M11 5L6 9H2v6h4l5 4V5zM19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07",
  speaker:  "M3 18v-6a9 9 0 0118 0v6M21 19a2 2 0 01-2 2h-1a2 2 0 01-2-2v-3a2 2 0 012-2h3zM3 19a2 2 0 002 2h1a2 2 0 002-2v-3a2 2 0 00-2-2H3z",
  copy:     "M8 17.929H6c-1.105 0-2-.912-2-2.036V5.036C4 3.91 4.895 3 6 3h8c1.105 0 2 .911 2 2.036v1.866m-6 .17h8c1.105 0 2 .91 2 2.035v10.857C20 21.09 19.105 22 18 22h-8c-1.105 0-2-.911-2-2.036V9.107c0-1.124.895-2.036 2-2.036z",
  userplus: "M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 7a4 4 0 100 8 4 4 0 000-8zM19 8v6M22 11h-6",
};

// ─── SHARED STYLES ────────────────────────────────────────────────────────────
const card = { background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:16, padding:24 };
const inp  = { width:"100%", padding:"10px 13px", borderRadius:10, background:"rgba(255,255,255,0.07)", border:"1px solid rgba(255,255,255,0.12)", color:"#fff", fontSize:13, boxSizing:"border-box", outline:"none", fontFamily:"inherit" };
const btnP = { display:"flex", alignItems:"center", gap:7, padding:"10px 18px", borderRadius:10, border:"none", background:"linear-gradient(135deg,#6366f1,#8b5cf6)", color:"#fff", fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:"inherit" };
const btnG = { display:"flex", alignItems:"center", gap:6, padding:"9px 15px", borderRadius:10, background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.1)", color:"rgba(255,255,255,0.6)", fontSize:13, cursor:"pointer", fontFamily:"inherit" };
const lbl  = { display:"block", color:"rgba(255,255,255,0.4)", fontSize:11, fontWeight:600, letterSpacing:0.5, marginBottom:5, textTransform:"uppercase" };

// ─── DB API ───────────────────────────────────────────────────────────────────
const dbApi = {
  get:   path        => fetch(`${API}${path}`).then(r=>r.json()),
  post:  (path,body) => fetch(`${API}${path}`,{method:"POST",  headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}).then(r=>r.json()),
  patch: (path,body) => fetch(`${API}${path}`,{method:"PATCH", headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}).then(r=>r.json()),
  del:   path        => fetch(`${API}${path}`,{method:"DELETE"}).then(r=>r.json()),
};

// ─── GROUP BADGE ──────────────────────────────────────────────────────────────
function GroupBadge({ name, size="sm" }) {
  const c = groupColor(name||"");
  return (
    <span style={{display:"inline-flex",alignItems:"center",gap:5,padding:size==="lg"?"6px 12px":"2px 9px",borderRadius:99,fontSize:size==="lg"?13:11,fontWeight:600,background:`${c}22`,border:`1px solid ${c}44`,color:c,whiteSpace:"nowrap"}}>
      <span style={{width:6,height:6,borderRadius:"50%",background:c,flexShrink:0}}/>{name}
    </span>
  );
}

// ─── STEP INDICATOR ───────────────────────────────────────────────────────────
function StepBar({ step, steps }) {
  return (
    <div style={{display:"flex",alignItems:"center",marginBottom:24}}>
      {steps.map((s,i) => {
        const n=i+1, done=step>n, active=step===n, c=done?"#22c55e":active?"#6366f1":"rgba(255,255,255,0.15)";
        return (
          <div key={s} style={{display:"flex",alignItems:"center",flex:i<steps.length-1?1:"auto"}}>
            <div style={{display:"flex",alignItems:"center",gap:7,flexShrink:0}}>
              <div style={{width:26,height:26,borderRadius:"50%",background:done?"#22c55e":active?"#6366f1":"rgba(255,255,255,0.06)",border:`2px solid ${c}`,display:"flex",alignItems:"center",justifyContent:"center"}}>
                {done?<Ic d={P.check} s={12} c="#fff"/>:<span style={{color:active?"#fff":"rgba(255,255,255,0.3)",fontSize:11,fontWeight:700}}>{n}</span>}
              </div>
              <span style={{color:active?"#fff":done?"#86efac":"rgba(255,255,255,0.3)",fontSize:12,fontWeight:active?600:400,whiteSpace:"nowrap"}}>{s}</span>
            </div>
            {i<steps.length-1&&<div style={{flex:1,height:1,background:"rgba(255,255,255,0.1)",margin:"0 10px"}}/>}
          </div>
        );
      })}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// LOGIN
// ═════════════════════════════════════════════════════════════════════════════
// ─── Auth helpers ────────────────────────────────────────────────────────────
// Simple SHA-256 hash (browser native)
async function sha256(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,"0")).join("");
}
// Seed default admin account on first run
async function seedAdminIfNeeded(db) {
  try {
    const res = await db.get("/api/users/admin");
    if (res && res.username) return; // already exists
  } catch(_) {}
  // Create default admin
  const hash = await sha256("Admin@2024!");
  await db.post("/api/users", {
    username: "admin", passwordHash: hash,
    role: "admin", createdBy: "system",
    createdAt: new Date().toISOString(), active: true,
  });
}

function Login({ onLogin }) {
  const [u,setU]=useState(""), [p,setP]=useState(""), [err,setErr]=useState(""), [busy,setBusy]=useState(false);
  const go = async () => {
    if (!u.trim() || !p.trim()) { setErr("Enter username and password"); return; }
    setBusy(true); setErr("");
    try {
      const hash = await sha256(p);
      const res  = await dbApi.post("/api/auth/login", { username: u.trim().toLowerCase(), passwordHash: hash });
      if (res.success) {
        onLogin(res.user);
      } else {
        setErr(res.error || "Invalid credentials");
      }
    } catch(e) {
      setErr("Cannot reach server. Check backend URL.");
    }
    setBusy(false);
  };
  return (
    <div style={{minHeight:"100vh",background:"#09090f",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{width:400,...card,borderRadius:24,padding:44}}>
        <div style={{textAlign:"center",marginBottom:32}}>
          <div style={{width:64,height:64,borderRadius:20,background:"linear-gradient(135deg,#6366f1,#8b5cf6)",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px",boxShadow:"0 8px 32px rgba(99,102,241,0.4)"}}><Ic d={P.mic} s={30} c="#fff"/></div>
          <h2 style={{color:"#fff",margin:"0 0 6px",fontSize:22,fontWeight:700}}>VoxPoll AI</h2>
          <p style={{color:"rgba(255,255,255,0.4)",margin:0,fontSize:13}}>Tamil Nadu Voice Survey Platform</p>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <div><label style={lbl}>Username</label><input style={inp} value={u} onChange={e=>setU(e.target.value)} placeholder="username" onKeyDown={e=>e.key==="Enter"&&go()}/></div>
          <div><label style={lbl}>Password</label><input style={inp} type="password" value={p} onChange={e=>setP(e.target.value)} onKeyDown={e=>e.key==="Enter"&&go()} placeholder="••••••••"/></div>
          {err&&<div style={{background:"rgba(239,68,68,0.12)",border:"1px solid rgba(239,68,68,0.3)",borderRadius:9,padding:"10px 14px",color:"#fca5a5",fontSize:13}}>{err}</div>}
          <button style={{...btnP,justifyContent:"center",padding:14,fontSize:15}} onClick={go} disabled={busy}>{busy?"Authenticating…":"Sign In →"}</button>
        </div>
        <p style={{textAlign:"center",color:"rgba(255,255,255,0.2)",fontSize:11,marginTop:18,marginBottom:0}}>Default admin: admin / Admin@2024!</p>
      </div>
    </div>
  );
}

// ─── User Management (Admin only) ────────────────────────────────────────────
function UserManagement({ currentUser, db }) {
  const [users,setUsers]       = useState([]);
  const [loading,setLoading]   = useState(true);
  const [showNew,setShowNew]   = useState(false);
  const [newU,setNewU]         = useState({ username:"", password:"", displayName:"", role:"support" });
  const [err,setErr]           = useState("");
  const [saving,setSaving]     = useState(false);
  const [changePw,setChangePw] = useState(null); // {username, pw}
  const [pwErr,setPwErr]       = useState("");

  const load = async () => {
    setLoading(true);
    try { setUsers(await db.get("/api/users")); } catch(e) { console.warn(e); }
    setLoading(false);
  };
  useEffect(()=>{ load(); },[]);

  const createUser = async () => {
    setErr("");
    if (!newU.username.trim()) { setErr("Username is required"); return; }
    if (newU.password.length < 6) { setErr("Password must be at least 6 characters"); return; }
    if (!/^[a-z0-9_.-]+$/i.test(newU.username.trim())) { setErr("Username: letters, numbers, _ . - only"); return; }
    setSaving(true);
    try {
      const hash = await sha256(newU.password);
      await db.post("/api/users", {
        username: newU.username.trim().toLowerCase(),
        passwordHash: hash,
        displayName: newU.displayName.trim() || newU.username.trim(),
        role: newU.role,
        createdBy: currentUser.username,
        createdAt: new Date().toISOString(),
        active: true,
      });
      setNewU({ username:"", password:"", displayName:"", role:"support" });
      setShowNew(false);
      await load();
    } catch(e) { setErr(e.message || "Failed to create user"); }
    setSaving(false);
  };

  const toggleActive = async (u) => {
    if (u.username === "admin") return;
    await db.post(`/api/users/${u.username}/toggle`, {});
    await load();
  };

  const deleteUser = async (u) => {
    if (u.username === "admin") return;
    if (!confirm(`Delete user "${u.username}"? This cannot be undone.`)) return;
    await db.del(`/api/users/${u.username}`);
    await load();
  };

  const changePassword = async () => {
    setPwErr("");
    if (!changePw.pw || changePw.pw.length < 6) { setPwErr("Min 6 characters"); return; }
    const hash = await sha256(changePw.pw);
    await db.post(`/api/users/${changePw.username}/password`, { passwordHash: hash });
    setChangePw(null);
    alert("Password updated.");
  };

  const roleColor = r => r==="admin" ? "#f59e0b" : "#6366f1";
  const roleBg    = r => r==="admin" ? "rgba(245,158,11,0.12)" : "rgba(99,102,241,0.12)";

  return (
    <div style={{padding:32,maxWidth:900}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24,flexWrap:"wrap",gap:12}}>
        <div>
          <h1 style={{color:"#fff",fontSize:22,fontWeight:700,margin:"0 0 4px"}}>User Management</h1>
          <p style={{color:"rgba(255,255,255,0.4)",fontSize:13,margin:0}}>Manage admin and support accounts</p>
        </div>
        <button style={{...btnP,gap:7}} onClick={()=>setShowNew(v=>!v)}>
          <Ic d={P.userplus} s={14}/>Create User
        </button>
      </div>

      {/* Create user form */}
      {showNew && (
        <div style={{...card,marginBottom:20,padding:24,border:"1px solid rgba(99,102,241,0.3)",background:"rgba(99,102,241,0.04)"}}>
          <h3 style={{color:"#fff",fontSize:15,fontWeight:600,margin:"0 0 16px"}}>New User</h3>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
            <div><label style={lbl}>Username *</label><input style={inp} value={newU.username} onChange={e=>setNewU(v=>({...v,username:e.target.value}))} placeholder="john_smith"/></div>
            <div><label style={lbl}>Display Name</label><input style={inp} value={newU.displayName} onChange={e=>setNewU(v=>({...v,displayName:e.target.value}))} placeholder="John Smith"/></div>
            <div><label style={lbl}>Password *</label><input style={inp} type="password" value={newU.password} onChange={e=>setNewU(v=>({...v,password:e.target.value}))} placeholder="min 6 characters"/></div>
            <div><label style={lbl}>Role</label>
              <select style={{...inp,cursor:"pointer"}} value={newU.role} onChange={e=>setNewU(v=>({...v,role:e.target.value}))}>
                <option value="support">Support</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          </div>
          {err&&<div style={{background:"rgba(239,68,68,0.12)",border:"1px solid rgba(239,68,68,0.3)",borderRadius:9,padding:"10px 14px",color:"#fca5a5",fontSize:13,marginBottom:12}}>{err}</div>}
          <div style={{display:"flex",gap:10}}>
            <button style={btnG} onClick={()=>{setShowNew(false);setErr("");}}>Cancel</button>
            <button style={btnP} onClick={createUser} disabled={saving}>{saving?"Creating…":"Create User"}</button>
          </div>
        </div>
      )}

      {/* Change password modal */}
      {changePw && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:999}}>
          <div style={{...card,padding:28,width:360,borderRadius:18}}>
            <h3 style={{color:"#fff",margin:"0 0 16px",fontSize:16}}>Change Password — {changePw.username}</h3>
            <input style={{...inp,marginBottom:10}} type="password" value={changePw.pw} onChange={e=>setChangePw(v=>({...v,pw:e.target.value}))} placeholder="New password (min 6 chars)" autoFocus/>
            {pwErr&&<div style={{color:"#fca5a5",fontSize:13,marginBottom:10}}>{pwErr}</div>}
            <div style={{display:"flex",gap:10}}>
              <button style={btnG} onClick={()=>setChangePw(null)}>Cancel</button>
              <button style={btnP} onClick={changePassword}>Update</button>
            </div>
          </div>
        </div>
      )}

      {loading
        ? <div style={{textAlign:"center",padding:40,color:"rgba(255,255,255,0.3)"}}>Loading users…</div>
        : <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {users.map(u=>(
              <div key={u.username} style={{...card,padding:"14px 20px",display:"flex",alignItems:"center",gap:14,flexWrap:"wrap",opacity:u.active===false?0.5:1}}>
                <div style={{width:38,height:38,borderRadius:"50%",background:roleBg(u.role),display:"flex",alignItems:"center",justifyContent:"center",color:roleColor(u.role),fontWeight:700,fontSize:15,flexShrink:0}}>
                  {(u.displayName||u.username||"?")[0].toUpperCase()}
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                    <span style={{color:"#fff",fontWeight:600,fontSize:14}}>{u.displayName||u.username}</span>
                    <span style={{color:"rgba(255,255,255,0.35)",fontSize:12,fontFamily:"monospace"}}>@{u.username}</span>
                    <span style={{padding:"2px 9px",borderRadius:99,fontSize:11,fontWeight:700,background:roleBg(u.role),color:roleColor(u.role),textTransform:"capitalize"}}>{u.role}</span>
                    {u.active===false&&<span style={{padding:"2px 9px",borderRadius:99,fontSize:11,background:"rgba(239,68,68,0.12)",color:"#fca5a5"}}>Disabled</span>}
                    {u.username===currentUser.username&&<span style={{padding:"2px 9px",borderRadius:99,fontSize:11,background:"rgba(34,197,94,0.1)",color:"#86efac"}}>You</span>}
                  </div>
                  <div style={{color:"rgba(255,255,255,0.3)",fontSize:11,marginTop:3}}>
                    Created by {u.createdBy||"system"} · {u.createdAt ? new Date(u.createdAt).toLocaleDateString("en-IN") : ""}
                  </div>
                </div>
                {u.username !== "admin" && (
                  <div style={{display:"flex",gap:8,flexShrink:0}}>
                    <button style={{...btnG,fontSize:12,padding:"5px 12px"}} onClick={()=>setChangePw({username:u.username,pw:""})}>
                      🔑 Password
                    </button>
                    <button style={{...btnG,fontSize:12,padding:"5px 12px",color:u.active===false?"#86efac":"#fbbf24",borderColor:u.active===false?"rgba(134,239,172,0.2)":"rgba(251,191,36,0.2)"}}
                      onClick={()=>toggleActive(u)}>
                      {u.active===false?"Enable":"Disable"}
                    </button>
                    <button style={{...btnG,fontSize:12,padding:"5px 12px",color:"#ef4444",borderColor:"rgba(239,68,68,0.2)"}}
                      onClick={()=>deleteUser(u)}>
                      <Ic d={P.trash} s={12}/>
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
      }
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// SIDEBAR
// ═════════════════════════════════════════════════════════════════════════════
function Sidebar({ page, setPage, onLogout, creds, contactGroups, currentUser }) {
  const isAdmin = currentUser?.role === "admin";
  const nav = [
    {id:"dashboard", label:"Dashboard",  icon:P.dash},
    {id:"contacts",  label:"Contacts",   icon:P.contacts},
    {id:"campaigns", label:"Campaigns",  icon:P.campaign},
    {id:"calls",     label:"Responses",  icon:P.phone},
    {id:"analytics", label:"Analytics",  icon:P.chart},
    ...(isAdmin ? [{id:"users", label:"Users", icon:P.userplus}] : []),
    {id:"settings",  label:"Settings",   icon:P.settings},
  ];
  const live = !creds.useSimulation && creds.exotelSid && creds.backendUrl;
  const badges = [
    {label: live?"Exotel Live":"Simulation",      color:live?"#22c55e":"#f59e0b", bg:live?"rgba(34,197,94,0.1)":"rgba(245,158,11,0.1)",   bdr:live?"rgba(34,197,94,0.25)":"rgba(245,158,11,0.25)"},
    {label: creds.elevenLabsKey?"ElevenLabs ✓":"ElevenLabs —", color:creds.elevenLabsKey?"#c084fc":"rgba(255,255,255,0.2)", bg:"rgba(168,85,247,0.07)", bdr:"rgba(168,85,247,0.15)"},
    {label: creds.whisperKey?"Whisper STT ✓":"Whisper STT —",  color:creds.whisperKey?"#38bdf8":"rgba(255,255,255,0.2)",   bg:"rgba(56,189,248,0.07)",  bdr:"rgba(56,189,248,0.15)"},
    {label: creds.geminiKey?"Gemini AI ✓":"Gemini AI —",       color:creds.geminiKey?"#4ade80":"rgba(255,255,255,0.2)",    bg:"rgba(74,222,128,0.07)",  bdr:"rgba(74,222,128,0.15)"},
  ];
  return (
    <div style={{width:232,minHeight:"100vh",background:"#0c0c18",borderRight:"1px solid rgba(255,255,255,0.06)",display:"flex",flexDirection:"column",flexShrink:0}}>
      <div style={{padding:"20px 14px 14px",borderBottom:"1px solid rgba(255,255,255,0.06)"}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
          <div style={{width:38,height:38,borderRadius:11,background:"linear-gradient(135deg,#6366f1,#8b5cf6)",display:"flex",alignItems:"center",justifyContent:"center"}}><Ic d={P.mic} s={19} c="#fff"/></div>
          <div><div style={{color:"#fff",fontWeight:700,fontSize:15}}>VoxPoll AI</div><div style={{color:"rgba(255,255,255,0.3)",fontSize:10}}>Tamil Nadu Survey</div></div>
        </div>
        {badges.map(b=>(
          <div key={b.label} style={{display:"flex",alignItems:"center",gap:6,padding:"4px 9px",borderRadius:7,marginBottom:4,background:b.bg,border:`1px solid ${b.bdr}`}}>
            <div style={{width:5,height:5,borderRadius:"50%",background:b.color,flexShrink:0}}/><span style={{color:b.color,fontSize:10,fontWeight:600}}>{b.label}</span>
          </div>
        ))}
        {contactGroups.length>0&&(
          <div style={{marginTop:8,padding:"8px 10px",borderRadius:9,background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.06)"}}>
            <div style={{color:"rgba(255,255,255,0.3)",fontSize:10,fontWeight:600,textTransform:"uppercase",letterSpacing:0.5,marginBottom:5}}>Groups</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
              {contactGroups.slice(0,5).map(g=><span key={g.name} style={{padding:"1px 7px",borderRadius:99,fontSize:10,fontWeight:600,background:`${groupColor(g.name)}22`,color:groupColor(g.name)}}>{g.name}</span>)}
              {contactGroups.length>5&&<span style={{color:"rgba(255,255,255,0.3)",fontSize:10}}>+{contactGroups.length-5}</span>}
            </div>
          </div>
        )}
      </div>
      <nav style={{flex:1,padding:"10px 8px"}}>
        {nav.map(n=>(
          <button key={n.id} onClick={()=>setPage(n.id)} style={{display:"flex",alignItems:"center",gap:10,width:"100%",padding:"10px 12px",borderRadius:9,marginBottom:2,border:"none",cursor:"pointer",fontSize:13,fontFamily:"inherit",textAlign:"left",background:page===n.id?"rgba(99,102,241,0.18)":"transparent",color:page===n.id?"#a5b4fc":"rgba(255,255,255,0.5)",fontWeight:page===n.id?600:400}}>
            <Ic d={n.icon} s={15}/>{n.label}
          </button>
        ))}
      </nav>
      <div style={{padding:"10px 8px",borderTop:"1px solid rgba(255,255,255,0.06)"}}>
        {/* Current user badge */}
        <div style={{padding:"9px 12px",borderRadius:9,marginBottom:6,background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.06)"}}>
          <div style={{display:"flex",alignItems:"center",gap:9}}>
            <div style={{width:28,height:28,borderRadius:"50%",background:currentUser?.role==="admin"?"rgba(245,158,11,0.2)":"rgba(99,102,241,0.2)",display:"flex",alignItems:"center",justifyContent:"center",color:currentUser?.role==="admin"?"#f59e0b":"#a5b4fc",fontWeight:700,fontSize:12,flexShrink:0}}>
              {(currentUser?.displayName||currentUser?.username||"U")[0].toUpperCase()}
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{color:"rgba(255,255,255,0.75)",fontSize:12,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{currentUser?.displayName||currentUser?.username}</div>
              <div style={{color:currentUser?.role==="admin"?"#f59e0b":"#818cf8",fontSize:10,fontWeight:600,textTransform:"capitalize"}}>{currentUser?.role}</div>
            </div>
          </div>
        </div>
        <button onClick={onLogout} style={{display:"flex",alignItems:"center",gap:9,width:"100%",padding:"9px 12px",borderRadius:9,border:"none",background:"transparent",color:"rgba(255,255,255,0.3)",cursor:"pointer",fontSize:13,fontFamily:"inherit"}}><Ic d={P.logout} s={14}/>Sign Out</button>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// CONTACTS PAGE — upload → name group → set village greetings
// ═════════════════════════════════════════════════════════════════════════════
function ContactsPage({ contacts, setContacts, db, currentUser }) {
  const fileRef = useRef();
  const [step,setStep]           = useState("list");
  const [drag,setDrag]           = useState(false);
  const [raw,setRaw]             = useState([]);
  const [vg,setVg]               = useState({});
  const [groupName,setGroupName] = useState("");
  const [groupErr,setGroupErr]   = useState("");
  const [editing,setEditing]     = useState(null);
  const [expanded,setExpanded]   = useState(null);
  const [saving,setSaving]       = useState(false);
  const [preview,setPreview]     = useState(null);

  const groups = [...new Map(contacts.filter(c=>c.groupName).map(c=>[c.groupName, {
    name: c.groupName,
    count: contacts.filter(x=>x.groupName===c.groupName).length,
    districts: [...new Set(contacts.filter(x=>x.groupName===c.groupName).map(x=>x.district))],
    uploadedAt: c.uploadedAt,
    createdBy: c.createdBy || "admin", // who created this group
  }])).values()].sort((a,b)=>a.name.localeCompare(b.name));

  const parseCSV = text => {
    const lines = text.trim().split(/\r?\n/);
    const headers = lines[0].split(",").map(h=>h.trim().toLowerCase().replace(/^"|"$/g,""));
    return lines.slice(1).map((ln,i)=>{
      const vals = ln.split(",").map(v=>v.trim().replace(/^"|"$/g,""));
      const r={}; headers.forEach((h,j)=>r[h]=vals[j]||"");
      return {id:i, name:r.name||r.full_name||`Contact ${i+1}`, phone:r.phone||r.mobile||"", district:r.district||"", village:r.village||r.area||r.town||""};
    }).filter(r=>r.phone);
  };
  const buildVgMap = parsed => {
    const m={};
    parsed.forEach(c=>{ const k=`${c.district}__${c.village}`; if(c.village&&!m[k]) m[k]={district:c.district,village:c.village,greeting:DISTRICT_GREETINGS[c.district]||DEFAULT_GREETING,count:0}; if(c.village) m[k].count++; });
    return m;
  };
  const handleFile = f => { const r=new FileReader(); r.onload=e=>{const p=parseCSV(e.target.result); setRaw(p); setVg(buildVgMap(p));}; r.readAsText(f); };
  const loadSample = () => {
    const s=[
      {id:0,name:"Ravi Kumar",phone:"+919000000001",district:"Madurai",village:"Alanganallur"},
      {id:1,name:"Priya Devi",phone:"+919000000002",district:"Madurai",village:"Melur"},
      {id:2,name:"Suresh M",  phone:"+919000000003",district:"Madurai",village:"Thirumangalam"},
      {id:3,name:"Anitha R",  phone:"+919000000004",district:"Chennai",village:"T.Nagar"},
      {id:4,name:"Deepa K",   phone:"+919000000005",district:"Chennai",village:"Tambaram"},
      {id:5,name:"Karthik V", phone:"+919000000006",district:"Coimbatore",village:"Peelamedu"},
      {id:6,name:"Lakshmi N", phone:"+919000000007",district:"Coimbatore",village:"Singanallur"},
      {id:7,name:"Vijaya B",  phone:"+919000000008",district:"Tirunelveli",village:"Palayamkottai"},
      {id:8,name:"Ganesh E",  phone:"+919000000009",district:"Salem",village:"Attur"},
      {id:9,name:"Geetha J",  phone:"+919000000010",district:"Thanjavur",village:"Kumbakonam"},
    ];
    setRaw(s); setVg(buildVgMap(s));
  };

  const byDist = {};
  Object.values(vg).forEach(v=>{ if(!byDist[v.district]) byDist[v.district]=[]; byDist[v.district].push(v); });
  const updateG = (k,val) => setVg(p=>({...p,[k]:{...p[k],greeting:val}}));
  const resetDist = d => { const dg=DISTRICT_GREETINGS[d]||DEFAULT_GREETING; setVg(p=>{const n={...p}; Object.keys(n).forEach(k=>{if(n[k].district===d) n[k]={...n[k],greeting:dg};}); return n;}); };

  const goToName = () => { if(!raw.length){alert("Upload a file first.");return;} setStep("name"); };
  const goToGreetings = () => {
    const t=groupName.trim();
    if(!t){setGroupErr("Group name is required.");return;}
    if(groups.find(g=>g.name.toLowerCase()===t.toLowerCase())){setGroupErr("This group name already exists.");return;}
    setGroupErr(""); setStep("greetings");
  };
  const finalise = async () => {
    setSaving(true);
    const ts = new Date().toISOString();
    const finalContacts = raw.map(c=>({...c, groupName:groupName.trim(), uploadedAt:ts, greeting:vg[`${c.district}__${c.village}`]?.greeting||DISTRICT_GREETINGS[c.district]||DEFAULT_GREETING}));
    const all = [...contacts, ...finalContacts];
    setContacts(all);
    try { await db.post("/api/contacts/bulk",{contacts:all}); } catch(e){ console.warn("[DB]",e.message); }
    setSaving(false); setStep("done");
  };
  const deleteGroup = async name => {
    if(!window.confirm(`Delete group "${name}" and all its contacts?`)) return;
    const remaining = contacts.filter(c=>c.groupName!==name);
    setContacts(remaining);
    try { await db.post("/api/contacts/bulk",{contacts:remaining}); } catch(e){}
    setPreview(null);
  };
  const resetWizard = () => { setStep("list"); setRaw([]); setVg({}); setGroupName(""); setGroupErr(""); setEditing(null); setExpanded(null); };

  // ── ADD CONTACT MODAL ─────────────────────────────────────────────────────────
  const [addModal, setAddModal] = useState(null); // groupName or null
  const [addForm, setAddForm]   = useState({name:"",phone:"",district:"",village:""});
  const [addErr,  setAddErr]    = useState("");

  const saveNewContact = async () => {
    if(!addForm.name.trim())  { setAddErr("Name is required."); return; }
    if(!addForm.phone.trim()) { setAddErr("Phone is required."); return; }
    setAddErr("");
    const nc = {
      ...addForm,
      id: Date.now(),
      groupName: addModal,
      uploadedAt: new Date().toISOString(),
      greeting: DISTRICT_GREETINGS[addForm.district] || DEFAULT_GREETING,
    };
    const all = [...contacts, nc];
    setContacts(all);
    try { await db.post("/api/contacts/bulk",{contacts:all}); } catch(e){}
    setAddModal(null);
    setAddForm({name:"",phone:"",district:"",village:""});
  };

  const removeContact = async (phone, groupName) => {
    if(!window.confirm(`Remove this contact from "${groupName}"?`)) return;
    const remaining = contacts.filter(c=>!(c.phone===phone && c.groupName===groupName));
    setContacts(remaining);
    try { await db.post("/api/contacts/bulk",{contacts:remaining}); } catch(e){}
  };

  // LIST VIEW
  if(step==="list") return (
    <div style={{padding:32,maxWidth:900}}>
      {/* Add Contact Modal */}
      {addModal&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center"}}>
          <div style={{...card,width:440,borderRadius:20,padding:32,boxShadow:"0 24px 64px rgba(0,0,0,0.5)"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:22}}>
              <div>
                <h3 style={{color:"#fff",margin:"0 0 3px",fontSize:17,fontWeight:700}}>Add Contact</h3>
                <p style={{color:"rgba(255,255,255,0.35)",margin:0,fontSize:12}}>Adding to <GroupBadge name={addModal}/></p>
              </div>
              <button onClick={()=>{setAddModal(null);setAddErr("");}} style={{background:"none",border:"none",color:"rgba(255,255,255,0.4)",cursor:"pointer",padding:4}}><Ic d={P.x} s={18}/></button>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:13}}>
              <div><label style={lbl}>Full Name *</label><input style={inp} value={addForm.name} onChange={e=>setAddForm(p=>({...p,name:e.target.value}))} placeholder="e.g. Karthik Kumar"/></div>
              <div><label style={lbl}>Phone *</label><input style={inp} value={addForm.phone} onChange={e=>setAddForm(p=>({...p,phone:e.target.value}))} placeholder="+919876543210 or 9876543210"/></div>
              <div style={{display:"flex",gap:10}}>
                <div style={{flex:1}}>
                  <label style={lbl}>District</label>
                  <select style={{...inp,appearance:"none"}} value={addForm.district} onChange={e=>setAddForm(p=>({...p,district:e.target.value}))}>
                    <option value="">— select —</option>
                    {DISTRICTS.map(d=><option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div style={{flex:1}}><label style={lbl}>Village / Area</label><input style={inp} value={addForm.village} onChange={e=>setAddForm(p=>({...p,village:e.target.value}))} placeholder="e.g. Melur"/></div>
              </div>
              {addErr&&<div style={{background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,0.25)",borderRadius:9,padding:"9px 13px",color:"#fca5a5",fontSize:13}}>{addErr}</div>}
              <div style={{display:"flex",gap:9,marginTop:4}}>
                <button style={{...btnP,flex:1,justifyContent:"center"}} onClick={saveNewContact}><Ic d={P.userplus} s={14}/>Add Contact</button>
                <button style={{...btnG,padding:"10px 18px"}} onClick={()=>{setAddModal(null);setAddErr("");}}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:22,flexWrap:"wrap",gap:12}}>
        <div><h1 style={{color:"#fff",fontSize:24,fontWeight:700,margin:"0 0 4px"}}>Contact Groups</h1>
          <p style={{color:"rgba(255,255,255,0.4)",fontSize:13,margin:0}}>{contacts.length} contacts · {groups.length} groups · select a group when creating a campaign</p></div>
        <button style={btnP} onClick={()=>setStep("upload")}><Ic d={P.plus} s={14}/>Upload New Group</button>
      </div>

      {groups.length===0&&(
        <div style={{...card,textAlign:"center",padding:56,border:"2px dashed rgba(99,102,241,0.2)"}}>
          <div style={{width:52,height:52,borderRadius:14,background:"rgba(99,102,241,0.1)",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 14px"}}><Ic d={P.layers} s={24} c="#6366f1"/></div>
          <p style={{color:"rgba(255,255,255,0.5)",fontSize:15,margin:"0 0 6px",fontWeight:500}}>No contact groups yet</p>
          <p style={{color:"rgba(255,255,255,0.3)",fontSize:13,margin:"0 0 20px"}}>Upload a CSV, name the group, set village greetings — then target it from a campaign.</p>
          <button style={{...btnP,margin:"0 auto"}} onClick={()=>setStep("upload")}><Ic d={P.upload} s={14}/>Upload First Group</button>
        </div>
      )}

      {groups.map(g=>{
        const groupContacts = contacts.filter(c=>c.groupName===g.name);
        const isEditMode = editing === g.name;
        return (
          <div key={g.name} style={{...card,marginBottom:12,padding:0,overflow:"hidden"}}>
            <div style={{padding:"16px 20px",display:"flex",alignItems:"center",gap:14,flexWrap:"wrap"}}>
              <div style={{width:42,height:42,borderRadius:12,background:`${groupColor(g.name)}20`,border:`1px solid ${groupColor(g.name)}40`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><Ic d={P.contacts} s={19} c={groupColor(g.name)}/></div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",alignItems:"center",gap:9,marginBottom:4,flexWrap:"wrap"}}>
                  <span style={{color:"#fff",fontSize:15,fontWeight:700}}>{g.name}</span>
                  <GroupBadge name={g.name}/>
                  {isEditMode&&<span style={{padding:"2px 9px",borderRadius:99,fontSize:10,fontWeight:700,background:"rgba(251,191,36,0.15)",color:"#fbbf24",border:"1px solid rgba(251,191,36,0.25)"}}>✏️ Editing</span>}
                </div>
                <div style={{display:"flex",gap:16,flexWrap:"wrap"}}>
                  <span style={{color:"rgba(255,255,255,0.5)",fontSize:12}}><strong style={{color:"#fff"}}>{groupContacts.length}</strong> contacts</span>
                  <span style={{color:"rgba(255,255,255,0.5)",fontSize:12}}><strong style={{color:"#fff"}}>{g.districts.length}</strong> districts</span>
                  {g.uploadedAt&&<span style={{color:"rgba(255,255,255,0.3)",fontSize:12}}>Uploaded {new Date(g.uploadedAt).toLocaleDateString()}</span>}
                </div>
              </div>
              <div style={{display:"flex",gap:7,flexShrink:0,flexWrap:"wrap"}}>
                <button style={{...btnG,fontSize:12}} onClick={()=>{setEditing(isEditMode?null:g.name);setPreview(isEditMode?null:g.name);}}>
                  <Ic d={isEditMode?P.check:P.edit} s={13} c={isEditMode?"#4ade80":"currentColor"}/>{isEditMode?"Done":"Edit"}
                </button>
                {!isEditMode&&<button style={{...btnG,fontSize:12}} onClick={()=>setPreview(preview===g.name?null:g.name)}><Ic d={P.eye} s={13}/>{preview===g.name?"Hide":"Preview"}</button>}
                {(currentUser?.role==="admin" || g.createdBy===currentUser?.username) ? (
                  <button style={{...btnG,color:"#ef4444",borderColor:"rgba(239,68,68,0.2)",fontSize:12}} onClick={()=>deleteGroup(g.name)}><Ic d={P.trash} s={13}/>Delete</button>
                ) : (
                  <span style={{padding:"4px 10px",borderRadius:7,fontSize:11,color:"rgba(255,255,255,0.2)",border:"1px solid rgba(255,255,255,0.06)",cursor:"not-allowed"}} title="You can only delete groups you created">🔒 Delete</span>
                )}
              </div>
            </div>

            <div style={{padding:"0 20px 12px",display:"flex",gap:6,flexWrap:"wrap"}}>
              {g.districts.map(d=><span key={d} style={{padding:"2px 9px",borderRadius:99,fontSize:11,background:"rgba(255,255,255,0.05)",color:"rgba(255,255,255,0.45)",border:"1px solid rgba(255,255,255,0.07)"}}>{d}</span>)}
            </div>

            {(preview===g.name||isEditMode)&&(
              <div style={{borderTop:"1px solid rgba(255,255,255,0.06)"}}>
                {isEditMode&&(
                  <div style={{padding:"10px 20px",background:"rgba(251,191,36,0.05)",borderBottom:"1px solid rgba(251,191,36,0.1)",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
                    <span style={{color:"rgba(251,191,36,0.8)",fontSize:12}}>Click <strong>✕</strong> on any row to remove that contact. Click <strong>+ Add Contact</strong> to add a new one.</span>
                    <button style={{...btnG,fontSize:12,color:"#4ade80",borderColor:"rgba(74,222,128,0.25)",background:"rgba(74,222,128,0.08)",padding:"6px 13px"}} onClick={()=>setAddModal(g.name)}>
                      <Ic d={P.userplus} s={13} c="#4ade80"/>Add Contact
                    </button>
                  </div>
                )}
                <div style={{maxHeight:320,overflowY:"auto"}}>
                  <table style={{width:"100%",borderCollapse:"collapse"}}>
                    <thead><tr style={{background:"rgba(255,255,255,0.03)"}}>
                      {isEditMode&&<th style={{padding:"7px 10px",width:32}}></th>}
                      {["#","Name","Phone","District","Village"].map(h=><th key={h} style={{padding:"7px 14px",textAlign:"left",color:"rgba(255,255,255,0.3)",fontSize:10,fontWeight:600,textTransform:"uppercase",letterSpacing:0.5,whiteSpace:"nowrap"}}>{h}</th>)}
                      {!isEditMode&&<th style={{padding:"7px 14px",textAlign:"left",color:"rgba(255,255,255,0.3)",fontSize:10,fontWeight:600,textTransform:"uppercase",letterSpacing:0.5}}>Greeting</th>}
                    </tr></thead>
                    <tbody>{groupContacts.map((c,i)=>(
                      <tr key={c.phone+i} style={{borderTop:"1px solid rgba(255,255,255,0.04)",background:isEditMode?"rgba(251,191,36,0.02)":"transparent"}}>
                        {isEditMode&&(
                          <td style={{padding:"6px 10px"}}>
                            <button onClick={()=>removeContact(c.phone,g.name)} title="Remove contact" style={{width:22,height:22,borderRadius:"50%",background:"rgba(239,68,68,0.15)",border:"1px solid rgba(239,68,68,0.3)",color:"#ef4444",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",padding:0}}>
                              <Ic d={P.x} s={11} c="#ef4444"/>
                            </button>
                          </td>
                        )}
                        <td style={{padding:"7px 14px",color:"rgba(255,255,255,0.2)",fontSize:12}}>{i+1}</td>
                        <td style={{padding:"7px 14px",color:"#fff",fontSize:12,fontWeight:500}}>{c.name}</td>
                        <td style={{padding:"7px 14px",color:"rgba(255,255,255,0.45)",fontSize:11,fontFamily:"monospace"}}>{c.phone}</td>
                        <td style={{padding:"7px 14px",color:"rgba(255,255,255,0.6)",fontSize:12}}>{c.district}</td>
                        <td style={{padding:"7px 14px",color:"rgba(255,255,255,0.5)",fontSize:12}}>{c.village}</td>
                        {!isEditMode&&<td style={{padding:"7px 14px",color:"#fbbf24",fontSize:11,maxWidth:200,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.greeting}</td>}
                      </tr>
                    ))}</tbody>
                  </table>
                  {isEditMode&&groupContacts.length===0&&(
                    <div style={{padding:"24px",textAlign:"center",color:"rgba(255,255,255,0.3)",fontSize:13}}>No contacts in this group. Add one above.</div>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  // UPLOAD
  if(step==="upload") return (
    <div style={{padding:32,maxWidth:700}}>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}><button style={btnG} onClick={resetWizard}><Ic d={P.x} s={13}/>Cancel</button><div><h1 style={{color:"#fff",fontSize:22,fontWeight:700,margin:0}}>Upload Contacts</h1><p style={{color:"rgba(255,255,255,0.4)",fontSize:13,margin:0}}>Step 1 of 3</p></div></div>
      <StepBar step={1} steps={["Upload File","Name Group","Set Greetings"]}/>
      <div style={{...card,border:"1px solid rgba(99,102,241,0.2)",padding:16,marginBottom:18}}>
        <div style={{color:"#a5b4fc",fontSize:12,fontWeight:600,marginBottom:8,display:"flex",alignItems:"center",gap:6}}><Ic d={P.info} s={13} c="#a5b4fc"/>Required columns</div>
        <table style={{borderCollapse:"collapse",fontSize:12,width:"100%"}}>
          <thead><tr style={{background:"rgba(99,102,241,0.08)"}}>{["name","phone","district","village"].map(h=><th key={h} style={{padding:"6px 12px",color:"#a5b4fc",textAlign:"left",fontWeight:600,borderBottom:"1px solid rgba(99,102,241,0.15)"}}>{h}</th>)}</tr></thead>
          <tbody>{[["Ravi Kumar","+919000000001","Madurai","Alanganallur"],["Anitha R","+919000000002","Chennai","T.Nagar"]].map((row,i)=>(
            <tr key={i} style={{borderBottom:"1px solid rgba(255,255,255,0.04)"}}>{row.map((v,j)=><td key={j} style={{padding:"6px 12px",color:j===3?"#fbbf24":"rgba(255,255,255,0.6)",fontFamily:j===1?"monospace":"inherit"}}>{v}</td>)}</tr>
          ))}</tbody>
        </table>
      </div>
      <div onDrop={e=>{e.preventDefault();setDrag(false);if(e.dataTransfer.files[0])handleFile(e.dataTransfer.files[0]);}} onDragOver={e=>{e.preventDefault();setDrag(true);}} onDragLeave={()=>setDrag(false)} onClick={()=>fileRef.current.click()}
        style={{border:`2px dashed ${drag?"#6366f1":"rgba(255,255,255,0.12)"}`,borderRadius:14,padding:44,textAlign:"center",cursor:"pointer",background:drag?"rgba(99,102,241,0.06)":"rgba(255,255,255,0.01)",marginBottom:14}}>
        <input ref={fileRef} type="file" accept=".csv,.txt,.xlsx,.xls" style={{display:"none"}} onChange={e=>e.target.files[0]&&handleFile(e.target.files[0])}/>
        <div style={{width:48,height:48,borderRadius:13,background:"rgba(99,102,241,0.14)",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 10px"}}><Ic d={P.upload} s={22} c="#a5b4fc"/></div>
        <p style={{color:"rgba(255,255,255,0.7)",fontSize:14,margin:"0 0 4px",fontWeight:500}}>Drop CSV/Excel here or click to browse</p>
        <p style={{color:"rgba(255,255,255,0.3)",fontSize:12,margin:0}}>Supported: .csv .xlsx .xls .txt</p>
      </div>
      {raw.length>0&&<div style={{...card,border:"1px solid rgba(34,197,94,0.3)",background:"rgba(34,197,94,0.04)",padding:"11px 16px",marginBottom:14,display:"flex",alignItems:"center",gap:9}}><Ic d={P.check} s={15} c="#22c55e"/><span style={{color:"#86efac",fontSize:13,fontWeight:600}}>{raw.length} contacts loaded · {Object.keys(buildVgMap(raw)).length} villages</span></div>}
      <div style={{textAlign:"center",marginBottom:14}}><p style={{color:"rgba(255,255,255,0.3)",fontSize:12,marginBottom:8}}>— or use sample data —</p><button style={{...btnP,background:"linear-gradient(135deg,#22c55e,#16a34a)",margin:"0 auto"}} onClick={loadSample}>Load 10 Sample Contacts</button></div>
      <div style={{display:"flex",justifyContent:"flex-end"}}><button style={{...btnP,opacity:raw.length?1:0.4}} disabled={!raw.length} onClick={goToName}>Next: Name Group →</button></div>
    </div>
  );

  // NAME GROUP
  if(step==="name") return (
    <div style={{padding:32,maxWidth:600}}>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}><button style={btnG} onClick={()=>setStep("upload")}><Ic d={P.x} s={13}/>Back</button><div><h1 style={{color:"#fff",fontSize:22,fontWeight:700,margin:0}}>Name This Group</h1><p style={{color:"rgba(255,255,255,0.4)",fontSize:13,margin:0}}>Step 2 of 3 — {raw.length} contacts will be saved under this name</p></div></div>
      <StepBar step={2} steps={["Upload File","Name Group","Set Greetings"]}/>
      <div style={{...card,border:"1px solid rgba(99,102,241,0.2)",padding:28}}>
        <div style={{marginBottom:20}}>
          <label style={{...lbl,fontSize:12,marginBottom:8}}>Group Name *</label>
          <input autoFocus style={{...inp,fontSize:15,padding:"13px 16px",border:`1px solid ${groupErr?"rgba(239,68,68,0.5)":"rgba(255,255,255,0.12)"}`}} value={groupName} onChange={e=>{setGroupName(e.target.value);setGroupErr("");}} onKeyDown={e=>e.key==="Enter"&&goToGreetings()} placeholder="e.g. Madurai Zone A, Coimbatore Voters, Phase 1 Women…"/>
          {groupErr?<p style={{color:"#fca5a5",fontSize:12,margin:"5px 0 0"}}>{groupErr}</p>:<p style={{color:"rgba(255,255,255,0.3)",fontSize:12,margin:"6px 0 0"}}>This name appears in campaign targeting. Each upload creates a new group.</p>}
        </div>
        {groupName.trim()&&(
          <div style={{padding:"14px 16px",borderRadius:12,background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)",marginBottom:18}}>
            <div style={{color:"rgba(255,255,255,0.35)",fontSize:11,fontWeight:600,textTransform:"uppercase",letterSpacing:0.5,marginBottom:8}}>Preview</div>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <div style={{width:34,height:34,borderRadius:9,background:`${groupColor(groupName.trim())}20`,display:"flex",alignItems:"center",justifyContent:"center"}}><Ic d={P.contacts} s={16} c={groupColor(groupName.trim())}/></div>
              <div><GroupBadge name={groupName.trim()} size="lg"/><div style={{color:"rgba(255,255,255,0.4)",fontSize:12,marginTop:4}}>{raw.length} contacts</div></div>
            </div>
          </div>
        )}
        {groups.length>0&&(
          <div style={{padding:"10px 14px",borderRadius:10,background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.06)",marginBottom:18}}>
            <div style={{color:"rgba(255,255,255,0.3)",fontSize:10,fontWeight:600,textTransform:"uppercase",letterSpacing:0.5,marginBottom:6}}>Existing groups</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:6}}>{groups.map(g=><GroupBadge key={g.name} name={g.name}/>)}</div>
          </div>
        )}
        <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
          <button style={btnG} onClick={()=>setStep("upload")}>← Back</button>
          <button style={btnP} onClick={goToGreetings}>Next: Set Greetings →</button>
        </div>
      </div>
    </div>
  );

  // SET GREETINGS
  if(step==="greetings") {
    const distList=Object.keys(byDist).sort();
    const totalV=Object.keys(vg).length;
    const customised=Object.values(vg).filter(v=>v.greeting!==(DISTRICT_GREETINGS[v.district]||DEFAULT_GREETING)).length;
    return (
      <div style={{padding:32,maxWidth:920}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16,flexWrap:"wrap",gap:12}}>
          <div><h1 style={{color:"#fff",fontSize:22,fontWeight:700,margin:"0 0 4px"}}>Set Village Greetings</h1>
            <p style={{color:"rgba(255,255,255,0.4)",fontSize:13,margin:0}}>Step 3 of 3 — village-level Tamil greetings for <GroupBadge name={groupName}/></p></div>
          <div style={{display:"flex",gap:10}}><button style={btnG} onClick={()=>setStep("name")}>← Back</button><button style={{...btnP,background:"linear-gradient(135deg,#22c55e,#16a34a)"}} onClick={finalise} disabled={saving}>{saving?"Saving…":"✓ Save Group"}</button></div>
        </div>
        <StepBar step={3} steps={["Upload File","Name Group","Set Greetings"]}/>
        <div style={{...card,padding:"11px 16px",marginBottom:14,display:"flex",gap:16,flexWrap:"wrap",border:"1px solid rgba(99,102,241,0.2)"}}>
          <span style={{color:"rgba(255,255,255,0.6)",fontSize:13}}><strong style={{color:"#fff"}}>{raw.length}</strong> contacts · <strong style={{color:"#fff"}}>{distList.length}</strong> districts · <strong style={{color:"#fff"}}>{totalV}</strong> villages</span>
          <span style={{color:"rgba(255,255,255,0.4)",fontSize:13}}>{customised} custom · {totalV-customised} default</span>
          <span style={{marginLeft:"auto",color:"rgba(255,255,255,0.3)",fontSize:12}}>ElevenLabs will voice each greeting</span>
        </div>
        {distList.map(district=>{
          const villages=byDist[district], isOpen=expanded===district, dg=DISTRICT_GREETINGS[district]||DEFAULT_GREETING, hasCustom=villages.some(v=>v.greeting!==dg);
          return (
            <div key={district} style={{...card,marginBottom:9,padding:0,overflow:"hidden"}}>
              <div onClick={()=>setExpanded(isOpen?null:district)} style={{padding:"14px 20px",cursor:"pointer",display:"flex",alignItems:"center",gap:13,background:isOpen?"rgba(99,102,241,0.07)":"transparent",borderBottom:isOpen?"1px solid rgba(255,255,255,0.06)":"none"}}>
                <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth={2} style={{transform:isOpen?"rotate(90deg)":"rotate(0deg)",transition:"transform 0.2s",flexShrink:0}}><path d="M9 18l6-6-6-6"/></svg>
                <div style={{flex:1}}>
                  <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",marginBottom:2}}><span style={{color:"#fff",fontSize:14,fontWeight:600}}>{district}</span><span style={{padding:"1px 7px",borderRadius:99,fontSize:11,background:"rgba(255,255,255,0.07)",color:"rgba(255,255,255,0.4)"}}>{villages.length} villages · {villages.reduce((s,v)=>s+v.count,0)} contacts</span>{hasCustom&&<span style={{padding:"1px 7px",borderRadius:99,fontSize:11,background:"rgba(34,197,94,0.15)",color:"#86efac",fontWeight:600}}>✦ Customised</span>}</div>
                  <p style={{color:"#fbbf24",fontSize:12,margin:0,opacity:0.55}}>{dg.slice(0,60)}…</p>
                </div>
                <button onClick={e=>{e.stopPropagation();resetDist(district);}} style={{...btnG,fontSize:11,padding:"4px 10px",flexShrink:0}}>Reset</button>
              </div>
              {isOpen&&(
                <div style={{padding:"12px 16px 14px"}}>
                  <div style={{background:"rgba(255,165,0,0.06)",border:"1px solid rgba(255,165,0,0.15)",borderRadius:9,padding:"8px 13px",marginBottom:11}}><div style={{color:"rgba(255,165,0,0.55)",fontSize:10,fontWeight:600,marginBottom:2,textTransform:"uppercase",letterSpacing:0.5}}>District Default</div><p style={{color:"#fbbf24",fontSize:13,margin:0}}>{dg}</p></div>
                  {villages.map(v=>{
                    const k=`${v.district}__${v.village}`, isEdit=editing===k, isDef=v.greeting===dg;
                    return (
                      <div key={k} style={{border:`1px solid ${isDef?"rgba(255,255,255,0.06)":"rgba(99,102,241,0.3)"}`,borderRadius:10,padding:13,marginBottom:7,background:isDef?"rgba(255,255,255,0.02)":"rgba(99,102,241,0.05)"}}>
                        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:isEdit?11:0}}>
                          <Ic d={P.village} s={13} c={isDef?"rgba(255,255,255,0.2)":"#a5b4fc"}/>
                          <div style={{flex:1}}><div style={{display:"flex",gap:7,alignItems:"center",flexWrap:"wrap",marginBottom:2}}><span style={{color:"#fff",fontSize:13,fontWeight:600}}>{v.village}</span><span style={{color:"rgba(255,255,255,0.3)",fontSize:11}}>{v.count} contact{v.count>1?"s":""}</span>{isDef?<span style={{padding:"1px 7px",borderRadius:99,fontSize:10,background:"rgba(245,158,11,0.1)",color:"#f59e0b"}}>Default</span>:<span style={{padding:"1px 7px",borderRadius:99,fontSize:10,background:"rgba(99,102,241,0.2)",color:"#a5b4fc",fontWeight:600}}>✦ Custom</span>}</div>
                            {!isEdit&&<p style={{color:isDef?"rgba(255,255,255,0.25)":"#c7d2fe",fontSize:12,margin:0}}>{v.greeting.slice(0,65)}…</p>}</div>
                          <div style={{display:"flex",gap:6,flexShrink:0}}>
                            {!isEdit?<button onClick={()=>setEditing(k)} style={{...btnG,fontSize:11,padding:"4px 10px",color:"#a5b4fc",borderColor:"rgba(99,102,241,0.3)"}}><Ic d={P.edit} s={11} c="#a5b4fc"/>Edit</button>
                              :<><button onClick={()=>setEditing(null)} style={{...btnP,fontSize:11,padding:"4px 10px"}}><Ic d={P.check} s={11}/>Done</button>{!isDef&&<button onClick={()=>{updateG(k,dg);setEditing(null);}} style={{...btnG,fontSize:11,padding:"4px 9px",color:"#f59e0b"}}>Reset</button>}</>}
                          </div>
                        </div>
                        {isEdit&&<textarea style={{...inp,resize:"vertical",fontSize:13,lineHeight:1.7,padding:"10px 13px"}} rows={3} value={v.greeting} onChange={e=>updateG(k,e.target.value)} autoFocus/>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
        <div style={{display:"flex",justifyContent:"flex-end",gap:10,marginTop:16}}>
          <button style={btnG} onClick={()=>setStep("name")}>← Back</button>
          <button style={{...btnP,background:"linear-gradient(135deg,#22c55e,#16a34a)",padding:"11px 24px",fontSize:14}} onClick={finalise} disabled={saving}>{saving?"Saving to Firestore…":"✓ Save Group"}</button>
        </div>
      </div>
    );
  }

  // DONE
  return (
    <div style={{padding:32,maxWidth:560}}>
      <div style={{...card,textAlign:"center",padding:44,border:"1px solid rgba(34,197,94,0.3)"}}>
        <div style={{width:54,height:54,borderRadius:15,background:"rgba(34,197,94,0.14)",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 14px"}}><Ic d={P.check} s={26} c="#22c55e"/></div>
        <h2 style={{color:"#fff",fontSize:20,fontWeight:700,margin:"0 0 10px"}}>Group Saved!</h2>
        <div style={{margin:"0 auto 14px"}}><GroupBadge name={groupName} size="lg"/></div>
        <p style={{color:"rgba(255,255,255,0.5)",fontSize:13,margin:"0 0 22px"}}>{raw.length} contacts saved under <strong style={{color:"#fff"}}>{groupName}</strong>.<br/>Target this group when creating a campaign.</p>
        <div style={{display:"flex",gap:10,justifyContent:"center",flexWrap:"wrap"}}>
          <button style={btnP} onClick={resetWizard}><Ic d={P.plus} s={14}/>Upload Another Group</button>
          <button style={btnG} onClick={()=>setStep("list")}><Ic d={P.layers} s={14}/>View All Groups</button>
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// CAMPAIGN WELCOME SPEECH EDITOR
// — lets you write & preview a campaign-level TTS override via ElevenLabs
// ═════════════════════════════════════════════════════════════════════════════
function WelcomeSpeechEditor({ value, onChange, elevenLabsKey, elevenLabsVoiceId }) {
  const [previewing, setPreviewing] = useState(false);
  const [audioUrl, setAudioUrl]     = useState(null);
  const [previewErr, setPreviewErr] = useState("");

  const previewSpeech = async () => {
    if(!value.trim()){setPreviewErr("Enter text to preview."); return;}
    if(!elevenLabsKey){setPreviewErr("Add ElevenLabs API key in Settings first."); return;}
    setPreviewing(true); setPreviewErr(""); setAudioUrl(null);
    try {
      const res = await fetch(`${API}/api/tts/preview`, {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({text:value, elevenLabsKey, elevenLabsVoiceId})});
      const data = await res.json();
      if(data.audioUrl){ setAudioUrl(data.audioUrl); }
      else setPreviewErr(data.error||"Preview failed");
    } catch(e){ setPreviewErr(e.message); }
    setPreviewing(false);
  };

  return (
    <div style={{marginBottom:16}}>
      <label style={{...lbl,fontSize:12,marginBottom:6,display:"flex",alignItems:"center",gap:7}}>
        <Ic d={P.volume} s={13} c="#c084fc"/>
        Campaign Welcome Speech (ElevenLabs TTS Override)
        <span style={{padding:"1px 7px",borderRadius:99,fontSize:10,background:"rgba(168,85,247,0.15)",color:"#c084fc",fontWeight:600,textTransform:"none",letterSpacing:0}}>overrides village greeting</span>
      </label>
      <textarea
        style={{...inp, resize:"vertical", fontSize:13, lineHeight:1.7, padding:"11px 13px", borderColor:"rgba(168,85,247,0.25)", background:"rgba(168,85,247,0.04)"}}
        rows={3}
        value={value}
        onChange={e=>{ onChange(e.target.value); setAudioUrl(null); setPreviewErr(""); }}
        placeholder={"வணக்கம்! நாங்கள் [திட்டம்] பற்றி உங்கள் கருத்தை அறிய விரும்புகிறோம்.\nThis text will be voiced by ElevenLabs for every call in this campaign.\nLeave blank to use the per-village greeting from the contact group."}
      />
      <div style={{display:"flex",alignItems:"center",gap:10,marginTop:8,flexWrap:"wrap"}}>
        <button type="button" onClick={previewSpeech} disabled={previewing||!value.trim()} style={{...btnG,fontSize:12,padding:"6px 14px",color:"#c084fc",borderColor:"rgba(168,85,247,0.3)",opacity:(!value.trim()||previewing)?0.5:1}}>
          <Ic d={P.volume} s={13} c="#c084fc"/>{previewing?"Generating…":"▶ Preview via ElevenLabs"}
        </button>
        {audioUrl&&<audio key={audioUrl} controls autoPlay style={{height:32,flex:1,minWidth:180}}><source src={audioUrl} type="audio/mpeg"/></audio>}
        {previewErr&&<span style={{color:"#fca5a5",fontSize:12}}>{previewErr}</span>}
      </div>
      <p style={{color:"rgba(255,255,255,0.25)",fontSize:11,margin:"6px 0 0"}}>
        <strong style={{color:"rgba(168,85,247,0.7)"}}>Priority:</strong> Campaign speech &gt; Contact group village greeting &gt; District default
      </p>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// CAMPAIGNS
// ═════════════════════════════════════════════════════════════════════════════
function Campaigns({ campaigns, setCampaigns, contacts, setResults, creds, db, currentUser }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({title:"", question:"", context:"", maxCalls:20, targetGroup:"", campaignWelcomeSpeech:""});
  const [progress, setProgress] = useState({});
  const [isClone, setIsClone] = useState(false);

  const cloneCampaign = (c) => {
    setForm({
      title: `${c.title} (Copy)`,
      question: c.question || "",
      context: c.context || "",
      maxCalls: c.maxCalls || 20,
      targetGroup: c.targetGroup || "",
      campaignWelcomeSpeech: c.campaignWelcomeSpeech || "",
    });
    setIsClone(true);
    setShowForm(true);
    window.scrollTo({top:0,behavior:"smooth"});
  };

  const groups = [...new Map(contacts.filter(c=>c.groupName).map(c=>[c.groupName,{name:c.groupName,count:contacts.filter(x=>x.groupName===c.groupName).length}])).values()].sort((a,b)=>a.name.localeCompare(b.name));

  const create = async () => {
    if(!form.title.trim()||!form.question.trim()) return;
    if(!form.targetGroup){alert("Select a contact group to target."); return;}
    try {
      const saved = await db.post("/api/campaigns", form);
      setCampaigns(p=>[{...saved,...form,created:new Date().toLocaleDateString()},...p]);
    } catch(e){
      setCampaigns(p=>[{id:Date.now(),...form,status:"draft",created:new Date().toLocaleDateString(),createdBy:currentUser?.username||"admin"},...p]);
    }
    setForm({title:"",question:"",context:"",maxCalls:20,targetGroup:"",campaignWelcomeSpeech:""}); setShowForm(false); setIsClone(false);
  };

  const launch = async c => {
    const pool = (c.targetGroup ? contacts.filter(x=>x.groupName===c.targetGroup) : contacts).slice(0,c.maxCalls);
    if(!pool.length){alert(`No contacts in group "${c.targetGroup}".`); return;}
    try{ await db.patch(`/api/campaigns/${c.id}`,{status:"running"}); }catch(e){}
    setCampaigns(p=>p.map(x=>x.id===c.id?{...x,status:"running"}:x));

    for(let i=0;i<pool.length;i+=5){
      await Promise.all(pool.slice(i,i+5).map(async(contact,bi)=>{
        try{
          // Campaign welcome speech overrides contact's village greeting
          const greetingToUse = c.campaignWelcomeSpeech?.trim() || contact.greeting;
          if(creds.useSimulation){
            await new Promise(r=>setTimeout(r,400+Math.random()*600));

            // 20% chance of a non-answer outcome to simulate real-world patterns
            const roll = Math.random();
            const nonAnswerStatus = roll < 0.05 ? "not-reachable"
                                  : roll < 0.10 ? "call-busy"
                                  : roll < 0.15 ? "no-answer"
                                  : roll < 0.18 ? "disconnected"
                                  : null;

            if (nonAnswerStatus) {
              // Retryable statuses: not-reachable, disconnected (before answering)
              const isRetryable = nonAnswerStatus === "not-reachable" || nonAnswerStatus === "disconnected";
              const resultId = Date.now()+i+bi;
              const result = {
                id: resultId, campaignId:c.id, campaignTitle:c.title,
                targetGroup:c.targetGroup, groupName:contact.groupName,
                phone:contact.phone, name:contact.name,
                district:contact.district, village:contact.village,
                greeting:greetingToUse, greetingSource:c.campaignWelcomeSpeech?.trim()?"campaign":"village",
                status: nonAnswerStatus, callStatusRaw: nonAnswerStatus,
                response:"", transcript:"", turns:[], turnCount:0,
                sentiment:"none", retryScheduled: isRetryable,
                duration:"0:00", time:new Date().toLocaleTimeString(), mode:"sim",
              };
              setResults(p=>[...p,result]);
              try{ await db.post("/api/results",result); }catch(e){}

              // Simulate the retry after 3s (compressed from 30s for sim UX)
              if (isRetryable) {
                await new Promise(r=>setTimeout(r,3000));
                const retryRoll = Math.random();
                const retrySuccess = retryRoll > 0.4; // 60% chance retry succeeds
                if (retrySuccess) {
                  const mock = MOCK_CONVERSATIONS[Math.floor(Math.random()*MOCK_CONVERSATIONS.length)];
                  const simTurns = mock.turns.slice(0,2).map((t,ti)=>({...t, ai:ti===0?(c.question||t.ai):t.ai}));
                  const fullTranscript = simTurns.map(t=>`User: ${t.user}\nAI: ${t.ai}`).join("\n");
                  const simDurSec = Math.min(25 + simTurns.length * 20, 118);
                  const retryResult = {
                    id: Date.now()+i+bi+9999, campaignId:c.id, campaignTitle:c.title,
                    targetGroup:c.targetGroup, groupName:contact.groupName,
                    phone:contact.phone, name:contact.name,
                    district:contact.district, village:contact.village,
                    greeting:greetingToUse, greetingSource:c.campaignWelcomeSpeech?.trim()?"campaign":"village",
                    status:"completed", callStatusRaw:"completed",
                    isRetry:true, retryCount:1, originalCallId: resultId,
                    response: simTurns[simTurns.length-1]?.user || "",
                    transcript: fullTranscript, turns: simTurns, turnCount: simTurns.length,
                    sentiment: mock.sentiment,
                    duration:`${Math.floor(simDurSec/60)}:${String(simDurSec%60).padStart(2,"0")}`,
                    time:new Date().toLocaleTimeString(), mode:"sim",
                  };
                  setResults(p=>[...p, retryResult]);
                  // Also update original result to remove "retrying" badge
                  setResults(p=>p.map(x=>x.id===resultId ? {...x, retryScheduled:false, retryDone:true} : x));
                  try{ await db.post("/api/results",retryResult); }catch(e){}
                } else {
                  // Retry also failed
                  const retryFailed = {
                    id: Date.now()+i+bi+9999, campaignId:c.id, campaignTitle:c.title,
                    targetGroup:c.targetGroup, groupName:contact.groupName,
                    phone:contact.phone, name:contact.name,
                    district:contact.district, village:contact.village,
                    greeting:greetingToUse, greetingSource:c.campaignWelcomeSpeech?.trim()?"campaign":"village",
                    status: nonAnswerStatus, callStatusRaw: nonAnswerStatus,
                    isRetry:true, retryCount:1, originalCallId: resultId,
                    response:"", transcript:"", turns:[], turnCount:0, sentiment:"none",
                    duration:"0:00", time:new Date().toLocaleTimeString(), mode:"sim",
                  };
                  setResults(p=>[...p, retryFailed]);
                  setResults(p=>p.map(x=>x.id===resultId ? {...x, retryScheduled:false, retryDone:true} : x));
                  try{ await db.post("/api/results",retryFailed); }catch(e){}
                }
              }
            } else {
              // Simulate a full multi-turn conversation (max 3 turns, ~119s budget)
              const mock = MOCK_CONVERSATIONS[Math.floor(Math.random()*MOCK_CONVERSATIONS.length)];
              const simTurns = mock.turns.slice(0,3).map((t,ti)=>({
                ...t,
                ai: ti===0 ? (c.question || t.ai) : t.ai,
              }));
              const fullTranscript = simTurns.map(t=>`User: ${t.user}\nAI: ${t.ai}`).join("\n");
              // Simulate duration within 119s budget: ~30s base + ~20s per turn
              const simDurSec = Math.min(30 + simTurns.length * 22 + Math.floor(Math.random()*15), 118);
              const result = {
                id:Date.now()+i+bi, campaignId:c.id, campaignTitle:c.title,
                targetGroup:c.targetGroup, groupName:contact.groupName,
                phone:contact.phone, name:contact.name,
                district:contact.district, village:contact.village,
                greeting:greetingToUse, greetingSource:c.campaignWelcomeSpeech?.trim()?"campaign":"village",
                status:"completed", callStatusRaw:"completed",
                response: simTurns[simTurns.length-1]?.user || "",
                transcript: fullTranscript,
                turns: simTurns, turnCount: simTurns.length,
                sentiment: mock.sentiment,
                duration:`${Math.floor(simDurSec/60)}:${String(simDurSec%60).padStart(2,"0")}`,
                time:new Date().toLocaleTimeString(), mode:"sim",
              };
              setResults(p=>[...p,result]);
              try{ await db.post("/api/results",result); }catch(e){}
            }
          } else {
            const res=await fetch(`${API}/api/calls/initiate`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({to:contact.phone, name:contact.name, district:contact.district, village:contact.village, groupName:contact.groupName, greeting:greetingToUse, question:c.question, context:c.context, campaignId:c.id, exotelSid:creds.exotelSid, exotelToken:creds.exotelToken, exotelCallerId:creds.exotelCallerId, whisperKey:creds.whisperKey, geminiKey:creds.geminiKey, elevenLabsKey:creds.elevenLabsKey, elevenLabsVoiceId:creds.elevenLabsVoiceId})});
            const data=await res.json();
            setResults(p=>[...p,{id:Date.now()+i+bi, campaignId:c.id, campaignTitle:c.title, targetGroup:c.targetGroup, groupName:contact.groupName, phone:contact.phone, name:contact.name, district:contact.district, village:contact.village, greeting:greetingToUse, greetingSource:c.campaignWelcomeSpeech?.trim()?"campaign":"village", response:data.transcript||"Awaiting…", transcript:data.transcript||"", sentiment:data.sentiment||"neutral", callSid:data.callSid, duration:data.duration||"—", time:new Date().toLocaleTimeString(), mode:"live"}]);
          }
        }catch(e){ console.error(e); }
      }));
      setProgress(p=>({...p,[c.id]:{done:Math.min(i+5,pool.length),total:pool.length}}));
    }
    try{ await db.patch(`/api/campaigns/${c.id}`,{status:"completed"}); }catch(e){}
    setCampaigns(p=>p.map(x=>x.id===c.id?{...x,status:"completed"}:x));
  };

  return (
    <div style={{padding:32,maxWidth:900}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:22}}>
        <div><h1 style={{color:"#fff",fontSize:24,fontWeight:700,margin:"0 0 4px"}}>Campaigns</h1>
          <p style={{color:"rgba(255,255,255,0.4)",fontSize:13,margin:0}}>{groups.length>0?<span style={{color:"#86efac"}}>✓ {groups.length} group{groups.length>1?"s":""} available · {contacts.length} contacts</span>:<span style={{color:"#f59e0b"}}>⚠ Upload contacts and create a group first</span>}</p></div>
        <button style={btnP} onClick={()=>setShowForm(v=>!v)}><Ic d={P.plus} s={14}/>New Campaign</button>
      </div>

      {showForm&&(
        <div style={{...card,border:isClone?"1px solid rgba(251,191,36,0.35)":"1px solid rgba(99,102,241,0.3)",marginBottom:18}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
            <span style={{color:isClone?"#fbbf24":"#a5b4fc",fontSize:14,fontWeight:700}}>{isClone?"Clone Campaign":"Create Campaign"}</span>
            {isClone&&<span style={{padding:"2px 10px",borderRadius:99,fontSize:11,fontWeight:600,background:"rgba(251,191,36,0.12)",color:"#fbbf24",border:"1px solid rgba(251,191,36,0.25)"}}>📋 Modify and save as new</span>}
          </div>

          {/* Row 1: Title + Max Calls */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 160px",gap:12,marginBottom:14}}>
            <div><label style={lbl}>Campaign Title *</label><input style={inp} value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="Women Hostel Survey 2025"/></div>
            <div><label style={lbl}>Max Calls</label><input style={inp} type="number" min={1} value={form.maxCalls} onChange={e=>setForm({...form,maxCalls:+e.target.value})}/></div>
          </div>

          {/* Target Group Selector */}
          <div style={{marginBottom:14}}>
            <label style={lbl}>Target Contact Group *</label>
            {groups.length===0
              ?<div style={{padding:"11px 14px",borderRadius:10,background:"rgba(245,158,11,0.07)",border:"1px solid rgba(245,158,11,0.2)",color:"#fbbf24",fontSize:13}}>⚠ No contact groups yet — go to Contacts and upload a group first.</div>
              :<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(170px,1fr))",gap:8}}>
                {groups.map(g=>{
                  const sel=form.targetGroup===g.name, c=groupColor(g.name);
                  return (
                    <div key={g.name} onClick={()=>setForm({...form,targetGroup:sel?"":g.name})} style={{padding:"11px 14px",borderRadius:10,cursor:"pointer",border:`2px solid ${sel?c:"rgba(255,255,255,0.08)"}`,background:sel?`${c}18`:"rgba(255,255,255,0.02)",transition:"all 0.15s"}}>
                      <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:3}}>
                        <div style={{width:9,height:9,borderRadius:"50%",background:sel?c:"rgba(255,255,255,0.2)",border:`2px solid ${sel?c:"rgba(255,255,255,0.2)"}`}}/>
                        <span style={{color:sel?"#fff":"rgba(255,255,255,0.65)",fontSize:13,fontWeight:sel?600:400}}>{g.name}</span>
                      </div>
                      <span style={{color:"rgba(255,255,255,0.35)",fontSize:11,marginLeft:16}}>{g.count} contacts</span>
                    </div>
                  );
                })}
              </div>}
            {form.targetGroup&&<p style={{color:"rgba(255,255,255,0.35)",fontSize:12,margin:"6px 0 0"}}>Will call up to <strong style={{color:"#fff"}}>{Math.min(form.maxCalls, contacts.filter(x=>x.groupName===form.targetGroup).length)}</strong> contacts from <strong style={{color:groupColor(form.targetGroup)}}>{form.targetGroup}</strong></p>}
          </div>

          {/* Campaign Welcome Speech — TTS override */}
          <WelcomeSpeechEditor
            value={form.campaignWelcomeSpeech}
            onChange={v=>setForm({...form,campaignWelcomeSpeech:v})}
            elevenLabsKey={creds.elevenLabsKey}
            elevenLabsVoiceId={creds.elevenLabsVoiceId}
          />

          {/* Survey Question */}
          <div style={{marginBottom:12}}>
            <label style={lbl}>Survey Question *</label>
            <textarea style={{...inp,resize:"vertical"}} rows={3} value={form.question} onChange={e=>setForm({...form,question:e.target.value})} placeholder="நமது மாநிலத்தில் கூடுதல் பெண்கள் விடுதி அமைக்க வேண்டுமா?"/>
          </div>
          <div style={{marginBottom:16}}>
            <label style={{...lbl,display:"flex",alignItems:"center",gap:7}}>
              <Ic d={P.sparkle} s={12} c="#4ade80"/>
              Background Context — AI Knowledge Base
              <span style={{padding:"1px 7px",borderRadius:99,fontSize:10,background:"rgba(74,222,128,0.12)",color:"#4ade80",fontWeight:600,textTransform:"none",letterSpacing:0}}>Gemini reads this live</span>
            </label>
            <textarea style={{...inp,resize:"vertical",borderColor:"rgba(74,222,128,0.2)",background:"rgba(74,222,128,0.03)",fontFamily:"'Courier New',monospace",fontSize:12}} rows={6} value={form.context} onChange={e=>setForm({...form,context:e.target.value})} placeholder={`Write facts Gemini can use to answer citizen questions during the call.

Recommended format:
SCHEME: [Full scheme name in Tamil and English]
BUDGET: [Exact allocation]
LOCATIONS: [District → area, capacity]
ELIGIBILITY: [Who qualifies, income limit, age]
TIMELINE: [Key dates]
COMMON CONCERNS:
- "[objection]": [how to address it]
- "[objection]": [how to address it]

Gemini will ONLY cite facts written here. It will not invent anything.`}/>
            <p style={{color:"rgba(74,222,128,0.5)",fontSize:11,margin:"4px 0 0"}}>The more specific and structured your context, the better Gemini handles citizen questions live on the call.</p>
          </div>
          <div style={{display:"flex",gap:10}}>
            <button style={btnP} onClick={create}><Ic d={P.check} s={14}/>Create Campaign</button>
            <button style={btnG} onClick={()=>{setShowForm(false);setIsClone(false);setForm({title:"",question:"",context:"",maxCalls:20,targetGroup:"",campaignWelcomeSpeech:""});}}>Cancel</button>
          </div>
        </div>
      )}

      {campaigns.length===0&&!showForm&&<div style={{textAlign:"center",padding:"50px 20px",color:"rgba(255,255,255,0.25)"}}><Ic d={P.campaign} s={42} c="rgba(255,255,255,0.1)"/><p style={{marginTop:12}}>No campaigns yet.</p></div>}

      {campaigns.map(c=>{
        const prog=progress[c.id], sc=c.status==="completed"?"#a5b4fc":c.status==="running"?"#22c55e":"rgba(255,255,255,0.3)";
        const grpCount=c.targetGroup?contacts.filter(x=>x.groupName===c.targetGroup).length:contacts.length;
        const hasCampaignSpeech=!!c.campaignWelcomeSpeech?.trim();
        return (
          <div key={c.id} style={{...card,marginBottom:10}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12,flexWrap:"wrap"}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",gap:8,marginBottom:6,alignItems:"center",flexWrap:"wrap"}}>
                  <span style={{color:"#fff",fontSize:15,fontWeight:600}}>{c.title}</span>
                  <span style={{padding:"2px 9px",borderRadius:99,fontSize:11,fontWeight:700,background:`${sc}18`,color:sc,textTransform:"capitalize"}}>{c.status}</span>
                  {c.targetGroup&&<GroupBadge name={c.targetGroup}/>}
                  {hasCampaignSpeech&&<span style={{display:"inline-flex",alignItems:"center",gap:4,padding:"1px 8px",borderRadius:99,fontSize:10,fontWeight:600,background:"rgba(168,85,247,0.15)",color:"#c084fc",border:"1px solid rgba(168,85,247,0.25)"}}><Ic d={P.volume} s={10} c="#c084fc"/>Custom Speech</span>}
                </div>
                <p style={{color:"rgba(255,255,255,0.5)",fontSize:13,margin:"0 0 4px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.question}</p>
                {hasCampaignSpeech&&<p style={{color:"rgba(168,85,247,0.6)",fontSize:12,margin:"0 0 4px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>🎙 "{c.campaignWelcomeSpeech.slice(0,80)}{c.campaignWelcomeSpeech.length>80?"…":""}"</p>}
                <span style={{color:"rgba(255,255,255,0.25)",fontSize:11}}>Created {c.created}{c.createdBy?" by "+c.createdBy:""} · Max {c.maxCalls} · {grpCount} contacts in group</span>
              </div>
              <div style={{display:"flex",gap:8,flexShrink:0,flexWrap:"wrap"}}>
                {c.status!=="running"&&(currentUser?.role==="admin"||c.createdBy===currentUser?.username)&&<button style={{...btnP,background:c.status==="completed"?"rgba(99,102,241,0.3)":"linear-gradient(135deg,#22c55e,#16a34a)"}} onClick={()=>launch(c)}><Ic d={P.play} s={13}/>{c.status==="completed"?"Re-run":"Launch"}</button>}
                <button title="Clone campaign" style={{...btnG,padding:"9px 12px",color:"#fbbf24",borderColor:"rgba(251,191,36,0.2)",background:"rgba(251,191,36,0.06)"}} onClick={()=>cloneCampaign(c)}><Ic d={P.copy} s={13} c="#fbbf24"/></button>
                {(currentUser?.role==="admin" || c.createdBy===currentUser?.username) ? (
                  <button style={{...btnG,color:"#ef4444",borderColor:"rgba(239,68,68,0.2)",padding:"9px 12px"}} onClick={async()=>{setCampaigns(p=>p.filter(x=>x.id!==c.id));try{await db.del(`/api/campaigns/${c.id}`);}catch(e){}}}><Ic d={P.trash} s={13}/></button>
                ) : (
                  <span style={{padding:"9px 12px",borderRadius:7,fontSize:11,color:"rgba(255,255,255,0.2)",border:"1px solid rgba(255,255,255,0.06)",cursor:"not-allowed"}} title="You can only delete campaigns you created"><Ic d={P.trash} s={13} c="rgba(255,255,255,0.15)"/></span>
                )}
              </div>
            </div>
            {c.status==="running"&&prog&&(
              <div style={{marginTop:12}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                  <span style={{color:"#22c55e",fontSize:12,fontWeight:600}}>📞 Calling {prog.done}/{prog.total} from {c.targetGroup||"all"}…</span>
                  <span style={{color:"rgba(255,255,255,0.4)",fontSize:12}}>{Math.round(prog.done/prog.total*100)}%</span>
                </div>
                <div style={{height:5,background:"rgba(255,255,255,0.05)",borderRadius:99}}><div style={{height:"100%",width:`${prog.done/prog.total*100}%`,background:"#22c55e",borderRadius:99,transition:"width 0.3s"}}/></div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// CONVERSATION BUBBLE — renders one AI/user turn pair
// ═════════════════════════════════════════════════════════════════════════════
// ── Mini audio player ──────────────────────────────────────────────────────────
function AudioPlayer({ url, label = "Play", accent = "#a5b4fc" }) {
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err,     setErr]     = useState(false);
  const audioRef = useRef(null);

  const proxyUrl = url && url.includes("api.twilio.com")
    ? `${API}/api/recording/proxy?url=${encodeURIComponent(url)}`
    : url;

  const toggle = () => {
    if (!audioRef.current) return;
    if (playing) {
      audioRef.current.pause();
      setPlaying(false);
    } else {
      setLoading(true);
      audioRef.current.play().then(() => {
        setLoading(false);
        setPlaying(true);
      }).catch(() => {
        setLoading(false);
        setErr(true);
      });
    }
  };

  if (!url) return null;

  return (
    <div style={{display:"flex",alignItems:"center",gap:6,marginTop:5}}>
      <audio
        ref={audioRef}
        src={proxyUrl}
        onEnded={() => setPlaying(false)}
        onError={() => { setErr(true); setLoading(false); setPlaying(false); }}
        preload="none"
      />
      <button
        onClick={toggle}
        disabled={err}
        style={{
          display:"flex",alignItems:"center",gap:5,
          padding:"3px 10px",borderRadius:99,border:"none",cursor:err?"not-allowed":"pointer",
          background: err ? "rgba(239,68,68,0.12)" : playing ? `${accent}25` : "rgba(255,255,255,0.06)",
          color: err ? "#ef4444" : playing ? accent : "rgba(255,255,255,0.5)",
          fontSize:11,fontFamily:"inherit",fontWeight:600,transition:"all 0.15s"
        }}
      >
        {loading ? (
          <span style={{display:"inline-block",width:10,height:10,borderRadius:"50%",border:`2px solid ${accent}`,borderTopColor:"transparent",animation:"spin 0.8s linear infinite"}}/>
        ) : err ? (
          <Ic d={P.x} s={10} c="#ef4444"/>
        ) : playing ? (
          <svg width={10} height={10} viewBox="0 0 10 10" fill={accent}><rect x="1" y="1" width="3" height="8" rx="1"/><rect x="6" y="1" width="3" height="8" rx="1"/></svg>
        ) : (
          <svg width={10} height={10} viewBox="0 0 10 10" fill={accent}><polygon points="1,1 9,5 1,9"/></svg>
        )}
        {err ? "Unavailable" : playing ? "Pause" : label}
      </button>
    </div>
  );
}

function ConversationTurn({ turn, index }) {
  return (
    <div style={{marginBottom:12}}>
      {/* AI bubble */}
      <div style={{display:"flex",gap:8,alignItems:"flex-start",marginBottom:6}}>
        <div style={{width:24,height:24,borderRadius:"50%",background:"rgba(99,102,241,0.25)",border:"1px solid rgba(99,102,241,0.4)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:1}}>
          <Ic d={P.mic} s={11} c="#a5b4fc"/>
        </div>
        <div style={{background:"rgba(99,102,241,0.1)",border:"1px solid rgba(99,102,241,0.2)",borderRadius:"0 10px 10px 10px",padding:"8px 12px",maxWidth:"85%"}}>
          <div style={{color:"rgba(99,102,241,0.7)",fontSize:9,fontWeight:700,textTransform:"uppercase",letterSpacing:0.5,marginBottom:3}}>AI · Turn {index+1}</div>
          <p style={{color:"#c7d2fe",fontSize:13,margin:0,lineHeight:1.6}}>{turn.ai}</p>
          {turn.audioUrl && <AudioPlayer url={turn.audioUrl} label="Play AI reply" accent="#a5b4fc"/>}
        </div>
      </div>
      {/* User bubble */}
      <div style={{display:"flex",gap:8,alignItems:"flex-start",justifyContent:"flex-end"}}>
        <div style={{background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:"10px 0 10px 10px",padding:"8px 12px",maxWidth:"85%"}}>
          <div style={{color:"rgba(255,255,255,0.35)",fontSize:9,fontWeight:700,textTransform:"uppercase",letterSpacing:0.5,marginBottom:3}}>User · Voice Recording</div>
          <p style={{color:"rgba(255,255,255,0.8)",fontSize:13,margin:0,lineHeight:1.6,fontStyle:turn.user==="(silence)"?"italic":"normal",opacity:turn.user==="(silence)"?0.4:1}}>{turn.user}</p>
          {turn.userAudioUrl && <AudioPlayer url={turn.userAudioUrl} label="Play recording" accent="#34d399"/>}
        </div>
        <div style={{width:24,height:24,borderRadius:"50%",background:"rgba(255,255,255,0.08)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:1}}>
          <Ic d={P.phone} s={11} c="rgba(255,255,255,0.5)"/>
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// RESPONSES
// ═════════════════════════════════════════════════════════════════════════════
function Responses({ results, db, setResults }) {
  const [sentFilter,  setSentFilter]  = useState("all");
  const [groupFilter, setGroupFilter] = useState("all");
  const [expanded,    setExpanded]    = useState({});
  const groups = [...new Set(results.map(r=>r.groupName||r.targetGroup).filter(Boolean))].sort();
  const shown  = results.filter(r=>(sentFilter==="all"||r.sentiment===sentFilter)&&(groupFilter==="all"||(r.groupName||r.targetGroup)===groupFilter));
  const clearAll = async () => {
    if(!window.confirm("Clear all results from Firestore?")) return;
    setResults([]); try{await db.del("/api/results");}catch(e){}
  };
  const toggleExpand = id => setExpanded(p=>({...p,[id]:!p[id]}));

  return (
    <div style={{padding:32,maxWidth:920}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14,flexWrap:"wrap",gap:10}}>
        <div>
          <h1 style={{color:"#fff",fontSize:24,fontWeight:700,margin:"0 0 4px"}}>Call Responses</h1>
          <p style={{color:"rgba(255,255,255,0.4)",fontSize:13,margin:0}}>
            Interactive AI conversations · <span style={{color:"#38bdf8"}}>Whisper</span> · <span style={{color:"#4ade80"}}>Gemini</span> · <span style={{color:"#c084fc"}}>ElevenLabs</span>
          </p>
        </div>
        {results.length>0&&<button style={{...btnG,color:"#ef4444",borderColor:"rgba(239,68,68,0.2)"}} onClick={clearAll}><Ic d={P.trash} s={13}/>Clear All</button>}
      </div>

      {/* Call status summary chips */}
      {results.length>0&&(
        <div style={{display:"flex",gap:7,marginBottom:12,flexWrap:"wrap"}}>
          {Object.entries(CALL_STATUS).filter(([k])=>["completed","no-answer","disconnected","not-reachable","call-busy"].includes(k)).map(([k,v])=>{
            const count=results.filter(r=>r.status===k).length;
            if(!count) return null;
            return <div key={k} style={{display:"flex",alignItems:"center",gap:5,padding:"4px 11px",borderRadius:99,background:v.bg,border:`1px solid ${v.color}33`}}><span style={{fontSize:12}}>{v.icon}</span><span style={{color:v.color,fontSize:12,fontWeight:600}}>{v.label.replace(/^[^\s]+ /,"")}</span><span style={{color:v.color,fontSize:12,opacity:0.7}}>{count}</span></div>;
          })}
        </div>
      )}

      {/* Sentiment filter — only relevant for completed calls */}
      <div style={{display:"flex",gap:7,marginBottom:10,flexWrap:"wrap",alignItems:"center"}}>
        <span style={{color:"rgba(255,255,255,0.3)",fontSize:12}}>Sentiment:</span>
        {["all","positive","neutral","negative"].map(f=>(
          <button key={f} onClick={()=>setSentFilter(f)} style={{padding:"5px 11px",borderRadius:99,border:"1px solid",cursor:"pointer",fontFamily:"inherit",fontSize:12,fontWeight:500,textTransform:"capitalize",borderColor:sentFilter===f?(SC[f]||"#6366f1")+"80":"rgba(255,255,255,0.1)",background:sentFilter===f?(SC[f]||"rgba(99,102,241,0.2)")+"22":"transparent",color:sentFilter===f?(SC[f]||"#a5b4fc"):"rgba(255,255,255,0.4)"}}>
            {f==="all"?`All (${results.length})`:`${f} (${results.filter(r=>r.sentiment===f).length})`}
          </button>
        ))}
      </div>

      {/* Group filter */}
      {groups.length>0&&(
        <div style={{display:"flex",gap:7,marginBottom:16,flexWrap:"wrap",alignItems:"center"}}>
          <span style={{color:"rgba(255,255,255,0.3)",fontSize:12}}>Group:</span>
          <button onClick={()=>setGroupFilter("all")} style={{padding:"5px 11px",borderRadius:99,border:"1px solid",cursor:"pointer",fontFamily:"inherit",fontSize:12,borderColor:groupFilter==="all"?"rgba(255,255,255,0.3)":"rgba(255,255,255,0.08)",background:groupFilter==="all"?"rgba(255,255,255,0.07)":"transparent",color:groupFilter==="all"?"#fff":"rgba(255,255,255,0.4)"}}>All</button>
          {groups.map(g=><button key={g} onClick={()=>setGroupFilter(g)} style={{padding:"5px 11px",borderRadius:99,border:`1px solid ${groupFilter===g?groupColor(g)+"80":"rgba(255,255,255,0.08)"}`,cursor:"pointer",fontFamily:"inherit",fontSize:12,background:groupFilter===g?`${groupColor(g)}20`:"transparent",color:groupFilter===g?groupColor(g):"rgba(255,255,255,0.4)"}}>{g} ({results.filter(r=>(r.groupName||r.targetGroup)===g).length})</button>)}
        </div>
      )}

      {shown.length===0
        ? <div style={{textAlign:"center",padding:"50px 20px",color:"rgba(255,255,255,0.25)"}}><Ic d={P.phone} s={42} c="rgba(255,255,255,0.1)"/><p style={{marginTop:12}}>No responses yet.</p></div>
        : shown.slice().reverse().map(r => {
          const cs         = getCallStatus(r);
          const hasTurns   = Array.isArray(r.turns) && r.turns.length > 0;
          const isExpanded = expanded[r.id];
          const isAnswered = r.status === "completed" || r.status === "disconnected";
          // Border colour: use call status colour for non-answered, sentiment for answered
          const borderColor = isAnswered && r.sentiment !== "none"
            ? (SC[r.sentiment] || cs.color)
            : cs.color;

          return (
            <div key={r.id} style={{...card,marginBottom:10,padding:0,overflow:"hidden",borderLeft:`3px solid ${borderColor}`}}>

              {/* ── Call status banner for non-answered calls ── */}
              {!isAnswered && (
                <div style={{padding:"10px 18px",background:cs.bg,borderBottom:`1px solid ${cs.color}22`,display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                  <span style={{fontSize:18}}>{cs.icon}</span>
                  <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                    <span style={{color:cs.color,fontSize:13,fontWeight:700}}>{cs.label}</span>
                    <span style={{color:"rgba(255,255,255,0.4)",fontSize:12}}>{r.name} · {r.phone}</span>
                    {(r.groupName||r.targetGroup)&&<GroupBadge name={r.groupName||r.targetGroup}/>}
                    {/* Retry status badges */}
                    {r.retryScheduled && !r.isRetry && (
                      <span style={{display:"inline-flex",alignItems:"center",gap:4,padding:"2px 9px",borderRadius:99,fontSize:11,fontWeight:700,background:"rgba(167,139,250,0.2)",color:"#c4b5fd",border:"1px solid rgba(167,139,250,0.35)"}}>
                        🔄 Retrying in 30s…
                      </span>
                    )}
                    {r.isRetry && (
                      <span style={{display:"inline-flex",alignItems:"center",gap:4,padding:"2px 9px",borderRadius:99,fontSize:11,fontWeight:700,background:"rgba(167,139,250,0.2)",color:"#a78bfa",border:"1px solid rgba(167,139,250,0.35)"}}>
                        🔄 Retry #{r.retryCount||1}
                      </span>
                    )}
                  </div>
                  <div style={{marginLeft:"auto",display:"flex",gap:10,alignItems:"center"}}>
                    <span style={{color:"rgba(255,255,255,0.3)",fontSize:11}}>📍 {r.village}, {r.district}</span>
                    <span style={{color:"rgba(255,255,255,0.3)",fontSize:11}}>🕐 {r.time}</span>
                    <span style={{color:r.mode==="live"?"#86efac":"#fcd34d",fontSize:10,fontWeight:600}}>{r.mode==="live"?"📞 Live":"🧪 Sim"}</span>
                  </div>
                </div>
              )}

              {/* ── Full detail for answered calls ── */}
              {isAnswered && (
                <div style={{padding:"14px 18px",display:"flex",gap:11,alignItems:"flex-start"}}>
                  {/* Avatar */}
                  <div style={{width:36,height:36,borderRadius:"50%",background:cs.color+"22",display:"flex",alignItems:"center",justifyContent:"center",color:cs.color,fontWeight:700,fontSize:14,flexShrink:0}}>
                    {(r.name||"?")[0].toUpperCase()}
                  </div>
                  <div style={{flex:1,minWidth:0}}>

                    {/* Name row */}
                    <div style={{display:"flex",gap:7,alignItems:"center",marginBottom:6,flexWrap:"wrap"}}>
                      <span style={{color:"#fff",fontSize:13,fontWeight:600}}>{r.name}</span>
                      <span style={{color:"rgba(255,255,255,0.3)",fontSize:11,fontFamily:"monospace"}}>{r.phone}</span>
                      {/* Call status badge */}
                      <span style={{display:"inline-flex",alignItems:"center",gap:4,padding:"2px 9px",borderRadius:99,fontSize:11,fontWeight:700,background:cs.bg,color:cs.color,border:`1px solid ${cs.color}33`}}>
                        {cs.icon} {cs.label.replace(/^[^\w]+ /,"")}
                      </span>
                      {/* Retry badges */}
                      {r.isRetry && (
                        <span style={{display:"inline-flex",alignItems:"center",gap:4,padding:"2px 9px",borderRadius:99,fontSize:10,fontWeight:700,background:"rgba(167,139,250,0.15)",color:"#a78bfa",border:"1px solid rgba(167,139,250,0.3)"}}>
                          🔄 Retry #{r.retryCount||1}
                        </span>
                      )}
                      {r.retryScheduled && !r.isRetry && (
                        <span style={{display:"inline-flex",alignItems:"center",gap:4,padding:"2px 8px",borderRadius:99,fontSize:10,background:"rgba(167,139,250,0.1)",color:"#c4b5fd",border:"1px solid rgba(167,139,250,0.2)"}}>
                          🔄 Retrying in 30s…
                        </span>
                      )}
                      {/* Sentiment badge — only when call completed */}
                      {r.sentiment && r.sentiment !== "none" && (
                        <span style={{padding:"2px 9px",borderRadius:99,fontSize:10,fontWeight:700,background:SC[r.sentiment]+"22",color:SC[r.sentiment]||"rgba(255,255,255,0.4)",textTransform:"capitalize"}}>
                          {r.sentiment}
                        </span>
                      )}
                      {(r.groupName||r.targetGroup)&&<GroupBadge name={r.groupName||r.targetGroup}/>}
                      <span style={{color:"rgba(255,255,255,0.3)",fontSize:11}}>📍 {r.village}, {r.district}</span>
                      {hasTurns&&<span style={{padding:"1px 8px",borderRadius:99,fontSize:10,background:"rgba(99,102,241,0.15)",color:"#a5b4fc",border:"1px solid rgba(99,102,241,0.2)"}}>{r.turns.length} turn{r.turns.length>1?"s":""}</span>}
                    </div>

                    {/* Greeting badge */}
                    {r.greeting&&(
                      <div style={{background:r.greetingSource==="campaign"?"rgba(168,85,247,0.06)":"rgba(255,165,0,0.06)",border:`1px solid ${r.greetingSource==="campaign"?"rgba(168,85,247,0.2)":"rgba(255,165,0,0.15)"}`,borderRadius:7,padding:"4px 10px",marginBottom:7,display:"inline-flex",alignItems:"center",gap:6}}>
                        <Ic d={P.volume} s={10} c={r.greetingSource==="campaign"?"#c084fc":"#fbbf24"}/>
                        <span style={{color:r.greetingSource==="campaign"?"rgba(168,85,247,0.7)":"rgba(255,165,0,0.6)",fontSize:10,fontWeight:600,textTransform:"uppercase",letterSpacing:0.4}}>{r.greetingSource==="campaign"?"Campaign Speech":"Village Greeting"}</span>
                        <span style={{color:r.greetingSource==="campaign"?"#e9d5ff":"#fbbf24",fontSize:11}}>{r.greeting.slice(0,55)}{r.greeting.length>55?"…":""}</span>
                      </div>
                    )}

                    {/* Last user response preview */}
                    <p style={{color:"rgba(255,255,255,0.6)",fontSize:13,margin:"0 0 7px",lineHeight:1.6,fontStyle:"italic",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                      "{r.response || (hasTurns ? r.turns[r.turns.length-1]?.user : r.transcript) || "…"}"
                    </p>

                    {/* Footer */}
                    <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
                      <span style={{color:"rgba(255,255,255,0.3)",fontSize:11}}>⏱ {r.duration}</span>
                      {/* Full datetime — handles Firestore Timestamp, {_seconds}, epoch ms, ISO string */}
                      {(()=>{
                        const raw = r.completedAtISO || r.completedAt || r.timestamp || r.startTime;
                        if (!raw) return <span style={{color:"rgba(255,255,255,0.3)",fontSize:11}}>🕐 {r.time||"—"}</span>;
                        let dt;
                        try {
                          if (raw?.toDate) dt = raw.toDate();
                          else if (raw?._seconds) dt = new Date(raw._seconds * 1000);
                          else if (raw?.seconds)  dt = new Date(raw.seconds  * 1000);
                          else dt = new Date(raw);
                          if (isNaN(dt.getTime())) throw new Error("bad");
                          const d = dt.toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"});
                          const t = dt.toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:true});
                          return <span style={{color:"rgba(255,255,255,0.35)",fontSize:11}}>🗓 {d} &nbsp;🕐 {t}</span>;
                        } catch(_) {
                          return <span style={{color:"rgba(255,255,255,0.3)",fontSize:11}}>🕐 {r.time||"—"}</span>;
                        }
                      })()}
                      <span style={{color:r.mode==="live"?"#86efac":"#fcd34d",fontSize:10,fontWeight:600}}>{r.mode==="live"?"📞 Live":"🧪 Sim"}</span>
                      {/* Download greeting audio */}
                      {r.greetingAudioUrl && (
                        <button
                          onClick={()=>{
                            const url = r.greetingAudioUrl.startsWith("http") ? r.greetingAudioUrl : `${API}${r.greetingAudioUrl}`;
                            const a = document.createElement("a");
                            a.href = url;
                            a.download = `${(r.name||"call").replace(/\s+/g,"_")}_greeting.mp3`;
                            a.target = "_blank";
                            document.body.appendChild(a); a.click(); document.body.removeChild(a);
                          }}
                          style={{...btnG,fontSize:11,padding:"3px 10px",color:"#fcd34d",borderColor:"rgba(252,211,77,0.25)"}}
                          title="Download AI greeting audio"
                        >⬇ Greeting</button>
                      )}
                      {/* Download user voice recordings */}
                      {hasTurns && r.turns.some(t=>t.userAudioUrl) && (
                        <button
                          onClick={()=>{
                            r.turns.forEach((t,i)=>{
                              if (!t.userAudioUrl) return;
                              const a = document.createElement("a");
                              a.href = `${API}/api/recording/proxy?url=${encodeURIComponent(t.userAudioUrl)}`;
                              a.download = `${(r.name||"call").replace(/\s+/g,"_")}_user_turn${i+1}.mp3`;
                              document.body.appendChild(a); a.click(); document.body.removeChild(a);
                            });
                          }}
                          style={{...btnG,fontSize:11,padding:"3px 10px",color:"#34d399",borderColor:"rgba(52,211,153,0.25)"}}
                          title="Download user voice recording(s)"
                        >⬇ User Audio</button>
                      )}
                      {/* Download AI reply audio */}
                      {hasTurns && r.turns.some(t=>t.audioUrl) && (
                        <button
                          onClick={()=>{
                            r.turns.forEach((t,i)=>{
                              if (!t.audioUrl) return;
                              const url = t.audioUrl.startsWith("http") ? t.audioUrl : `${API}${t.audioUrl}`;
                              const a = document.createElement("a");
                              a.href = url;
                              a.download = `${(r.name||"call").replace(/\s+/g,"_")}_ai_turn${i+1}.mp3`;
                              a.target = "_blank";
                              document.body.appendChild(a); a.click(); document.body.removeChild(a);
                            });
                          }}
                          style={{...btnG,fontSize:11,padding:"3px 10px",color:"#a5b4fc",borderColor:"rgba(165,180,252,0.25)"}}
                          title="Download AI reply audio(s)"
                        >⬇ AI Audio</button>
                      )}
                      {hasTurns&&(
                        <button onClick={()=>toggleExpand(r.id)} style={{...btnG,fontSize:11,padding:"3px 10px",marginLeft:"auto",color:"#a5b4fc",borderColor:"rgba(99,102,241,0.25)"}}>
                          <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{transform:isExpanded?"rotate(90deg)":"rotate(0deg)",transition:"transform 0.2s"}}><path d="M9 18l6-6-6-6"/></svg>
                          {isExpanded?"Hide conversation":"View conversation"}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* ── Conversation turns (expandable) ── */}
              {hasTurns && isExpanded && (
                <div style={{borderTop:"1px solid rgba(255,255,255,0.06)",padding:"14px 18px 16px",background:"rgba(0,0,0,0.15)"}}>
                  <div style={{color:"rgba(255,255,255,0.3)",fontSize:10,fontWeight:600,textTransform:"uppercase",letterSpacing:0.5,marginBottom:12}}>
                    Full conversation · {r.turns.length} turn{r.turns.length>1?"s":""} · max 119s · Gemini-powered
                  </div>
                  {/* Greeting audio — played before survey question */}
                  {r.greetingAudioUrl && (
                    <div style={{display:"flex",gap:8,alignItems:"flex-start",marginBottom:10}}>
                      <div style={{width:24,height:24,borderRadius:"50%",background:"rgba(252,211,77,0.15)",border:"1px solid rgba(252,211,77,0.35)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:1}}>
                        <Ic d={P.mic} s={11} c="#fcd34d"/>
                      </div>
                      <div style={{background:"rgba(252,211,77,0.07)",border:"1px solid rgba(252,211,77,0.2)",borderRadius:"0 10px 10px 10px",padding:"8px 12px",flex:1}}>
                        <div style={{color:"rgba(252,211,77,0.7)",fontSize:9,fontWeight:700,textTransform:"uppercase",letterSpacing:0.5,marginBottom:5}}>AI · Greeting</div>
                        <p style={{color:"#fde68a",fontSize:13,margin:"0 0 6px"}}>{r.greeting || "வணக்கம்!"}</p>
                        <AudioPlayer url={r.greetingAudioUrl.startsWith("http") ? r.greetingAudioUrl : `${API}${r.greetingAudioUrl}`} label="Play greeting" accent="#fcd34d"/>
                      </div>
                    </div>
                  )}
                  {r.turns.map((t,i)=><ConversationTurn key={i} turn={t} index={i}/>)}
                  {r.status!=="disconnected"&&(
                    <div style={{display:"flex",gap:8,alignItems:"flex-start",marginTop:6}}>
                      <div style={{width:24,height:24,borderRadius:"50%",background:"rgba(99,102,241,0.25)",border:"1px solid rgba(99,102,241,0.4)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:1}}><Ic d={P.mic} s={11} c="#a5b4fc"/></div>
                      <div style={{background:"rgba(34,197,94,0.08)",border:"1px solid rgba(34,197,94,0.2)",borderRadius:"0 10px 10px 10px",padding:"8px 12px"}}>
                        <div style={{color:"rgba(34,197,94,0.6)",fontSize:9,fontWeight:700,textTransform:"uppercase",letterSpacing:0.5,marginBottom:3}}>AI · Closing</div>
                        <p style={{color:"#86efac",fontSize:13,margin:0}}>உங்கள் மதிப்புமிக்க கருத்துக்கு மிக்க நன்றி. வணக்கம்!</p>
                      </div>
                    </div>
                  )}
                  {r.status==="disconnected"&&(
                    <div style={{marginTop:8,padding:"7px 12px",borderRadius:8,background:"rgba(251,146,60,0.08)",border:"1px solid rgba(251,146,60,0.2)",color:"#fb923c",fontSize:12}}>
                      ⚡ User disconnected before call completed
                    </div>
                  )}
                </div>
              )}

            </div>
          );
        })}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// ANALYTICS
// ═════════════════════════════════════════════════════════════════════════════
function Analytics({ results }) {
  const [view,setView]=useState("village"), [groupFilter,setGroupFilter]=useState("all");
  const groups=[...new Set(results.map(r=>r.groupName||r.targetGroup).filter(Boolean))].sort();
  const filtered=groupFilter==="all"?results:results.filter(r=>(r.groupName||r.targetGroup)===groupFilter);
  if(!results.length) return <div style={{padding:32,textAlign:"center",paddingTop:80,color:"rgba(255,255,255,0.25)"}}><Ic d={P.chart} s={50} c="rgba(255,255,255,0.1)"/><p style={{marginTop:14}}>No data yet.</p></div>;
  const agg={};
  filtered.forEach(r=>{const k=view==="village"?`${r.village} · ${r.district}`:r.district; if(!agg[k]) agg[k]={pos:0,neu:0,neg:0}; if(r.sentiment==="positive") agg[k].pos++; else if(r.sentiment==="neutral") agg[k].neu++; else agg[k].neg++;});
  const rows=Object.entries(agg).map(([k,v])=>({name:k,...v,total:v.pos+v.neu+v.neg})).sort((a,b)=>b.total-a.total);
  const tot=filtered.length||1, pos=filtered.filter(r=>r.sentiment==="positive").length, neu=filtered.filter(r=>r.sentiment==="neutral").length, neg=filtered.filter(r=>r.sentiment==="negative").length;
  const distAgg={};
  filtered.forEach(r=>{if(!distAgg[r.district])distAgg[r.district]={pos:0,total:0};distAgg[r.district].total++;if(r.sentiment==="positive")distAgg[r.district].pos++;});
  return (
    <div style={{padding:32,maxWidth:1060}}>
      <h1 style={{color:"#fff",fontSize:24,fontWeight:700,margin:"0 0 4px"}}>Geographic Analytics</h1>
      <p style={{color:"rgba(255,255,255,0.4)",fontSize:13,margin:"0 0 16px"}}>Village & district sentiment · Tamil Nadu</p>
      {groups.length>0&&(
        <div style={{display:"flex",gap:7,marginBottom:20,flexWrap:"wrap",alignItems:"center"}}>
          <span style={{color:"rgba(255,255,255,0.3)",fontSize:12}}>Group:</span>
          <button onClick={()=>setGroupFilter("all")} style={{padding:"5px 11px",borderRadius:99,border:"1px solid",cursor:"pointer",fontFamily:"inherit",fontSize:12,borderColor:groupFilter==="all"?"rgba(255,255,255,0.3)":"rgba(255,255,255,0.08)",background:groupFilter==="all"?"rgba(255,255,255,0.07)":"transparent",color:groupFilter==="all"?"#fff":"rgba(255,255,255,0.4)"}}>All ({results.length})</button>
          {groups.map(g=><button key={g} onClick={()=>setGroupFilter(g)} style={{padding:"5px 11px",borderRadius:99,border:`1px solid ${groupFilter===g?groupColor(g)+"80":"rgba(255,255,255,0.08)"}`,cursor:"pointer",fontFamily:"inherit",fontSize:12,background:groupFilter===g?`${groupColor(g)}20`:"transparent",color:groupFilter===g?groupColor(g):"rgba(255,255,255,0.4)"}}>{g} ({results.filter(r=>(r.groupName||r.targetGroup)===g).length})</button>)}
        </div>
      )}
      <div style={{display:"flex",gap:12,marginBottom:20,flexWrap:"wrap"}}>
        {[["Positive",pos,SC.positive],["Neutral",neu,SC.neutral],["Negative",neg,SC.negative]].map(([l,v,c])=>(
          <div key={l} style={{...card,flex:1,minWidth:130,textAlign:"center",borderColor:`${c}20`}}>
            <div style={{fontSize:28,fontWeight:700,color:c,fontFamily:"monospace"}}>{Math.round(v/tot*100)}%</div>
            <div style={{color:"rgba(255,255,255,0.4)",fontSize:12,marginTop:3}}>{l} · {v}</div>
          </div>
        ))}
      </div>
      <div style={{display:"flex",gap:8,marginBottom:14}}>
        {["village","district"].map(v=><button key={v} onClick={()=>setView(v)} style={{...btnG,textTransform:"capitalize",background:view===v?"rgba(99,102,241,0.15)":"transparent",color:view===v?"#a5b4fc":"rgba(255,255,255,0.4)",borderColor:view===v?"rgba(99,102,241,0.35)":"rgba(255,255,255,0.1)"}}>By {v}</button>)}
      </div>
      <div style={{...card,marginBottom:18}}>
        <div style={{color:"#fff",fontSize:14,fontWeight:600,marginBottom:16}}>Sentiment by {view}</div>
        {rows.slice(0,25).map(r=>{const t=r.total||1;return(
          <div key={r.name} style={{marginBottom:12}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{color:"rgba(255,255,255,0.75)",fontSize:13}}>{r.name}</span><span style={{color:"rgba(255,255,255,0.3)",fontSize:11}}>{r.total}</span></div>
            <div style={{height:20,background:"rgba(255,255,255,0.04)",borderRadius:6,display:"flex",overflow:"hidden"}}>
              {[["pos",SC.positive],["neu",SC.neutral],["neg",SC.negative]].map(([k,c])=>{const w=r[k]/t*100;return w>0?<div key={k} style={{width:`${w}%`,background:c,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,color:"rgba(255,255,255,0.9)",fontWeight:600}}>{w>12?Math.round(w)+"%":""}</div>:null;})}
            </div>
          </div>
        );})}
      </div>
      <div style={card}>
        <div style={{color:"#fff",fontSize:14,fontWeight:600,marginBottom:14}}>🗺️ District Heat Map — Positive %</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(118px,1fr))",gap:8}}>
          {DISTRICTS.map(d=>{const data=distAgg[d]||{pos:0,total:0};const pct=data.total>0?Math.round(data.pos/data.total*100):0;const a=0.06+pct/100*0.5;return(
            <div key={d} style={{background:`rgba(34,197,94,${a})`,border:`1px solid rgba(34,197,94,${a+0.1})`,borderRadius:10,padding:"10px 8px",textAlign:"center"}}>
              <div style={{fontSize:18,fontWeight:700,color:"#fff",fontFamily:"monospace"}}>{data.total>0?pct+"%":"—"}</div>
              <div style={{color:"rgba(255,255,255,0.6)",fontSize:10,marginTop:2,lineHeight:1.3}}>{d}</div>
              <div style={{color:"rgba(255,255,255,0.3)",fontSize:10}}>{data.total}</div>
            </div>
          );})}
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// DASHBOARD
// ═════════════════════════════════════════════════════════════════════════════
function Dashboard({ campaigns, contacts, results, setPage }) {
  const pos=results.filter(r=>r.sentiment==="positive").length, neu=results.filter(r=>r.sentiment==="neutral").length, neg=results.filter(r=>r.sentiment==="negative").length, tot=results.length||1;
  const answered=results.filter(r=>r.status==="completed").length;
  const missed=results.filter(r=>["no-answer","call-busy","not-reachable","disconnected"].includes(r.status)).length;
  const groups=[...new Map(contacts.filter(c=>c.groupName).map(c=>[c.groupName,{name:c.groupName,count:contacts.filter(x=>x.groupName===c.groupName).length}])).values()];
  const bv={};
  results.forEach(r=>{const k=`${r.village}·${r.district}`;if(!bv[k])bv[k]={pos:0,neu:0,neg:0};if(r.sentiment==="positive")bv[k].pos++;else if(r.sentiment==="neutral")bv[k].neu++;else bv[k].neg++;});
  const topV=Object.entries(bv).sort((a,b)=>(b[1].pos+b[1].neu+b[1].neg)-(a[1].pos+a[1].neu+a[1].neg)).slice(0,5);
  return (
    <div style={{padding:32,maxWidth:1060}}>
      <h1 style={{color:"#fff",fontSize:24,fontWeight:700,margin:"0 0 4px"}}>Dashboard</h1>
      <p style={{color:"rgba(255,255,255,0.4)",fontSize:13,margin:"0 0 22px"}}><span style={{color:"#60a5fa"}}>Exotel</span> · <span style={{color:"#c084fc"}}>ElevenLabs</span> · <span style={{color:"#38bdf8"}}>Whisper</span> · <span style={{color:"#4ade80"}}>Gemini</span> · <span style={{color:"#f97316"}}>Firestore</span></p>
      <div style={{display:"flex",gap:12,marginBottom:20,flexWrap:"wrap"}}>
        {[{l:"Campaigns",v:campaigns.length,c:"#a5b4fc"},{l:"Groups",v:groups.length,c:"#e879f9"},{l:"Contacts",v:contacts.length,c:"#60a5fa"},{l:"Calls Made",v:results.length,c:"#fff"},{l:"✓ Answered",v:answered,c:"#22c55e",p:results.length?Math.round(answered/results.length*100):0},{l:"📵 Missed",v:missed,c:"#f59e0b",p:results.length?Math.round(missed/results.length*100):0},{l:"Positive",v:pos,c:SC.positive,p:Math.round(pos/(answered||1)*100)},{l:"Neutral",v:neu,c:SC.neutral,p:Math.round(neu/(answered||1)*100)},{l:"Negative",v:neg,c:SC.negative,p:Math.round(neg/(answered||1)*100)}].map(s=>(
          <div key={s.l} style={{...card,flex:1,minWidth:100}}>
            <div style={{color:"rgba(255,255,255,0.4)",fontSize:10,fontWeight:600,textTransform:"uppercase",letterSpacing:0.5,marginBottom:6}}>{s.l}</div>
            <div style={{color:s.c,fontSize:26,fontWeight:700,fontFamily:"monospace"}}>{s.v}</div>
            {s.p!=null&&<div style={{marginTop:6,height:3,background:"rgba(255,255,255,0.06)",borderRadius:99}}><div style={{height:"100%",width:`${s.p}%`,background:s.c,borderRadius:99}}/></div>}
          </div>
        ))}
      </div>
      {groups.length>0&&(
        <div style={{...card,marginBottom:16}}>
          <div style={{color:"#fff",fontSize:14,fontWeight:600,marginBottom:12}}>Contact Groups</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:10}}>
            {groups.map(g=>{const rc=results.filter(r=>(r.groupName||r.targetGroup)===g.name).length;return(
              <div key={g.name} style={{padding:"10px 14px",borderRadius:11,background:`${groupColor(g.name)}14`,border:`1px solid ${groupColor(g.name)}30`,display:"flex",alignItems:"center",gap:9}}>
                <div style={{width:7,height:7,borderRadius:"50%",background:groupColor(g.name)}}/>
                <div><div style={{color:"#fff",fontSize:13,fontWeight:600}}>{g.name}</div><div style={{color:"rgba(255,255,255,0.4)",fontSize:11}}>{g.count} contacts · {rc} calls</div></div>
              </div>
            );})}
          </div>
        </div>
      )}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
        <div style={card}>
          <div style={{color:"#fff",fontSize:14,fontWeight:600,marginBottom:14}}>Overall Sentiment</div>
          {!results.length?<p style={{color:"rgba(255,255,255,0.3)",fontSize:13}}>Launch a campaign to see data.</p>
          :[["Positive",pos,SC.positive],["Neutral",neu,SC.neutral],["Negative",neg,SC.negative]].map(([l,v,c])=>(
            <div key={l} style={{marginBottom:12}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{color:"rgba(255,255,255,0.7)",fontSize:13}}>{l}</span><span style={{color:c,fontSize:13,fontWeight:600}}>{Math.round(v/tot*100)}%</span></div>
              <div style={{height:7,background:"rgba(255,255,255,0.06)",borderRadius:99}}><div style={{height:"100%",width:`${v/tot*100}%`,background:c,borderRadius:99,transition:"width 0.8s"}}/></div>
            </div>
          ))}
        </div>
        <div style={card}>
          <div style={{color:"#fff",fontSize:14,fontWeight:600,marginBottom:14}}>Top Villages</div>
          {!topV.length?<p style={{color:"rgba(255,255,255,0.3)",fontSize:13}}>No data yet.</p>
          :topV.map(([v,d],i)=>{const t=d.pos+d.neu+d.neg||1;return(
            <div key={v} style={{marginBottom:11}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}><span style={{color:"rgba(255,255,255,0.8)",fontSize:13}}>{i+1}. {v}</span><span style={{color:"rgba(255,255,255,0.3)",fontSize:11}}>{t}</span></div>
              <div style={{height:6,background:"rgba(255,255,255,0.05)",borderRadius:99,display:"flex",overflow:"hidden"}}><div style={{width:`${d.pos/t*100}%`,background:SC.positive}}/><div style={{width:`${d.neu/t*100}%`,background:SC.neutral}}/><div style={{width:`${d.neg/t*100}%`,background:SC.negative}}/></div>
            </div>
          );})}
        </div>
      </div>
      {!contacts.length&&<div style={{...card,border:"1px solid rgba(99,102,241,0.2)",background:"rgba(99,102,241,0.04)",textAlign:"center",padding:36,marginTop:16}}><p style={{color:"rgba(255,255,255,0.5)",fontSize:14,margin:"0 0 16px"}}>Upload contacts, create a group, then launch a campaign.</p><button style={{...btnP,margin:"0 auto"}} onClick={()=>setPage("contacts")}><Ic d={P.upload} s={14}/>Upload Contacts</button></div>}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// SETTINGS
// ═════════════════════════════════════════════════════════════════════════════
function Settings({ creds, setCreds, db }) {
  const [form,setForm]=useState({...creds}), [saved,setSaved]=useState(false), [saving,setSaving]=useState(false), [show,setShow]=useState({});
  // keep form in sync if creds loaded from Firestore after mount
  useState(()=>setForm({...creds}));
  const save=async()=>{
    setSaving(true);
    setCreds({...form});
    try{ await db.post("/api/settings", form); } catch(e){ console.warn("[DB] Settings save failed",e.message); }
    setSaving(false); setSaved(true); setTimeout(()=>setSaved(false),2500);
  };
  const F=({l,k,ph,secret,hint})=>(
    <div>
      <label style={lbl}>{l}</label>
      <div style={{position:"relative"}}>
        <input style={{...inp,paddingRight:secret?40:13}} type={secret&&!show[k]?"password":"text"} value={form[k]||""} onChange={e=>setForm({...form,[k]:e.target.value})} placeholder={ph}/>
        {secret&&<button onClick={()=>setShow(p=>({...p,[k]:!p[k]}))} style={{position:"absolute",right:11,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",color:"rgba(255,255,255,0.35)",padding:0}}><Ic d={show[k]?P.eyeoff:P.eye} s={14}/></button>}
      </div>
      {hint&&<p style={{color:"rgba(255,255,255,0.3)",fontSize:11,margin:"4px 0 0"}}>{hint}</p>}
    </div>
  );
  const Sec=({color,icon,title,sub,children,bdr})=>(
    <div style={{...card,marginBottom:14,border:`1px solid ${bdr||"rgba(255,255,255,0.08)"}`}}>
      <div style={{color,fontSize:13,fontWeight:600,marginBottom:3,display:"flex",alignItems:"center",gap:7}}><Ic d={icon} s={14} c={color}/>{title}</div>
      {sub&&<p style={{color:"rgba(255,255,255,0.3)",fontSize:12,margin:"0 0 14px"}} dangerouslySetInnerHTML={{__html:sub}}/>}
      {children}
    </div>
  );
  return (
    <div style={{padding:32,maxWidth:760}}>
      <h1 style={{color:"#fff",fontSize:24,fontWeight:700,margin:"0 0 4px"}}>Settings</h1>
      <p style={{color:"rgba(255,255,255,0.4)",fontSize:13,margin:"0 0 22px"}}>Configure all API integrations</p>
      <div style={{...card,marginBottom:18,background:"rgba(99,102,241,0.03)",border:"1px solid rgba(99,102,241,0.18)"}}>
        <div style={{color:"#a5b4fc",fontSize:11,fontWeight:600,marginBottom:10,textTransform:"uppercase",letterSpacing:0.5}}>Active Stack</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))",gap:9}}>
          {[{l:"Telephony",s:"Exotel",c:"#60a5fa",d:"Outbound calls"},{l:"Voice TTS",s:"ElevenLabs",c:"#c084fc",d:"Natural Tamil"},{l:"STT",s:"Whisper",c:"#38bdf8",d:"Transcription"},{l:"Sentiment",s:"Gemini",c:"#4ade80",d:"AI analysis"},{l:"Database",s:"Firestore",c:"#f97316",d:"Persistent"},{l:"Hosting",s:"Firebase",c:"#fbbf24",d:"Frontend"}].map(s=>(
            <div key={s.l} style={{background:"rgba(255,255,255,0.03)",borderRadius:9,padding:"9px 12px",border:"1px solid rgba(255,255,255,0.06)"}}>
              <div style={{color:"rgba(255,255,255,0.3)",fontSize:10,textTransform:"uppercase",letterSpacing:0.5,marginBottom:2}}>{s.l}</div>
              <div style={{color:s.c,fontSize:13,fontWeight:700}}>{s.s}</div>
              <div style={{color:"rgba(255,255,255,0.3)",fontSize:11}}>{s.d}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{...card,marginBottom:14}}>
        <div style={{color:"#fff",fontSize:14,fontWeight:600,marginBottom:12}}>Call Mode</div>
        <div style={{display:"flex",gap:12}}>
          {[{v:true,label:"🧪 Simulation",desc:"Mock calls, no APIs needed"},{v:false,label:"📞 Exotel Live",desc:"Real calls via Exotel India"}].map(o=>(
            <div key={String(o.v)} onClick={()=>setForm({...form,useSimulation:o.v})} style={{flex:1,padding:14,borderRadius:10,cursor:"pointer",border:`2px solid ${form.useSimulation===o.v?"#6366f1":"rgba(255,255,255,0.08)"}`,background:form.useSimulation===o.v?"rgba(99,102,241,0.1)":"transparent"}}>
              <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:3}}><div style={{width:10,height:10,borderRadius:"50%",border:`2px solid ${form.useSimulation===o.v?"#6366f1":"rgba(255,255,255,0.2)"}`,background:form.useSimulation===o.v?"#6366f1":"transparent"}}/><span style={{color:"#fff",fontSize:13,fontWeight:600}}>{o.label}</span></div>
              <p style={{color:"rgba(255,255,255,0.4)",fontSize:12,margin:"0 0 0 17px"}}>{o.desc}</p>
            </div>
          ))}
        </div>
      </div>
      <Sec color="#60a5fa" icon={P.phone} title="Exotel — Telephony (India)" sub='Sign up at <strong style="color:#60a5fa">exotel.com</strong> → Dashboard → Settings → API' bdr="rgba(96,165,250,0.2)">
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
          <F l="Account SID" k="exotelSid" ph="your_account_sid" secret hint="Exotel → Settings → API"/>
          <F l="API Token" k="exotelToken" ph="your_api_token" secret hint="Exotel → Settings → API"/>
          <F l="Caller ID" k="exotelCallerId" ph="0XXXXXXXXXX" hint="Virtual number (0XXXXXXXXXX)"/>
          <F l="Backend URL" k="backendUrl" ph="https://api.yourdomain.com" hint="Deployed Cloud Run URL"/>
        </div>
        <div style={{background:"rgba(96,165,250,0.05)",border:"1px solid rgba(96,165,250,0.12)",borderRadius:9,padding:"9px 13px"}}>
          <div style={{color:"#93c5fd",fontSize:11,fontWeight:600,marginBottom:5}}>📋 Setup</div>
          <ol style={{color:"rgba(255,255,255,0.45)",fontSize:12,margin:0,paddingLeft:18,lineHeight:2}}>
            <li>exotel.com → Sign up → KYC (1–2 days)</li><li>Dashboard → Settings → API → copy SID & Token</li><li>Buy virtual number → use as Caller ID</li><li>Apps → Passthru app → URL: your backend /exotel/app</li>
          </ol>
        </div>
      </Sec>
      <Sec color="#c084fc" icon={P.music} title="ElevenLabs — Voice TTS (Tamil)" sub='Get key at <strong style="color:#c084fc">elevenlabs.io</strong> → Profile → API Key (free: 10k chars/month)' bdr="rgba(168,85,247,0.22)">
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
          <F l="ElevenLabs API Key" k="elevenLabsKey" ph="your_elevenlabs_key" secret/>
          <F l="Voice ID" k="elevenLabsVoiceId" ph="pNInz6obpgDQGcFmaJgB" hint="From ElevenLabs Voice Library"/>
        </div>
        <div style={{background:"rgba(168,85,247,0.05)",border:"1px solid rgba(168,85,247,0.12)",borderRadius:9,padding:"9px 13px"}}>
          <div style={{color:"#c084fc",fontSize:11,fontWeight:600,marginBottom:6}}>🎙 Recommended Voice IDs for Tamil</div>
          {[{id:"pNInz6obpgDQGcFmaJgB",name:"Adam",desc:"Male · clear"},{id:"EXAVITQu4vr4xnSDxMaL",name:"Bella",desc:"Female · warm"},{id:"21m00Tcm4TlvDq8ikWAM",name:"Rachel",desc:"Female · pro"}].map(v=>(
            <div key={v.id} style={{display:"flex",alignItems:"center",gap:9,marginBottom:5}}>
              <code style={{background:"rgba(0,0,0,0.25)",padding:"2px 7px",borderRadius:5,color:"#e9d5ff",fontSize:11,flexShrink:0}}>{v.id}</code>
              <span style={{color:"rgba(255,255,255,0.4)",fontSize:12,flex:1}}>{v.name} — {v.desc}</span>
              <button onClick={()=>setForm(f=>({...f,elevenLabsVoiceId:v.id}))} style={{...btnG,padding:"2px 9px",fontSize:11,flexShrink:0}}>Use</button>
            </div>
          ))}
        </div>
      </Sec>
      <Sec color="#38bdf8" icon={P.wave} title="Whisper — Speech-to-Text" sub='Get key at <strong style="color:#38bdf8">platform.openai.com/api-keys</strong>' bdr="rgba(56,189,248,0.18)">
        <F l="OpenAI API Key (for Whisper)" k="whisperKey" ph="sk-proj-xxxxxxxxxxxx" secret hint="whisper-1 model — accurately transcribes Tamil and Tanglish"/>
      </Sec>
      <Sec color="#4ade80" icon={P.sparkle} title="Gemini — Sentiment Analysis" sub='Get key at <strong style="color:#4ade80">aistudio.google.com</strong> → Get API Key (free tier)' bdr="rgba(74,222,128,0.18)">
        <F l="Gemini API Key" k="geminiKey" ph="AIzaSy-xxxxxxxxxxxxxxxxxxxx" secret hint="gemini-1.5-flash — classifies Tamil/Tanglish as positive, neutral, negative"/>
      </Sec>
      <div style={{display:"flex",gap:10,alignItems:"center"}}>
        <button style={{...btnP,opacity:saving?0.7:1}} onClick={save} disabled={saving}><Ic d={P.check} s={14}/>{saving?"Saving…":"Save Settings"}</button>
        {saved&&<span style={{color:"#22c55e",fontSize:13,fontWeight:600}}>✓ Saved!</span>}
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// ROOT APP
// ═════════════════════════════════════════════════════════════════════════════
const SESSION_KEY = "voxpoll_session";

function readSession() {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null"); } catch { return null; }
}
function writeSession(user) {
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(user)); } catch {}
}
function clearSession() {
  try { sessionStorage.removeItem(SESSION_KEY); } catch {}
}

export default function App() {
  const savedSession                   = readSession();
  const [auth,setAuth]                 = useState(!!savedSession);
  const [currentUser,setCurrentUser]   = useState(savedSession); // {username, role, displayName}
  const [page,setPage]                 = useState("dashboard");
  const [campaigns,setCampaigns]       = useState([]);
  const [contacts,setContacts]         = useState([]);
  const [results,setResults]           = useState([]);
  const [loading,setLoading]           = useState(!!savedSession); // load immediately if session exists
  const [creds,setCreds]               = useState({
    exotelSid:"", exotelToken:"", exotelCallerId:"", backendUrl:"",
    elevenLabsKey:"", elevenLabsVoiceId:"pNInz6obpgDQGcFmaJgB",
    whisperKey:"", geminiKey:"",
    useSimulation:true,
  });

  const isAdmin = currentUser?.role === "admin";

  const loadAll = async () => {
    setLoading(true);
    try {
      const [c,co,r,s] = await Promise.all([
        dbApi.get("/api/campaigns"),
        dbApi.get("/api/contacts"),
        dbApi.get("/api/results"),
        dbApi.get("/api/settings"),
      ]);
      setCampaigns(Array.isArray(c)?c:[]);
      setContacts(Array.isArray(co)?co:[]);
      setResults(Array.isArray(r)?r.map(x=>({...x,response:x.transcript||x.response||""})):[]);
      if(s && typeof s === "object" && !s.error) {
        setCreds(prev=>({...prev,...s}));
      }
    } catch(e){ console.warn("[DB] offline or backend not running",e.message); }
    setLoading(false);
  };

  // Auto-load data if session was restored from sessionStorage
  useEffect(() => { if (auth) loadAll(); }, []);

  const handleLogin = async (user) => {
    writeSession(user);
    setCurrentUser(user);
    setAuth(true);
    await seedAdminIfNeeded(dbApi).catch(()=>{});
    loadAll();
  };

  const handleLogout = () => {
    clearSession();
    setAuth(false);
    setCurrentUser(null);
    setPage("dashboard");
    setCampaigns([]); setContacts([]); setResults([]);
  };

  if (!auth) return <Login onLogin={handleLogin}/>;

  if(loading) return (
    <div style={{minHeight:"100vh",background:"#09090f",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:16}}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{width:38,height:38,border:"3px solid rgba(99,102,241,0.25)",borderTopColor:"#6366f1",borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>
      <p style={{color:"rgba(255,255,255,0.4)",fontSize:14}}>Loading from Firestore…</p>
    </div>
  );

  const contactGroups = [...new Map(contacts.filter(c=>c.groupName).map(c=>[c.groupName,{name:c.groupName,count:contacts.filter(x=>x.groupName===c.groupName).length}])).values()];
  const pages = {
    dashboard: <Dashboard campaigns={campaigns} contacts={contacts} results={results} setPage={setPage}/>,
    contacts:  <ContactsPage contacts={contacts} setContacts={setContacts} db={dbApi} currentUser={currentUser}/>,
    campaigns: <Campaigns campaigns={campaigns} setCampaigns={setCampaigns} contacts={contacts} setResults={setResults} creds={creds} db={dbApi} currentUser={currentUser}/>,
    calls:     <Responses results={results} db={dbApi} setResults={setResults}/>,
    analytics: <Analytics results={results}/>,
    settings:  <Settings creds={creds} setCreds={setCreds} db={dbApi}/>,
    ...(isAdmin ? { users: <UserManagement currentUser={currentUser} db={dbApi}/> } : {}),
  };
  return (
    <div style={{display:"flex",minHeight:"100vh",background:"#09090f",fontFamily:"'Segoe UI',system-ui,sans-serif"}}>
      <style>{`*{box-sizing:border-box;margin:0;padding:0}::-webkit-scrollbar{width:5px}::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.1);border-radius:3px}input,textarea,button,select{font-family:inherit}input::placeholder,textarea::placeholder{color:rgba(255,255,255,0.2)}audio::-webkit-media-controls-panel{background:#1e1e2e}`}</style>
      <Sidebar page={page} setPage={setPage} onLogout={handleLogout} creds={creds} contactGroups={contactGroups} currentUser={currentUser}/>
      <main style={{flex:1,overflowY:"auto"}}>{pages[page]||pages.dashboard}</main>
    </div>
  );
}
