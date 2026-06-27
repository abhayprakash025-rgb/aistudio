// Campus2Board Student Portal
// Supabase URL: https://yhycjpsbuiidboadvchp.supabase.co
// Deploy this as app.campus2board.com

import { useState, useEffect } from "react";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

// ─── Supabase Config ───────────────────────────────────────────────────────────
const SUPABASE_URL = "https://yhycjpsbuiidboadvchp.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InloeWNqcHNidWlpZGJvYWR2Y2hwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyMjMxMTUsImV4cCI6MjA5Nzc5OTExNX0.9l639s3cddDx9nHWeAr533yJ996rM4tqSQU8iUrPUWg";
const CAREER_DISCOVERY_URL = "https://campus2board-v2-career-intelligence-platform-561715786352.asia-southeast1.run.app";
const RESUME_BUILDER_URL = "https://campus2board-resume-review-561715786352.asia-southeast1.run.app";
const INTERVIEW_TRAINING_URL = "https://campus2board-interview-619074305977.asia-southeast1.run.app";
const WORKPLACE_SIMULATION_URL = "https://campus2board-workplace-ai-619074305977.asia-southeast1.run.app";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ─── Brand Tokens ──────────────────────────────────────────────────────────────
const C = {
  purple: "#4B0082",
  purpleLight: "#6A0DAD",
  gold: "#F59E0B",
  goldLight: "#FCD34D",
  lavender: "#7F6BB3",
  lavenderBg: "#F3F0FA",
  charcoal: "#1E1E1E",
  white: "#FFFFFF",
  bgSec: "#F8F9FC",
  border: "#E8E4F0",
  success: "#10B981",
  error: "#EF4444",
  muted: "#6B7280",
};

const styles = {
  page: { minHeight: "100vh", background: C.bgSec, fontFamily: "'Inter', 'Segoe UI', sans-serif", color: C.charcoal },
  navbar: { background: C.purple, padding: "0 24px", height: 64, display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 100, boxShadow: "0 2px 12px rgba(75,0,130,0.3)" },
  logo: { display: "flex", alignItems: "center", gap: 10 },
  logoMark: { width: 36, height: 36, background: C.gold, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 18, color: C.purple },
  logoText: { color: C.white, fontWeight: 700, fontSize: 18, letterSpacing: "-0.3px" },
  logoSub: { color: C.lavender, fontSize: 11, fontWeight: 500, letterSpacing: "0.5px", textTransform: "uppercase" },
  card: { background: C.white, borderRadius: 16, border: `1px solid ${C.border}`, padding: 28, boxShadow: "0 2px 8px rgba(75,0,130,0.06)" },
  btn: { background: C.purple, color: C.white, border: "none", borderRadius: 10, padding: "12px 24px", fontWeight: 600, fontSize: 15, cursor: "pointer", transition: "all 0.2s", display: "inline-flex", alignItems: "center", gap: 8 },
  btnGold: { background: C.gold, color: C.purple, border: "none", borderRadius: 10, padding: "12px 24px", fontWeight: 700, fontSize: 15, cursor: "pointer", transition: "all 0.2s", display: "inline-flex", alignItems: "center", gap: 8 },
  btnOutline: { background: "transparent", color: C.purple, border: `2px solid ${C.purple}`, borderRadius: 10, padding: "10px 22px", fontWeight: 600, fontSize: 14, cursor: "pointer", transition: "all 0.2s" },
  input: { width: "100%", padding: "12px 16px", border: `1.5px solid ${C.border}`, borderRadius: 10, fontSize: 15, color: C.charcoal, background: C.white, outline: "none", boxSizing: "border-box", transition: "border-color 0.2s" },
  label: { fontSize: 13, fontWeight: 600, color: C.charcoal, marginBottom: 6, display: "block", letterSpacing: "0.2px" },
  tag: { display: "inline-flex", alignItems: "center", background: C.lavenderBg, color: C.purple, borderRadius: 20, padding: "4px 12px", fontSize: 12, fontWeight: 600 },
};

