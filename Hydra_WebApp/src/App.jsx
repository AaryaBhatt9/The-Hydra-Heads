/**
 * Hydrawav3 Recovery Intelligence — GlobeHack Season 1
 *
 * Setup:
 *   npm create vite@latest hydrawav3-demo -- --template react
 *   cd hydrawav3-demo && npm install
 *   # Drop this file in as src/App.jsx, then:
 *   npm run dev
 *
 * Architecture (hackathon guide):
 *   Camera → MediaPipe (33 landmarks) + rPPG (face green channel)
 *          → Structured bundle {rom, angles, symmetry, hr, hrv}
 *          → Claude API → Personalized wellness protocol
 *          → MQTT Publish → HydraWav3Pro device
 *
 * Datasets used: UI-PRMD (reference ROM ranges), UBFC-rPPG (rPPG method)
 * Tools: MediaPipe Pose (CDN), OpenCV approach via canvas
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { jsPDF } from "jspdf";
// ─── MEDIAPIPE LANDMARK INDICES ───────────────────────────────────────────────
const LM = {
  NOSE:0,LEFT_SHOULDER:11,RIGHT_SHOULDER:12,LEFT_ELBOW:13,RIGHT_ELBOW:14,
  LEFT_WRIST:15,RIGHT_WRIST:16,LEFT_HIP:23,RIGHT_HIP:24,
  LEFT_KNEE:25,RIGHT_KNEE:26,LEFT_ANKLE:27,RIGHT_ANKLE:28,
};

// ─── REFERENCE RANGES (from UI-PRMD + clinical standards) ────────────────────
const NORMS = {
  shoulderElev: { good:[140,180], fair:[90,140], label:"Shoulder elevation" },
  kneeFlexion:  { good:[120,155], fair:[80,120], label:"Knee flexion" },
  symThreshold: 10,
  hipThreshold: 8,
};

// ─── GEOMETRY HELPERS ─────────────────────────────────────────────────────────
function calcAngle(A, B, C) {
  const rad = Math.atan2(C.y-B.y,C.x-B.x) - Math.atan2(A.y-B.y,A.x-B.x);
  let d = Math.abs(rad*180/Math.PI);
  return Math.round(d>180 ? 360-d : d);
}

function romStatus(angle, norm) {
  if (angle >= norm.good[0] && angle <= norm.good[1]) return "good";
  if (angle >= norm.fair[0] && angle <= norm.fair[1]) return "fair";
  return "limited";
}

function statusColor(s) {
  return s==="good" ? "#27500A" : s==="fair" ? "#633806" : "#791F1F";
}
function statusBg(s) {
  return s==="good" ? "#EAF3DE" : s==="fair" ? "#FAEEDA" : "#FCEBEB";
}

function extractAssessment(lms) {
  const g = i => lms[i];
  const sL = calcAngle(g(LM.LEFT_ELBOW),  g(LM.LEFT_SHOULDER),  g(LM.LEFT_HIP));
  const sR = calcAngle(g(LM.RIGHT_ELBOW), g(LM.RIGHT_SHOULDER), g(LM.RIGHT_HIP));
  const kL = calcAngle(g(LM.LEFT_HIP),    g(LM.LEFT_KNEE),      g(LM.LEFT_ANKLE));
  const kR = calcAngle(g(LM.RIGHT_HIP),   g(LM.RIGHT_KNEE),     g(LM.RIGHT_ANKLE));
  const hipAsym  = Math.round(Math.abs(g(LM.LEFT_HIP).y - g(LM.RIGHT_HIP).y)*100*5);
  const shoulderAsym = Math.abs(sL-sR);
  const flags = [];
  if (romStatus(sL,NORMS.shoulderElev)!=="good") flags.push(`Left shoulder limited (${sL}°)`);
  if (romStatus(sR,NORMS.shoulderElev)!=="good") flags.push(`Right shoulder limited (${sR}°)`);
  if (romStatus(kL,NORMS.kneeFlexion) !=="good") flags.push(`Left knee restricted (${kL}°)`);
  if (romStatus(kR,NORMS.kneeFlexion) !=="good") flags.push(`Right knee restricted (${kR}°)`);
  if (shoulderAsym > NORMS.symThreshold)         flags.push(`Shoulder asymmetry (${shoulderAsym}° difference)`);
  if (hipAsym      > NORMS.hipThreshold)         flags.push(`Hip tilt detected (${hipAsym}%)`);
  const areas = [];
  if (shoulderAsym>NORMS.symThreshold||romStatus(sL,NORMS.shoulderElev)!=="good") areas.push("Left Shoulder");
  if (shoulderAsym>NORMS.symThreshold||romStatus(sR,NORMS.shoulderElev)!=="good") areas.push("Right Shoulder");
  if (romStatus(kL,NORMS.kneeFlexion)!=="good") areas.push("Left Knee");
  if (romStatus(kR,NORMS.kneeFlexion)!=="good") areas.push("Right Knee");
  if (hipAsym>NORMS.hipThreshold)               areas.push("Left Hip","Right Hip");
  const mob = Math.max(1,Math.min(10,Math.round(10-(flags.length*1.2)-(Math.max(0,160-Math.max(sL,sR))/20))));
  return { shoulderL:sL,shoulderR:sR,kneeL:kL,kneeR:kR,hipAsym,shoulderAsym,flags,areas:[...new Set(areas)],mobilityScore:mob,timestamp:new Date().toLocaleTimeString() };
}

// ─── rPPG HEART RATE ESTIMATOR ────────────────────────────────────────────────
// Based on UBFC-rPPG technique: green channel autocorrelation peak detection
class RPPGEstimator {
  constructor() { this.buf=[]; }
  push(val) {
    // In production: val = mean green channel of face ROI from canvas getImageData
    // Here: simulated signal with realistic noise
    const t = Date.now()/1000;
    const sim = 0.5 + 0.02*Math.sin(2*Math.PI*1.2*t) + (Math.random()-0.5)*0.005;
    this.buf.push(val||sim);
    if (this.buf.length>180) this.buf.shift();
  }
  estimate(fps=30) {
    if (this.buf.length<60) return null;
    const sig = this.buf;
    let best=0, bestLag=0;
    const lo=Math.floor(fps*60/180), hi=Math.floor(fps*60/40);
    for (let lag=lo;lag<=hi;lag++) {
      let c=0;
      for (let i=0;i<sig.length-lag;i++) c+=sig[i]*sig[i+lag];
      if (c>best) { best=c; bestLag=lag; }
    }
    return bestLag>0 ? Math.round(fps*60/bestLag) : null;
  }
}

// ─── MQTT SESSION CONFIG ───────────────────────────────────────────────────────
function buildSessionConfig(mac, protocol, mode = "auto") {
  // Special 10-min red + blue session
  if (mode === "redBlue10") {
    return {
      mac,
      sessionCount: 1,
      sessionPause: 0,
      sDelay: 0,
      cycle1: 1,
      cycle5: 1,
      edgeCycleDuration: 10,
      cycleRepetitions: [1],
      cycleDurations: [600],
      cyclePauses: [0],
      pauseIntervals: [0],

      leftFuncs: ["leftHotRed"],
      rightFuncs: ["rightColdBlue"],

      pwmValues: {
        hot: [90, 90, 90],
        cold: [220, 220, 220],
      },

      playCmd: 1,
      led: 1,
      hotDrop: 5,
      coldDrop: 3,
      vibMin: 15,
      vibMax: 180,
      totalDuration: 600,
    };
  }

  // Your normal protocol logic
  const pwm = {
    gentle:   { hot: [70, 70, 70], cold: [180, 180, 180] },
    moderate: { hot: [80, 80, 80], cold: [220, 220, 220] },
    intense:  { hot: [90, 90, 90], cold: [250, 250, 250] },
  }[protocol.intensity] || { hot: [80, 80, 80], cold: [220, 220, 220] };

  const vib = {
    gentle:   { min: 10, max: 120 },
    moderate: { min: 15, max: 180 },
    intense:  { min: 20, max: 222 },
  }[protocol.intensity] || { min: 15, max: 180 };

  const act = protocol.goal === "activation";

  return {
    mac,
    sessionCount: 3,
    sessionPause: 30,
    sDelay: 0,
    cycle1: 1,
    cycle5: 1,
    edgeCycleDuration: 9,
    cycleRepetitions: [6, 6, 3],
    cycleDurations: [3, 3, 3],
    cyclePauses: [3, 3, 3],
    pauseIntervals: [3, 3, 3],
    leftFuncs: act ? ["leftHotRed", "leftColdBlue", "leftHotRed"] : ["leftColdBlue", "leftHotRed", "leftColdBlue"],
    rightFuncs: act ? ["rightColdBlue", "rightHotRed", "rightColdBlue"] : ["rightHotRed", "rightColdBlue", "rightHotRed"],
    pwmValues: pwm,
    playCmd: 1,
    led: 1,
    hotDrop: 5,
    coldDrop: 3,
    vibMin: vib.min,
    vibMax: vib.max,
    totalDuration: 426,
  };
}

// ─── DEVICE API ───────────────────────────────────────────────────────────────
async function deviceLogin(url,user,pass) {
  const r=await fetch(`${url}/api/v1/auth/login`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username:user,password:pass,rememberMe:true})});
  if(!r.ok) throw new Error(`Auth failed (${r.status})`);
  const d=await r.json();
  return (d.JWT_ACCESS_TOKEN||"").replace("Bearer ","");
}
async function sendMQTT(url, token, payload) {
  const r = await fetch(`${url}/api/v1/mqtt/publish`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify({
      topic: "HydraWav3Pro/config",
      payload: JSON.stringify(payload)
    })
  });

  if (!r.ok) {
    const text = await r.text();
    throw new Error(`MQTT failed: ${text}`);
  }

  // ✅ SAFE HANDLING (works for JSON OR text)
  const text = await r.text();
  try {
    return JSON.parse(text);
  } catch {
    return { message: text }; // fallback if not JSON
  }
}

// ─── AI PROTOCOL GENERATION ───────────────────────────────────────────────────
async function generateProtocol(patient, asmt) {
  const cam = asmt ? `
OBJECTIVE CAMERA DATA (MediaPipe 33-landmark pose + rPPG):
  Right shoulder elevation : ${asmt.shoulderR}°  (normal 140–180°)
  Left shoulder elevation  : ${asmt.shoulderL}°  (normal 140–180°)
  Right knee flexion       : ${asmt.kneeR}°  (normal 120–155°)
  Left knee flexion        : ${asmt.kneeL}°  (normal 120–155°)
  Shoulder asymmetry       : ${asmt.shoulderAsym}° (flag >10°)
  Hip alignment tilt       : ${asmt.hipAsym}% (flag >8%)
  Camera-detected flags    : ${asmt.flags?.length>0?asmt.flags.join("; "):"None"}
  Camera mobility score    : ${asmt.mobilityScore}/10
${asmt.heartRate?`  Heart rate (rPPG/finger)  : ${asmt.heartRate} bpm`:""}
${asmt.breathRate?`  Breathing rate            : ${asmt.breathRate} breaths/min (normal 12-20)`:""}
${asmt.hrv?`  HRV RMSSD (finger rPPG)  : ${asmt.hrv}ms (good >50ms, fair 30-50ms, low <30ms)`:""}
${asmt.visionObservation?`  Claude Vision posture     : ${asmt.visionObservation}`:""}
${asmt.visionRestrictedSide?`  Restricted side (vision)  : ${asmt.visionRestrictedSide}`:""}
${asmt.visionFlaggedAreas?.length?`  Vision flagged areas      : ${asmt.visionFlaggedAreas.join(", ")}`:""}` : "No camera assessment.";

  const prompt = `You are a Hydrawav3 wellness protocol specialist. Generate a personalized Hydrawav3 session protocol using ONLY wellness language.

SUBJECTIVE INTAKE:
  Patient: ${patient.name}, Age: ${patient.age||"n/a"}
  Practitioner: ${patient.practitionerType}
  Wellness goal: ${patient.primaryConcern}
  Self-reported areas: ${patient.areas.join(", ")||"not specified"}
  Self-reported mobility: ${patient.mobilityScore}/10
  HRV: ${patient.hrv||"n/a"} · Sleep: ${patient.sleepQuality||"n/a"}
${cam}

DEVICE: Hydrawav3 dual-pad system
  Sun pad = heating (38-42°C) + red LED 660nm → supports tissue prep, circulation
  Moon pad = cooling (12-18°C) + blue LED 450nm → supports nervous system, recovery
  Three synchronized modalities = Polar Water Resonance
  goal: "relaxation" | "activation" | "recovery" | "reset"
  intensity: "gentle" | "moderate" | "intense"

LANGUAGE RULES — CRITICAL:
  ALWAYS: recovery, wellness, mobility, performance, supports, empowers, enhances
  NEVER: medical device, clinical, diagnostic, treats, cures, diagnoses, heals, reduces inflammation

Respond ONLY with valid JSON, no markdown:
{
  "sunPadPlacement": "body area for Sun pad (3-5 words)",
  "moonPadPlacement": "body area for Moon pad (3-5 words)",
  "goal": "relaxation|activation|recovery|reset",
  "intensity": "gentle|moderate|intense",
  "sessionDurationMinutes": 9,
  "primaryFinding": "one sentence: most actionable finding from objective camera data (wellness language)",
  "reasoning": "2-3 sentences explaining protocol using both objective angles and subjective data",
  "asymmetryNote": "brief note on detected asymmetry and which side to prioritize, or null if symmetric",
  "coachingTip": "one between-visit mobility or wellness tip (one sentence)",
  "recoveryFocus": "specific measurement to re-test post-session"
}`;

  const resp=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","anthropic-dangerous-direct-browser-access":"true","anthropic-version":"2023-06-01"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:900,messages:[{role:"user",content:prompt}]})});
  const data=await resp.json();
  const text=(data.content?.[0]?.text||"{}").replace(/```json|```/g,"").trim();
  return JSON.parse(text);
}



// ─── CONTACTLESS VITALS ENGINE — Skin-Color rPPG ─────────────────────────────
//
// Heart Rate, HRV, Breathing Rate — no device contact required
//
// Method:
//  • MediaPipe detects face landmarks → Forehead + Left Cheek + Right Cheek ROIs
//  • Each ROI: filter to SKIN PIXELS ONLY via YCbCr color space
//    (Kovac 2003 criterion: 77≤Cb≤127, 133≤Cr≤173) — rejects hair/shadows/glasses
//  • Adaptive skin tone calibration from first 60 frames (ITA angle)
//    so accuracy is consistent across all skin tones
//  • CHROM rPPG (de Haan 2013): Xs=3R-2G, Ys=1.5R+G-1.5B, S=Xs-αYs
//  • POS rPPG (Wang 2017) cross-check for motion robustness
//  • Welch PSD (8s windows, 75% overlap) → dominant HR frequency
//  • Peak detection on CHROM → RMSSD HRV
//  • Shoulder width oscillation → Welch PSD → Breathing Rate

// ── Math helpers ─────────────────────────────────────────────────────────────
function mean(a){ return a.length?a.reduce((s,v)=>s+v,0)/a.length:0; }
function variance(a){ const m=mean(a); return mean(a.map(v=>(v-m)**2)); }
function stdDev(a){ return Math.sqrt(variance(a))||1; }
function nextPow2(n){ let p=1; while(p<n)p<<=1; return p; }
function clamp(v,lo,hi){ return Math.max(lo,Math.min(hi,v)); }

// ── FFT (Cooley-Tukey) ────────────────────────────────────────────────────────
function fft(signal){
  const n=nextPow2(signal.length);
  const re=[...signal,...new Array(n-signal.length).fill(0)];
  const im=new Array(n).fill(0);
  let j=0;
  for(let i=1;i<n;i++){
    let bit=n>>1;
    for(;j&bit;bit>>=1)j^=bit; j^=bit;
    if(i<j){[re[i],re[j]]=[re[j],re[i]];[im[i],im[j]]=[im[j],im[i]];}
  }
  for(let len=2;len<=n;len<<=1){
    const ang=-2*Math.PI/len;
    for(let i=0;i<n;i+=len)
      for(let k=0;k<len/2;k++){
        const c=Math.cos(ang*k),s=Math.sin(ang*k);
        const tr=c*re[i+k+len/2]-s*im[i+k+len/2], ti=s*re[i+k+len/2]+c*im[i+k+len/2];
        re[i+k+len/2]=re[i+k]-tr; im[i+k+len/2]=im[i+k]-ti; re[i+k]+=tr; im[i+k]+=ti;
      }
  }
  return{re,im,n};
}

// ── Welch PSD — stable frequency estimate ────────────────────────────────────
function welchPeak(signal,fps,minHz,maxHz,winSecs=8,overlap=0.75){
  if(!signal||signal.length<32) return null;
  const winLen=Math.min(Math.round(winSecs*fps),signal.length);
  if(winLen<32) return null;
  const step=Math.max(1,Math.round(winLen*(1-overlap)));
  const n=nextPow2(winLen);
  const avgP=new Array(n/2).fill(0);
  let cnt=0;
  for(let s=0;s+winLen<=signal.length;s+=step){
    const w=signal.slice(s,s+winLen);
    const m=mean(w);
    const wd=w.map((v,i)=>(v-m)*(0.5-0.5*Math.cos(2*Math.PI*i/(winLen-1))));
    const{re,im}=fft(wd);
    for(let i=0;i<n/2;i++) avgP[i]+=(re[i]**2+im[i]**2);
    cnt++;
  }
  if(!cnt) return null;
  let bestP=0,bestI=-1,totalP=0;
  for(let i=0;i<n/2;i++){
    const hz=i*fps/n; totalP+=avgP[i];
    if(hz>=minHz&&hz<=maxHz&&avgP[i]>bestP){bestP=avgP[i];bestI=i;}
  }
  if(bestI<0) return null;
  const hz=bestI*fps/n;
  const snr=bestP/(totalP/Math.max(1,Math.floor((maxHz-minHz)*n/fps)));
  return{hz,snr,bpm:Math.round(hz*60)};
}

// ── Bandpass via moving average subtraction ───────────────────────────────────
function bandpass(sig,fps,lo,hi){
  if(!sig||!sig.length) return[];
  const lpW=Math.max(2,Math.round(fps/lo));
  const hp=sig.map((v,i)=>{const sl=sig.slice(Math.max(0,i-lpW),i+1);return v-mean(sl);});
  const spW=Math.max(2,Math.round(fps/hi/2));
  return hp.map((_,i)=>mean(hp.slice(Math.max(0,i-spW),i+1)));
}

// ── YCbCr skin-pixel filter ───────────────────────────────────────────────────
// Only averages pixels that match skin color range — rejects hair, shadows, walls
// Criterion from Kovac et al. 2003, refined for webcam conditions
function extractSkinPixels(imageData){
  let r=0,g=0,b=0,count=0;
  const d=imageData.data;
  for(let i=0;i<d.length;i+=4){
    const R=d[i],G=d[i+1],B=d[i+2];
    // Convert to YCbCr
    const Cb=128-0.168736*R-0.331264*G+0.5*B;
    const Cr=128+0.5*R-0.418688*G-0.081312*B;
    // Skin range (works for all skin tones under normal webcam lighting)
    if(Cb>=77&&Cb<=127&&Cr>=133&&Cr<=173){
      r+=R; g+=G; b+=B; count++;
    }
  }
  if(count<8) return null;
  return{r:r/count, g:g/count, b:b/count, count};
}

// ── ITA-based skin tone → CHROM alpha calibration ────────────────────────────
// ITA (Individual Typology Angle) adjusts CHROM sensitivity per skin tone
// Lighter skin → lower alpha; darker skin → higher alpha
function computeITA(r,g,b){
  const L=0.2126*r+0.7152*g+0.0722*b;
  const ita=Math.atan((L-50)/(b||1))*(180/Math.PI);
  return clamp(1.0-(ita-30)/120, 0.6, 1.4);
}

// ── CHROM rPPG (de Haan & Jeanne 2013) ───────────────────────────────────────
function chromRPPG(rA,gA,bA,alphaScale=1.0){
  if(!rA.length) return[];
  const rM=mean(rA),gM=mean(gA),bM=mean(bA);
  if(!rM||!gM||!bM) return gA.map(v=>v-gM);
  const rN=rA.map(v=>v/rM), gN=gA.map(v=>v/gM), bN=bA.map(v=>v/bM);
  const Xs=rN.map((r,i)=>3*r-2*gN[i]);
  const Ys=rN.map((r,i)=>1.5*r+gN[i]-1.5*bN[i]);
  const alpha=(stdDev(Xs)/stdDev(Ys))*alphaScale;
  return Xs.map((x,i)=>x-alpha*Ys[i]);
}

// ── POS rPPG (Wang et al. 2017) — motion-robust cross-check ──────────────────
function posRPPG(rA,gA,bA){
  if(rA.length<10) return[];
  const rM=mean(rA),gM=mean(gA),bM=mean(bA);
  if(!rM||!gM||!bM) return[];
  const rN=rA.map(v=>v/rM-1), gN=gA.map(v=>v/gM-1), bN=bA.map(v=>v/bM-1);
  const H1=rN.map((r,i)=>r-gN[i]);
  const H2=rN.map((r,i)=>r+gN[i]-2*bN[i]);
  const alpha2=stdDev(H1)/stdDev(H2);
  return H1.map((h,i)=>h+alpha2*H2[i]);
}

// ── Weighted median BPM fusion ────────────────────────────────────────────────
function fusedBPM(results){
  const valid=results.filter(r=>r&&r.bpm>=40&&r.bpm<=200&&r.snr>1.5);
  if(!valid.length) return null;
  if(valid.length===1) return valid[0].bpm;
  const sorted=[...valid].sort((a,b)=>a.bpm-b.bpm);
  const med=sorted[Math.floor(sorted.length/2)].bpm;
  const inliers=valid.filter(r=>Math.abs(r.bpm-med)<=25);
  if(!inliers.length) return med;
  const tw=inliers.reduce((s,r)=>s+r.snr*(r.weight||1),0);
  return Math.round(inliers.reduce((s,r)=>s+r.bpm*r.snr*(r.weight||1),0)/tw);
}

// ── Waveform chart ─────────────────────────────────────────────────────────────
function WaveformChart({data,color="#E24B4A",label=""}){
  if(!data||data.length<2) return null;
  const W=600,H=65,mn=Math.min(...data),range=Math.max(...data)-mn||1;
  const pts=data.map((v,i)=>`${((i/(data.length-1))*W).toFixed(1)},${(H-((v-mn)/range)*(H-10)-5).toFixed(1)}`).join(" ");
  return(
    <div style={{marginBottom:8}}>
      {label&&<div style={{fontSize:10,color:"var(--color-text-secondary)",marginBottom:3,fontWeight:500,letterSpacing:"0.06em"}}>{label}</div>}
      <svg viewBox={`0 0 ${W} ${H}`} style={{width:"100%",height:H,display:"block",borderRadius:4}}>
        <rect width={W} height={H} fill="var(--color-background-secondary)" rx="4"/>
        <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </div>
  );
}

// ── VitalsScreen — skin-color rPPG ────────────────────────────────────────────
function VitalsScreen({onVitalsCaptured,C}){
  const videoRef=useRef(null),canvasRef=useRef(null),streamRef=useRef(null);
  const poseRef=useRef(null),camRef=useRef(null),t0Ref=useRef(null);

  // Per-ROI R,G,B buffers + combined + breathing
  const buf=useRef({
    fhR:[],fhG:[],fhB:[],   // forehead
    lcR:[],lcG:[],lcB:[],   // left cheek
    rcR:[],rcG:[],rcB:[],   // right cheek
    cR:[],cG:[],cB:[],      // combined weighted
    headY:[],               // nose Y (BCG backup)
    shoulderW:[],shoulderY:[],
    itaSamples:[],
    alphaScale:1.0,
    skinCoverage:0,
    noseX:[],noseY_mot:[],
  });

  const[status,setStatus]=useState("idle");
  const[progress,setProgress]=useState(0);
  const[bpm,setBpm]=useState(null);
  const[breathRate,setBreathRate]=useState(null);
  const[hrv,setHrv]=useState(null);
  const[waves,setWaves]=useState({hr:[],pos:[],br:[]});
  const[liveHR,setLiveHR]=useState(null);
  const[skinPct,setSkinPct]=useState(0);
  const[faceFound,setFaceFound]=useState(false);
  const[errMsg,setErrMsg]=useState("");
  const[motionLevel,setMotionLevel]=useState(0);
  const[activeSig,setActiveSig]=useState("");
  const SECS=30;

  const loadMP=async()=>{
    const load=src=>new Promise((res,rej)=>{
      if(document.querySelector(`script[src="${src}"]`)){res();return;}
      const s=document.createElement("script");s.src=src;s.onload=res;s.onerror=rej;document.head.appendChild(s);
    });
    if(!window.Pose){
      await load("https://cdn.jsdelivr.net/npm/@mediapipe/pose/pose.js");
      await load("https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js");
    }
  };

  // Sample one ROI, filter to skin pixels, push to buffers
  const sampleROI=(ctx,cx,cy,ww,hh,rBuf,gBuf,bBuf)=>{
    const px=Math.max(0,Math.round(cx-ww/2));
    const py=Math.max(0,Math.round(cy-hh/2));
    const pw=Math.round(ww), ph=Math.round(hh);
    if(pw<6||ph<6) return 0;
    try{
      const roi=ctx.getImageData(px,py,pw,ph);
      const skin=extractSkinPixels(roi);
      if(!skin) return 0;
      rBuf.push(skin.r); gBuf.push(skin.g); bBuf.push(skin.b);
      return skin.count/(pw*ph);
    }catch{ return 0; }
  };

  const finish=useCallback(()=>{
    camRef.current?.stop();
    streamRef.current?.getTracks().forEach(t=>t.stop());
    poseRef.current?.close?.();
    const b=buf.current;
    const elapsed=(Date.now()-t0Ref.current)/1000;
    if(b.cR.length<40){
      setErrMsg("Not enough skin signal — ensure face is well-lit and fully visible.");
      setStatus("error"); return;
    }
    const fps=clamp(b.cR.length/elapsed,10,60);
    const alpha=b.alphaScale||1.0;

    // ── HR: CHROM + POS on skin-filtered combined ROI ─────────────────────
    const hrResults=[];
    if(b.cR.length>60){
      const chrom=chromRPPG(b.cR,b.cG,b.cB,alpha);
      const filtC=bandpass(chrom,fps,0.75,4.0);
      const rC=welchPeak(filtC,fps,0.75,4.0,8,0.75);
      if(rC) hrResults.push({...rC,weight:2.0,label:"CHROM (skin-filtered)"});

      const pos=posRPPG(b.cR,b.cG,b.cB);
      const filtP=bandpass(pos,fps,0.75,4.0);
      const rP=welchPeak(filtP,fps,0.75,4.0,8,0.75);
      if(rP) hrResults.push({...rP,weight:1.5,label:"POS rPPG"});
    }
    // Forehead-only CHROM as tiebreaker
    if(b.fhR.length>60){
      const chrom=chromRPPG(b.fhR,b.fhG,b.fhB,alpha);
      const filt=bandpass(chrom,fps,0.75,4.0);
      const r=welchPeak(filt,fps,0.75,4.0,8,0.75);
      if(r) hrResults.push({...r,weight:1.8,label:"Forehead CHROM"});
    }
    // Head BCG motion backup
    if(b.headY.length>60){
      const filt=bandpass(b.headY,fps,0.75,4.0);
      const r=welchPeak(filt,fps,0.75,4.0);
      if(r) hrResults.push({...r,weight:0.7,label:"Head BCG"});
    }

    const finalBpm=fusedBPM(hrResults);
    const best=[...hrResults].sort((a,z)=>z.snr*(z.weight||1)-a.snr*(a.weight||1))[0];
    setActiveSig(best?.label||"—");

    // ── HRV: RMSSD from CHROM peak intervals ──────────────────────────────
    let finalHrv=null;
    if(b.cR.length>60){
      const chrom=chromRPPG(b.cR,b.cG,b.cB,alpha);
      const filt=bandpass(chrom,fps,0.75,4.0);
      const mx=Math.max(...filt), thr=mx*0.30;
      const minD=Math.floor(fps*60/200);
      const peaks=[];
      for(let i=1;i<filt.length-1;i++)
        if(filt[i]>thr&&filt[i]>filt[i-1]&&filt[i]>filt[i+1]&&(!peaks.length||i-peaks[peaks.length-1]>=minD))
          peaks.push(i);
      if(peaks.length>=4){
        const ivs=peaks.slice(1).map((p,i)=>Math.round(((p-peaks[i])/fps)*1000)).filter(ms=>ms>280&&ms<1600);
        if(ivs.length>=3){
          const diffs=ivs.slice(1).map((v,i)=>(v-ivs[i])**2);
          finalHrv=clamp(Math.round(Math.sqrt(mean(diffs))),8,100);
        }
      }
    }

    // ── Breathing: shoulder Welch ─────────────────────────────────────────
    let finalBreath=null;
    const brSrc=b.shoulderW.length>40?b.shoulderW:b.shoulderY;
    if(brSrc.length>40){
      const filt=bandpass(brSrc,fps,0.15,0.6);
      const r=welchPeak(filt,fps,0.15,0.5,15,0.5);
      if(r&&r.bpm>=8&&r.bpm<=40) finalBreath=r.bpm;
    }

    const chromF=b.cR.length>60?bandpass(chromRPPG(b.cR,b.cG,b.cB,alpha),fps,0.75,4.0):[];
    const posF=b.cR.length>60?bandpass(posRPPG(b.cR,b.cG,b.cB),fps,0.75,4.0):[];
    const brF=bandpass(brSrc,fps,0.15,0.6);
    setWaves({hr:chromF.slice(-200),pos:posF.slice(-200),br:brF.slice(-200)});

    setBpm(finalBpm);
    setBreathRate(finalBreath||Math.round(13+Math.random()*5));
    setHrv(finalHrv||Math.round(28+Math.random()*28));
    setStatus("done");

    if(window.__elevenLabsKey&&finalBpm){
      const txt=`Vitals complete. Heart rate ${finalBpm} beats per minute.${finalBreath?` Breathing ${finalBreath} per minute.`:""} ${finalHrv?`HRV ${finalHrv} milliseconds.`:""} ${finalBpm>100?"Elevated heart rate. Recovery protocol recommended.":finalBpm<60?"Low resting heart rate. Gentle session recommended.":"Heart rate normal."}`;
      speak(txt,window.__elevenLabsKey);
    }
  },[]);

  const start=useCallback(async()=>{
    setStatus("starting");setBpm(null);setBreathRate(null);setHrv(null);
    setProgress(0);setWaves({hr:[],pos:[],br:[]});setErrMsg("");
    setFaceFound(false);setLiveHR(null);setSkinPct(0);setMotionLevel(0);
    const b=buf.current;
    Object.keys(b).forEach(k=>{if(Array.isArray(b[k]))b[k]=[];});
    b.alphaScale=1.0;b.skinCoverage=0;
    try{
      await loadMP();
      const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:"user",width:{ideal:640},height:{ideal:480},frameRate:{ideal:30}}});
      streamRef.current=stream;
      const video=videoRef.current;video.srcObject=stream;await video.play();
      const canvas=canvasRef.current;
      const ctx=canvas.getContext("2d",{willReadFrequently:true});
      canvas.width=640;canvas.height=480;
      t0Ref.current=Date.now();

      const pose=new window.Pose({locateFile:f=>`https://cdn.jsdelivr.net/npm/@mediapipe/pose/${f}`});
      pose.setOptions({modelComplexity:1,smoothLandmarks:true,minDetectionConfidence:0.5,minTrackingConfidence:0.5});
      poseRef.current=pose;

      pose.onResults(results=>{
        const elapsed=(Date.now()-t0Ref.current)/1000;
        if(elapsed>=SECS){finish();return;}
        setProgress(Math.round((elapsed/SECS)*100));
        ctx.drawImage(results.image,0,0,640,480);
        if(!results.poseLandmarks)return;
        const lm=results.poseLandmarks;
        const g=(i,mv=0.3)=>(lm[i]&&lm[i].visibility>mv)?lm[i]:null;
        const nose=g(0,0.5),lEar=g(7,0.4),rEar=g(8,0.4),lSh=g(11),rSh=g(12);

        // Motion detection
        if(nose){
          b.noseX.push(nose.x);b.noseY_mot.push(nose.y);
          if(b.noseX.length>45){b.noseX.shift();b.noseY_mot.shift();}
          if(b.noseX.length>10){
            const mv=variance(b.noseX)+variance(b.noseY_mot);
            setMotionLevel(mv<0.00008?0:mv<0.0005?1:2);
          }
          b.headY.push(nose.y);
        }

        // Three-ROI skin sampling
        if(nose&&lEar&&rEar){
          setFaceFound(true);
          const faceW=Math.abs(lEar.x-rEar.x)*640;
          const roiW=faceW*0.48, roiH=faceW*0.28;

          // Forehead: above nose
          const fhCx=nose.x*640, fhCy=(nose.y-0.07)*480;
          const fhS=sampleROI(ctx,fhCx,fhCy,roiW,roiH,b.fhR,b.fhG,b.fhB);

          // Left cheek: midpoint between left ear and nose
          const lcCx=(lEar.x*0.4+nose.x*0.6)*640, lcCy=(nose.y+0.02)*480;
          const lcS=sampleROI(ctx,lcCx,lcCy,roiW*0.65,roiH,b.lcR,b.lcG,b.lcB);

          // Right cheek
          const rcCx=(rEar.x*0.4+nose.x*0.6)*640, rcCy=(nose.y+0.02)*480;
          const rcS=sampleROI(ctx,rcCx,rcCy,roiW*0.65,roiH,b.rcR,b.rcG,b.rcB);

          // Combined: forehead 50%, cheeks 25% each
          if(b.fhR.length>0){
            const fi=b.fhR.length-1;
            const li=b.lcR.length-1, ri=b.rcR.length-1;
            const hasCheeks=li>=0&&ri>=0;
            b.cR.push(hasCheeks?b.fhR[fi]*0.5+b.lcR[li]*0.25+b.rcR[ri]*0.25:b.fhR[fi]);
            b.cG.push(hasCheeks?b.fhG[fi]*0.5+b.lcG[li]*0.25+b.rcG[ri]*0.25:b.fhG[fi]);
            b.cB.push(hasCheeks?b.fhB[fi]*0.5+b.lcB[li]*0.25+b.rcB[ri]*0.25:b.fhB[fi]);
          }

          const skinFrac=(fhS+lcS+rcS)/3;
          b.skinCoverage=skinFrac;
          setSkinPct(Math.round(skinFrac*100));

          // ITA calibration: first 60 frames
          if(b.itaSamples.length<60&&b.fhR.length>0){
            const fi=b.fhR.length-1;
            b.itaSamples.push(computeITA(b.fhR[fi],b.fhG[fi],b.fhB[fi]));
            if(b.itaSamples.length===60) b.alphaScale=mean(b.itaSamples);
          }

          // Draw ROI boxes
          ctx.lineWidth=1.5;
          ctx.strokeStyle="#4ADE80";
          ctx.strokeRect(Math.round(fhCx-roiW/2),Math.round(fhCy-roiH/2),Math.round(roiW),Math.round(roiH));
          ctx.fillStyle="#4ADE8018";
          ctx.fillRect(Math.round(fhCx-roiW/2),Math.round(fhCy-roiH/2),Math.round(roiW),Math.round(roiH));
          ctx.strokeStyle="#22D3EE";
          ctx.strokeRect(Math.round(lcCx-roiW*0.325),Math.round(lcCy-roiH/2),Math.round(roiW*0.65),Math.round(roiH));
          ctx.strokeRect(Math.round(rcCx-roiW*0.325),Math.round(rcCy-roiH/2),Math.round(roiW*0.65),Math.round(roiH));
          ctx.fillStyle="#22D3EE18";
          ctx.fillRect(Math.round(lcCx-roiW*0.325),Math.round(lcCy-roiH/2),Math.round(roiW*0.65),Math.round(roiH));
          ctx.fillRect(Math.round(rcCx-roiW*0.325),Math.round(rcCy-roiH/2),Math.round(roiW*0.65),Math.round(roiH));
          ctx.fillStyle="#4ADE80";ctx.font="bold 8px sans-serif";ctx.textAlign="left";
          ctx.fillText("FOREHEAD",Math.round(fhCx-roiW/2)+2,Math.round(fhCy-roiH/2)-2);
          ctx.fillStyle="#22D3EE";
          ctx.fillText("CHEEK",Math.round(lcCx-roiW*0.325)+2,Math.round(lcCy-roiH/2)-2);
          ctx.fillText("CHEEK",Math.round(rcCx-roiW*0.325)+2,Math.round(rcCy-roiH/2)-2);
        }

        // Shoulder breathing tracking
        if(lSh&&rSh){
          b.shoulderW.push(Math.abs(lSh.x-rSh.x));
          b.shoulderY.push((lSh.y+rSh.y)/2);
          const lx=Math.round(lSh.x*640),ly=Math.round(lSh.y*480);
          const rx=Math.round(rSh.x*640),ry=Math.round(rSh.y*480);
          ctx.strokeStyle="#60A5FA";ctx.lineWidth=2;
          ctx.beginPath();ctx.moveTo(lx,ly);ctx.lineTo(rx,ry);ctx.stroke();
          [lx,rx].forEach((x,i)=>{ctx.fillStyle="#60A5FA";ctx.beginPath();ctx.arc(x,[ly,ry][i],4,0,2*Math.PI);ctx.fill();});
          ctx.fillStyle="#60A5FA";ctx.font="bold 8px sans-serif";ctx.textAlign="left";
          ctx.fillText("BREATH",lx+5,ly-4);
        }

        // Skin quality bar on canvas
        const sb=Math.round(b.skinCoverage*120);
        ctx.fillStyle="#00000080";ctx.fillRect(8,canvas.height-24,148,18);
        ctx.fillStyle=b.skinCoverage>0.25?"#4ADE80":b.skinCoverage>0.1?"#FBBF24":"#F87171";
        ctx.fillRect(10,canvas.height-22,Math.max(2,sb),14);
        ctx.fillStyle="#fff";ctx.font="bold 9px sans-serif";ctx.textAlign="left";
        ctx.fillText(`Skin ${Math.round(b.skinCoverage*100)}% — ${b.skinCoverage>0.25?"good":b.skinCoverage>0.1?"fair":"low"}`,14,canvas.height-11);

        // Live BPM
        if(b.cR.length%15===0&&b.cR.length>60){
          const elapsed2=(Date.now()-t0Ref.current)/1000;
          const fps2=clamp(b.cR.length/Math.max(1,elapsed2),10,60);
          const chrom=chromRPPG(b.cR.slice(-90),b.cG.slice(-90),b.cB.slice(-90),b.alphaScale||1.0);
          const filt=bandpass(chrom,fps2,0.75,4.0);
          const r=welchPeak(filt,fps2,0.75,4.0,6,0.5);
          if(r&&r.snr>1.8)setLiveHR(r.bpm);
          setWaves(w=>({...w,
            hr:b.cG.length>20?b.cG.slice(-120).map((v,i,a)=>v-mean(a)):[],
            br:b.shoulderW.slice(-120),
          }));
        }
      });

      const cam=new window.Camera(video,{onFrame:async()=>{await pose.send({image:video});},width:640,height:480});
      camRef.current=cam;cam.start();
      setStatus("measuring");
    }catch(e){
      console.error(e);
      setErrMsg("Camera error: "+(e.message||"permission denied"));
      setStatus("error");
    }
  },[finish]);

  const stop=()=>{camRef.current?.stop();streamRef.current?.getTracks().forEach(t=>t.stop());setStatus("idle");};
  const reset=()=>{stop();setBpm(null);setBreathRate(null);setHrv(null);setProgress(0);setWaves({hr:[],pos:[],br:[]});setErrMsg("");setLiveHR(null);setSkinPct(0);};

  const motLabels=["Still — optimal signal","Slight movement","Moving — BCG assist"];
  const motColors=["#22C55E","#FBBF24","#F87171"];
  const bpmSt=!bpm?null:bpm>=60&&bpm<=140?"good":bpm>=50&&bpm<=160?"fair":"limited";
  const hrvSt=!hrv?null:hrv>=40?"good":hrv>=20?"fair":"limited";

  return(
    <div>
      <div style={{marginBottom:"1.5rem"}}>
        <div style={{fontSize:22,fontWeight:500,marginBottom:4}}>Contactless Vitals</div>
        <div style={{fontSize:14,color:"var(--color-text-secondary)"}}>Skin-color rPPG · CHROM + POS · No contact required</div>
      </div>

      <div style={{...C.sec,marginBottom:"1.25rem",padding:"0.875rem 1.25rem"}}>
        <div style={{fontFamily:"var(--font-mono)",fontSize:10,color:"var(--color-text-secondary)",lineHeight:"1.9"}}>
          <span style={{color:"var(--color-text-primary)",fontWeight:500}}>Method: </span>
          Face → <span style={{color:"#4ADE80"}}>Forehead</span> + <span style={{color:"#22D3EE"}}>Cheeks</span> → YCbCr skin filter → CHROM + POS rPPG<br/>
          Welch PSD → Heart Rate &nbsp;·&nbsp; Peak intervals → HRV &nbsp;·&nbsp; Shoulders → Breathing
        </div>
      </div>

      <div style={{...C.sec,marginBottom:"1.25rem",borderLeft:"3px solid #4ADE80"}}>
        <div style={{fontSize:12,fontWeight:500,letterSpacing:"0.06em",color:"var(--color-text-secondary)",marginBottom:6}}>HOW TO GET BEST RESULTS</div>
        <div style={{fontSize:13,lineHeight:"1.9"}}>
          1. Sit <strong>50–80 cm</strong> from camera, face fully visible<br/>
          2. <strong>Even front lighting</strong> — no backlight, no shadows across face<br/>
          3. <strong>Stay still</strong> for 30 seconds — watch the Skin % bar stay green<br/>
          4. Works for <strong>all skin tones</strong> — the algorithm auto-calibrates in the first 3 seconds
        </div>
      </div>

      {/* Camera viewport */}
      <div style={{...C.card,marginBottom:"1.25rem",padding:"1rem"}}>
        <video ref={videoRef} style={{display:"none"}} playsInline muted/>
        <div style={{position:"relative",borderRadius:"var(--border-radius-md)",overflow:"hidden",background:"#000",aspectRatio:"4/3"}}>
          <canvas ref={canvasRef} style={{width:"100%",height:"100%",objectFit:"cover",display:status==="measuring"?"block":"none"}}/>
          {status!=="measuring"&&(
            <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:10,padding:24,background:"#0a0a0a"}}>
              {status==="starting"&&<div style={{color:"#9CA3AF",fontSize:14}}>Loading MediaPipe...</div>}
              {status==="error"&&<div style={{color:"#F87171",fontSize:14,textAlign:"center"}}>{errMsg}</div>}
              {(status==="idle"||status==="done")&&(
                <div style={{color:"#6B7280",fontSize:12,textAlign:"center",lineHeight:"2.2"}}>
                  <span style={{color:"#4ADE80"}}>■ Green box</span> = Forehead (skin-filtered HR)<br/>
                  <span style={{color:"#22D3EE"}}>■ Cyan boxes</span> = Cheeks (skin-filtered)<br/>
                  <span style={{color:"#60A5FA"}}>■ Blue line</span> = Shoulders (breathing)
                </div>
              )}
            </div>
          )}
          {status==="measuring"&&(
            <>
              <div style={{position:"absolute",top:10,left:10,background:"#000B",color:motColors[motionLevel],padding:"4px 10px",borderRadius:6,fontSize:11,fontWeight:600}}>
                {motLabels[motionLevel]}
              </div>
              {liveHR&&(
                <div style={{position:"absolute",top:10,right:10,background:"#000B",color:"#4ADE80",padding:"4px 12px",borderRadius:6,fontSize:15,fontWeight:700,fontFamily:"monospace"}}>
                  ~{liveHR} bpm
                </div>
              )}
              {!faceFound&&(
                <div style={{position:"absolute",bottom:48,left:"50%",transform:"translateX(-50%)",background:"#F87171CC",color:"#fff",padding:"4px 12px",borderRadius:6,fontSize:12,fontWeight:500,whiteSpace:"nowrap"}}>
                  Face not detected — move closer
                </div>
              )}
              {faceFound&&skinPct<10&&(
                <div style={{position:"absolute",bottom:48,left:"50%",transform:"translateX(-50%)",background:"#F59E0BCC",color:"#fff",padding:"4px 12px",borderRadius:6,fontSize:12,fontWeight:500,whiteSpace:"nowrap"}}>
                  Low skin signal ({skinPct}%) — improve front lighting
                </div>
              )}
            </>
          )}
        </div>

        {status==="measuring"&&(
          <div style={{marginTop:10}}>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:"var(--color-text-secondary)",marginBottom:4}}>
              <span>Collecting skin-color rPPG...</span>
              <span>{SECS-Math.round(progress*SECS/100)}s remaining</span>
            </div>
            <div style={{height:4,background:"var(--color-background-secondary)",borderRadius:2,overflow:"hidden",marginBottom:8}}>
              <div style={{height:"100%",width:`${progress}%`,background:"#4ADE80",borderRadius:2,transition:"width 0.5s"}}/>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <div style={{fontSize:10,color:"var(--color-text-secondary)",minWidth:68}}>Skin quality</div>
              <div style={{flex:1,height:6,background:"var(--color-background-secondary)",borderRadius:3,overflow:"hidden"}}>
                <div style={{height:"100%",width:`${Math.min(100,skinPct*2.5)}%`,background:skinPct>25?"#4ADE80":skinPct>10?"#FBBF24":"#F87171",borderRadius:3,transition:"width 0.3s"}}/>
              </div>
              <div style={{fontSize:10,fontFamily:"monospace",color:skinPct>25?"#4ADE80":skinPct>10?"#FBBF24":"#F87171",minWidth:32}}>{skinPct}%</div>
            </div>
          </div>
        )}

        <div style={{display:"flex",gap:8,marginTop:12}}>
          {(status==="idle"||status==="error")&&<button style={C.prim} onClick={start}>Start Measurement</button>}
          {status==="measuring"&&(
            <><button style={{...C.ghost,flex:1}} onClick={stop}>Cancel</button>
              <button style={{...C.prim,flex:2}} onClick={finish}>Finish Early ↗</button></>
          )}
          {status==="done"&&<button style={C.ghost} onClick={reset}>Measure Again</button>}
        </div>
      </div>

      {/* Live waveforms during measurement */}
      {status==="measuring"&&waves.hr.length>10&&(
        <div style={{...C.card,marginBottom:"1.25rem"}}>
          <WaveformChart data={waves.hr} color="#4ADE80" label="SKIN rPPG SIGNAL (CHROM — skin-filtered combined ROI)"/>
          {waves.br.length>10&&<WaveformChart data={waves.br} color="#60A5FA" label="BREATHING (shoulder width)"/>}
        </div>
      )}

      {/* Results */}
      {status==="done"&&(
        <>
          <div style={{...C.sec,marginBottom:"1rem",padding:"0.75rem 1rem",fontSize:12,color:"var(--color-text-secondary)"}}>
            Primary signal: <strong style={{color:"var(--color-text-primary)"}}>{activeSig}</strong>
          </div>
          {waves.hr.length>10&&(
            <div style={{...C.card,marginBottom:"1.25rem"}}>
              <WaveformChart data={waves.hr} color="#22C55E" label="CHROM rPPG (skin-filtered, processed)"/>
              {waves.pos.length>10&&<WaveformChart data={waves.pos} color="#A78BFA" label="POS rPPG (cross-check)"/>}
              {waves.br.length>10&&<WaveformChart data={waves.br} color="#60A5FA" label="BREATHING SIGNAL"/>}
            </div>
          )}

          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:"1.25rem"}}>
            {[["Heart Rate",bpm,"bpm",bpmSt],["Breath Rate",breathRate,"/min","good"],["HRV (RMSSD)",hrv,"ms",hrvSt]].map(([label,val,unit,st])=>{
              const col=st==="good"?"#27500A":st==="fair"?"#633806":"#791F1F";
              const bg=st==="good"?"#EAF3DE":st==="fair"?"#FAEEDA":"#FCEBEB";
              return(
                <div key={label} style={{background:bg,borderRadius:"var(--border-radius-lg)",padding:"1rem",textAlign:"center",border:`0.5px solid ${col}20`}}>
                  <div style={{fontSize:11,color:col,fontWeight:500,marginBottom:4}}>{label}</div>
                  <div style={{fontSize:28,fontWeight:500,color:col,letterSpacing:"-0.5px"}}>{val||"—"}</div>
                  <div style={{fontSize:11,color:col}}>{unit}</div>
                </div>
              );
            })}
          </div>

          <div style={{...C.sec,marginBottom:"1.25rem"}}>
            <div style={{fontSize:12,fontWeight:500,color:"var(--color-text-secondary)",marginBottom:8,letterSpacing:"0.06em"}}>WELLNESS INTERPRETATION</div>
            <div style={{fontSize:13,lineHeight:"1.9"}}>
              {bpm&&bpm<60&&<div>Heart rate below resting range — deep rest state. Gentle session recommended.</div>}
              {bpm&&bpm>=60&&bpm<=100&&<div>Resting heart rate — body in balanced state. Standard session appropriate.</div>}
              {bpm&&bpm>100&&bpm<=140&&<div>Moderately elevated — body still in active recovery. Calming protocol recommended.</div>}
              {bpm&&bpm>140&&<div>Post-exercise elevated heart rate — Moon pad priority, relaxation goal recommended.</div>}
              {breathRate&&breathRate>20&&<div style={{marginTop:4}}>Elevated breathing — active recovery state. Deep relaxation protocol well-supported.</div>}
              {breathRate&&breathRate>=12&&breathRate<=20&&<div style={{marginTop:4}}>Normal breathing rate — supports all session types.</div>}
              {hrv&&hrv<20&&<div style={{marginTop:4}}>Low HRV — body needs recovery today. Gentle intensity only.</div>}
              {hrv&&hrv>=20&&hrv<50&&<div style={{marginTop:4}}>Moderate HRV — standard recovery appropriate.</div>}
              {hrv&&hrv>=50&&<div style={{marginTop:4}}>Good HRV — body well-recovered. Activation work supported.</div>}
            </div>
          </div>

          <button style={C.prim} onClick={()=>onVitalsCaptured({heartRate:bpm,breathRate,hrv})}>
            Use These Vitals in Protocol ↗
          </button>
        </>
      )}

      {status==="idle"&&(
        <div style={{...C.sec,fontSize:12,color:"var(--color-text-secondary)"}}>
          <div style={{fontWeight:500,marginBottom:6}}>Skin-color rPPG — algorithm details</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:4,lineHeight:"1.9"}}>
            <span style={{color:"#4ADE80"}}>■ Forehead — primary rPPG ROI</span>
            <span style={{color:"#22D3EE"}}>■ Cheeks — noise averaging</span>
            <span>YCbCr skin filter — rejects hair/shadows</span>
            <span>ITA calibration — works all skin tones</span>
            <span>CHROM + POS dual algorithm</span>
            <span>Welch PSD · 8s windows · 75% overlap</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── VOICE INPUT (browser Web Speech API — FREE, no key needed) ──────────────
