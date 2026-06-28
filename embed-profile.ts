// supabase/functions/embed-profile/index.ts
// ─────────────────────────────────────────────────────────────────────────────
// Generates Gemini embeddings for student profiles and job descriptions.
//
// POST /functions/v1/embed-profile
// Body: { "type": "student" }                    — embeds the calling student's profile
// Body: { "type": "job", "job_id": "<uuid>" }    — embeds a specific job
// Body: { "type": "all_jobs" }                   — backfills all un-embedded active jobs
//
// KEY IMPROVEMENT (v2):
// buildStudentText and buildJobText produce rich, semantically dense documents
// that front-load domain vocabulary, used by the within-domain ranking step.
//
// NOTE ON SCORING: embedding cosine similarity alone is NOT sufficient to
// separate domains (every MBA job shares huge generic vocabulary overlap,
// which compresses cross-domain similarity into a narrow band regardless of
// how rich the embedding text is). The actual domain separation now happens
// in the match_jobs_for_student SQL function, which uses the student's
// Career Discovery topCareerMatches domains as the primary, deterministic
// signal and uses these embeddings only to rank jobs *within* a domain band.
// See match_jobs_for_student.sql.
// ─────────────────────────────────────────────────────────────────────────────

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GEMINI_EMBEDDING_MODEL = "gemini-embedding-001";
const TASK_TYPE = "SEMANTIC_SIMILARITY";
const OUTPUT_DIMENSIONS = 768;

function errStr(err: unknown): string {
  if (!err) return "unknown error";
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  try { return JSON.stringify(err); } catch { return String(err); }
}

