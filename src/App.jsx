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
function subjName(id) { return SUBJECTS.find(s => s.id === id)?.name || id; }
function r(n) { return Math.round(n * 10) / 10; }

// ── SCHEDULER ENGINE ────────────────────────────────────────────────────────
function buildSchedule(hours, startStr, classDL, spdC, classOrder) {
  if (!hours || !startStr || !classDL || !classOrder) return [];
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
  const today = new Date("2026-05-24");

  // SEAMLESS STATE LOADERS WITH LOCALSTORAGE FAILSAFES
  const [step, setStep] = useState(() => Number(localStorage.getItem("ca_step_lock")) || 1);
  const [startDate, setStartDate] = useState(() => localStorage.getItem("ca_start") || today.toISOString().slice(0, 10));
  const [classDL, setClassDL] = useState(() => localStorage.getItem("ca_dl") || CLASS_DEADLINES[1].date.toISOString().slice(0, 10));
  const [spdC, setSpdC] = useState(() => Number(localStorage.getItem("ca_spd")) || 3);
  const [classOrder, setClassOrder] = useState(() => {
    const stored = localStorage.getItem("ca_order");
    return stored ? JSON.parse(stored) : ["aa", "dt", "it", "cl"];
  });
  
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

  const [dailyNotes, setDailyNotes] = useState(() => {
    const stored = localStorage.getItem("ca_notes");
    return stored ? JSON.parse(stored) : {};
  });

  // DYNAMIC REVERSE COUNTDOWN SETTINGS
  const [timerTargetDate, setTimerTargetDate] = useState(() => localStorage.getItem("ca_timer_date") || "2026-07-25");
  const [timerTargetTime, setTimerTargetTime] = useState(() => localStorage.getItem("ca_timer_time") || "00:00");
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, mins: 0, secs: 0, isOver: false });

  // INITIALIZE AS EMPTY UNTIL PERSISTED RECONCILIATION LOOPS COMPLETE SAFELY
  const [schedule, setSchedule] = useState([]);

  // TIMELINE TIMESTAMPS SYNC EXECUTOR
  useEffect(() => {
    if (hours && startDate && classDL && classOrder) {
      const generated = buildSchedule(hours, startDate, classDL, spdC, classOrder);
      setSchedule(generated);
    }
  }, [hours, startDate, classDL, spdC, classOrder]);

  // SAFELY MOUNT THE LIVE COUNTDOWN ENGINE
  useEffect(() => {
    function computeTimer() {
      if (!timerTargetDate || !timerTargetTime) return;
      
      const targetString = `${timerTargetDate}T${timerTargetTime}:00`;
      const targetAnchor = new Date(targetString);
      const now = new Date();
      const diff = targetAnchor - now;

      if (isNaN(targetAnchor.getTime()) || diff <= 0) {
        setTimeLeft({ days: 0, hours: 0, mins: 0, secs: 0, isOver: true });
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
      const mins = Math.floor((diff / (1000 * 60)) % 60);
      const secs = Math.floor((diff / 1000) % 60);
      setTimeLeft({ days, hours, mins, secs, isOver: false });
    }

    computeTimer();
    const interval = setInterval(computeTimer, 1000);
    return () => clearInterval(interval);
  }, [timerTargetDate, timerTargetTime]);

  // GLOBAL STATE DATA STORAGE PIPELINE
  useEffect(() => {
    localStorage.setItem("ca_step_lock", step);
    localStorage.setItem("ca_start", startDate);
    localStorage.setItem("ca_dl", classDL);
    localStorage.setItem("ca_spd", spdC);
    localStorage.setItem("ca_hours", JSON.stringify(hours));
    localStorage.setItem("ca_checked", JSON.stringify(checkedSlots));
    localStorage.setItem("ca_notes", JSON.stringify(dailyNotes));
    localStorage.setItem("ca_order", JSON.stringify(classOrder));
    localStorage.setItem("ca_timer_date", timerTargetDate);
    localStorage.setItem("ca_timer_time", timerTargetTime);
  }, [step, startDate, classDL, spdC, hours, checkedSlots, dailyNotes, classOrder, timerTargetDate, timerTargetTime]);

  function toggleCheck(dayIndex, slotIndex) {
    const key = `${dayIndex}-${slotIndex}`;
    setCheckedSlots(prev => ({ ...prev, [key]: !prev[key] }));
  }

  function handleNoteChange(dayIndex, val) {
    setDailyNotes(prev => ({ ...prev, [dayIndex]: val }));
  }

  function setHr(k, v) { 
    setHours(h => ({ ...h, [k]: Math.max(0, Number(v) || 0) })); 
  }

  // Metrics Arithmetic
  const totalC = SUBJECTS.reduce((s, sub) => s + (hours[`${sub.id}_c`] || 0), 0);
  const classDays = Math.max(1, Math.round((toD(classDL) - toD(startDate)) / 86400000));
  const autoHpdC = (totalC / classDays).toFixed(1);

  const rev1Days = Math.max(1, Math.round((REV2_START - addDays(toD(classDL), 1)) / 86400000));
  const totalR1 = SUBJECTS.reduce((s, sub) => s + (hours[`${sub.id}_r1`] || 0), 0);
  const autoHpdR1 = (totalR1 / rev1Days).toFixed(1);

  const totalSlotsCount = schedule ? schedule.reduce((acc, current) => acc + (current.entries?.length || 0), 0) : 0;
  const totalCheckedCount = Object.values(checkedSlots).filter(Boolean).length;
  const performancePercentage = totalSlotsCount > 0 ? Math.round((totalCheckedCount / totalSlotsCount) * 100) : 0;

  return (
    <div style={{ backgroundColor: "#F1F5F9", minHeight: "100vh", fontFamily: "system-ui, sans-serif", padding: "14px" }}>
      <div style={{ maxWidth: "840px", margin: "0 auto", backgroundColor: "#fff", borderRadius: "20px", boxShadow: "0 20px 40px -15px rgba(15,23,42,0.08)", border: "1px solid #E2E8F0", overflow: "hidden" }}>
        
        {/* REVERSE COUNTDOWN TIMER BLOCK (HIGH VISIBILITY GRID SYSTEM) */}
        <div style={{ backgroundColor: "#0F172A", padding: "24px 20px", color: "#F8FAFC", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", borderBottom: "2px solid #334155", gap: "10px", textAlign: "center" }}>
          <div style={{ fontSize: "12px", fontWeight: "800", letterSpacing: "1px", color: "#38BDF8", textTransform: "uppercase" }}>
            🚀 COUNTDOWN TIMELINE TARGET INDICATOR
          </div>
          
          <div style={{ display: "flex", justifyContent: "center", gap: "16px", flexWrap: "wrap", margin: "4px 0" }}>
            {timeLeft.isOver ? (
              <div style={{ fontSize: "28px", color: "#F43F5E", fontWeight: "900", letterSpacing: "-0.5px" }}>🏁 TARGET DESTINATION REACHED</div>
            ) : (
              <div style={{ display: "flex", gap: "14px", alignItems: "center", fontSize: "16px", color: "#94A3B8", fontWeight: "700" }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <span style={{ fontSize: "32px", fontWeight: "900", color: "#38BDF8", lineHeight: "1" }}>{timeLeft.days}</span>
                  <span style={{ fontSize: "10px", textTransform: "uppercase", color: "#64748B", marginTop: "4px" }}>Days</span>
                </div>
                <span style={{ fontSize: "24px", color: "#475569", alignSelf: "flex-start", marginTop: "-2px" }}>:</span>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <span style={{ fontSize: "32px", fontWeight: "900", color: "#38BDF8", lineHeight: "1" }}>{timeLeft.hours}</span>
                  <span style={{ fontSize: "10px", textTransform: "uppercase", color: "#64748B", marginTop: "4px" }}>Hrs</span>
                </div>
                <span style={{ fontSize: "24px", color: "#475569", alignSelf: "flex-start", marginTop: "-2px" }}>:</span>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <span style={{ fontSize: "32px", fontWeight: "900", color: "#38BDF8", lineHeight: "1" }}>{timeLeft.mins}</span>
                  <span style={{ fontSize: "10px", textTransform: "uppercase", color: "#64748B", marginTop: "4px" }}>Mins</span>
                </div>
                <span style={{ fontSize: "24px", color: "#475569", alignSelf: "flex-start", marginTop: "-2px" }}>:</span>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: "40px" }}>
                  <span style={{ fontSize: "32px", fontWeight: "900", color: "#EF4444", lineHeight: "1" }}>{timeLeft.secs}</span>
                  <span style={{ fontSize: "10px", textTransform: "uppercase", color: "#64748B", marginTop: "4px" }}>Secs</span>
                </div>
              </div>
            )}
          </div>
          
          <div style={{ fontSize: "11px", color: "#64748B", fontWeight: "600" }}>
            Target Anchor Locked: {timerTargetDate} at {timerTargetTime}
          </div>
        </div>

        {/* TOP BRAND HEADER */}
        <div style={{ background: "linear-gradient(135deg, #4F46E5 0%, #2563EB 100%)", padding: "26px", color: "#fff" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
            <div>
              <h1 style={{ margin: 0, fontSize: "24px", fontWeight: "800", letterSpacing: "-0.5px" }}>⚡ AIR Ranker's Blueprint</h1>
              <p style={{ margin: "4px 0 0", fontSize: "13px", color: "#E0E7FF", opacity: 0.9 }}>Group 1 Ultimate Inter Prep Suite</p>
            </div>
            <div style={{ background: "rgba(255,255,255,0.16)", backdropFilter: "blur(6px)", padding: "6px 14px", borderRadius: "99px", fontSize: "12px", fontWeight: "700" }}>
              Cycle: Sept 2026 Exams
            </div>
          </div>

          {/* Dynamic Tracker Bar */}
          <div style={{ marginTop: "20px", background: "rgba(15,23,42,0.3)", padding: "14px", borderRadius: "12px", display: "flex", alignItems: "center", gap: "14px", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div style={{ fontSize: "11px", fontWeight: "800", textTransform: "uppercase", letterSpacing: "0.5px", color: "#E2E8F0" }}>Execution Matrix Score:</div>
            <div style={{ flex: 1, backgroundColor: "rgba(255,255,255,0.2)", height: "8px", borderRadius: "99px", overflow: "hidden" }}>
              <div style={{ width: `${performancePercentage}%`, backgroundColor: "#10B981", height: "100%", transition: "width 0.4s ease" }} />
            </div>
            <div style={{ fontSize: "14px", fontWeight: "900", color: "#34D399" }}>{performancePercentage}%</div>
          </div>
        </div>

        {/* PERSISTENT NAVIGATION ROUTING TABS */}
        <div style={{ display: "flex", gap: "4px", background: "#F8FAFC", padding: "6px", borderBottom: "1px solid #E2E8F0" }}>
          {["1. Strategy Dashboard", "2. Lecture Sequence", "3. Active Tracker"].map((label, index) => {
            const currentTabIdx = index + 1;
            const isLockedOnTracker = step === 3;
            const shouldDisable = isLockedOnTracker && currentTabIdx !== 3;

            return (
              <button 
                key={index} 
                disabled={shouldDisable}
                onClick={() => setStep(currentTabIdx)}
                style={{ 
                  flex: 1, padding: "12px", border: "none", borderRadius: "10px", fontSize: "13px", fontWeight: "700", transition: "all 0.2s",
                  backgroundColor: step === currentTabIdx ? "#fff" : "transparent",
                  color: step === currentTabIdx ? "#4F46E5" : shouldDisable ? "#CBD5E1" : "#64748B",
                  boxShadow: step === currentTabIdx ? "0 4px 6px -1px rgba(0,0,0,0.05)" : "none",
                  cursor: shouldDisable ? "not-allowed" : "pointer",
                  opacity: shouldDisable ? 0.5 : 1
                }}
              >
                {label}
              </button>
            );
          })}
        </div>

        <div style={{ padding: "24px" }}>
          
          {/* STEP 1 CONTROLS */}
          {step === 1 && (
            <div>
              {/* INTERACTIVE TIMELINE SELECTOR */}
              <div style={{ background: "#F1F5F9", border: "1px solid #CBD5E1", padding: "14px", borderRadius: "12px", marginBottom: "18px" }}>
                <div style={{ fontSize: "12px", fontWeight: "800", color: "#1E293B", textTransform: "uppercase", marginBottom: "10px", letterSpacing: "0.3px" }}>⚙️ Configure Countdown Timer Target</div>
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  <div style={{ flex: 2, minWidth: "160px" }}>
                    <span style={{ fontSize: "11px", color: "#64748B", fontWeight: "700" }}>Target Date</span>
                    <input type="date" value={timerTargetDate} onChange={e => setTimerTargetDate(e.target.value)} style={{ width: "100%", border: "1px solid #CBD5E1", padding: "8px", borderRadius: "8px", fontSize: "13px", fontWeight: "600", marginTop: "4px" }} />
                  </div>
                  <div style={{ flex: 1, minWidth: "100px" }}>
                    <span style={{ fontSize: "11px", color: "#64748B", fontWeight: "700" }}>Exact Target Time</span>
                    <input type="time" value={timerTargetTime} onChange={e => setTimerTargetTime(e.target.value)} style={{ width: "100%", border: "1px solid #CBD5E1", padding: "8px", borderRadius: "8px", fontSize: "13px", fontWeight: "600", marginTop: "4px" }} />
                  </div>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "14px", marginBottom: "18px" }}>
                <div style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", padding: "14px", borderRadius: "12px" }}>
                  <label style={{ display: "block", fontSize: "11px", fontWeight: "800", color: "#64748B", textTransform: "uppercase", marginBottom: "6px", letterSpacing: "0.3px" }}>Start Tracker From</label>
                  <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={{ width: "100%", border: "1px solid #CBD5E1", padding: "8px 12px", borderRadius: "8px", fontSize: "13px", fontWeight: "600", color: "#1E293B" }} />
                </div>

                <div style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", padding: "14px", borderRadius: "12px" }}>
                  <label style={{ display: "block", fontSize: "11px", fontWeight: "800", color: "#64748B", textTransform: "uppercase", marginBottom: "6px", letterSpacing: "0.3px" }}>Finish Pending Classes By</label>
                  <div style={{ display: "flex", gap: "6px" }}>
                    {CLASS_DEADLINES.map(dl => {
                      const isActive = classDL === dl.date.toISOString().slice(0, 10);
                      return (
                        <button key={dl.label} onClick={() => setClassDL(dl.date.toISOString().slice(0, 10))}
                          style={{ flex: 1, padding: "8px 4px", border: "none", borderRadius: "8px", fontSize: "11px", fontWeight: "700", cursor: "pointer", transition: "all 0.15s",
                            backgroundColor: isActive ? "#4F46E5" : "#E2E8F0", color: isActive ? "#fff" : "#334155" }}>{dl.label}</button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* VELOCITY METRIC CARD TRACKERS */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "12px", marginBottom: "24px" }}>
                <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", padding: "14px", borderRadius: "12px" }}>
                  <div style={{ fontSize: "11px", fontWeight: "800", color: "#B45309", letterSpacing: "0.3px" }}>CLASSES VELOCITY CAPACITY</div>
                  <div style={{ fontSize: "20px", fontWeight: "800", color: "#78350F", margin: "4px 0" }}>{autoHpdC} Hours / Day</div>
                  <div style={{ fontSize: "11px", color: "#D97706", fontWeight: "500" }}>Required: {totalC} Hrs total across {classDays} target days</div>
                </div>
                <div style={{ background: "#F5F3FF", border: "1px solid #DDD6FE", padding: "14px", borderRadius: "12px" }}>
                  <div style={{ fontSize: "11px", fontWeight: "800", color: "#6D28D9", letterSpacing: "0.3px" }}>1ST REVISION COMPRESSION RATIO</div>
                  <div style={{ fontSize: "20px", fontWeight: "800", color: "#4C1D95", margin: "4px 0" }}>{autoHpdR1} Hours / Day</div>
                  <div style={{ fontSize: "11px", color: "#7C3AED", fontWeight: "500" }}>Allocated: {totalR1} Hrs total across {rev1Days} active days</div>
                </div>
              </div>

              {/* ENTRY FIELD INPUT ROW CONFIGURATIONS */}
              <div style={{ fontSize: "13px", fontWeight: "800", color: "#1E293B", marginBottom: "12px", textTransform: "uppercase", letterSpacing: "0.5px" }}>Adjust Remaining Parameters</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(350px, 1fr))", gap: "14px" }}>
                {SUBJECTS.map(s => (
                  <div key={s.id} style={{ background: "#fff", border: "1px solid #E2E8F0", borderTop: "4px solid #4F46E5", borderRadius: "12px", padding: "16px", boxShadow: "0 1px 3px rgba(0,0,0,0.02)" }}>
                    <div style={{ fontWeight: "800", fontSize: "15px", color: "#0F172A" }}>{s.name}</div>
                    <div style={{ fontSize: "11px", color: "#64748B", marginBottom: "14px", fontWeight: "500" }}>Exam Date Anchor: {fmt(s.exam)}</div>
                    
                    {["c", "r1", "r2"].map((phaseKey, pIdx) => (
                      <div key={phaseKey} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                        <span style={{ fontSize: "12px", color: "#475569", fontWeight: "500" }}>{["Class Lecture Hours Remaining", "1st Revision Target Allocation", "2nd Revision Crash Allocation"][pIdx]}</span>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <input type="number" value={hours[`${s.id}_${phaseKey}`] || 0} onChange={e => setHr(`${s.id}_${phaseKey}`, e.target.value)}
                            style={{ width: "60px", textAlign: "center", padding: "6px", border: "1px solid #CBD5E1", borderRadius: "8px", fontSize: "12px", fontWeight: "700", color: "#0F172A" }} />
                          <span style={{ fontSize: "11px", color: "#94A3B8", fontWeight: "600" }}>hrs</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>

              <button onClick={() => setStep(2)} style={{ width: "100%", marginTop: "24px", background: "#4F46E5", color: "#fff", border: "none", padding: "14px", borderRadius: "10px", fontSize: "14px", fontWeight: "700", cursor: "pointer", boxShadow: "0 4px 12px rgba(79,70,229,0.25)" }}>
                Next: Customize Lecture Sequence →
              </button>
            </div>
          )}

          {/* STEP 2 CONTROLS */}
          {step === 2 && (
            <div>
              <div style={{ fontSize: "15px", fontWeight: "800", color: "#0F172A", marginBottom: "4px" }}>Set Class Subject Discharge Sequence</div>
              <p style={{ fontSize: "12px", color: "#64748B", marginBottom: "18px" }}>Arrange your daily subject cycling priority layout order below using the dynamic controllers.</p>
              
              <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "24px" }}>
                {classOrder.map((id, index) => {
                  const s = SUBJECTS.find(sub => sub.id === id);
                  return (
                    <div key={id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#F8FAFC", border: "1px solid #E2E8F0", padding: "14px", borderRadius: "10px" }}>
                      <div style={{ display: "flex", alignItems: "center" }}>
                        <span style={{ width: "26px", height: "26px", borderRadius: "50%", background: "#E0E7FF", color: "#4F46E5", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: "800", marginRight: "14px" }}>{index + 1}</span>
                        <span style={{ fontWeight: "700", fontSize: "14px", color: "#0F172A" }}>{s.name}</span>
                      </div>
                      <div style={{ display: "flex", gap: "6px" }}>
                        <button disabled={index === 0} onClick={() => { const nextOrder = [...classOrder]; [nextOrder[index - 1], nextOrder[index]] = [nextOrder[index], nextOrder[index - 1]]; setClassOrder(nextOrder); }} style={{ padding: "6px 12px", border: "1px solid #CBD5E1", background: "#fff", borderRadius: "8px", cursor: index === 0 ? "not-allowed" : "pointer", fontWeight: "600" }}>↑</button>
                        <button disabled={index === classOrder.length - 1} onClick={() => { const nextOrder = [...classOrder]; [nextOrder[index + 1], nextOrder[index]] = [nextOrder[index], nextOrder[index + 1]]; setClassOrder(nextOrder); }} style={{ padding: "6px 12px", border: "1px solid #CBD5E1", background: "#fff", borderRadius: "8px", cursor: index === classOrder.length - 1 ? "not-allowed" : "pointer", fontWeight: "600" }}>↓</button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div style={{ display: "flex", gap: "10px" }}>
                <button onClick={() => setStep(1)} style={{ padding: "12px 24px", background: "#E2E8F0", color: "#334155", border: "none", borderRadius: "10px", fontWeight: "700", cursor: "pointer" }}>← Back</button>
                <button onClick={() => setStep(3)} style={{ flex: 1, padding: "12px", background: "#10B981", color: "#fff", border: "none", borderRadius: "10px", fontWeight: "700", cursor: "pointer", boxShadow: "0 4px 12px rgba(16,185,129,0.25)" }}>Compile Live Tracking Engine →</button>
              </div>
            </div>
          )}

          {/* STEP 3 ACTIVE TRACKER LIST (LOCKED MATRIX STRUCTURE) */}
          {step === 3 && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "18px", background: "#F8FAFC", padding: "12px 16px", borderRadius: "12px", border: "1px solid #E2E8F0" }}>
                <div>
                  <div style={{ fontSize: "14px", fontWeight: "800", color: "#0F172A" }}>Active Daily Target Checksheets</div>
                  <div style={{ fontSize: "11px", color: "#64748B", fontWeight: "500" }}>Dashboard layout configurations are safely locked below.</div>
                </div>
                <button 
                  onClick={() => {
                    if(confirm("Open modification dashboard? This lets you recalibrate timelines, targets, or custom countdown dates.")) {
                      setStep(1);
                    }
                  }} 
                  style={{ padding: "8px 14px", background: "#fff", border: "1px solid #CBD5E1", borderRadius: "8px", fontSize: "12px", fontWeight: "700", color: "#4F46E5", cursor: "pointer", boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }}
                >
                  ⚙️ Modify Plan Layout
                </button>
              </div>

              {schedule.length === 0 ? (
                <div style={{ textAlign: "center", padding: "40px", color: "#64748B", fontWeight: "600", fontSize: "14px" }}>
                  ⏳ Loading ranker engine timeline nodes...
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  {schedule.map((day, dIdx) => {
                    const isExam = day.type === "exam";
                    const isTest = day.type === "test" || day.type === "aimt";
                    
                    if (isExam) {
                      return (
                        <div key={dIdx} style={{ background: "linear-gradient(90deg, #FEE2E2 0%, #FFFEFE 100%)", borderLeft: "6px solid #EF4444", borderRadius: "12px", padding: "14px", border: "1px solid #FEE2E2" }}>
                          <div style={{ fontSize: "12px", fontWeight: "800", color: "#991B1B" }}>🚨 {fmt(day.date).toUpperCase()} — Paper Venue</div>
                          <div style={{ fontSize: "15px", fontWeight: "800", color: "#7F1D1D", marginTop: "2px" }}>ICAI Paper: {day.examSubj?.name}</div>
                        </div>
                      );
                    }

                    if (isTest) {
                      return (
                        <div key={dIdx} style={{ background: "linear-gradient(90deg, #ECFDF5 0%, #FFFFFF 100%)", borderLeft: "6px solid #10B981", borderRadius: "12px", padding: "14px", border: "1px solid #ECFDF5" }}>
                          <div style={{ fontSize: "11px", fontWeight: "800", color: "#065F46", textTransform: "uppercase" }}>🏁 Assessment Milestone</div>
                          <div style={{ fontSize: "14px", fontWeight: "700", color: "#047857" }}>{day.type === "aimt" ? "🏆 ALL INDIA MOCK TEST (AIMT) ARENA" : "📝 SUBJECT MOCK ASSESSMENT"}: {day.blockLabel}</div>
                        </div>
                      );
                    }

                    return (
                      <div key={dIdx} style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: "14px", padding: "16px", boxShadow: "0 4px 6px -1px rgba(15,23,42,0.02)" }}>
                        <div style={{ fontSize: "14px", fontWeight: "800", color: "#334155", borderBottom: "1px solid #F1F5F9", paddingBottom: "8px", marginBottom: "12px" }}>
                          📅 {fmt(day.date)}
                        </div>
                        
                        <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "12px" }}>
                          {day.entries?.map((entry, sIdx) => {
                            const isDone = !!checkedSlots[`${dIdx}-${sIdx}`];
                            const styleProfile = PHASE_STYLE[entry.phase] || { badge: "#E2E8F0", text: "#334155", bg: "#F8FAFC", border: "#E2E8F0", label: "Revision" };
                            
                            return (
                              <div key={sIdx} onClick={() => toggleCheck(dIdx, sIdx)}
                                style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px", borderRadius: "10px", border: `1px solid ${isDone ? "#A7F3D0" : styleProfile.border}`, backgroundColor: isDone ? "#F0FDF4" : styleProfile.bg, cursor: "pointer", transition: "all 0.15s ease" }}>
                                
                                <div style={{ width: "22px", height: "22px", borderRadius: "7px", border: `2px solid ${isDone ? "#10B981" : "#CBD5E1"}`, backgroundColor: isDone ? "#10B981" : "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                  {isDone && <span style={{ color: "#fff", fontSize: "12px", fontWeight: "900" }}>✓</span>}
                                </div>

                                <div style={{ flex: 1 }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                                    <span style={{ fontSize: "10px", fontWeight: "800", background: isDone ? "#A7F3D0" : styleProfile.badge, color: isDone ? "#047857" : styleProfile.text, padding: "2px 6px", borderRadius: "4px", textTransform: "uppercase", letterSpacing: "0.3px" }}>{styleProfile.label}</span>
                                    <span style={{ fontSize: "11px", color: "#64748B", fontWeight: "500" }}>• {entry.slot}</span>
                                  </div>
                                  <div style={{ fontSize: "14px", fontWeight: "700", marginTop: "3px", color: isDone ? "#94A3B8" : "#0F172A", textDecoration: isDone ? "line-through" : "none" }}>
                                    {subjName(entry.id)}
                                  </div>
                                </div>

                                <div style={{ fontSize: "13px", fontWeight: "800", color: isDone ? "#10B981" : styleProfile.text }}>
                                  {entry.hrs} hrs
                                </div>

                              </div>
                            );
                          })}
                        </div>

                        {/* DAILY LOG NOTES COMPONENT */}
                        <div style={{ borderTop: "1px dashed #E2E8F0", paddingTop: "10px", marginTop: "6px" }}>
                          <div style={{ fontSize: "11px", fontWeight: "700", color: "#64748B", textTransform: "uppercase", marginBottom: "4px" }}>
                            📝 End-of-Day Execution Memo:
                          </div>
                          <textarea
                            value={dailyNotes[dIdx] || ""}
                            onChange={(e) => handleNoteChange(dIdx, e.target.value)}
                            placeholder="Log conceptual gaps, pending doubt adjustments, or standard module retention notes here..."
                            style={{
                              width: "100%",
                              minHeight: "44px",
                              padding: "8px 10px",
                              fontSize: "12px",
                              fontFamily: "inherit",
                              color: "#334155",
                              backgroundColor: "#F8FAFC",
                              border: "1px solid #E2E8F0",
                              borderRadius: "8px",
                              resize: "vertical",
                              outline: "none",
                              boxSizing: "border-box"
                            }}
                          />
                        </div>

                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