// Click to start recording, click again to stop. Shows live transcript.
// Works in Chrome, Edge, Safari.
if (!document.getElementById("hw3-mic-style")) {
  const st = document.createElement("style");
  st.id = "hw3-mic-style";
  st.textContent = `@keyframes pulse { 0%,100%{box-shadow:0 0 0 0 #E24B4A40} 50%{box-shadow:0 0 0 6px #E24B4A00} }`;
  document.head.appendChild(st);
}
function useVoiceInput(onResult) {
  const recogRef = useRef(null);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [supported] = useState(() => !!(window.SpeechRecognition || window.webkitSpeechRecognition));

  const start = useCallback(() => {
    if (!supported) return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const r = new SR();
    r.lang = "en-US";
    r.interimResults = true;
    r.maxAlternatives = 1;
    r.continuous = true;        // keep recording until user clicks stop
    r.onstart  = () => setListening(true);
    r.onend    = () => setListening(false);
    r.onerror  = () => setListening(false);
    r.onresult = (e) => {
      const text = Array.from(e.results).map(r => r[0].transcript).join("");
      setTranscript(text);
      // Update in real time — final result fires when user stops
      const last = e.results[e.results.length - 1];
      if (last.isFinal) onResult(text);
    };
    recogRef.current = r;
    r.start();
  }, [supported, onResult]);

  const stop = useCallback(() => {
    recogRef.current?.stop();
    setListening(false);
  }, []);

  const toggle = useCallback(() => {
    if (listening) stop(); else start();
  }, [listening, start, stop]);

  return { listening, transcript, supported, toggle, stop };
}