// ─── Icons (inline SVG) ────────────────────────────────────────────────────────
const Icon = {
  compass: () => <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>,
  file: () => <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>,
  mic: () => <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>,
  briefcase: () => <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>,
  grid: () => <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>,
  chevron: () => <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>,
  check: () => <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>,
  upload: () => <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>,
  star: () => <svg width="14" height="14" fill={C.gold} stroke={C.gold} strokeWidth="2" viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
  logout: () => <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
  user: () => <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  lock: () => <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>,
  mail: () => <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>,
  eye: () => <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
  eyeOff: () => <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>,
  search: () => <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
};

// ─── Auth Screen ───────────────────────────────────────────────────────────────
function AuthScreen({ onAuth }) {
  const [mode, setMode] = useState("login"); // login | signup
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [college, setCollege] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleSubmit = async () => {
    setError(""); setSuccess("");
    if (!email || !password) return setError("Email and password are required.");
    if (mode === "signup" && !name.trim()) return setError("Please enter your full name.");
    setLoading(true);
    try {
      if (mode === "login") {
        const { data, error: e } = await supabase.auth.signInWithPassword({ email, password });
        if (e) throw e;
        onAuth(data.user);
      } else {
        const { data, error: e } = await supabase.auth.signUp({ email, password, options: { data: { name, college } } });
        if (e) throw e;
        if (data.user) {
          // Insert into students table
          await supabase.from("students").upsert({
            id: data.user.id,
            name,
            email,
            college_name: college,
            created_at: new Date().toISOString(),
          });
          setSuccess("Account created! You can now sign in.");
          setMode("login");
        }
      }
    } catch (e) {
      setError(e.message || "Something went wrong. Please try again.");
    }
    setLoading(false);
  };

  return (
    <div style={{ ...styles.page, display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: `linear-gradient(135deg, ${C.purple} 0%, #2D0052 50%, ${C.charcoal} 100%)` }}>
      {/* Background decoration */}
      <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, overflow: "hidden", pointerEvents: "none" }}>
        <div style={{ position: "absolute", top: -100, right: -100, width: 400, height: 400, borderRadius: "50%", background: `rgba(245,158,11,0.08)`, filter: "blur(60px)" }} />
        <div style={{ position: "absolute", bottom: -100, left: -100, width: 350, height: 350, borderRadius: "50%", background: `rgba(127,107,179,0.12)`, filter: "blur(60px)" }} />
      </div>

      <div style={{ width: "100%", maxWidth: 440, padding: 24, position: "relative", zIndex: 1 }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <div style={{ ...styles.logoMark, width: 48, height: 48, fontSize: 22, borderRadius: 12 }}>C</div>
            <div style={{ textAlign: "left" }}>
              <div style={{ color: C.white, fontWeight: 800, fontSize: 22, letterSpacing: "-0.5px" }}>Campus2Board</div>
              <div style={{ color: C.lavender, fontSize: 12, fontWeight: 500, letterSpacing: "1px", textTransform: "uppercase" }}>Student Portal</div>
            </div>
          </div>
          <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 14, margin: 0 }}>Your MBA career readiness platform</p>
        </div>

        {/* Card */}
        <div style={{ ...styles.card, padding: 36 }}>
          {/* Tabs */}
          <div style={{ display: "flex", background: C.bgSec, borderRadius: 10, padding: 4, marginBottom: 28, gap: 4 }}>
            {["login", "signup"].map(m => (
              <button key={m} onClick={() => { setMode(m); setError(""); setSuccess(""); }}
                style={{ flex: 1, padding: "9px 0", borderRadius: 8, border: "none", fontSize: 14, fontWeight: 600, cursor: "pointer", transition: "all 0.2s", background: mode === m ? C.purple : "transparent", color: mode === m ? C.white : C.muted }}>
                {m === "login" ? "Sign In" : "Create Account"}
              </button>
            ))}
          </div>

          {/* Fields */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {mode === "signup" && (
              <>
                <div>
                  <label style={styles.label}>Full Name</label>
                  <div style={{ position: "relative" }}>
                    <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: C.muted }}><Icon.user /></span>
                    <input style={{ ...styles.input, paddingLeft: 40 }} placeholder="Aryan Sharma" value={name} onChange={e => setName(e.target.value)} />
                  </div>
                </div>
                <div>
                  <label style={styles.label}>College / University</label>
                  <input style={styles.input} placeholder="IIM Ahmedabad, XLRI, etc." value={college} onChange={e => setCollege(e.target.value)} />
                </div>
              </>
            )}
            <div>
              <label style={styles.label}>Email Address</label>
              <div style={{ position: "relative" }}>
                <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: C.muted }}><Icon.mail /></span>
                <input style={{ ...styles.input, paddingLeft: 40 }} type="email" placeholder="you@college.edu" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSubmit()} />
              </div>
            </div>
            <div>
              <label style={styles.label}>Password</label>
              <div style={{ position: "relative" }}>
                <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: C.muted }}><Icon.lock /></span>
                <input style={{ ...styles.input, paddingLeft: 40, paddingRight: 44 }} type={showPass ? "text" : "password"} placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSubmit()} />
                <button onClick={() => setShowPass(!showPass)} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: C.muted, padding: 0 }}>
                  {showPass ? <Icon.eyeOff /> : <Icon.eye />}
                </button>
              </div>
            </div>

            {error && <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, padding: "10px 14px", color: C.error, fontSize: 13, fontWeight: 500 }}>{error}</div>}
            {success && <div style={{ background: "#ECFDF5", border: "1px solid #A7F3D0", borderRadius: 8, padding: "10px 14px", color: C.success, fontSize: 13, fontWeight: 500 }}>{success}</div>}

            <button onClick={handleSubmit} disabled={loading}
              style={{ ...styles.btn, width: "100%", justifyContent: "center", padding: "14px 24px", fontSize: 15, opacity: loading ? 0.7 : 1, marginTop: 4 }}>
              {loading ? "Please wait..." : mode === "login" ? "Sign In to Portal" : "Create My Account"}
            </button>
          </div>
        </div>

        <p style={{ textAlign: "center", color: "rgba(255,255,255,0.4)", fontSize: 12, marginTop: 24 }}>
          Campus2Board · MBA Career Readiness Platform
        </p>
      </div>
    </div>
  );
}

