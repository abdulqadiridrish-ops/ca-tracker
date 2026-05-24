import { useState, useEffect } from "react";

// EXCLUSIVE GROUP 1 CONFIGURATION
const SUBJECTS = [
  { id: "aa", name: "Advanced Accounts", g: 1, exam: new Date(2026, 8, 1) },
  { id: "cl", name: "Corporate & Other Laws", g: 1, exam: new Date(2026, 8, 3) },
  { id: "dt", name: "Direct Tax", g: 1, exam: new Date(2026, 8, 6) },
  { id: "it", name: "Indirect Tax (GST)", g: 1, exam: new Date(2026, 8, 6) },
];

const REV1_PAIRS = [
  ["aa", "cl"],
  ["dt", "it"],
];

const REV2_FIXED = [
  { ids: ["cl"], label: "Law Comprehensive Review", days: 4, hasAIMT: true },
  { ids: ["dt", "it"], label: "Taxation (DT + GST) Marathon", days: 6, hasAIMT: false },
];

const REV2_START = new Date(2026, 7, 13); // Aug 13
const PRE_EXAM_START = new Date(2026, 7, 27); // Aug 27

const CLASS_DEADLINES = [
  { label: "30th June", date: new Date(2026, 5, 30) },
  { label: "7th July", date: new Date(2026, 6, 7) },
  { label: "15th July", date: new Date(2026, 6, 15) },
];

const SLOT_LABELS = ["Morning Session", "Afternoon Session", "Evening Session"];

const PHASE_STYLE = {
  c: { badge: "#FEF3C7", text: "#92400E", bg: "#FFFDF5", border: "#FDE68A", label: "Syllabus Classes" },
  r1: { badge: "#EDE9FE", text: "#4C1D95", bg: "#FAFAFF", border: "#DDD6FE", label: "1st Revision (Pairs)" },
  r2: { badge: "#D1FAE5", text: "#064E3B", bg: "#F4FDF9", border: "#A7F3D0", label: "2nd Revision (Fixed)" },
};

// Utility Helper Functions
function toD(s) { const d = new Date(s); d.setHours(0, 0, 0, 0); return d; }
function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function sameDay(a, b) { return a.toDateString() === b.toDateString(); }
function fmt(d) { return d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" }); }
function fmtShort(d) { return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }); }
function isExamDay(d) { return SUBJECTS.some(s => sameDay(s.exam, d)); }
function subjName(id) { return SUBJECTS.find(s => s.id === id)?.name || id; }
function r(n) { return Math.round(n * 10) / 10; }