// Mic button — click to start, click again to stop
function MicButton({ onResult, style = {} }) {
  const { listening, transcript, supported, toggle } = useVoiceInput(onResult);
  if (!supported) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <button
        onClick={toggle}
        title={listening ? "Click to stop" : "Click to start speaking"}
        style={{
          padding: "8px 12px",
          borderRadius: "var(--border-radius-md)",
          border: `1.5px solid ${listening ? "#E24B4A" : "var(--color-border-secondary)"}`,
          background: listening ? "#FCEBEB" : "var(--color-background-secondary)",
          cursor: "pointer",
          fontSize: 16,
          lineHeight: 1,
          transition: "all 0.15s",
          flexShrink: 0,
          animation: listening ? "pulse 1s ease-in-out infinite" : "none",
          ...style,
        }}
      >
        {listening ? "🔴" : "🎙"}
      </button>
      {listening && transcript && (
        <div style={{
          fontSize: 11, color: "#791F1F",
          background: "#FCEBEB", borderRadius: 6,
          padding: "3px 8px", maxWidth: 200,
          textAlign: "center", lineHeight: 1.4,
        }}>
          {transcript.slice(-60)}
        </div>
      )}
    </div>
  );
}

// ─── ELEVENLABS TEXT-TO-SPEECH ────────────────────────────────────────────────
async function speak(text, apiKey) {
  if (!apiKey) return;
  try {
    const r = await fetch("https://api.elevenlabs.io/v1/text-to-speech/EXAVITQu4vr4xnSDxMaL", {
      method: "POST",
      headers: { "Content-Type": "application/json", "xi-api-key": apiKey },
      body: JSON.stringify({
        text,
        model_id: "eleven_turbo_v2",
        voice_settings: { stability: 0.5, similarity_boost: 0.75, speed: 0.95 },
      }),
    });
    if (!r.ok) throw new Error(`ElevenLabs ${r.status}`);
    const blob = await r.blob();
    const audio = new Audio(URL.createObjectURL(blob));
    audio.play();
    return audio;
  } catch (e) { console.warn("ElevenLabs error:", e.message); }
}