// ─── Module Cards Config ───────────────────────────────────────────────────────
const MODULES = [
  {
    id: "career-discovery",
    number: "01",
    title: "Career Discovery",
    subtitle: "AI-powered career intelligence",
    description: "Complete a personalised AI interview, workplace simulations, and receive your Career Blueprint with role recommendations and a 12-month roadmap.",
    icon: Icon.compass,
    color: C.purple,
    accent: C.lavender,
    cta: "Begin Discovery",
    badge: "Core Module",
    badgeColor: C.purple,
    live: true,
  },
  {
    id: "resume-builder",
    number: "02",
    title: "AI Resume Builder",
    subtitle: "ATS score & optimisation",
    description: "Upload your CV and get an instant ATS compatibility score against your target role. Receive a rewritten summary and specific gap-closing suggestions.",
    icon: Icon.file,
    color: "#1D6A45",
    accent: "#A7F3D0",
    cta: "Upload CV",
    badge: "New Module",
    badgeColor: C.success,
    live: true,
  },
  {
    id: "interview-training",
    number: "03",
    title: "AI Interview Training",
    subtitle: "Role-specific mock interviews",
    description: "Practice unlimited mock interviews for your target role. Get feedback on content, structure, and delivery after every session.",
    icon: Icon.mic,
    color: "#1E40AF",
    accent: "#BFDBFE",
    cta: "Start Practice",
    badge: "New Module",
    badgeColor: C.success,
    live: true,
  },
  {
    id: "workplace-simulation",
    number: "04",
    title: "Workplace Simulation",
    subtitle: "Real business case challenges",
    description: "Solve live business problems across Finance, Marketing, Operations, and Analytics. Assessed against actual corporate performance benchmarks.",
    icon: Icon.grid,
    color: "#92400E",
    accent: "#FDE68A",
    cta: "Run Simulation",
    badge: "In Discovery",
    badgeColor: C.gold,
    live: true,
  },
  {
    id: "opportunities",
    number: "05",
    title: "Explore Opportunities",
    subtitle: "Jobs · Internships · Live Projects",
    description: "Browse verified opportunities from recruiters matched to your Career Blueprint score. Apply with one click using your validated profile.",
    icon: Icon.briefcase,
    color: "#5B21B6",
    accent: "#DDD6FE",
    cta: "Browse Openings",
    badge: "Coming Soon",
    badgeColor: C.muted,
    live: false,
  },
];