// ── SCHEDULER ENGINE ────────────────────────────────────────────────────────
function buildSchedule(hours, startStr, classDL, spdC, classOrder) {
  const start = toD(startStr);
  const classDead = toD(classDL);
  const activeIds = new Set(SUBJECTS.map(s => s.id));
  const schedule = [];

  function push(date, type, payload) {
    schedule.push({ date: new Date(date), type, ...payload });
  }

  // Phase 1: Regular Classes Setup
  const orderedIds = classOrder.filter(id => activeIds.has(id) && (hours[`${id}_c`] || 0) > 0);
  if (orderedIds.length > 0) {
    const tasks = orderedIds.map(id => ({ id, total: hours[`${id}_c`] || 0, done: 0 }));
    let studyDays = 0, tmp = new Date(start);
    while (tmp < classDead) { if (!isExamDay(tmp)) studyDays++; tmp = addDays(tmp, 1); }
    const totalC = tasks.reduce((s, t) => s + t.total, 0);
    const hpd = studyDays > 0 ? totalC / studyDays : 0;
    const hps = hpd / Math.min(spdC, orderedIds.length);

    let cur = new Date(start);
    let ptr = 0;
    while (cur < classDead) {
      if (isExamDay(cur)) {
        push(cur, "exam", { examSubj: SUBJECTS.find(s => sameDay(s.exam, cur)) });
        cur = addDays(cur, 1); continue;
      }
      const entries = [];
      const usedToday = new Set();
      const slots = Math.min(spdC, orderedIds.length);
      for (let slot = 0; slot < slots; slot++) {
        let found = -1;
        for (let k = 0; k < tasks.length; k++) {
          const idx = (ptr + k) % tasks.length;
          if (tasks[idx].done < tasks[idx].total - 0.01 && !usedToday.has(idx)) { found = idx; break; }
        }
        if (found === -1) break;
        usedToday.add(found);
        const alloc = r(Math.min(hps, tasks[found].total - tasks[found].done));
        tasks[found].done += alloc;
        entries.push({ phase: "c", id: tasks[found].id, hrs: alloc, slot: SLOT_LABELS[slot] });
      }
      if (usedToday.size > 0) { ptr = (Math.max(...usedToday) + 1) % tasks.length; }
      push(cur, "study", { entries });
      cur = addDays(cur, 1);
    }
  }

  // Phase 2: 1st Balanced Revision
  const rev1Start = addDays(classDead, 1);
  const rev1End = new Date(REV2_START);
  const pairTasks = REV1_PAIRS.map(pair => {
    const active = pair.filter(id => activeIds.has(id) && (hours[`${id}_r1`] || 0) > 0);
    if (!active.length) return null;
    return { subjHrs: active.map(id => ({ id, total: hours[`${id}_r1`] || 0, done: 0 })), total: active.reduce((s, id) => s + hours[`${id}_r1`], 0), done: 0 };
  }).filter(Boolean);

  let studyDaysR1 = 0, tmpR1 = new Date(rev1Start);
  while (tmpR1 < rev1End) { if (!isExamDay(tmpR1)) studyDaysR1++; tmpR1 = addDays(tmpR1, 1); }
  const totalR1 = pairTasks.reduce((s, p) => s + p.total, 0);
  const hpdR1 = studyDaysR1 > 0 ? totalR1 / studyDaysR1 : 0;

  let curR1 = new Date(rev1Start);
  let pairPtr = 0;
  while (curR1 < rev1End) {
    if (isExamDay(curR1)) {
      push(curR1, "exam", { examSubj: SUBJECTS.find(s => sameDay(s.exam, curR1)) });
      curR1 = addDays(curR1, 1); continue;
    }
    while (pairPtr < pairTasks.length && pairTasks[pairPtr].done >= pairTasks[pairPtr].total - 0.01) pairPtr++;
    if (pairPtr >= pairTasks.length) { push(curR1, "free", { entries: [] }); curR1 = addDays(curR1, 1); continue; }

    const pair = pairTasks[pairPtr];
    const allocTotal = r(Math.min(hpdR1, pair.total - pair.done));
    pair.done += allocTotal;

    const entries = [];
    const subRem = pair.subjHrs.reduce((s, x) => s + (x.total - x.done), 0);
    pair.subjHrs.forEach((subj, si) => {
      const rem = subj.total - subj.done;
      if (rem <= 0.01) return;
      const alloc = r(allocTotal * (subRem > 0 ? rem / subRem : 1 / pair.subjHrs.length));
      subj.done += alloc;
      entries.push({ phase: "r1", id: subj.id, hrs: alloc, slot: SLOT_LABELS[si] });
    });
    push(curR1, "study", { entries });
    curR1 = addDays(curR1, 1);
  }

  // Phase 3: 2nd Specialized Revision
  let curR2 = new Date(REV2_START);
  for (const block of REV2_FIXED) {
    const activeBlockIds = block.ids.filter(id => activeIds.has(id) && (hours[`${id}_r2`] || 0) > 0);
    if (!activeBlockIds.length) continue;
    const totalHrs = activeBlockIds.reduce((s, id) => s + (hours[`${id}_r2`] || 0), 0);
    const hpd = totalHrs / block.days;

    for (let d = 0; d < block.days; d++) {
      while (isExamDay(curR2)) {
        push(curR2, "exam", { examSubj: SUBJECTS.find(s => sameDay(s.exam, curR2)) });
        curR2 = addDays(curR2, 1);
      }
      if (curR2 >= PRE_EXAM_START) break;
      const entries = [];
      activeBlockIds.forEach((id, si) => {
        const alloc = r(hpd * (1 / activeBlockIds.length));
        entries.push({ phase: "r2", id, hrs: alloc, slot: activeBlockIds.length > 1 ? SLOT_LABELS[si] : "Full-Day Revision Focus" });
      });
      push(curR2, "study", { entries });
      curR2 = addDays(curR2, 1);
    }
    if (curR2 < PRE_EXAM_START) {
      push(curR2, block.hasAIMT ? "aimt" : "test", { gids: activeBlockIds, blockLabel: block.label });
      curR2 = addDays(curR2, 1);
    }
  }

  // Phase 4: Pre-Exam Execution Lock
  const aaHrs = hours[`aa_r2`] || 0;
  const hpdPre = r(aaHrs / 5);
  for (let d = 0; d < 5; d++) {
    const dt = addDays(PRE_EXAM_START, d);
    push(dt, "preexam", { entries: [{ phase: "r2", id: "aa", hrs: hpdPre, slot: "Full Day Pre-Exam Prep" }] });
  }

  // Map Real Exam Markers
  SUBJECTS.forEach(s => {
    if (!schedule.some(d => sameDay(d.date, s.exam))) {
      push(s.exam, "exam", { examSubj: s });
    }
  });

  return schedule.sort((a, b) => a.date - b.date);
}