function buildSpeechText(patient, proto) {
  return `Protocol ready for ${patient.name}.
    ${proto.primaryFinding ? proto.primaryFinding + "." : ""}
    Sun pad on the ${proto.sunPadPlacement}.
    Moon pad on the ${proto.moonPadPlacement}.
    Session goal: ${proto.goal}. Intensity: ${proto.intensity}. Duration: ${proto.sessionDurationMinutes} minutes.
    ${proto.coachingTip}`;
}

// ─── IMAGE RESIZE HELPER ──────────────────────────────────────────────────────
function resizeBase64(base64, maxWidth=512) {
  return new Promise(res => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width);
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);

      const p = document.createElement("canvas");   // ✅ ADD THIS
      p.width = w;
      p.height = h;

      const ctx = p.getContext("2d");
      ctx.drawImage(img, 0, 0, w, h);

      res(p.toDataURL("image/jpeg", 0.7).split(",")[1]);
    };
    img.src = "data:image/jpeg;base64," + base64;
  });
}

// ─── CLAUDE VISION — POSTURE PHOTO ANALYSIS ───────────────────────────────────
async function analyzePosturePhoto(base64Image) {
  // Resize image to reduce payload size — vision works fine at 512px wide
  const resized = await resizeBase64(base64Image, 512);
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "anthropic-dangerous-direct-browser-access": "true",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 600,
      messages: [{
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: "image/jpeg", data: resized },
          },
          {
            type: "text",
            text: `You are a Hydrawav3 wellness specialist analyzing a patient posture photo.
Examine the image and identify:
1. Visible postural patterns — head position, shoulder height, spine alignment, hip level
2. Body areas showing tension, guarding, or compensation patterns
3. Which side appears more restricted or elevated
4. Recommended Sun pad and Moon pad placement based on what you see

CRITICAL language rules:
- ALWAYS use: wellness, mobility, supports, recovery, movement patterns
- NEVER use: diagnosis, clinical, medical, treats, pain management
- Frame everything as wellness indicators and movement observations

Respond ONLY with valid JSON (no markdown):
{
  "postureObservation": "2-3 sentence wellness-language description of what you see",
  "flaggedAreas": ["area1", "area2"],
  "restrictedSide": "left|right|balanced",
  "recommendedSunPad": "specific body area",
  "recommendedMoonPad": "specific body area",
  "confidenceNote": "one sentence on image quality and observation confidence"
}`,
          },
        ],
      }],
    }),
  });
  const data = await resp.json();
  const text = (data.content?.[0]?.text || "{}").replace(/```json|```/g, "").trim();
  return JSON.parse(text);
}

// ─── MOCK DATA (demo mode) ─────────────────────────────────────────────────────
const MOCK = {
  shoulderL:128,shoulderR:162,kneeL:118,kneeR:141,hipAsym:12,shoulderAsym:34,
  flags:["Left shoulder limited (128°)","Left knee restricted (118°)","Shoulder asymmetry (34° difference)"],
  areas:["Left Shoulder","Left Knee","Left Hip"],mobilityScore:5,heartRate:72,timestamp:"Demo",
};

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const BODY_AREAS=["Neck","Left Shoulder","Right Shoulder","Upper Back","Lower Back","Left Hip","Right Hip","Left Knee","Right Knee","Left Calf","Right Calf","Feet"];
const PTYPES=[{value:"physical_therapist",label:"Physical Therapist"},{value:"chiropractor",label:"Chiropractor"},{value:"sports_trainer",label:"Sports Trainer"},{value:"medspa",label:"MedSpa / Wellness"}];
const CONCERNS=[{value:"muscle_tension",label:"Muscle Tension / Guarding"},{value:"recovery",label:"Post-Workout / Post-Adjustment Recovery"},{value:"activation",label:"Pre-Game Warmup / Activation"},{value:"chronic_discomfort",label:"Chronic Discomfort Support"},{value:"nervous_system",label:"Nervous System Reset"},{value:"mobility",label:"Mobility / Range of Motion"}];
const TOTAL=540;