async function embedText(text: string, apiKey: string): Promise<number[]> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_EMBEDDING_MODEL}:embedContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: `models/${GEMINI_EMBEDDING_MODEL}`,
        content: { parts: [{ text }] },
        taskType: TASK_TYPE,
        outputDimensionality: OUTPUT_DIMENSIONS,
      }),
    }
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gemini embedding API ${res.status}: ${body}`);
  }
  const data = await res.json();
  const values = data?.embedding?.values;
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error(`Empty embedding returned. Full response: ${JSON.stringify(data)}`);
  }
  return values;
}

function simpleHash(text: string): string {
  let h = 0;
  for (let i = 0; i < text.length; i++) {
    h = (Math.imul(31, h) + text.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(16);
}

// ── Domain vocabulary clusters ────────────────────────────────────────────────
// Mirror the roles.ts knowledge graph. By injecting these keywords into both
// student and job embeddings, we ensure they land in the same vector cluster
// even when the raw text uses different words for the same concept.
const DOMAIN_VOCAB: Record<string, string> = {
  "Sales & Marketing": "sales marketing brand management key account channel distribution digital marketing market research consumer insights GTM go-to-market B2B B2C revenue growth customer acquisition retail FMCG e-commerce campaign advertising brand equity product launch pricing trade marketing",
  "Finance & Investment Banking": "finance investment banking financial modelling valuation M&A mergers acquisitions equity debt capital markets treasury corporate finance budgeting P&L profit loss accounting CFA financial analysis portfolio management fundraising due diligence",
  "Human Resources": "human resources HR talent acquisition recruitment hiring learning development L&D training HR business partner employee engagement performance management organizational design workforce planning HRIS payroll compensation benefits culture",
  "Operations & Supply Chain": "operations supply chain logistics procurement sourcing warehouse fulfillment inventory management vendor management manufacturing lean Six Sigma process improvement transportation distribution category management demand planning",
  "Business Analytics & AI": "business analytics data analytics data science machine learning AI artificial intelligence SQL Python R Power BI Tableau business intelligence insights reporting dashboards predictive modelling statistics A/B testing experimentation",
  "Strategy & Consulting": "strategy consulting strategic planning business transformation management consulting problem solving frameworks hypothesis-driven deck building client management McKinsey BCG Bain structured thinking market entry competitive analysis",
  "Product & Strategy": "product management product strategy roadmap agile scrum user research UX product analytics go-to-market product-led growth feature prioritization stakeholder management",
  "General Management": "general management leadership cross-functional operations P&L management business strategy entrepreneurship team leadership execution",
};

function getDomainVocab(domain: string): string {
  if (!domain) return "";
  if (DOMAIN_VOCAB[domain]) return DOMAIN_VOCAB[domain];
  for (const [key, vocab] of Object.entries(DOMAIN_VOCAB)) {
    if (domain.toLowerCase().includes(key.toLowerCase().split(" & ")[0].toLowerCase())) return vocab;
  }
  return "";
}

// ── Student embedding document ────────────────────────────────────────────────
// Structure: career identity → domain vocab → detailed matches → background → behaviours
// The ordering matters — Gemini's embedding model weights earlier tokens more heavily.
function buildStudentText(session: any): string {
  const p = session.student_profile || {};
  const r = session.report || {};
  const si = session.student_intelligence || {};

  // Sort top career matches by fit score descending
  const topMatches = ((r.topCareerMatches || []) as any[])
    .slice(0, 5)
    .sort((a, b) => (b.careerFitScore || 0) - (a.careerFitScore || 0));

  const topRoleTitles = topMatches.map((m) => m.roleTitle).filter(Boolean).join(", ");
  const topDomains = [...new Set(topMatches.map((m) => m.domain).filter(Boolean))].join(", ");
  const topRolesFull = topMatches
    .map((m) => `${m.roleTitle} in ${m.domain || "General"} (${m.careerFitScore}% fit)`)
    .join("; ");

  // Domain vocabulary for every top domain — this is the primary fix for flat scores
  const domainVocabText = [...new Set(
    topMatches.map((m) => getDomainVocab(m.domain || "")).filter(Boolean)
  )].join(" ");

  const candidateRoles = ((si.topCandidateRoles || []) as string[]).slice(0, 5).join(", ");

  // Behavioural top 5 sorted highest first
  const behavioralScores = si.behavioralScores
    ? Object.entries(si.behavioralScores as Record<string, number>)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([k, v]) => `${k}: ${v}`)
        .join(", ")
    : "";

  const risks = ((r.careerRiskAreas || []) as string[]).slice(0, 3).join(", ");
  const priorities = ((r.developmentPriorities || []) as string[]).slice(0, 4).join(", ");
  const cvText = (p.cvText || "").slice(0, 3000);

  return [
    // Primary career identity — highest embedding weight
    topRoleTitles ? `Primary career target roles: ${topRoleTitles}` : "",
    topDomains ? `Target functional domains: ${topDomains}` : "",
    p.careerGoals ? `Stated career goal: ${p.careerGoals}` : "",

    // Domain vocabulary injection — forces embedding into correct cluster
    domainVocabText ? `Domain expertise and keywords: ${domainVocabText}` : "",

    // Detailed match context
    topRolesFull ? `Career Discovery match scores: ${topRolesFull}` : "",
    candidateRoles ? `Candidate role types: ${candidateRoles}` : "",

    // Background
    p.academicBackground ? `Academic background: ${p.academicBackground}` : "",
    p.interests ? `Interests and strengths: ${p.interests}` : "",
    cvText ? `CV and work experience: ${cvText}` : "",

    // Behavioural signals
    behavioralScores ? `Behavioural strengths (top 5): ${behavioralScores}` : "",
    priorities ? `Development priorities: ${priorities}` : "",
    risks ? `Areas needing development: ${risks}` : "",
  ].filter(Boolean).join("\n\n");
}

// ── Job embedding document ────────────────────────────────────────────────────
// Structure: domain identity → domain vocab → role details → requirements
// Domain vocab injection ensures a "Sales Manager" and a "Key Account Manager"
// both land in the Sales & Marketing cluster rather than generic management space.
function buildJobText(job: any): string {
  const skills = Array.isArray(job.skills)
    ? job.skills.join(", ")
    : typeof job.skills === "string"
    ? job.skills
    : "";

  const requirements = Array.isArray(job.requirements)
    ? job.requirements.join(". ")
    : "";

  const domainVocab = getDomainVocab(job.domain || "");

  // Infer additional domain from title if domain field is generic
  const titleDomainVocab = getDomainVocab(job.title || "");

  const combinedVocab = [domainVocab, titleDomainVocab === domainVocab ? "" : titleDomainVocab]
    .filter(Boolean).join(" ");

  return [
    // Domain identity first — highest weight
    `Functional domain: ${job.domain || "General Management"}`,
    job.type ? `Job type: ${job.type}` : "",

    // Domain vocabulary — anchors the vector to the right cluster
    combinedVocab ? `Domain keywords: ${combinedVocab}` : "",

    // Role identity
    `Job title: ${job.title}`,
    `Company: ${job.company}`,
    job.location ? `Location: ${job.location}` : "",
    job.experience ? `Experience required: ${job.experience}` : "",

    // Skills and requirements — rich semantic content
    skills ? `Required skills and competencies: ${skills}` : "",
    requirements ? `Role responsibilities: ${requirements}` : "",

    // Description last — often verbose but less signal-dense
    job.description ? `Full job description: ${job.description}` : "",
  ].filter(Boolean).join("\n\n");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
  if (!GEMINI_API_KEY) {
    return new Response(JSON.stringify({ error: "GEMINI_API_KEY not configured" }), {
      status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({
      error: "Missing env vars",
      hasUrl: !!SUPABASE_URL,
      hasServiceKey: !!SUPABASE_SERVICE_ROLE_KEY,
    }), { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  const { type } = body;

  // ── CASE 1: Embed a student's profile ──────────────────────────────────────
  if (type === "student") {
    try {
      const { data: { user }, error: userErr } = await sb.auth.getUser(
        authHeader.replace("Bearer ", "")
      );
      if (userErr || !user) {
        return new Response(JSON.stringify({ error: "Auth failed", detail: errStr(userErr) }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const { data: session, error: sessionErr } = await sb
        .from("campus2board_sessions")
        .select("student_profile, student_intelligence, report")
        .eq("user_id", user.id)
        .maybeSingle();

      if (sessionErr || !session) {
        return new Response(JSON.stringify({
          error: "No Career Discovery session found. Complete Career Discovery first.",
          skipped: true
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const profileText = buildStudentText(session);
      if (!profileText.trim()) {
        return new Response(JSON.stringify({ error: "Profile is empty", skipped: true }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // Hash includes a version prefix — changing it forces re-embedding of all
      // students when the buildStudentText logic changes (as it has here).
      const hash = "v2:" + simpleHash(profileText);

      const { data: existing } = await sb
        .from("student_embeddings")
        .select("profile_hash")
        .eq("student_id", user.id)
        .maybeSingle();

      if (existing?.profile_hash === hash) {
        return new Response(JSON.stringify({ cached: true, skipped: true }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const vector = await embedText(profileText, GEMINI_API_KEY);
      const { error: upsertErr } = await sb.from("student_embeddings").upsert({
        student_id: user.id,
        embedding: JSON.stringify(vector),
        profile_hash: hash,
        updated_at: new Date().toISOString(),
      }, { onConflict: "student_id" });

      if (upsertErr) throw new Error(errStr(upsertErr));

      return new Response(JSON.stringify({ success: true, dimensions: vector.length }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });

    } catch (err) {
      return new Response(JSON.stringify({ error: errStr(err) }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
  }

  // ── CASE 2: Embed all unembedded jobs ──────────────────────────────────────
  // Pass { "type": "all_jobs", "force": true } to re-embed ALL active jobs
  // (use after changing buildJobText logic to refresh stale embeddings).
  if (type === "all_jobs") {
    const force = body.force === true;
    try {
      let query = sb
        .from("jobs")
        .select("id, title, company, domain, type, location, experience, skills, requirements, description")
        .eq("is_active", true);

      if (!force) {
        query = query.is("embedding", null);
      }

      const { data: jobs, error: jobsErr } = await query;

      if (jobsErr) throw new Error(errStr(jobsErr));
      if (!jobs || jobs.length === 0) {
        return new Response(JSON.stringify({ message: "All jobs already embedded", count: 0 }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      let succeeded = 0, failed = 0;
      const errors: string[] = [];

      for (const job of jobs) {
        try {
          const jobText = buildJobText(job);
          const vector = await embedText(jobText, GEMINI_API_KEY);
          const { error: updateErr } = await sb
            .from("jobs")
            .update({ embedding: JSON.stringify(vector) })
            .eq("id", job.id);
          if (updateErr) throw new Error(errStr(updateErr));
          succeeded++;
          await new Promise(r => setTimeout(r, 120)); // slightly longer delay to stay under rate limit
        } catch (jobErr) {
          const msg = errStr(jobErr);
          errors.push(`${job.id}: ${msg}`);
          failed++;
        }
      }

      return new Response(JSON.stringify({ succeeded, failed, total: jobs.length, errors }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });

    } catch (err) {
      return new Response(JSON.stringify({ error: errStr(err) }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
  }

  // ── CASE 3: Embed a single job ─────────────────────────────────────────────
  if (type === "job") {
    const { job_id } = body;
    if (!job_id) {
      return new Response(JSON.stringify({ error: "job_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
    try {
      const { data: job, error: jobErr } = await sb
        .from("jobs")
        .select("id, title, company, domain, type, location, experience, skills, requirements, description")
        .eq("id", job_id)
        .single();
      if (jobErr || !job) throw new Error(errStr(jobErr) || "Job not found");

      const vector = await embedText(buildJobText(job), GEMINI_API_KEY);
      const { error: updateErr } = await sb
        .from("jobs")
        .update({ embedding: JSON.stringify(vector) })
        .eq("id", job_id);
      if (updateErr) throw new Error(errStr(updateErr));

      return new Response(JSON.stringify({ success: true, job_id, dimensions: vector.length }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: errStr(err) }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
  }

  return new Response(JSON.stringify({ error: `Unknown type: ${type}` }), {
    status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
});