// ── MAIN APP COMPONENT ──────────────────────────────────────────────────────
export default function App() {
  const today = new Date("2026-05-24"); // Automatically calibrated tracking base

  // Persist State Configurations to Local Storage
  const [startDate, setStartDate] = useState(() => localStorage.getItem("ca_start") || today.toISOString().slice(0, 10));
  const [classDL, setClassDL] = useState(() => localStorage.getItem("ca_dl") || CLASS_DEADLINES[1].date.toISOString().slice(0, 10));
  const [spdC, setSpdC] = useState(() => Number(localStorage.getItem("ca_spd")) || 3);
  const [hours, setHours] = useState(() => {
    const stored = localStorage.getItem("ca_hours");
    return stored ? JSON.parse(stored) : {
      aa_c: 160, aa_r1: 40, aa_r2: 30,
      cl_c: 0,   cl_r1: 30, cl_r2: 20,
      dt_c: 180, dt_r1: 45, dt_r2: 25,
      it_c: 110, it_r1: 35, it_r2: 20,
    };
  });
  
  const [checkedSlots, setCheckedSlots] = useState(() => {
    const stored = localStorage.getItem("ca_checked");
    return stored ? JSON.parse(stored) : {};
  });

  const [step, setStep] = useState(1);
  const [classOrder, setClassOrder] = useState(["aa", "dt", "it", "cl"]);
  const [schedule, setSchedule] = useState(null);

  useEffect(() => {
    localStorage.setItem("ca_start", startDate);
    localStorage.setItem("ca_dl", classDL);
    localStorage.setItem("ca_spd", spdC);
    localStorage.setItem("ca_hours", JSON.stringify(hours));
    localStorage.setItem("ca_checked", JSON.stringify(checkedSlots));
  }, [startDate, classDL, spdC, hours, checkedSlots]);

  function toggleCheck(dayIndex, slotIndex) {
    const key = `${dayIndex}-${slotIndex}`;
    setCheckedSlots(prev => ({ ...prev, [key]: !prev[key] }));
  }

  function setHr(k, v) { setHours(h => ({ ...h, [k]: Math.max(0, Number(v) || 0) })); }

  // System Math Operations
  const totalC = SUBJECTS.reduce((s, sub) => s + (hours[`${sub.id}_c`] || 0), 0);
  const classDays = Math.max(1, Math.round((toD(classDL) - toD(startDate)) / 86400000));
  const autoHpdC = (totalC / classDays).toFixed(1);

  const rev1Days = Math.max(1, Math.round((REV2_START - addDays(toD(classDL), 1)) / 86400000));
  const totalR1 = SUBJECTS.reduce((s, sub) => s + (hours[`${sub.id}_r1`] || 0), 0);
  const autoHpdR1 = (totalR1 / rev1Days).toFixed(1);

  const totalR2 = SUBJECTS.filter(s => s.id !== "aa").reduce((s, sub) => s + (hours[`${sub.id}_r2`] || 0), 0);
  const autoHpdR2 = (totalR2 / 10).toFixed(1);

  // Analytical Tracker Math
  const totalSlotsCount = schedule ? schedule.reduce((acc, current, dIdx) => acc + (current.entries?.length || 0), 0) : 0;
  const totalCheckedCount = Object.values(checkedSlots).filter(Boolean).length;
  const performancePercentage = totalSlotsCount > 0 ? Math.round((totalCheckedCount / totalSlotsCount) * 100) : 0;

  function runGeneration() {
    const generated = buildSchedule(hours, startDate, classDL, spdC, classOrder);
    setSchedule(generated);
    setStep(3);
  }

  return (
    <div style={{ backgroundColor: "#F8FAFC", minHeight: "100vh", fontFamily: "system-ui, sans-serif", padding: "12px" }}>
      <div style={{ maxWidth: "800px", margin: "0 auto", backgroundColor: "#fff", borderRadius: "16px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.05)", border: "1px solid #E2E8F0", overflow: "hidden" }}>
        
        {/* TOP BRAND HEADER */}
        <div style={{ background: "linear-gradient(135deg, #4F46E5 0%, #3B82F6 100%)", padding: "24px", color: "#fff" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
            <div>
              <h1 style={{ margin: 0, fontSize: "22px", fontWeight: "800", letterSpacing: "-0.5px" }}>⚡ AIR Ranker's Blueprint</h1>
              <p style={{ margin: "4px 0 0", fontSize: "13px", color: "#E0E7FF", opacity: 0.9 }}>Group 1 Ultimate Inter Prep Suite</p>
            </div>
            <div style={{ background: "rgba(255,255,255,0.15)", backdropFilter: "blur(4px)", padding: "6px 14px", borderRadius: "99px", fontSize: "12px", fontWeight: "700" }}>
              Target: Sept 2026 Cycle
            </div>
          </div>

          {/* Dynamic Tracker Bar */}
          {schedule && (
            <div style={{ marginTop: "20px", background: "rgba(0,0,0,0.15)", padding: "12px", borderRadius: "10px", display: "flex", alignItems: "center", gap: "14px" }}>
              <div style={{ fontSize: "12px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.5px", color: "#F3F4F6" }}>My Execution Score:</div>
              <div style={{ flex: 1, backgroundColor: "rgba(255,255,255,0.2)", height: "8px", borderRadius: "99px", overflow: "hidden" }}>
                <div style={{ width: `${performancePercentage}%`, backgroundColor: "#10B981", height: "100%", transition: "width 0.4s ease" }} />
              </div>
              <div style={{ fontSize: "14px", fontWeight: "800", color: "#34D399" }}>{performancePercentage}%</div>
            </div>
          )}
        </div>

        {/* INTERACTIVE NAVIGATION CONTROL TABS */}
        <div style={{ display: "flex", gap: "4px", background: "#F1F5F9", padding: "6px" }}>
          {["1. Strategy Dashboard", "2. Lecture Sequence", "3. Active Tracker"].map((label, index) => (
            <button key={index} onClick={() => { if (index < 2 || schedule) setStep(index + 1); }}
              style={{ flex: 1, padding: "10px", border: "none", borderRadius: "8px", fontSize: "13px", fontWeight: "700", cursor: "pointer", transition: "all 0.2s",
                backgroundColor: step === index + 1 ? "#fff" : "transparent",
                color: step === index + 1 ? "#4F46E5" : "#64748B",
                boxShadow: step === index + 1 ? "0 1px 3px rgba(0,0,0,0.05)" : "none",
                opacity: (index === 2 && !schedule) ? 0.4 : 1 }}>
              {label}
            </button>
          ))}
        </div>

        <div style={{ padding: "20px" }}>
          
          {/* STEP 1 CONTROLS */}
          {step === 1 && (
            <div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px", marginBottom: "16px" }}>
                <div style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", padding: "12px", borderRadius: "10px" }}>
                  <label style={{ display: "block", fontSize: "11px", fontWeight: "700", color: "#64748B", textTransform: "uppercase", marginBottom: "6px" }}>Start Tracker From</label>
                  <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={{ width: "100%", border: "1px solid #CBD5E1", padding: "6px 10px", borderRadius: "6px", fontSize: "13px" }} />
                </div>

                <div style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", padding: "12px", borderRadius: "10px" }}>
                  <label style={{ display: "block", fontSize: "11px", fontWeight: "700", color: "#64748B", textTransform: "uppercase", marginBottom: "6px" }}>Finish Pending Classes By</label>
                  <div style={{ display: "flex", gap: "4px" }}>
                    {CLASS_DEADLINES.map(dl => {
                      const isActive = classDL === dl.date.toISOString().slice(0, 10);
                      return (
                        <button key={dl.label} onClick={() => setClassDL(dl.date.toISOString().slice(0, 10))}
                          style={{ flex: 1, padding: "6px", border: "none", borderRadius: "6px", fontSize: "11px", fontWeight: "700", cursor: "pointer",
                            backgroundColor: isActive ? "#4F46E5" : "#E2E8F0", color: isActive ? "#fff" : "#334155" }}>{dl.label}</button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* REAL-TIME CALCULATION CARDS */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "10px", marginBottom: "20px" }}>
                <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", padding: "12px", borderRadius: "10px" }}>
                  <div style={{ fontSize: "11px", fontWeight: "700", color: "#B45309" }}>CLASSES VELOCITY CAPACITY</div>
                  <div style={{ fontSize: "18px", fontWeight: "800", color: "#78350F", margin: "2px 0" }}>{autoHpdC} Hours / Day</div>
                  <div style={{ fontSize: "11px", color: "#B45309" }}>Target: {totalC} Hrs total across {classDays} operational days</div>
                </div>
                <div style={{ background: "#F5F3FF", border: "1px solid #DDD6FE", padding: "12px", borderRadius: "10px" }}>
                  <div style={{ fontSize: "11px", fontWeight: "700", color: "#6D28D9" }}>1ST REVISION COMPRESSION RATIO</div>
                  <div style={{ fontSize: "18px", fontWeight: "800", color: "#4C1D95", margin: "2px 0" }}>{autoHpdR1} Hours / Day</div>
                  <div style={{ fontSize: "11px", color: "#6D28D9" }}>Allocated: {totalR1} Hrs total across {rev1Days} active days</div>
                </div>
              </div>

              {/* SUBJECT HOUR ENTRY CONFIGURATOR */}
              <div style={{ fontSize: "13px", fontWeight: "700", color: "#334155", marginBottom: "10px", textTransform: "uppercase" }}>Adjust Remaining Targets</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: "12px" }}>
                {SUBJECTS.map(s => (
                  <div key={s.id} style={{ background: "#fff", border: "1px solid #E2E8F0", borderTop: "4px solid #4F46E5", borderRadius: "10px", padding: "14px" }}>
                    <div style={{ fontWeight: "800", fontSize: "14px", color: "#1E293B" }}>{s.name}</div>
                    <div style={{ fontSize: "11px", color: "#94A3B8", marginBottom: "12px" }}>Exam Date Anchor: {fmt(s.exam)}</div>
                    
                    {["c", "r1", "r2"].map((phaseKey, pIdx) => (
                      <div key={phaseKey} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                        <span style={{ fontSize: "12px", color: "#475569" }}>{["Class Lecture Hours Remaining", "1st Revision Target Allocation", "2nd Revision Crash Allocation"][pIdx]}</span>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <input type="number" value={hours[`${s.id}_${phaseKey}`] || 0} onChange={e => setHr(`${s.id}_${phaseKey}`, e.target.value)}
                            style={{ width: "55px", textAlign: "center", padding: "4px", border: "1px solid #CBD5E1", borderRadius: "6px", fontSize: "12px", fontWeight: "700" }} />
                          <span style={{ fontSize: "11px", color: "#94A3B8" }}>hrs</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>

              <button onClick={() => setStep(2)} style={{ width: "100%", marginTop: "20px", background: "#4F46E5", color: "#fff", border: "none", padding: "12px", borderRadius: "8px", fontSize: "14px", fontWeight: "700", cursor: "pointer" }}>
                Next: Customize Lecture Discharge Sequence →
              </button>
            </div>
          )}

          {/* STEP 2 CONTROLS */}
          {step === 2 && (
            <div>
              <div style={{ fontSize: "14px", fontWeight: "700", marginBottom: "4px" }}>Set Class Subject Discharge Sequence</div>
              <p style={{ fontSize: "12px", color: "#64748B", marginBottom: "16px" }}>Drag-free quick configuration interface. Arrange your daily 3-subject cycling priority order below.</p>
              
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "20px" }}>
                {classOrder.map((id, index) => {
                  const s = SUBJECTS.find(sub => sub.id === id);
                  return (
                    <div key={id} style={{ display: "flex", alignItems: "center", justifyBetween: "center", background: "#F8FAFC", border: "1px solid #E2E8F0", padding: "12px", borderRadius: "8px" }}>
                      <span style={{ width: "24px", height: "24px", borderRadius: "50%", background: "#E0E7FF", color: "#4F46E5", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: "700", marginRight: "12px" }}>{index + 1}</span>
                      <span style={{ fontWeight: "700", fontSize: "13px", color: "#1E293B", flex: 1 }}>{s.name}</span>
                      <div style={{ display: "flex", gap: "4px" }}>
                        <button disabled={index === 0} onClick={() => { const nextOrder = [...classOrder]; [nextOrder[index - 1], nextOrder[index]] = [nextOrder[index], nextOrder[index - 1]]; setClassOrder(nextOrder); }} style={{ padding: "4px 10px", border: "1px solid #CBD5E1", background: "#fff", borderRadius: "6px", cursor: "pointer" }}>↑</button>
                        <button disabled={index === classOrder.length - 1} onClick={() => { const nextOrder = [...classOrder]; [nextOrder[index + 1], nextOrder[index]] = [nextOrder[index], nextOrder[index + 1]]; setClassOrder(nextOrder); }} style={{ padding: "4px 10px", border: "1px solid #CBD5E1", background: "#fff", borderRadius: "6px", cursor: "pointer" }}>↓</button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div style={{ display: "flex", gap: "8px" }}>
                <button onClick={() => setStep(1)} style={{ padding: "10px 20px", background: "#E2E8F0", border: "none", borderRadius: "8px", fontWeight: "700", cursor: "pointer" }}>← Back</button>
                <button onClick={runGeneration} style={{ flex: 1, padding: "10px", background: "#10B981", color: "#fff", border: "none", borderRadius: "8px", fontWeight: "700", cursor: "pointer" }}>Compile Live Tracking Engine →</button>
              </div>
            </div>
          )}

          {/* STEP 3 ACTIVE TRACKER LIST */}
          {step === 3 && schedule && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
                <div style={{ fontSize: "14px", fontWeight: "700", color: "#1E293B" }}>Active Daily Target Checksheets</div>
                <button onClick={() => setStep(1)} style={{ padding: "6px 12px", background: "#F1F5F9", border: "1px solid #CBD5E1", borderRadius: "6px", fontSize: "12px", fontWeight: "700", cursor: "pointer" }}>⚙️ Tweak Targets</button>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {schedule.map((day, dIdx) => {
                  const isExam = day.type === "exam";
                  const isTest = day.type === "test" || day.type === "aimt";
                  
                  if (isExam) {
                    return (
                      <div key={dIdx} style={{ background: "linear-gradient(90deg, #FEE2E2 0%, #FFFEFE 100%)", borderLeft: "6px solid #EF4444", borderRadius: "8px", padding: "12px" }}>
                        <div style={{ fontSize: "12px", fontWeight: "800", color: "#991B1B" }}>🚨 {fmt(day.date).toUpperCase()} — CRITICAL EXAM VENUE</div>
                        <div style={{ fontSize: "14px", fontWeight: "800", color: "#7F1D1D", marginTop: "2px" }}>ICAI Intermediate Paper: {day.examSubj?.name}</div>
                      </div>
                    );
                  }

                  if (isTest) {
                    return (
                      <div key={dIdx} style={{ background: "linear-gradient(90deg, #ECFDF5 0%, #FFFFFF 100%)", borderLeft: "6px solid #10B981", borderRadius: "8px", padding: "12px" }}>
                        <div style={{ fontSize: "11px", fontWeight: "800", color: "#065F46", textTransform: "uppercase" }}>🏁 Evaluative Assessment Milestone</div>
                        <div style={{ fontSize: "13px", fontWeight: "700", color: "#047857" }}>{day.type === "aimt" ? "🏆 ALL INDIA MOCK TEST (AIMT) ARENA" : "📝 SUBJECT MOCK ASSESSMENT"}: {day.blockLabel}</div>
                      </div>
                    );
                  }

                  return (
                    <div key={dIdx} style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: "10px", padding: "14px", boxShadow: "0 1px 2px rgba(0,0,0,0.02)" }}>
                      <div style={{ fontSize: "13px", fontWeight: "800", color: "#334155", borderBottom: "1px solid #F1F5F9", paddingBottom: "6px", marginBottom: "10px" }}>
                        📅 {fmt(day.date)}
                      </div>
                      
                      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                        {day.entries?.map((entry, sIdx) => {
                          const isDone = !!checkedSlots[`${dIdx}-${sIdx}`];
                          const styleProfile = PHASE_STYLE[entry.phase];
                          
                          return (
                            <div key={sIdx} onClick={() => toggleCheck(dIdx, sIdx)}
                              style={{ display: "flex", alignItems: "center", gap: "12px", padding: "10px", borderRadius: "8px", border: `1px solid ${isDone ? "#D1FAE5" : styleProfile.border}`, backgroundColor: isDone ? "#F0FDF4" : styleProfile.bg, cursor: "pointer", transition: "all 0.15s ease" }}>
                              
                              {/* Custom Styled Interactive Checkbox */}
                              <div style={{ width: "20px", height: "20px", borderRadius: "6px", border: `2px solid ${isDone ? "#10B981" : "#CBD5E1"}`, backgroundColor: isDone ? "#10B981" : "#fff", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.1s" }}>
                                {isDone && <span style={{ color: "#fff", fontSize: "11px", fontWeight: "900" }}>✓</span>}
                              </div>

                              <div style={{ flex: 1 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                  <span style={{ fontSize: "10px", fontWeight: "700", background: isDone ? "#A7F3D0" : styleProfile.badge, color: isDone ? "#047857" : styleProfile.text, padding: "2px 6px", borderRadius: "4px", textTransform: "uppercase" }}>{styleProfile.label}</span>
                                  <span style={{ fontSize: "11px", color: "#64748B" }}>• {entry.slot}</span>
                                </div>
                                <div style={{ fontSize: "13px", fontWeight: "700", marginTop: "2px", color: isDone ? "#94A3B8" : "#1E293B", textDecoration: isDone ? "line-through" : "none" }}>
                                  {subjName(entry.id)}
                                </div>
                              </div>

                              <div style={{ fontSize: "13px", fontWeight: "800", color: isDone ? "#A7F3D0" : styleProfile.text }}>
                                {entry.hrs} hrs
                              </div>

                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