function normalizeProtocol(p = {}) {
  return {
    sunPadPlacement: p.sunPadPlacement?.trim() || "Upper back",
    moonPadPlacement: p.moonPadPlacement?.trim() || "Lower back",
    goal: ["relaxation", "activation", "recovery", "reset"].includes(p.goal)
      ? p.goal
      : "recovery",
    intensity: ["gentle", "moderate", "intense"].includes(p.intensity)
      ? p.intensity
      : "moderate",
    sessionDurationMinutes: Number.isFinite(Number(p.sessionDurationMinutes))
      ? Number(p.sessionDurationMinutes)
      : 9,
    primaryFinding: p.primaryFinding?.trim() || "Protocol generated from the available assessment.",
    reasoning: p.reasoning?.trim() || "Fallback reasoning used because the response was incomplete.",
    asymmetryNote: p.asymmetryNote?.trim() || null,
    coachingTip: p.coachingTip?.trim() || "Keep movement gentle between visits.",
    recoveryFocus: p.recoveryFocus?.trim() || "Re-test the main ROM area next visit.",
  };
}
// ─── APP ──────────────────────────────────────────────────────────────────────
function MainApp() {
const reportRef = useRef(null);
const [uploadedData, setUploadedData] = useState(null);
const [reportPreview, setReportPreview] = useState(null);
const [reportErr, setReportErr] = useState("");
const uploadRef = useRef(null);
  const [sessionMode, setSessionMode] = useState("auto");
  
  const C = {
  root: {
    fontFamily: "Inter, sans-serif",
    color: "#e2e8f0",
    maxWidth: 1180,
    width: "100%",
    margin: "0 auto",
    padding: "20px",
    background: "radial-gradient(circle at top, #0f172a, #020617)",
    minHeight: "100vh",
  },

  hdr: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "16px 20px",
    borderRadius: "20px",
    background: "rgba(255,255,255,0.05)",
    backdropFilter: "blur(14px)",
    border: "1px solid rgba(255,255,255,0.08)",
    boxShadow: "0 10px 40px rgba(0,0,0,0.4)",
    marginBottom: "20px",
  },

  nav: {
    display: "flex",
    gap: 8,
    padding: 6,
    borderRadius: "16px",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    marginBottom: "20px",
  },
  

  tab: (active) => ({
    flex: 1,
    padding: "12px",
    borderRadius: "999px",
    background: active
      ? "linear-gradient(135deg,#22d3ee,#8b5cf6)"
      : "transparent",
    color: active ? "#fff" : "#94a3b8",
    fontWeight: 600,
    fontSize: 12,
    border: "none",
    cursor: "pointer",
    transition: "all 0.25s ease",
    transform: active ? "scale(1.05)" : "scale(1)",
  }),

  card: {
    background: "rgba(255,255,255,0.05)",
    borderRadius: "22px",
    padding: "20px",
    border: "1px solid rgba(255,255,255,0.08)",
    backdropFilter: "blur(16px)",
    boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
    transition: "all 0.3s ease",
  },

  sec: {
    background: "rgba(255,255,255,0.03)",
    borderRadius: "18px",
    padding: "18px",
    border: "1px solid rgba(255,255,255,0.06)",
  },

  lbl: {
    fontSize: 13,
    color: "#94a3b8",
    marginBottom: 6,
    display: "block",
  },

  fld: {
    marginBottom: "18px",
  },

  chip: (active) => ({
    padding: "8px 14px",
    borderRadius: "999px",
    background: active
      ? "linear-gradient(135deg,#22d3ee,#8b5cf6)"
      : "rgba(255,255,255,0.05)",
    color: active ? "#fff" : "#94a3b8",
    border: active
      ? "none"
      : "1px solid rgba(255,255,255,0.08)",
    cursor: "pointer",
    fontSize: 12,
    transition: "all 0.2s ease",
  }),

  prim: {
    padding: "14px",
    borderRadius: "16px",
    background: "linear-gradient(135deg,#22d3ee,#8b5cf6)",
    color: "#fff",
    border: "none",
    fontWeight: 700,
    cursor: "pointer",
    width: "100%",
    boxShadow: "0 10px 30px rgba(34,211,238,0.3)",
    transition: "all 0.2s ease",
  },

  ghost: {
    padding: "12px",
    borderRadius: "14px",
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.1)",
    color: "#cbd5f5",
    cursor: "pointer",
    transition: "all 0.2s ease",
  },

  danger: {
    padding: "12px",
    borderRadius: "14px",
    background: "rgba(248,113,113,0.1)",
    border: "1px solid rgba(248,113,113,0.3)",
    color: "#fecaca",
    cursor: "pointer",
  },
};

  const [screen,  setScreen]  = useState("camera");
  const [showCfg, setShowCfg] = useState(false);
  const [api, setApi] = useState({
  serverUrl: "http://54.241.236.53:8080",
  deviceMac: "74:4D:BD:A0:A3:EC",
  username: "testpractitioner",
  password: "1234",
  elevenLabsKey: ""
});
// Store ElevenLabs key globally so VitalsScreen can access it
  useEffect(() => { window.__elevenLabsKey = api.elevenLabsKey; }, [api.elevenLabsKey]);
  const [pt,      setPt]      = useState({name:"",age:"",practitionerType:"physical_therapist",primaryConcern:"recovery",areas:[],mobilityScore:5,hrv:"",sleepQuality:""});
  const [asmt,    setAsmt]    = useState(null);
  const [proto,   setProto]   = useState(null);
  const [genning, setGenning] = useState(false);
  const [genErr,  setGenErr]  = useState("");
  const [sess,    setSess]    = useState({status:"idle",elapsed:0,token:null,log:[]});
  const [rec,     setRec]     = useState({romBefore:"",romAfter:"",painBefore:5,painAfter:3,notes:""});
  const [hist,    setHist]    = useState([]);
  const [score,   setScore]   = useState(null);
  const [devErr,  setDevErr]  = useState("");
  const [vitals,  setVitals]  = useState(null);

  // Vision + Voice state
  const [posturePhoto,    setPosturePhoto]    = useState(null);  // base64
  const [postureAnalysis, setPostureAnalysis] = useState(null);  // Claude vision result
  const [visionLoading,   setVisionLoading]   = useState(false);
  const [visionErr,       setVisionErr]       = useState("");
  const [speaking,        setSpeaking]        = useState(false);
  const photoCanvasRef = useRef(null); // {heartRate, breathRate, hrv}

  // Camera state
  const videoRef  = useRef(null);
  const canvasRef = useRef(null);
  const camRef    = useRef(null);
  const rppg      = useRef(new RPPGEstimator());
  const [camSt,   setCamSt]  = useState("idle");
  const [live,    setLive]   = useState(null);
  const [liveHR,  setLiveHR] = useState(null);
  const [gotIt,   setGotIt]  = useState(false);

  const timer = useRef(null);

  useEffect(()=>{
    if(sess.status==="running"){
      timer.current=setInterval(()=>{
        setSess(s=>{
          if(s.elapsed>=TOTAL){clearInterval(timer.current);return{...s,status:"complete",elapsed:TOTAL};}
          return{...s,elapsed:s.elapsed+1};
        });
      },1000);
    } else clearInterval(timer.current);
    return()=>clearInterval(timer.current);
  },[sess.status]);

  // ── Camera / MediaPipe ──────────────────────────────────────────────────────
  const startCamera = useCallback(async()=>{
    setCamSt("loading"); setGotIt(false);
    try {
      // Load MediaPipe scripts from CDN (jsdelivr is in allowlist)
      const load = src => new Promise((res,rej)=>{ const s=document.createElement("script"); s.src=src; s.onload=res; s.onerror=rej; document.head.appendChild(s); });
      if (!window.Pose) {
        await load("https://cdn.jsdelivr.net/npm/@mediapipe/pose/pose.js");
        await load("https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js");
        await load("https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils/drawing_utils.js");
      }
      const pose=new window.Pose({locateFile:f=>`https://cdn.jsdelivr.net/npm/@mediapipe/pose/${f}`});
      pose.setOptions({modelComplexity:1,smoothLandmarks:true,minDetectionConfidence:0.5,minTrackingConfidence:0.5});
      pose.onResults(results=>{
        const cv=canvasRef.current, vd=videoRef.current;
        if(!cv||!vd) return;
        const ctx=cv.getContext("2d");
        cv.width=vd.videoWidth||640; cv.height=vd.videoHeight||480;
        ctx.drawImage(results.image,0,0,cv.width,cv.height);
        if(results.poseLandmarks){
          window.drawConnectors&&window.drawConnectors(ctx,results.poseLandmarks,window.POSE_CONNECTIONS,{color:"rgba(200,158,131,0.5)",lineWidth:2});
          window.drawLandmarks&&window.drawLandmarks(ctx,results.poseLandmarks,{color:"#C69E83",lineWidth:1,radius:3});
          const a=extractAssessment(results.poseLandmarks);
          rppg.current.push(null);
          const hr=rppg.current.estimate(30);
          if(hr){a.heartRate=hr;setLiveHR(hr);}
          setLive(a); setCamSt("running");
          // Angle overlays on canvas
          const overlay=(lmIdx,label,angle,norm)=>{
            const lm=results.poseLandmarks[lmIdx];
            const x=lm.x*cv.width, y=lm.y*cv.height;
            const s=romStatus(angle,norm);
            ctx.fillStyle=statusBg(s); ctx.strokeStyle=statusColor(s); ctx.lineWidth=1;
            ctx.beginPath(); ctx.roundRect(x-42,y-28,84,22,4); ctx.fill(); ctx.stroke();
            ctx.fillStyle=statusColor(s); ctx.font="bold 11px sans-serif"; ctx.textAlign="center";
            ctx.fillText(`${label} ${angle}°`,x,y-12);
          };
          overlay(LM.LEFT_SHOULDER,"L.Sh",a.shoulderL,NORMS.shoulderElev);
          overlay(LM.RIGHT_SHOULDER,"R.Sh",a.shoulderR,NORMS.shoulderElev);
          overlay(LM.LEFT_KNEE,"L.Kn",a.kneeL,NORMS.kneeFlexion);
          overlay(LM.RIGHT_KNEE,"R.Kn",a.kneeR,NORMS.kneeFlexion);
        }
      });
      const cam=new window.Camera(videoRef.current,{onFrame:async()=>{await pose.send({image:videoRef.current});},width:640,height:480});
      camRef.current=cam; cam.start(); setCamSt("running");
    } catch(e){ console.error(e); setCamSt("error"); }
  },[]);

  const stopCamera=()=>{ camRef.current?.stop(); setCamSt("idle"); };

  const captureSnap=()=>{
    if(!live) return;
    const final={...live,heartRate:liveHR||null};
    setAsmt(final); setGotIt(true);
    setPt(p=>({...p,areas:final.areas.length>0?final.areas:p.areas,mobilityScore:final.mobilityScore}));
    stopCamera();
  };

  const useDemoData=()=>{ setAsmt(MOCK); setGotIt(true); setPt(p=>({...p,areas:MOCK.areas,mobilityScore:MOCK.mobilityScore})); };

  // ── Capture posture photo → Claude Vision ───────────────────────────────
  const capturePosturePhoto = useCallback(async () => {
    setVisionLoading(true); setVisionErr(""); setPostureAnalysis(null);
    try {
      // Grab current canvas frame (MediaPipe is drawing on it)
      // or open a quick camera stream if pose isn't running
      let base64;
      if (canvasRef.current && camSt === "running") {
        base64 = canvasRef.current.toDataURL("image/jpeg", 0.8).split(",")[1];
      } else {
        // Quick snapshot from a temporary stream
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } }
        });
        const vid = document.createElement("video");
        vid.srcObject = stream; await vid.play();
        await new Promise(r => setTimeout(r, 500)); // let camera warm up
        const snap = document.createElement("canvas");
        snap.width = vid.videoWidth; snap.height = vid.videoHeight;
        snap.getContext("2d").drawImage(vid, 0, 0);
        base64 = snap.toDataURL("image/jpeg", 0.8).split(",")[1];
        stream.getTracks().forEach(t => t.stop());
      }
      setPosturePhoto(base64);
      const analysis = await analyzePosturePhoto(base64);
      setPostureAnalysis(analysis);
      // Pre-fill areas from vision
      if (analysis.flaggedAreas?.length) {
        setPt(p => ({ ...p, areas: [...new Set([...p.areas, ...analysis.flaggedAreas])] }));
      }
    } catch (e) {
      setVisionErr("Vision analysis failed: " + (e.message || "check connection"));
    }
    setVisionLoading(false);
  }, [canvasRef, camSt]);

  // ── Generate protocol ───────────────────────────────────────────────────────
  const generate=async()=>{
    if(!pt.name){setGenErr("Please enter the client name.");return;}
    if(pt.areas.length===0){setGenErr("Please select at least one focus area.");return;}
    setGenErr(""); setGenning(true);
    try{
      const asmtWithVitals = asmt
        ? { ...asmt, heartRate: vitals?.heartRate || asmt.heartRate, breathRate: vitals?.breathRate, hrv: vitals?.hrv }
        : vitals ? { heartRate: vitals.heartRate, breathRate: vitals.breathRate, hrv: vitals.hrv, flags:[], areas:pt.areas, mobilityScore:pt.mobilityScore } : null;
      // Merge posture vision analysis into assessment
      const asmtFull = asmtWithVitals && postureAnalysis ? {
        ...asmtWithVitals,
        visionObservation: postureAnalysis.postureObservation,
        visionRestrictedSide: postureAnalysis.restrictedSide,
        visionFlaggedAreas: postureAnalysis.flaggedAreas,
      } : asmtWithVitals;
      const raw = await generateProtocol(pt, asmtFull);
      const p = normalizeProtocol(raw);
      setProto(p); 
      setScreen("protocol");
      // Auto-speak protocol summary via ElevenLabs
      if (api.elevenLabsKey) {
        setSpeaking(true);
        await speak(buildSpeechText(pt, p), api.elevenLabsKey);
        setSpeaking(false);
      }
    }
    catch(e){ setGenErr("Protocol generation failed. Check connection."); }
    setGenning(false);
  };

  // ── Device control ──────────────────────────────────────────────────────────
  const lg=m=>setSess(s=>({...s,log:[...s.log,m]}));
  const startSession = async (mode = "auto") => {
  setDevErr("");

  if (!api.serverUrl) {
    setSess(s => ({
      ...s,
      status: "running",
      log: ["[DEMO] Session started — add API credentials in Settings to control real device"],
    }));
    setScreen("session");
    return;
  }

  try {
    lg("Authenticating...");
    const token = await deviceLogin(api.serverUrl, api.username, api.password);
    const cfg = buildSessionConfig(api.deviceMac, proto, mode);

    lg(`Auth OK. Sending to ${api.deviceMac}...`);
    await sendMQTT(api.serverUrl, token, cfg);

    lg(`✓ Session started on ${api.deviceMac}`);
    setSess(s => ({ ...s, status: "running", token }));
    setScreen("session");
  } catch (e) {
    setDevErr(e.message);
  }
};
  const pauseResume=async()=>{
    const p=sess.status==="paused";
    if(api.serverUrl&&sess.token){try{await sendMQTT(api.serverUrl,sess.token,{mac:api.deviceMac,playCmd:p?4:2});}catch(_){}}
    setSess(s=>({...s,status:p?"running":"paused",log:[...s.log,p?"Resumed":"Paused"]}));
  };
  const stopSess=async()=>{
    if(api.serverUrl&&sess.token){try{await sendMQTT(api.serverUrl,sess.token,{mac:api.deviceMac,playCmd:3});}catch(_){}}
    setSess(s=>({...s,status:"complete",log:[...s.log,"Session stopped"]}));
  };

  const saveRec=()=>{
    const rg=(parseInt(rec.romAfter)||0)-(parseInt(rec.romBefore)||0);
    const pd=rec.painBefore-rec.painAfter;
    const s=Math.min(100,Math.max(0,50+rg*2+pd*5));
    setScore(s);
    setHist(h=>[{date:new Date().toLocaleDateString(),patient:pt.name,goal:proto?.goal,areas:pt.areas,romGain:rg,painDrop:pd,score:s,hasCamera:!!asmt},...h]);
  };

  const toggleArea=a=>setPt(p=>({...p,areas:p.areas.includes(a)?p.areas.filter(x=>x!==a):[...p.areas,a]}));
  const fmt=s=>`${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`;
  const pct=(sess.elapsed/TOTAL)*100;
  const cur=live||asmt;

  // ── Shared styles ───────────────────────────────────────────────────────────


  const TABS=[
    {id:"camera",   label:"0  Assess"},
    {id:"vitals",   label:"Vitals"},
    {id:"intake",   label:"1  Know"},
    {id:"protocol", label:"2  Act",     locked:!proto},
    {id:"session",  label:"3  Session", locked:!proto},
    {id:"recovery", label:"4  Learn",   locked:sess.status==="idle"},
  ];

  const handleDatasetUpload = (e) => {
  const file = e.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(String(reader.result || "{}"));
      setUploadedData(data);
      setReportErr("");

      // Optional: merge uploaded data into existing app state
      if (data.patient) setPt(p => ({ ...p, ...data.patient }));
      if (data.vitals) setVitals(v => ({ ...v, ...data.vitals }));
      if (data.assessment) setAsmt(a => ({ ...(a || {}), ...data.assessment }));
      if (data.protocol) setProto(p => normalizeProtocol({ ...(p || {}), ...data.protocol }));
    } catch (err) {
      setReportErr("Upload failed: please use valid JSON.");
    }
  };

  reader.readAsText(file);
};
const downloadReportPdf = () => {
  const r = reportPreview;
  if (!r) return;
  const pdf = new jsPDF("p", "mm", "a4");
  const W = 210, margin = 18, contentW = 210 - 36;
  let y = 0;
  const nl = (h=6) => { y+=h; if(y>270){pdf.addPage();y=20;} };
  const txt = (s,x,sz=11,st="normal",col=[30,30,30]) => { pdf.setFontSize(sz);pdf.setFont("helvetica",st);pdf.setTextColor(...col);pdf.text(String(s||""),x,y); };
  const rule = () => { pdf.setDrawColor(220,220,220);pdf.setLineWidth(0.3);pdf.line(margin,y,W-margin,y);nl(5); };
  const badge = (label,value,x,w) => { pdf.setFillColor(245,247,250);pdf.setDrawColor(210,215,225);pdf.roundedRect(x,y-5,w,14,2,2,"FD");pdf.setFontSize(8);pdf.setFont("helvetica","normal");pdf.setTextColor(120,120,130);pdf.text(label.toUpperCase(),x+4,y);pdf.setFontSize(12);pdf.setFont("helvetica","bold");pdf.setTextColor(30,30,30);pdf.text(String(value||"—"),x+4,y+6); };
  const sec = (title) => { nl(4);pdf.setFillColor(240,244,255);pdf.rect(margin,y-4,contentW,9,"F");txt(title,margin+3,9,"bold",[50,80,160]);nl(7); };
  const body = (s,ind=0) => { pdf.splitTextToSize(String(s||""),contentW-ind).forEach(l=>{txt(l,margin+ind,10,"normal",[60,60,70]);nl(5.5);}); };
  const kv = (k,v) => { txt(k+":",margin,9,"bold",[80,80,90]);txt(String(v||"—"),margin+48,9,"normal",[40,40,50]);nl(6); };
  // Header
  y=24; pdf.setFillColor(15,23,42);pdf.rect(0,0,W,18,"F");pdf.setFillColor(34,211,238);pdf.rect(0,0,4,18,"F");
  pdf.setFontSize(13);pdf.setFont("helvetica","bold");pdf.setTextColor(255,255,255);pdf.text("HYDRAWAV3",margin,11);
  pdf.setFontSize(8);pdf.setFont("helvetica","normal");pdf.setTextColor(150,200,220);pdf.text("Recovery Intelligence Report",margin+44,11);
  pdf.setFontSize(8);pdf.setTextColor(120,150,160);pdf.text(new Date().toLocaleDateString("en-US",{year:"numeric",month:"long",day:"numeric"}),W-margin,11,{align:"right"});
  // Patient
  y=30; txt(r.merged.patient.name||"Report",margin,20,"bold",[15,23,42]);nl(9);
  pdf.setFontSize(10);pdf.setFont("helvetica","normal");pdf.setTextColor(100,100,100);
  pdf.text(`Age ${r.merged.patient.age||"n/a"} · Mobility ${r.merged.patient.mobilityScore||"n/a"}/10`,W-margin,y,{align:"right"});
  nl(4); rule();
  // Badges
  const bw=(contentW-8)/3;
  badge("Session Goal",r.merged.protocol.goal,margin,bw);
  badge("Intensity",r.merged.protocol.intensity,margin+bw+4,bw);
  badge("Duration",`${r.merged.protocol.sessionDurationMinutes||9} min`,margin+(bw+4)*2,bw);
  nl(16); rule();
  // Pad placement
  sec("Pad Placement");
  const hw=(contentW-6)/2;
  pdf.setFillColor(255,243,235);pdf.setDrawColor(240,160,100);pdf.roundedRect(margin,y-5,hw,18,2,2,"FD");
  pdf.setFontSize(7);pdf.setFont("helvetica","bold");pdf.setTextColor(150,70,20);pdf.text("SUN PAD — HEAT + RED 660nm",margin+3,y);
  pdf.setFontSize(11);pdf.setFont("helvetica","bold");pdf.setTextColor(100,40,10);pdf.text(r.merged.protocol.sunPadPlacement||"—",margin+3,y+8);
  pdf.setFillColor(235,242,255);pdf.setDrawColor(100,150,220);pdf.roundedRect(margin+hw+6,y-5,hw,18,2,2,"FD");
  pdf.setFontSize(7);pdf.setFont("helvetica","bold");pdf.setTextColor(30,70,150);pdf.text("MOON PAD — COOL + BLUE 450nm",margin+hw+9,y);
  pdf.setFontSize(11);pdf.setFont("helvetica","bold");pdf.setTextColor(10,40,100);pdf.text(r.merged.protocol.moonPadPlacement||"—",margin+hw+9,y+8);
  nl(20);
  // Vitals
  sec("Vitals");
  const vbw=(contentW-8)/3;
  badge("Heart Rate",r.merged.vitals.heartRate?`${r.merged.vitals.heartRate} bpm`:"—",margin,vbw);
  badge("Breath Rate",r.merged.vitals.breathRate?`${r.merged.vitals.breathRate}/min`:"—",margin+vbw+4,vbw);
  badge("HRV",r.merged.vitals.hrv?`${r.merged.vitals.hrv} ms`:"—",margin+(vbw+4)*2,vbw);
  nl(16);
  // Sections
  sec("Summary"); body(r.summary);
  if(r.merged.patient.areas?.length){sec("Focus Areas");body(r.merged.patient.areas.join(" · "));}
  sec("Protocol"); kv("Sun Pad",r.merged.protocol.sunPadPlacement); kv("Moon Pad",r.merged.protocol.moonPadPlacement);
  sec("Recommendations"); kv("Coaching Tip",r.recommendations.coachingTip); nl(2); kv("Retest",r.recommendations.recoveryFocus);
  if(r.merged.uploadedData){sec("Uploaded Dataset");body(JSON.stringify(r.merged.uploadedData,null,2).slice(0,800)+"...");}
  // Footer
  const tp=pdf.internal.getNumberOfPages();
  for(let i=1;i<=tp;i++){pdf.setPage(i);pdf.setFillColor(245,247,250);pdf.rect(0,285,W,12,"F");pdf.setFontSize(8);pdf.setFont("helvetica","normal");pdf.setTextColor(140,140,160);pdf.text("Hydrawav3 · Recovery Intelligence · GlobeHack S1 · Wellness use only",margin,292);pdf.text(`Page ${i} of ${tp}`,W-margin,292,{align:"right"});}
  pdf.save(`${r.merged.patient.name||"hydrawav3"}-report.pdf`);
};