// ─── Dashboard ─────────────────────────────────────────────────────────────────
function Dashboard({ user, onLogout }) {
  const [studentData, setStudentData] = useState(null);
  const [blueprint, setBlueprint] = useState(null);
  const [careerDiscoveryDone, setCareerDiscoveryDone] = useState(false);
  const [resumeDone, setResumeDone] = useState(false);
  const [interviewDone, setInterviewDone] = useState(false);
  const [loading, setLoading] = useState(true);

  const displayName = user?.user_metadata?.name || user?.email?.split("@")[0] || "Student";
  const college = user?.user_metadata?.college || "";

  useEffect(() => {
    const fetchData = async () => {
      try {
        const { data: student } = await supabase.from("students").select("*").eq("id", user.id).single();
        setStudentData(student);

        // Check campus2board_sessions: report NOT NULL means Career Discovery is done
        const { data: sessionData } = await supabase.from("campus2board_sessions")
          .select("report")
          .eq("user_id", user.id)
          .maybeSingle();
        if (sessionData && sessionData.report !== null) {
          setCareerDiscoveryDone(true);
        }

        const { data: bp } = await supabase.from("career_blueprints").select("*").eq("student_id", user.id).order("created_at", { ascending: false }).limit(1).single();
        setBlueprint(bp);
      } catch (e) { /* no data yet */ }
      try {
        // Check campus2board_resume: query by user_id OR student_id (both text columns)
        const userId = String(user.id);
        let resumeData = null;
        const { data: r1 } = await supabase.from("campus2board_resume")
          .select("resume_downloaded, downloaded_pdf, downloaded_word")
          .eq("user_id", userId)
          .maybeSingle();
        if (r1) { resumeData = r1; }
        if (!resumeData) {
          const { data: r2 } = await supabase.from("campus2board_resume")
            .select("resume_downloaded, downloaded_pdf, downloaded_word")
            .eq("student_id", userId)
            .maybeSingle();
          if (r2) { resumeData = r2; }
        }
        if (resumeData && (
          resumeData.resume_downloaded !== null ||
          resumeData.downloaded_pdf === true ||
          resumeData.downloaded_word === true
        )) {
          setResumeDone(true);
        }
      } catch (e) { /* no data yet */ }
      try {
        // Check student_reports: any row with overall_feedback NOT NULL means interview done
        const { data: reportData } = await supabase.from("student_reports")
          .select("overall_feedback")
          .eq("student_id", user.id)
          .not("overall_feedback", "is", null)
          .limit(1)
          .maybeSingle();
        if (reportData) {
          setInterviewDone(true);
        }
      } catch (e) { /* no data yet */ }
      setLoading(false);
    };
    fetchData();
  }, [user.id]);

const handleModuleClick = async (mod) => {
    if (mod.id === "career-discovery" || mod.id === "resume-builder" || mod.id === "interview-training" || mod.id === "workplace-simulation") {
      const { data: { session } } = await supabase.auth.getSession();
      const params = new URLSearchParams({
        name: displayName,
        email: user?.email || "",
        college: college,
        student_id: user?.id,
      });
      let baseUrl;
      if (mod.id === "career-discovery") baseUrl = CAREER_DISCOVERY_URL;
      else if (mod.id === "resume-builder") baseUrl = RESUME_BUILDER_URL;
      else if (mod.id === "interview-training") baseUrl = INTERVIEW_TRAINING_URL;
      else if (mod.id === "workplace-simulation") baseUrl = WORKPLACE_SIMULATION_URL;
      else return;
      let finalUrl = `${baseUrl}?${params.toString()}`;
      if (session) {
        finalUrl += `#access_token=${session.access_token}&refresh_token=${session.refresh_token}`;
      }
      window.open(finalUrl, "_blank");
    }
  };

  const completionScore = blueprint ? Math.round((blueprint.recommendation_confidence || 0)) : 0;
  const hasBlueprint = !!blueprint;
  // Career Discovery complete if sessions.report is NOT NULL OR a blueprint exists
  const isCareerDiscoveryComplete = careerDiscoveryDone || hasBlueprint;

  return (
    <div style={styles.page}>
      {/* Navbar */}
      <nav style={styles.navbar}>
        <div style={styles.logo}>
          <div style={styles.logoMark}>C</div>
          <div>
            <div style={styles.logoText}>Campus2Board</div>
            <div style={styles.logoSub}>Student Portal</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ color: C.white, fontSize: 14, fontWeight: 600 }}>{displayName}</div>
            {college && <div style={{ color: C.lavender, fontSize: 11 }}>{college}</div>}
          </div>
          <button onClick={onLogout} style={{ background: "rgba(255,255,255,0.1)", border: "none", borderRadius: 8, padding: "8px 14px", color: C.white, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 500 }}>
            <Icon.logout /> Sign Out
          </button>
        </div>
      </nav>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 24px" }}>

        {/* Welcome Banner */}
        <div style={{ background: `linear-gradient(135deg, ${C.purple} 0%, #6A0DAD 100%)`, borderRadius: 20, padding: "32px 36px", marginBottom: 32, position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", top: -40, right: -40, width: 200, height: 200, borderRadius: "50%", background: "rgba(245,158,11,0.15)" }} />
          <div style={{ position: "absolute", bottom: -60, right: 100, width: 160, height: 160, borderRadius: "50%", background: "rgba(127,107,179,0.2)" }} />
          <div style={{ position: "relative", zIndex: 1 }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 20 }}>
              <div>
                <p style={{ color: C.gold, fontSize: 13, fontWeight: 600, letterSpacing: "1px", textTransform: "uppercase", margin: "0 0 8px" }}>Welcome back</p>
                <h1 style={{ color: C.white, fontSize: 28, fontWeight: 800, margin: "0 0 8px", letterSpacing: "-0.5px" }}>
                  {displayName.split(" ")[0]}, your career journey starts here.
                </h1>
                <p style={{ color: "rgba(255,255,255,0.65)", fontSize: 15, margin: 0, maxWidth: 480 }}>
                  {hasBlueprint
                    ? "Your Career Blueprint is ready. Continue building on your assessment."
                    : "Begin with Career Discovery to get your personalised Career Blueprint and role recommendations."}
                </p>
              </div>
              {hasBlueprint && (
                <div style={{ background: "rgba(255,255,255,0.1)", borderRadius: 16, padding: "20px 28px", textAlign: "center", backdropFilter: "blur(10px)", border: "1px solid rgba(255,255,255,0.15)" }}>
                  <div style={{ color: C.gold, fontSize: 36, fontWeight: 900, lineHeight: 1 }}>{completionScore}%</div>
                  <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: 600, marginTop: 4, letterSpacing: "0.5px" }}>CAREER FIT SCORE</div>
                </div>
              )}
            </div>

            {/* Progress Bar */}
            <div style={{ marginTop: 24 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 12, fontWeight: 600 }}>PROFILE COMPLETION</span>
                <span style={{ color: C.gold, fontSize: 12, fontWeight: 700 }}>{isCareerDiscoveryComplete ? "40%" : "20%"}</span>
              </div>
              <div style={{ background: "rgba(255,255,255,0.15)", borderRadius: 100, height: 8, overflow: "hidden" }}>
                <div style={{ background: `linear-gradient(90deg, ${C.gold}, ${C.goldLight})`, height: "100%", width: isCareerDiscoveryComplete ? "40%" : "20%", borderRadius: 100, transition: "width 1s ease" }} />
              </div>
              <div style={{ display: "flex", gap: 16, marginTop: 10, flexWrap: "wrap" }}>
                {[{ label: "Profile Created", done: true }, { label: "Career Discovery", done: isCareerDiscoveryComplete }, { label: "Resume Builder", done: resumeDone }, { label: "Interview Training", done: interviewDone }, { label: "Applied to Role", done: false }].map((step, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 5, color: step.done ? C.gold : "rgba(255,255,255,0.4)", fontSize: 11, fontWeight: 600 }}>
                    <span style={{ width: 14, height: 14, borderRadius: "50%", background: step.done ? C.gold : "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8 }}>
                      {step.done && "✓"}
                    </span>
                    {step.label}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Blueprint Preview (if exists) */}
        {hasBlueprint && blueprint.report_data && (
          <div style={{ ...styles.card, marginBottom: 32, borderLeft: `4px solid ${C.gold}` }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: C.charcoal }}>Your Career Blueprint</h3>
                <p style={{ margin: "4px 0 0", fontSize: 13, color: C.muted }}>Last updated {new Date(blueprint.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</p>
              </div>
              <button onClick={() => handleModuleClick({ id: "career-discovery" })} style={{ ...styles.btnOutline, fontSize: 13, padding: "8px 16px" }}>
                View Full Report →
              </button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
              {(blueprint.report_data?.topCareerMatches || []).slice(0, 3).map((match, i) => (
                <div key={i} style={{ background: C.lavenderBg, borderRadius: 10, padding: "14px 16px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                    <Icon.star />
                    <span style={{ fontSize: 11, fontWeight: 700, color: C.purple, textTransform: "uppercase", letterSpacing: "0.5px" }}>{match.domain}</span>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.charcoal }}>{match.roleTitle}</div>
                  <div style={{ fontSize: 20, fontWeight: 900, color: C.purple, marginTop: 4 }}>{match.careerFitScore}%</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Module Cards */}
        <h2 style={{ fontSize: 20, fontWeight: 800, color: C.charcoal, margin: "0 0 20px", letterSpacing: "-0.3px" }}>Your Learning Modules</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 20 }}>
          {MODULES.map((mod) => {
            const ModIcon = mod.icon;
            return (
              <div key={mod.id}
                onClick={() => mod.live && handleModuleClick(mod)}
                style={{ ...styles.card, cursor: mod.live ? "pointer" : "default", transition: "all 0.2s", position: "relative", overflow: "hidden", opacity: mod.live ? 1 : 0.85, border: mod.live ? `1.5px solid ${C.border}` : `1.5px solid ${C.border}` }}
                onMouseEnter={e => { if (mod.live) { e.currentTarget.style.transform = "translateY(-3px)"; e.currentTarget.style.boxShadow = `0 12px 32px rgba(75,0,130,0.15)`; } }}
                onMouseLeave={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "0 2px 8px rgba(75,0,130,0.06)"; }}>

                {/* Top accent bar */}
                <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: mod.live ? `linear-gradient(90deg, ${mod.color}, ${mod.accent})` : C.border }} />

                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16, paddingTop: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 44, height: 44, borderRadius: 12, background: `${mod.color}15`, display: "flex", alignItems: "center", justifyContent: "center", color: mod.color }}>
                      <ModIcon />
                    </div>
                    <span style={{ fontSize: 28, fontWeight: 900, color: `${mod.color}20`, fontFamily: "monospace", lineHeight: 1 }}>{mod.number}</span>
                  </div>
                  <span style={{ ...styles.tag, background: `${mod.badgeColor}15`, color: mod.badgeColor, fontSize: 11 }}>{mod.badge}</span>
                </div>

                <h3 style={{ margin: "0 0 4px", fontSize: 17, fontWeight: 800, color: C.charcoal }}>{mod.title}</h3>
                <p style={{ margin: "0 0 12px", fontSize: 12, fontWeight: 600, color: mod.color, textTransform: "uppercase", letterSpacing: "0.5px" }}>{mod.subtitle}</p>
                <p style={{ margin: "0 0 20px", fontSize: 14, color: C.muted, lineHeight: 1.6 }}>{mod.description}</p>

                <button
                  onClick={e => { e.stopPropagation(); mod.live && handleModuleClick(mod); }}
                  disabled={!mod.live}
                  style={{ ...(mod.live ? styles.btn : { ...styles.btn, background: C.border, color: C.muted, cursor: "not-allowed" }), padding: "10px 18px", fontSize: 13, width: "100%", justifyContent: "center" }}>
                  {mod.live ? <><span>{mod.cta}</span><Icon.chevron /></> : "Coming Soon"}
                </button>
              </div>
            );
          })}
        </div>

        {/* Footer note */}
        <div style={{ textAlign: "center", marginTop: 48, paddingBottom: 24 }}>
          <p style={{ color: C.muted, fontSize: 13 }}>
            Campus2Board · MBA Career Readiness Platform · <span style={{ color: C.purple, fontWeight: 600 }}>app.campus2board.com</span>
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Root App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setChecking(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  if (checking) {
    return (
      <div style={{ ...styles.page, display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: C.purple }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ ...styles.logoMark, width: 56, height: 56, fontSize: 26, borderRadius: 14, margin: "0 auto 16px" }}>C</div>
          <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 14 }}>Loading your portal...</div>
        </div>
      </div>
    );
  }

  if (!user) return <AuthScreen onAuth={setUser} />;
  return <Dashboard user={user} onLogout={handleLogout} />;
}
