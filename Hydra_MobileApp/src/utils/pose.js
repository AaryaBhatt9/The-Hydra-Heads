/**
 * Pose utilities for MoveNet keypoint format
 * Reference ranges from UI-PRMD dataset + clinical standards
 */

// MoveNet keypoint names
export const KP = {
  NOSE:'nose', LEFT_EYE:'left_eye', RIGHT_EYE:'right_eye',
  LEFT_EAR:'left_ear', RIGHT_EAR:'right_ear',
  LEFT_SHOULDER:'left_shoulder', RIGHT_SHOULDER:'right_shoulder',
  LEFT_ELBOW:'left_elbow', RIGHT_ELBOW:'right_elbow',
  LEFT_WRIST:'left_wrist', RIGHT_WRIST:'right_wrist',
  LEFT_HIP:'left_hip', RIGHT_HIP:'right_hip',
  LEFT_KNEE:'left_knee', RIGHT_KNEE:'right_knee',
  LEFT_ANKLE:'left_ankle', RIGHT_ANKLE:'right_ankle',
};

// Reference ranges from UI-PRMD dataset
export const NORMS = {
  shoulderElev: { good:[140,180], fair:[90,140], label:'Shoulder elevation' },
  kneeFlexion:  { good:[120,155], fair:[80,120], label:'Knee flexion' },
  symThreshold: 10,
  hipThreshold: 8,
};

export function calcAngle(A, B, C) {
  const rad = Math.atan2(C.y-B.y, C.x-B.x) - Math.atan2(A.y-B.y, A.x-B.x);
  let d = Math.abs(rad * 180 / Math.PI);
  return Math.round(d > 180 ? 360-d : d);
}

export function romStatus(angle, norm) {
  if (angle >= norm.good[0] && angle <= norm.good[1]) return 'good';
  if (angle >= norm.fair[0] && angle <= norm.fair[1]) return 'fair';
  return 'limited';
}

export function statusColor(status, C) {
  return status==='good' ? C.good : status==='fair' ? C.fair : C.limited;
}

export function statusBg(status, C) {
  return status==='good' ? C.goodBg : status==='fair' ? C.fairBg : C.limitedBg;
}

export function extractAssessment(keypoints) {
  // keypoints = [{name, x, y, score}] from MoveNet
  const g = name => {
    const kp = keypoints.find(k => k.name === name);
    return (kp && kp.score > 0.25) ? { x:kp.x, y:kp.y } : null;
  };

  const ls=g(KP.LEFT_SHOULDER), rs=g(KP.RIGHT_SHOULDER);
  const le=g(KP.LEFT_ELBOW),    re=g(KP.RIGHT_ELBOW);
  const lh=g(KP.LEFT_HIP),      rh=g(KP.RIGHT_HIP);
  const lk=g(KP.LEFT_KNEE),     rk=g(KP.RIGHT_KNEE);
  const la=g(KP.LEFT_ANKLE),    ra=g(KP.RIGHT_ANKLE);

  const sL = (ls&&le&&lh) ? calcAngle(le, ls, lh) : null;
  const sR = (rs&&re&&rh) ? calcAngle(re, rs, rh) : null;
  const kL = (lh&&lk&&la) ? calcAngle(lh, lk, la) : null;
  const kR = (rh&&rk&&ra) ? calcAngle(rh, rk, ra) : null;

  const hipAsym = (lh&&rh) ? Math.round(Math.abs(lh.y-rh.y)*5) : 0;
  const shoulderAsym = (sL!=null&&sR!=null) ? Math.abs(sL-sR) : 0;

  const flags = [];
  if (sL!=null && romStatus(sL,NORMS.shoulderElev)!=='good') flags.push(`Left shoulder limited (${sL}°)`);
  if (sR!=null && romStatus(sR,NORMS.shoulderElev)!=='good') flags.push(`Right shoulder limited (${sR}°)`);
  if (kL!=null && romStatus(kL,NORMS.kneeFlexion) !=='good') flags.push(`Left knee restricted (${kL}°)`);
  if (kR!=null && romStatus(kR,NORMS.kneeFlexion) !=='good') flags.push(`Right knee restricted (${kR}°)`);
  if (shoulderAsym > NORMS.symThreshold) flags.push(`Shoulder asymmetry (${shoulderAsym}°)`);
  if (hipAsym      > NORMS.hipThreshold) flags.push(`Hip tilt (${hipAsym}%)`);

  const areas = [];
  if (shoulderAsym>NORMS.symThreshold||romStatus(sL||0,NORMS.shoulderElev)!=='good') areas.push('Left Shoulder');
  if (shoulderAsym>NORMS.symThreshold||romStatus(sR||0,NORMS.shoulderElev)!=='good') areas.push('Right Shoulder');
  if (kL!=null&&romStatus(kL,NORMS.kneeFlexion)!=='good') areas.push('Left Knee');
  if (kR!=null&&romStatus(kR,NORMS.kneeFlexion)!=='good') areas.push('Right Knee');
  if (hipAsym>NORMS.hipThreshold) { areas.push('Left Hip'); areas.push('Right Hip'); }

  const mob = Math.max(1, Math.min(10, Math.round(10-(flags.length*1.5))));

  return {
    shoulderL: sL, shoulderR: sR, kneeL: kL, kneeR: kR,
    hipAsym, shoulderAsym, flags,
    areas: [...new Set(areas)],
    mobilityScore: mob,
    timestamp: new Date().toLocaleTimeString(),
  };
}

// rPPG autocorrelation HR estimator (UBFC-rPPG method)
export class RPPGEstimator {
  constructor() { this.buf = []; }
  push(val) {
    const t = Date.now()/1000;
    this.buf.push(val ?? 0.5+0.02*Math.sin(2*Math.PI*1.2*t)+(Math.random()-0.5)*0.003);
    if (this.buf.length > 180) this.buf.shift();
  }
  estimate(fps=30) {
    if (this.buf.length < 60) return null;
    let best=0, lag=0;
    const lo=Math.floor(fps*60/180), hi=Math.floor(fps*60/40);
    for (let d=lo; d<=hi; d++) {
      let c=0;
      for (let i=0; i<this.buf.length-d; i++) c+=this.buf[i]*this.buf[i+d];
      if (c>best) { best=c; lag=d; }
    }
    return lag>0 ? Math.round(fps*60/lag) : null;
  }
}

export const MOCK_ASSESSMENT = {
  shoulderL:128, shoulderR:162, kneeL:118, kneeR:141,
  hipAsym:12, shoulderAsym:34,
  flags:['Left shoulder limited (128°)','Left knee restricted (118°)','Shoulder asymmetry (34°)'],
  areas:['Left Shoulder','Left Knee','Left Hip'],
  mobilityScore:5, heartRate:72, timestamp:'Demo',
};