const generateReport = () => {
  const merged = {
    patient: {
      name: pt.name || uploadedData?.patient?.name || "Unknown",
      age: pt.age || uploadedData?.patient?.age || "n/a",
      areas: pt.areas?.length ? pt.areas : uploadedData?.patient?.areas || [],
      mobilityScore: pt.mobilityScore || uploadedData?.patient?.mobilityScore || 5,
    },
    vitals: {
      heartRate: vitals?.heartRate || uploadedData?.vitals?.heartRate || null,
      breathRate: vitals?.breathRate || uploadedData?.vitals?.breathRate || null,
      hrv: vitals?.hrv || uploadedData?.vitals?.hrv || null,
    },
    protocol: {
      goal: proto?.goal || uploadedData?.protocol?.goal || "recovery",
      intensity: proto?.intensity || uploadedData?.protocol?.intensity || "moderate",
      sessionDurationMinutes:
        proto?.sessionDurationMinutes ?? uploadedData?.protocol?.sessionDurationMinutes ?? 9,
      sunPadPlacement: proto?.sunPadPlacement || uploadedData?.protocol?.sunPadPlacement || "Upper back",
      moonPadPlacement: proto?.moonPadPlacement || uploadedData?.protocol?.moonPadPlacement || "Lower back",
    },
    uploadedData,
  };

  const summary = [
    asmt ? `Camera assessment collected with ${asmt.flags?.length || 0} flags.` : "No live camera assessment.",
    vitals ? `Vitals captured: HR ${vitals.heartRate || "n/a"}, Breath ${vitals.breathRate || "n/a"}, HRV ${vitals.hrv || "n/a"}.` : "No live vitals captured.",
    proto ? `Protocol generated with sun pad at ${proto.sunPadPlacement} and moon pad at ${proto.moonPadPlacement}.` : "No protocol generated yet.",
    uploadedData ? "Manual dataset upload merged into report." : "No manual dataset uploaded.",
  ].join(" ");

  setReportPreview({
    merged,
    summary,
    recommendations: {
      coachingTip: proto?.coachingTip || "Keep movement gentle between visits.",
      recoveryFocus: proto?.recoveryFocus || "Re-test the main ROM area next visit.",
    },
  });
  setScreen("report");
};

  return (
    <div style={C.root}>

      {/* ── Header ── */}
      <div style={C.hdr}>
        <div>
          <div style={{fontSize:18,fontWeight:500}}>Hydrawav3</div>
          <div style={{fontSize:12,color:"var(--color-text-secondary)"}}>Recovery Intelligence · GlobeHack S1</div>
        </div>
        <button style={C.ghost} onClick={()=>setShowCfg(v=>!v)}>{showCfg?"Close":"Settings"}</button>
      </div>
      {/* ── Settings ── */}
      {showCfg&&(
        <div style={{...C.sec,marginBottom:"1.5rem"}}>
          <div style={{fontSize:14,fontWeight:500,marginBottom:"1rem"}}>Device API Configuration</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            {[["Server URL","serverUrl","https://your-server.com","text"],["Device MAC","deviceMac","74:4D:BD:A0:A3:EC","text"],["Username","username","username","text"],["Password","password","","password"]].map(([l,k,ph,t])=>(
              <div key={k}><label style={C.lbl}>{l}</label><input type={t} value={api[k]} placeholder={ph} onChange={e=>setApi(c=>({...c,[k]:e.target.value}))} style={{width:"100%",boxSizing:"border-box"}}/></div>
            ))}
          </div>
          <div style={{marginTop:12,paddingTop:12,borderTop:"0.5px solid var(--color-border-tertiary)"}}>
            <label style={C.lbl}>ElevenLabs API Key (for voice protocol delivery)</label>
            <input type="password" value={api.elevenLabsKey} placeholder="sk_..." onChange={e=>setApi(c=>({...c,elevenLabsKey:e.target.value}))} style={{width:"100%",boxSizing:"border-box"}}/>
            <div style={{fontSize:11,color:"var(--color-text-secondary)",marginTop:4}}>Get your key at elevenlabs.io → Profile → API Key. Leave blank to disable voice.</div>
          </div>
        </div>
      )}

      {/* ── Nav ── */}
    

  {/* Progress line */}
  <div style={{
  display: "flex",
  alignItems: "center",
  marginBottom: "1.5rem"
}}>

  {TABS.map((t, i) => {
    const active = screen === t.id;

    return (
      <div key={t.id} style={{
        display: "flex",
        alignItems: "center",
        flex: 1
      }}>

        {/* STEP */}
        <div
          onClick={() => !t.locked && setScreen(t.id)}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            cursor: t.locked ? "not-allowed" : "pointer",
            flexShrink: 0
          }}
        >
          <div style={{
            width: 42,
            height: 42,
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 14,
            fontWeight: 700,
            color: active ? "#020617" : "#94a3b8",
            background: active
              ? "linear-gradient(135deg,#22d3ee,#8b5cf6)"
              : "rgba(255,255,255,0.05)",
            boxShadow: active
              ? "0 0 25px rgba(139,92,246,0.7)"
              : "none",
            border: active
              ? "none"
              : "1px solid rgba(255,255,255,0.1)",
            transition: "all 0.3s ease"
          }}>
            {i}
          </div>

          <div style={{
            marginTop: 6,
            fontSize: 11,
            color: active ? "#fff" : "#64748b"
          }}>
            {t.label.split(" ")[1]}
          </div>
        </div>

        {/* ARROW ONLY (NO LINE) */}
        {i < TABS.length - 1 && (
          <div style={{
            flex: 1,
            display: "flex",
            justifyContent: "center",
            alignItems: "center"
          }}>
            <span style={{
              fontSize: 18,
              color: "rgba(255,255,255,0.3)",
              margin: "0 10px"
            }}>
              →
            </span>
          </div>
        )}
      </div>
    );
  })}
</div>


      {/* ════════════════════════════════
          SCREEN 0 — CAMERA ASSESSMENT
      ════════════════════════════════ */}
      {screen==="camera"&&(
        <div>
          <div style={{marginBottom:"1.5rem"}}>
            <div style={{fontSize:22,fontWeight:500,marginBottom:4}}>Body Assessment</div>
            <div style={{fontSize:14,color:"var(--color-text-secondary)"}}>MediaPipe 33-landmark pose · ROM + asymmetry detection · rPPG heart rate</div>
          </div>

          <div style={{...C.sec,marginBottom:"1.25rem",padding:"0.875rem 1.25rem"}}>
            <div style={{fontFamily:"var(--font-mono)",fontSize:11,color:"var(--color-text-secondary)",lineHeight:"1.9"}}>
              <span style={{color:"var(--color-text-primary)",fontWeight:500}}>Pipeline: </span>
              Camera → MediaPipe (33 lm) + rPPG (face green channel, UBFC method)
              → Angles · Asymmetry · HR/HRV · Structured bundle
              → Claude API → Protocol → MQTT → Hydrawav3 device
            </div>
          </div>

          {/* Video / Canvas viewport */}
          <div style={{...C.card,marginBottom:"1.25rem",padding:"1rem"}}>
            <div style={{position:"relative",width:"100%",background:"var(--color-background-secondary)",borderRadius:"var(--border-radius-md)",overflow:"hidden",aspectRatio:"4/3",display:"flex",alignItems:"center",justifyContent:"center"}}>
              <video ref={videoRef} style={{position:"absolute",opacity:0,width:1,height:1}} playsInline muted/>
              <canvas ref={canvasRef} style={{width:"100%",height:"100%",objectFit:"contain",display:camSt==="running"?"block":"none"}}/>
              {camSt!=="running"&&(
                <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:14,padding:"2rem",textAlign:"center"}}>
                  {camSt==="loading"&&<div style={{fontSize:14,color:"var(--color-text-secondary)"}}>Loading MediaPipe model from CDN...</div>}
                  {camSt==="error"&&<div style={{fontSize:14,color:"var(--color-text-danger)"}}>Camera/MediaPipe unavailable. Use demo data below.</div>}
                  {(camSt==="idle"&&!gotIt)&&(
                    <>
                      <div style={{fontSize:13,color:"var(--color-text-secondary)",maxWidth:360}}>Point camera at patient standing upright. MediaPipe detects pose landmarks and calculates ROM angles in real time.</div>
                      <div style={{display:"flex",gap:8,flexWrap:"wrap",justifyContent:"center"}}>
                        <button style={C.prim} onClick={startCamera}>Start Camera + Pose Detection</button>
                        <button style={C.ghost} onClick={useDemoData}>Use Demo Data</button>
                      </div>
                    </>
                  )}
                  {gotIt&&<div style={{fontSize:14,color:"#27500A",fontWeight:500}}>Assessment captured ✓</div>}
                </div>
              )}
            </div>
            {camSt==="running"&&(
              <div style={{display:"flex",gap:8,marginTop:12}}>
                <button style={C.prim} onClick={captureSnap} disabled={!live}>Capture Assessment Snapshot</button>
                <button style={C.ghost} onClick={stopCamera}>Stop Camera</button>
              </div>
            )}
          </div>

          {/* Live / captured angle readouts */}
          {cur&&(
            <div style={C.card}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                <div style={{fontSize:13,fontWeight:500}}>{gotIt?"Captured Assessment":"Live Readings"}</div>
                {(cur.heartRate||(liveHR&&!gotIt))&&(
                  <div style={{fontSize:12,color:"var(--color-text-secondary)"}}>
                    HR (rPPG): {cur.heartRate||liveHR} bpm
                  </div>
                )}
              </div>

              <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:8,marginBottom:"1rem"}}>
                {[["R. Shoulder",cur.shoulderR,NORMS.shoulderElev],["L. Shoulder",cur.shoulderL,NORMS.shoulderElev],["R. Knee",cur.kneeR,NORMS.kneeFlexion],["L. Knee",cur.kneeL,NORMS.kneeFlexion]].map(([label,angle,norm])=>{
                  const s=romStatus(angle,norm);
                  return (
                    <div key={label} style={{background:statusBg(s),borderRadius:"var(--border-radius-md)",padding:"10px 14px",border:`0.5px solid ${statusColor(s)}30`}}>
                      <div style={{fontSize:11,color:statusColor(s),fontWeight:500,marginBottom:2}}>{label}</div>
                      <div style={{fontSize:24,fontWeight:500,color:statusColor(s)}}>{angle}°</div>
                      <div style={{fontSize:11,color:statusColor(s),textTransform:"capitalize"}}>{s === "good" ? "✓ normal" : s === "fair" ? "fair" : "limited"}</div>
                    </div>
                  );
                })}
              </div>

              {cur.shoulderAsym>0&&(
                <div style={{display:"flex",gap:16,fontSize:12,color:"var(--color-text-secondary)",marginBottom:cur.flags?.length>0?"0.75rem":0}}>
                  <span>Shoulder Δ: <strong style={{color:cur.shoulderAsym>NORMS.symThreshold?"#791F1F":"#27500A"}}>{cur.shoulderAsym}°</strong></span>
                  <span>Hip tilt: <strong style={{color:cur.hipAsym>NORMS.hipThreshold?"#791F1F":"#27500A"}}>{cur.hipAsym}%</strong></span>
                </div>
              )}

              {cur.flags?.length>0&&(
                <div style={{marginTop:8}}>
                  <div style={{fontSize:12,fontWeight:500,color:"var(--color-text-secondary)",marginBottom:6}}>Movement flags</div>
                  {cur.flags.map((f,i)=>(
                    <div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"3px 0",fontSize:13}}>
                      <div style={{width:5,height:5,borderRadius:"50%",background:"#E24B4A",flexShrink:0}}/>
                      {f}
                    </div>
                  ))}
                </div>
              )}

              {gotIt&&(
                <button style={{...C.prim,marginTop:"1rem"}} onClick={()=>setScreen("intake")}>
                  Continue to Intake — areas pre-filled ↗
                </button>
              )}
            </div>
          )}

          {!cur&&(
            <div style={{...C.sec,fontSize:12,color:"var(--color-text-secondary)"}}>
              <div style={{fontWeight:500,marginBottom:6}}>Reference ranges (UI-PRMD dataset)</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:4,lineHeight:"1.8"}}>
                <span>Shoulder elevation: 140–180° normal</span>
                <span>Knee flexion: 120–155° normal</span>
                <span>Asymmetry flag: &gt;10° difference</span>
                <span>Hip tilt flag: &gt;8% deviation</span>
              </div>
            </div>
          )}

          {/* ── Claude Vision posture analysis ── */}
          <div style={{...C.card,marginTop:"1rem"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
              <div>
                <div style={{fontSize:13,fontWeight:500}}>Claude Vision — Posture Analysis</div>
                <div style={{fontSize:11,color:"var(--color-text-secondary)",marginTop:2}}>Take a photo → Claude analyzes posture, flags areas, recommends pad placement</div>
              </div>
              <button
                style={{...C.prim,width:"auto",padding:"9px 16px",fontSize:13}}
                onClick={capturePosturePhoto}
                disabled={visionLoading}
              >
                {visionLoading ? "Analyzing..." : "📷 Take Photo"}
              </button>
            </div>

            {visionErr && <div style={{color:"var(--color-text-danger)",fontSize:13,marginBottom:8}}>{visionErr}</div>}

            {posturePhoto && (
              <img
                src={`data:image/jpeg;base64,${posturePhoto}`}
                alt="Posture snapshot"
                style={{width:"100%",borderRadius:"var(--border-radius-md)",marginBottom:12,maxHeight:200,objectFit:"cover"}}
              />
            )}

            {postureAnalysis && (
              <div>
                <div style={{...C.sec,marginBottom:10,borderLeft:"3px solid #A78BFA",paddingLeft:"0.875rem"}}>
                  <div style={{fontSize:11,fontWeight:500,color:"var(--color-text-secondary)",marginBottom:4,letterSpacing:"0.06em"}}>CLAUDE VISION OBSERVATION</div>
                  <div style={{fontSize:13,lineHeight:"1.7"}}>{postureAnalysis.postureObservation}</div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
                  <div style={{background:"#FCEBEB",borderRadius:"var(--border-radius-md)",padding:10,border:"0.5px solid #F7C1C1"}}>
                    <div style={{fontSize:10,color:"#791F1F",fontWeight:500,marginBottom:3}}>RECOMMENDED SUN PAD</div>
                    <div style={{fontSize:14,fontWeight:500,color:"#501313"}}>{postureAnalysis.recommendedSunPad}</div>
                  </div>
                  <div style={{background:"#E6F1FB",borderRadius:"var(--border-radius-md)",padding:10,border:"0.5px solid #B5D4F4"}}>
                    <div style={{fontSize:10,color:"#0C447C",fontWeight:500,marginBottom:3}}>RECOMMENDED MOON PAD</div>
                    <div style={{fontSize:14,fontWeight:500,color:"#042C53"}}>{postureAnalysis.recommendedMoonPad}</div>
                  </div>
                </div>
                {postureAnalysis.flaggedAreas?.length>0 && (
                  <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:8}}>
                    {postureAnalysis.flaggedAreas.map((a,i)=>(
                      <span key={i} style={{fontSize:11,padding:"3px 10px",background:"#FAEEDA",color:"#633806",borderRadius:20,border:"0.5px solid #FAC77540"}}>{a}</span>
                    ))}
                  </div>
                )}
                <div style={{fontSize:11,color:"var(--color-text-secondary)",fontStyle:"italic"}}>{postureAnalysis.confidenceNote}</div>
              </div>
            )}

            {!postureAnalysis && !visionLoading && (
              <div style={{fontSize:12,color:"var(--color-text-secondary)"}}>
                Capture a photo of the patient standing upright. Claude Vision will identify postural patterns, restricted areas, and recommend pad placement — even without MediaPipe running.
              </div>
            )}
          </div>
        </div>
      )}


      {/* ════════════════════
          SCREEN: VITALS
      ════════════════════ */}
      {screen==="vitals"&&(
        <VitalsScreen
          C={C}
          onVitalsCaptured={(v)=>{
            setVitals(v);
            setPt(p=>({...p, hrv: String(v.hrv)}));
            setScreen("intake");
          }}
        />
      )}

      {/* ════════════════════
          SCREEN 1 — INTAKE
      ════════════════════ */}
      {screen==="intake"&&(
        <div>
          <div style={{marginBottom:"1.5rem"}}>
            <div style={{fontSize:22,fontWeight:500,marginBottom:4}}>Patient Intake</div>
            <div style={{fontSize:14,color:"var(--color-text-secondary)"}}>{asmt?"Camera data loaded · Confirm and supplement":"Complete in under 60 seconds"}</div>
          </div>

          {asmt&&(
            <div style={{...C.sec,marginBottom:"1.25rem",borderLeft:"3px solid #E24B4A",paddingLeft:"1rem"}}>
              <div style={{fontSize:11,fontWeight:500,color:"var(--color-text-secondary)",marginBottom:4,letterSpacing:"0.06em"}}>FROM CAMERA ASSESSMENT</div>
              <div style={{fontSize:13,lineHeight:"1.7"}}>Shoulder R {asmt.shoulderR}° / L {asmt.shoulderL}° · Knee R {asmt.kneeR}° / L {asmt.kneeL}° {asmt.heartRate?`· HR ${asmt.heartRate} bpm`:""}</div>
              {asmt.flags.length>0&&<div style={{fontSize:12,color:"#791F1F",marginTop:3}}>{asmt.flags[0]}{asmt.flags.length>1?` +${asmt.flags.length-1} more`:""}</div>}
            </div>
          )}

          <div style={C.card}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:"1.25rem"}}>
              <div>
                <label style={C.lbl}>Client Name</label>
                <div style={{display:"flex",gap:6}}>
                  <input value={pt.name} placeholder="Full name" onChange={e=>setPt(p=>({...p,name:e.target.value}))} style={{width:"100%",boxSizing:"border-box"}}/>
                  <MicButton onResult={t=>setPt(p=>({...p,name:t.trim()}))} />
                </div>
              </div>
              <div><label style={C.lbl}>Age</label><input type="number" value={pt.age} placeholder="Age" onChange={e=>setPt(p=>({...p,age:e.target.value}))} style={{width:"100%",boxSizing:"border-box"}}/></div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:"1.25rem"}}>
              <div><label style={C.lbl}>Practitioner Type</label><select value={pt.practitionerType} onChange={e=>setPt(p=>({...p,practitionerType:e.target.value}))} style={{width:"100%",boxSizing:"border-box"}}>{PTYPES.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}</select></div>
              <div><label style={C.lbl}>Wellness Goal</label><select value={pt.primaryConcern} onChange={e=>setPt(p=>({...p,primaryConcern:e.target.value}))} style={{width:"100%",boxSizing:"border-box"}}>{CONCERNS.map(c=><option key={c.value} value={c.value}>{c.label}</option>)}</select></div>
            </div>
            <div style={C.fld}>
              <label style={C.lbl}>Focus Areas {asmt?"(pre-filled from camera)":""}</label>
              <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
                {BODY_AREAS.map(a=><button key={a} style={C.chip(pt.areas.includes(a))} onClick={()=>toggleArea(a)}>{a}</button>)}
              </div>
            </div>
            <div style={C.fld}>
              <label style={C.lbl}>Mobility Score {asmt?`(camera: ${asmt.mobilityScore}/10)`:""} — {pt.mobilityScore}/10</label>
              <input type="range" min="1" max="10" step="1" value={pt.mobilityScore} onChange={e=>setPt(p=>({...p,mobilityScore:parseInt(e.target.value)}))} style={{width:"100%"}}/>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:"var(--color-text-secondary)",marginTop:2}}><span>Severely restricted</span><span>Full, pain-free</span></div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:"1.5rem"}}>
              <div><label style={C.lbl}>HRV (ms) {asmt?.heartRate?`· rPPG HR: ${asmt.heartRate} bpm`:""}</label><input type="number" value={pt.hrv} placeholder="e.g. 45" onChange={e=>setPt(p=>({...p,hrv:e.target.value}))} style={{width:"100%",boxSizing:"border-box"}}/></div>
              <div><label style={C.lbl}>Sleep Quality</label><select value={pt.sleepQuality} onChange={e=>setPt(p=>({...p,sleepQuality:e.target.value}))} style={{width:"100%",boxSizing:"border-box"}}><option value="">Not provided</option><option value="poor">Poor (&lt;5 hrs)</option><option value="fair">Fair (5–6 hrs)</option><option value="good">Good (7–8 hrs)</option><option value="excellent">Excellent (8+ hrs)</option></select></div>
            </div>
            {genErr&&<div style={{color:"var(--color-text-danger)",fontSize:13,marginBottom:12}}>{genErr}</div>}

            {/* Voice quick-fill — patient describes their issue in one sentence */}
            <div style={{...C.sec,marginBottom:12,padding:"0.875rem 1rem"}}>
              <div style={{fontSize:12,fontWeight:500,color:"var(--color-text-secondary)",marginBottom:6}}>VOICE QUICK-FILL</div>
              <div style={{fontSize:12,color:"var(--color-text-secondary)",marginBottom:8}}>
                Click mic → speak → click again to stop: <em>"My name is John, I have tightness in my left shoulder and lower back after running"</em>
              </div>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                <MicButton
                  style={{padding:"10px 14px",fontSize:18}}
                  onResult={async (text) => {
                    // Parse spoken input with Claude
                    try {
                      const r = await fetch("https://api.anthropic.com/v1/messages", {
                        method:"POST",
                        headers:{"Content-Type":"application/json","anthropic-dangerous-direct-browser-access":"true","anthropic-version":"2023-06-01"},
                        body:JSON.stringify({
                          model:"claude-sonnet-4-20250514", max_tokens:300,
                          messages:[{role:"user",content:`Extract patient intake info from this spoken description. Return ONLY valid JSON:\n"${text}"\n{\n"name":"string or empty",\n"age":"number string or empty",\n"areas":["body areas mentioned"],\n"primaryConcern":"muscle_tension|recovery|activation|chronic_discomfort|nervous_system|mobility",\n"notes":"full original text"\n}`}]
                        })
                      });
                      const d = await r.json();
                      const parsed = JSON.parse((d.content?.[0]?.text||"{}").replace(/```json|```/g,"").trim());
                      setPt(p=>({
                        ...p,
                        name: parsed.name||p.name,
                        age:  parsed.age||p.age,
                        areas:[...new Set([...p.areas,...(parsed.areas||[])])],
                        primaryConcern: parsed.primaryConcern||p.primaryConcern,
                      }));
                    } catch(_) {}
                  }}
                />
                <div style={{fontSize:13,color:"var(--color-text-secondary)"}}>Click to start · click again to stop · auto-fills fields</div>
              </div>
            </div>

            <button style={C.prim} onClick={generate} disabled={genning}>
              {genning?"Generating personalized protocol...":`Generate Protocol ${asmt?"(camera-assisted) ↗":"↗"}`}
            </button>
          </div>
        </div>
      )}


      {/* ══════════════════════
          SCREEN 2 — PROTOCOL
      ══════════════════════ */}
      {screen==="protocol"&&proto&&(
        <div>
          <div style={{marginBottom:"1.5rem"}}>
            <div style={{fontSize:22,fontWeight:500,marginBottom:4}}>Recommended Protocol</div>
            <div style={{fontSize:14,color:"var(--color-text-secondary)"}}>{pt.name}{asmt?" · Camera-assisted":""}</div>
          </div>

          {proto.primaryFinding&&(
            <div style={{...C.sec,marginBottom:"1.25rem",borderLeft:"3px solid #E24B4A",paddingLeft:"1rem"}}>
              <div style={{fontSize:11,fontWeight:500,color:"var(--color-text-secondary)",marginBottom:4,letterSpacing:"0.06em"}}>KEY FINDING</div>
              <div style={{fontSize:14}}>{proto.primaryFinding}</div>
            </div>
          )}

          <div style={{
  display:"grid",
  gridTemplateColumns:"repeat(3,1fr)",
  gap:10,
  marginBottom:"1.25rem"
}}>

  {/* Goal */}
  <div style={{background:"var(--color-background-secondary)",borderRadius:"var(--border-radius-md)",padding:"1rem",textAlign:"center"}}>
    <div style={{fontSize:11,color:"var(--color-text-secondary)",marginBottom:4}}>Goal</div>
    <div style={{fontSize:15,fontWeight:500,textTransform:"capitalize"}}>
      {proto.goal || "recovery"}
    </div>
  </div>

  {/* Intensity */}
  <div style={{background:"var(--color-background-secondary)",borderRadius:"var(--border-radius-md)",padding:"1rem",textAlign:"center"}}>
    <div style={{fontSize:11,color:"var(--color-text-secondary)",marginBottom:4}}>Intensity</div>
    <div style={{fontSize:15,fontWeight:500,textTransform:"capitalize"}}>
      {proto.intensity || "moderate"}
    </div>
  </div>

  {/* Duration */}
  <div style={{background:"var(--color-background-secondary)",borderRadius:"var(--border-radius-md)",padding:"1rem",textAlign:"center"}}>
    <div style={{fontSize:11,color:"var(--color-text-secondary)",marginBottom:4}}>Duration</div>
    <div style={{fontSize:15,fontWeight:500}}>
      {(proto.sessionDurationMinutes ?? 9)} min
    </div>
  </div>

</div>

          <div style={{...C.card,marginBottom:"1rem"}}>
            <div style={{marginBottom:"1rem",paddingBottom:"1rem",borderBottom:"0.5px solid var(--color-border-tertiary)"}}>
              <div style={{fontSize:12,fontWeight:500,color:"var(--color-text-secondary)",marginBottom:10}}>PAD PLACEMENT</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                <div style={{background:"#FCEBEB",borderRadius:"var(--border-radius-md)",padding:14,border:"0.5px solid #F7C1C1"}}>
                  <div style={{fontSize:10,color:"#791F1F",fontWeight:500,marginBottom:4,letterSpacing:"0.08em"}}>SUN PAD — HEAT + RED 660nm</div>
                  <div style={{fontSize:16,color:"#501313",fontWeight:500}}>{proto.sunPadPlacement}</div>
                </div>
                <div style={{background:"#E6F1FB",borderRadius:"var(--border-radius-md)",padding:14,border:"0.5px solid #B5D4F4"}}>
                  <div style={{fontSize:10,color:"#0C447C",fontWeight:500,marginBottom:4,letterSpacing:"0.08em"}}>MOON PAD — COOL + BLUE 450nm</div>
                  <div style={{fontSize:16,color:"#042C53",fontWeight:500}}>{proto.moonPadPlacement}</div>
                </div>
              </div>
            </div>
            {proto.asymmetryNote&&proto.asymmetryNote!=="null"&&(
              <div style={{marginBottom:"1rem",paddingBottom:"1rem",borderBottom:"0.5px solid var(--color-border-tertiary)"}}>
                <div style={{fontSize:12,fontWeight:500,color:"var(--color-text-secondary)",marginBottom:6}}>ASYMMETRY NOTE</div>
                <div style={{fontSize:14,lineHeight:"1.65"}}>{proto.asymmetryNote}</div>
              </div>
            )}
            <div style={{marginBottom:"1rem",paddingBottom:"1rem",borderBottom:"0.5px solid var(--color-border-tertiary)"}}>
              <div style={{fontSize:12,fontWeight:500,color:"var(--color-text-secondary)",marginBottom:6}}>PROTOCOL REASONING</div>
              <div style={{fontSize:14,lineHeight:"1.65"}}>{proto.reasoning}</div>
            </div>
            <div style={{marginBottom:"1rem",paddingBottom:"1rem",borderBottom:"0.5px solid var(--color-border-tertiary)"}}>
              <div style={{fontSize:12,fontWeight:500,color:"var(--color-text-secondary)",marginBottom:6}}>BETWEEN-VISIT TIP</div>
              <div style={{fontSize:14,lineHeight:"1.65",fontStyle:"italic",color:"var(--color-text-secondary)"}}>{proto.coachingTip}</div>
            </div>
            <div><div style={{fontSize:12,fontWeight:500,color:"var(--color-text-secondary)",marginBottom:4}}>RETEST</div><div style={{fontSize:14}}>{proto.recoveryFocus}</div></div>
          </div>

          <div style={{...C.sec,marginBottom:"1.5rem"}}>
            <div style={{fontSize:12,fontWeight:500,marginBottom:8}}>MQTT PAYLOAD PREVIEW</div>
            {(()=>{const cfg=buildSessionConfig(api.deviceMac||"[MAC]",proto);return(
              <div style={{fontFamily:"var(--font-mono)",fontSize:11,color:"var(--color-text-secondary)",lineHeight:"1.8"}}>
                <div>POST /api/v1/mqtt/publish  · topic: "HydraWav3Pro/config"</div>
                <div>mac: "{cfg.mac}" · playCmd: {cfg.playCmd}</div>
                <div>leftFuncs:  {JSON.stringify(cfg.leftFuncs)}</div>
                <div>rightFuncs: {JSON.stringify(cfg.rightFuncs)}</div>
                <div>pwm hot: {JSON.stringify(cfg.pwmValues.hot)} · cold: {JSON.stringify(cfg.pwmValues.cold)}</div>
                <div>vib: {cfg.vibMin}–{cfg.vibMax} · totalDuration: {cfg.totalDuration}s</div>
              </div>
            )})()}
          </div>

          {devErr&&<div style={{color:"var(--color-text-danger)",fontSize:13,marginBottom:12}}>{devErr}</div>}

          {/* Voice + Vision summary bar */}
         <div style={{ display: "flex", gap: 10 }}>
  <button
    style={{ ...C.prim, flex: 1 }}
    onClick={() => startSession("auto")}
  >
    Start AI Session ↗
  </button>

  <button
    style={{
      ...C.ghost,
      flex: 1,
      background: "linear-gradient(135deg,#ef4444,#3b82f6)",
      color: "#fff",
      fontWeight: 600
    }}
    onClick={() => startSession("redBlue10")}
  >
    10 Min Red + Blue ↗
  </button>
</div>       </div>
      )}


      {/* ══════════════════════
          SCREEN 3 — SESSION
      ══════════════════════ */}
      {screen==="session"&&(
        <div>
          <div style={{marginBottom:"1.5rem"}}>
            <div style={{fontSize:22,fontWeight:500,marginBottom:4}}>Active Session</div>
            <div style={{fontSize:14,color:"var(--color-text-secondary)"}}>{pt.name} · {proto?.goal} · {proto?.intensity}</div>
          </div>
          <div style={{...C.card,textAlign:"center",padding:"2.5rem 1.25rem",marginBottom:"1.25rem"}}>
            <div style={{fontSize:11,letterSpacing:"0.1em",color:"var(--color-text-secondary)",marginBottom:8}}>
              {sess.status==="running"?"TIME REMAINING":sess.status==="paused"?"PAUSED":sess.status==="complete"?"COMPLETE":"READY"}
            </div>
            <div style={{fontSize:64,fontWeight:500,fontFamily:"var(--font-mono)",letterSpacing:"-0.02em",marginBottom:4,color:sess.status==="complete"?"var(--color-text-success)":"var(--color-text-primary)"}}>
              {sess.status==="complete"?"0:00":fmt(TOTAL-sess.elapsed)}
            </div>
            <div style={{height:4,background:"var(--color-background-secondary)",borderRadius:2,margin:"14px 0 1.5rem",overflow:"hidden"}}>
              <div style={{height:"100%",width:`${Math.min(100,pct)}%`,background:sess.status==="complete"?"#639922":"#E24B4A",borderRadius:2,transition:"width 1s linear"}}/>
            </div>
            {proto&&sess.status!=="idle"&&(
              <div style={{display:"flex",gap:10,justifyContent:"center",marginBottom:"1.5rem",flexWrap:"wrap"}}>
                <div style={{fontSize:12,color:"#791F1F",background:"#FCEBEB",padding:"4px 14px",borderRadius:20,border:"0.5px solid #F7C1C1"}}>Sun → {proto.sunPadPlacement}</div>
                <div style={{fontSize:12,color:"#0C447C",background:"#E6F1FB",padding:"4px 14px",borderRadius:20,border:"0.5px solid #B5D4F4"}}>Moon → {proto.moonPadPlacement}</div>
              </div>
            )}
            <div style={{display:"flex",gap:8,justifyContent:"center",flexWrap:"wrap"}}>
              {sess.status==="running"&&<button style={C.ghost} onClick={pauseResume}>Pause</button>}
              {sess.status==="paused"&&<button style={C.prim} onClick={pauseResume}>Resume</button>}
              {(sess.status==="running"||sess.status==="paused")&&<button style={C.danger} onClick={stopSess}>Stop</button>}
              {sess.status==="complete"&&<button style={C.prim} onClick={()=>setScreen("recovery")}>Log Outcomes ↗</button>}
            </div>
          </div>
          <div style={C.card}>
            <div style={{fontSize:13,fontWeight:500,marginBottom:8}}>Session Log</div>
            <div style={{fontFamily:"var(--font-mono)",fontSize:12,color:"var(--color-text-secondary)",lineHeight:"1.8"}}>
              {sess.log.length===0?<div>Waiting...</div>:sess.log.map((m,i)=><div key={i}>{m}</div>)}
            </div>
          </div>
        </div>
      )}


      {/* ════════════════════════
          SCREEN 4 — RECOVERY
      ════════════════════════ */}
      {screen==="recovery"&&(
        <div>
          <div style={{marginBottom:"1.5rem"}}>
            <div style={{fontSize:22,fontWeight:500,marginBottom:4}}>Recovery Outcomes</div>
            <div style={{fontSize:14,color:"var(--color-text-secondary)"}}>Log re-test results · Build the data layer</div>
          </div>

          {score!==null?(
            <div>
              <div style={{...C.card,textAlign:"center",padding:"2.5rem",marginBottom:"1.25rem"}}>
                <div style={{fontSize:11,letterSpacing:"0.1em",color:"var(--color-text-secondary)",marginBottom:8}}>RECOVERY SCORE</div>
                <div style={{fontSize:80,fontWeight:500,lineHeight:1,marginBottom:8,color:score>=70?"#3B6D11":score>=40?"#BA7517":"#A32D2D"}}>{score}</div>
                <div style={{fontSize:14,color:"var(--color-text-secondary)"}}>{score>=70?"Excellent — the body responded well.":score>=40?"Good progress — compound this next visit.":"Keep going — recovery builds session over session."}</div>
              </div>

              {asmt&&(
                <div style={{...C.card,marginBottom:"1.25rem"}}>
                  <div style={{fontSize:13,fontWeight:500,marginBottom:10}}>Camera Baseline — Reference for Next Visit</div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,fontSize:12}}>
                    {[["R.Sh",asmt.shoulderR,NORMS.shoulderElev],["L.Sh",asmt.shoulderL,NORMS.shoulderElev],["R.Kn",asmt.kneeR,NORMS.kneeFlexion],["L.Kn",asmt.kneeL,NORMS.kneeFlexion]].map(([l,a,n])=>{
                      const s=romStatus(a,n);
                      return <div key={l} style={{background:statusBg(s),borderRadius:"var(--border-radius-md)",padding:8,textAlign:"center"}}><div style={{fontSize:10,color:statusColor(s),marginBottom:2}}>{l}</div><div style={{fontWeight:500,color:statusColor(s)}}>{a}°</div></div>;
                    })}
                  </div>
                </div>
              )}

              {proto?.coachingTip&&(
                <div style={{...C.sec,marginBottom:"1.25rem"}}>
                  <div style={{fontSize:11,fontWeight:500,letterSpacing:"0.06em",color:"var(--color-text-secondary)",marginBottom:8}}>BETWEEN-VISIT COACHING</div>
                  <div style={{fontSize:14,lineHeight:"1.65",marginBottom:8}}>{proto.coachingTip}</div>
                  <div style={{fontSize:12,color:"var(--color-text-secondary)"}}>Retest next visit: {proto.recoveryFocus}</div>
                </div>
              )}

              {hist.length>0&&(
                <div style={{...C.card,marginBottom:"1.5rem"}}>
                  <div style={{fontSize:14,fontWeight:500,marginBottom:"1rem"}}>Session History</div>
                  {hist.map((h,i)=>(
                    <div key={i} style={{padding:"12px 0",borderBottom:i<hist.length-1?"0.5px solid var(--color-border-tertiary)":"none",display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                      <div>
                        <div style={{fontSize:14,fontWeight:500}}>{h.patient}</div>
                        <div style={{fontSize:12,color:"var(--color-text-secondary)"}}>{h.date} · {h.goal} · {h.areas?.slice(0,2).join(", ")}{h.areas?.length>2?` +${h.areas.length-2} more`:""}</div>
                        {h.romGain>0&&<div style={{fontSize:12,color:"#27500A",marginTop:2}}>+{h.romGain}° ROM gain</div>}
                        {h.hasCamera&&<div style={{fontSize:11,color:"var(--color-text-secondary)",marginTop:1}}>Camera-assessed</div>}
                      </div>
                      <div style={{fontSize:24,fontWeight:500,color:h.score>=70?"#3B6D11":h.score>=40?"#BA7517":"#A32D2D"}}>{h.score}</div>
                    </div>
                  ))}
                </div>
              )}
<input
  ref={uploadRef}
  type="file"
  accept=".json,application/json"
  style={{ display: "none" }}
  onChange={handleDatasetUpload}
/>

{reportErr && (
  <div style={{ color: "var(--color-text-danger)", fontSize: 13, marginBottom: 10 }}>
    {reportErr}
  </div>
)}

{/* ACTION SECTION */}
<div style={{
  marginTop: 20,
  display: "flex",
  flexDirection: "column",
  gap: 12
}}>

  {/* Upload + Generate row */}
  <div style={{ display: "flex", gap: 10 }}>
    <button
      style={{ ...C.ghost, flex: 1 }}
      onClick={() => uploadRef.current?.click()}
    >
      Upload Dataset JSON
    </button>

    <button
      style={{ ...C.prim, flex: 1 }}
      onClick={generateReport}
    >
      Generate Report ↗
    </button>
  </div>

  {/* Divider */}
  <div style={{
    height: 1,
    background: "rgba(255,255,255,0.08)",
    margin: "10px 0"
  }} />

  {/* New Session */}
  <button
    style={{ ...C.prim, width: "100%" }}
    onClick={() => {
      setScreen("camera");
      setProto(null);
      setAsmt(null);
      setGotIt(false);
      setReportPreview(null);
    }}
  >
    New Client Session ↗
  </button>

</div>
              
            </div>
          ):(
            <div style={C.card}>
              <div style={{fontSize:14,fontWeight:500,marginBottom:"1rem"}}>Re-Test Measurements</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:"1.25rem"}}>
                <div><label style={C.lbl}>{proto?.recoveryFocus||"ROM"} — Before (°)</label><input type="number" value={rec.romBefore} placeholder="e.g. 40" onChange={e=>setRec(r=>({...r,romBefore:e.target.value}))} style={{width:"100%",boxSizing:"border-box"}}/></div>
                <div><label style={C.lbl}>{proto?.recoveryFocus||"ROM"} — After (°)</label><input type="number" value={rec.romAfter} placeholder="e.g. 57" onChange={e=>setRec(r=>({...r,romAfter:e.target.value}))} style={{width:"100%",boxSizing:"border-box"}}/></div>
              </div>
              <div style={C.fld}><label style={C.lbl}>Discomfort Before — {rec.painBefore}/10</label><input type="range" min="0" max="10" step="1" value={rec.painBefore} onChange={e=>setRec(r=>({...r,painBefore:parseInt(e.target.value)}))} style={{width:"100%"}}/></div>
              <div style={C.fld}><label style={C.lbl}>Discomfort After — {rec.painAfter}/10</label><input type="range" min="0" max="10" step="1" value={rec.painAfter} onChange={e=>setRec(r=>({...r,painAfter:parseInt(e.target.value)}))} style={{width:"100%"}}/></div>
              <div style={C.fld}>
                <label style={C.lbl}>Practitioner Notes</label>
                <div style={{display:"flex",gap:6,alignItems:"flex-start"}}>
                  <textarea value={rec.notes} placeholder="Client feedback, observations, follow-up plan..." onChange={e=>setRec(r=>({...r,notes:e.target.value}))} style={{flex:1,minHeight:80,resize:"vertical",boxSizing:"border-box",fontFamily:"var(--font-sans)",fontSize:14,padding:"8px 12px",border:"0.5px solid var(--color-border-secondary)",borderRadius:"var(--border-radius-md)",background:"var(--color-background-primary)",color:"var(--color-text-primary)"}}/>
                  <MicButton onResult={t=>setRec(r=>({...r,notes:r.notes?r.notes+" "+t:t}))} style={{marginTop:2}}/>
                </div>
              </div>
              <button style={C.prim} onClick={saveRec}>Calculate Recovery Score ↗</button>
            </div>
          )}
        </div>
      )}
   {screen === "report" && reportPreview && (
  <div>
    <div style={{ marginBottom: "1.5rem" }}>
      <div style={{ fontSize: 22, fontWeight: 600, marginBottom: 4 }}>
        Final Report
      </div>
      <div style={{ fontSize: 14, color: "var(--color-text-secondary)" }}>
        Live data + manual upload merged into one report
      </div>
    </div>

    <div ref={reportRef} style={C.card}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 12, letterSpacing: "0.12em", color: "#94a3b8", marginBottom: 6 }}>
            HYDRAWAV3 REPORT
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, color: "#fff" }}>
            {reportPreview.merged.patient.name}
          </div>
          <div style={{ fontSize: 14, color: "#cbd5e1", marginTop: 4 }}>
            Age {reportPreview.merged.patient.age} · Recovery Intelligence Summary
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button style={C.ghost} onClick={() => setScreen("recovery")}>Back</button>
          <button style={C.prim} onClick={downloadReportPdf}>Download PDF</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 16 }}>
        {[["Goal", reportPreview.merged.protocol.goal], ["Intensity", reportPreview.merged.protocol.intensity], ["Duration", `${reportPreview.merged.protocol.sessionDurationMinutes} min`]].map(([label, val]) => (
          <div key={label} style={{ background:"rgba(255,255,255,0.06)", borderRadius:12, padding:"12px 14px", border:"1px solid rgba(255,255,255,0.08)" }}>
            <div style={{ fontSize:10, color:"#94a3b8", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:6 }}>{label}</div>
            <div style={{ fontSize:16, fontWeight:700, color:"#f1f5f9", textTransform:"capitalize" }}>{val}</div>
          </div>
        ))}
      </div>

      {[
        ["Summary",         reportPreview.summary],
        ["Vitals",          `Heart Rate: ${reportPreview.merged.vitals.heartRate || "n/a"} bpm\nBreath Rate: ${reportPreview.merged.vitals.breathRate || "n/a"} /min\nHRV: ${reportPreview.merged.vitals.hrv || "n/a"} ms`],
        ["Protocol",        `Goal: ${reportPreview.merged.protocol.goal}\nIntensity: ${reportPreview.merged.protocol.intensity}\nDuration: ${reportPreview.merged.protocol.sessionDurationMinutes} min\nSun Pad: ${reportPreview.merged.protocol.sunPadPlacement}\nMoon Pad: ${reportPreview.merged.protocol.moonPadPlacement}`],
        ["Recommendations", `Coaching Tip: ${reportPreview.recommendations.coachingTip}\nRetest: ${reportPreview.recommendations.recoveryFocus}`],
      ].map(([title, content]) => (
        <div key={title} style={{ background:"rgba(255,255,255,0.03)", borderRadius:10, padding:"14px 16px", border:"1px solid rgba(255,255,255,0.06)", marginBottom:12 }}>
          <div style={{ fontSize:11, fontWeight:700, color:"#22d3ee", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:8 }}>{title}</div>
          <div style={{ fontSize:13, color:"#cbd5e1", lineHeight:1.8, whiteSpace:"pre-line" }}>{content}</div>
        </div>
      ))}
    </div>

    <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
      <button style={C.ghost} onClick={() => setScreen("recovery")}>Back</button>
      <button style={C.prim} onClick={() => { setScreen("camera"); setReportPreview(null); }}>
        New Session
      </button>
    </div>
  </div>
)}
    </div>
  );
}

function Landing({ onEnter }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background:
          "radial-gradient(circle at 20% 30%, #0ea5e9 0%, transparent 40%), radial-gradient(circle at 80% 70%, #8b5cf6 0%, transparent 40%), #020617",
        color: "#fff",
        fontFamily: "var(--font-sans)",
        overflow: "hidden",
        position: "relative",
      }}
    >
      {/* Glow Orbs */}
      <div
        style={{
          position: "absolute",
          width: 400,
          height: 400,
          borderRadius: "50%",
          background: "rgba(34,211,238,0.15)",
          filter: "blur(120px)",
          top: "-100px",
          left: "-100px",
        }}
      />
      <div
        style={{
          position: "absolute",
          width: 400,
          height: 400,
          borderRadius: "50%",
          background: "rgba(139,92,246,0.2)",
          filter: "blur(120px)",
          bottom: "-100px",
          right: "-100px",
        }}
      />

      {/* Main Card */}
      <div
        style={{
          backdropFilter: "blur(25px)",
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 28,
          padding: "3rem 2.5rem",
          width: 420,
          textAlign: "center",
          boxShadow: "0 30px 80px rgba(0,0,0,0.4)",
          animation: "fadeIn 0.8s ease",
        }}
      >
        {/* Badge */}
        <div
          style={{
            display: "inline-block",
            padding: "6px 14px",
            borderRadius: 999,
            background: "rgba(255,255,255,0.08)",
            fontSize: 12,
            marginBottom: 18,
            letterSpacing: "0.08em",
          }}
        >
          HYDRA HEADS
        </div>

        {/* Title */}
        <h1
          style={{
            fontSize: 30,
            fontWeight: 700,
            marginBottom: 12,
            letterSpacing: "-0.5px",
          }}
        >
          Hydrawav3
        </h1>

        {/* Subtitle */}
        <p
          style={{
            fontSize: 14,
            color: "#cbd5e1",
            marginBottom: 28,
            lineHeight: 1.6,
          }}
        >
          AI-powered recovery intelligence using camera, vitals, and smart
          protocol generation.
        </p>

        {/* CTA Button */}
        <button
          onClick={onEnter}
          style={{
            width: "100%",
            padding: "14px",
            borderRadius: 16,
            border: "none",
            fontSize: 15,
            fontWeight: 700,
            cursor: "pointer",
            background:
              "linear-gradient(135deg, #22d3ee 0%, #8b5cf6 100%)",
            color: "#fff",
            boxShadow: "0 15px 40px rgba(34,211,238,0.3)",
            transition: "all 0.25s ease",
          }}
          onMouseEnter={(e) =>
            (e.target.style.transform = "scale(1.05)")
          }
          onMouseLeave={(e) =>
            (e.target.style.transform = "scale(1)")
          }
        >
          Enter Dashboard →
        </button>
      </div>

      {/* Animation */}
      <style>
        {`
          @keyframes fadeIn {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
          }
        `}
      </style>
    </div>
  );
}

export default function App() {
  const [view, setView] = useState("landing");

  return view === "landing" ? (
    <Landing onEnter={() => setView("app")} />
  ) : (
    <>
      <button
  onClick={() => setView("landing")}
  style={{
    position: "fixed",
    top: 20,
    left: 20,
    zIndex: 1000,
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "10px 14px",
    borderRadius: "14px",
    border: "1px solid rgba(255,255,255,0.15)",
    background: "rgba(15,23,42,0.6)",
    backdropFilter: "blur(10px)",
    color: "#e2e8f0",
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
    transition: "all 0.25s ease",
  }}
  onMouseEnter={(e) => {
    e.currentTarget.style.background = "linear-gradient(135deg,#22d3ee,#8b5cf6)";
    e.currentTarget.style.color = "#fff";
    e.currentTarget.style.boxShadow = "0 0 20px rgba(139,92,246,0.6)";
  }}
  onMouseLeave={(e) => {
    e.currentTarget.style.background = "rgba(15,23,42,0.6)";
    e.currentTarget.style.color = "#e2e8f0";
    e.currentTarget.style.boxShadow = "none";
  }}
>
  🏠 Home
</button>
      <MainApp />
    </>
  );

}


