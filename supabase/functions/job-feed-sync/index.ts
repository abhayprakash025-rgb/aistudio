// ─── job-feed-sync Edge Function ─────────────────────────────────────────────
// Runs 4x per week (Mon/Wed/Fri/Sun via pg_cron). Never called on page load.
// Fetches MBA-relevant jobs from OpenWebNinja JSearch API, upserts to Supabase,
// then embeds each new job immediately via embed-profile.
//
// MBA Year 1 queries → Internship + Live Project roles
// MBA Year 2 queries → Full-time fresher/graduate roles
//
// Jobs older than 15 days are marked is_active = false on each run.
//
// ── QUOTA-SAFE DOMAIN ROTATION (added) ────────────────────────────────────────
// Free-tier JSearch is capped at 200 requests/month. Running all 14 queries on
// every one of the 4x/week runs (~14 × 4 × 4.33 ≈ 241 calls/month) was already
// over budget — which is the actual reason only 3 jobs/domains ever made it
// into the DB: most calls were silently failing (429s landing in `errors[]`
// while the function still returned overall success).
//
// Fix: split the 7 domains into per-run groups and ROTATE which domains get
// queried each run, so every domain still gets refreshed at least once a
// week, but total monthly calls stay safely under quota.
//
// 8 domains × 2 queries (Year1 internship + Year2 full-time) = 16 query slots.
// Split into 2 even groups of 4 domains (8 queries/group). Group A runs on
// Mon/Fri, Group B runs on Wed/Sun — so every domain is queried 2x/week
// instead of 4x/week, halving the call volume to ~8 × 4 × 4.33 ≈ 139
// calls/month, comfortably under the 200 cap with headroom for retries.
// ─────────────────────────────────────────────────────────────────────────────

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function errStr(err: unknown): string {
  if (!err) return "unknown error";
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  try { return JSON.stringify(err); } catch { return String(err); }
}

// ── Search queries, grouped by domain ─────────────────────────────────────────
// Each domain carries one Year1 (internship) query and one Year2 (full-time)
// query. Domains are split into two rotation groups below.
const DOMAIN_QUERIES: Record<string, { year1: string; year2: string }> = {
  "Sales & Marketing": {
    year1: "MBA internship sales marketing brand management India",
    year2: "MBA fresher graduate sales marketing brand manager India",
  },
  "Finance & Investment Banking": {
    year1: "MBA internship finance investment banking corporate finance India",
    year2: "MBA fresher finance analyst investment banking associate India",
  },
  "Human Resources": {
    year1: "MBA internship human resources talent acquisition HR India",
    year2: "MBA graduate HR business partner talent acquisition India",
  },
  "Operations & Supply Chain": {
    year1: "MBA internship operations supply chain logistics procurement India",
    year2: "MBA fresher operations supply chain logistics India",
  },
  "Business Analytics & AI": {
    year1: "MBA internship business analytics data analytics strategy India",
    year2: "MBA fresher business analytics data science strategy India",
  },
  "Strategy & Consulting": {
    year1: "MBA internship strategy consulting business analyst India",
    year2: "MBA fresher strategy consulting associate business analyst India",
  },
  "General Management": {
    year1: "MBA live project management trainee internship India",
    year2: "MBA management trainee graduate trainee India",
  },
  "Product & Strategy": {
    year1: "MBA internship product management associate India",
    year2: "MBA fresher product manager associate product management India",
  },
};

const ALL_DOMAINS = Object.keys(DOMAIN_QUERIES);

// Rotation groups — Group A on Mon/Fri, Group B on Wed/Sun (see pg_cron note
// at the bottom). 8 domains split evenly into two groups of 4 (8 queries
// each), so both runs cost the same and every domain refreshes 2x/week.
const ROTATION_GROUP_A = ["Sales & Marketing", "Finance & Investment Banking", "Human Resources", "Operations & Supply Chain"];
const ROTATION_GROUP_B = ["Business Analytics & AI", "Strategy & Consulting", "General Management", "Product & Strategy"];

function buildQueriesForGroup(domains: string[]): string[] {
  const queries: string[] = [];
  for (const domain of domains) {
    const dq = DOMAIN_QUERIES[domain];
    if (!dq) continue;
    queries.push(dq.year1, dq.year2);
  }
  return queries;
}


// ── Domain mapping ────────────────────────────────────────────────────────────
// Maps job title keywords to the canonical domain values used in the portal filter
function inferDomain(title: string): string {
  const t = title.toLowerCase();
  if (t.includes("consult") || t.includes("strateg")) return "Strategy & Consulting";
  if (t.includes("invest") || t.includes("banking") || t.includes("treasury") || t.includes("corporate finance") || t.includes("financial analyst") || t.includes("finance analyst")) return "Finance & Investment Banking";
  if (t.includes("financ")) return "Finance & Investment Banking";
  if (t.includes("digital market") || t.includes("brand") || t.includes("market research") || t.includes("key account") || t.includes("b2b sales") || t.includes("channel sales") || t.includes("retail sales") || t.includes("pre-sales") || t.includes("presales")) return "Sales & Marketing";
  if (t.includes("market") || t.includes("sales") || t.includes("business development")) return "Sales & Marketing";
  if (t.includes("human resource") || t.includes(" hr ") || t.includes("talent") || t.includes("recruit") || t.includes("learning") || t.includes("l&d") || t.includes("hr business") || t.includes("people partner")) return "Human Resources";
  if (t.includes("supply chain") || t.includes("logistics") || t.includes("procurement") || t.includes("sourcing") || t.includes("warehouse") || t.includes("fulfil") || t.includes("quick commerce") || t.includes("dark store")) return "Operations & Supply Chain";
  if (t.includes("operation") || t.includes("manufacturing") || t.includes("production")) return "Operations & Supply Chain";
  if (t.includes("analyt") || t.includes("data science") || t.includes("business intelligence") || t.includes("bi analyst") || t.includes("data analyst") || t.includes("product analyt")) return "Business Analytics & AI";
  if (t.includes("product manager") || t.includes("product management")) return "Product & Strategy";
  return "General Management";
}

// ── Job type inference ────────────────────────────────────────────────────────
function inferType(title: string, empType: string): string {
  const t = title.toLowerCase();
  const e = (empType || "").toLowerCase();
  if (t.includes("intern") || e.includes("intern")) return "Internship";
  if (t.includes("live project") || t.includes("project trainee") || t.includes("student project")) return "Live Project";
  if (e.includes("contract") || t.includes("contract")) return "Contract";
  if (e.includes("part")) return "Part-time";
  return "Full-time";
}

// ── Readiness inference ───────────────────────────────────────────────────────
// Will be replaced by embedding-based cosine score but we still set a baseline
function inferReadiness(type: string): string {
  if (type === "Internship" || type === "Live Project") return "medium";
  return "medium";
}

async function fetchJobs(query: string, apiKey: string): Promise<any[]> {
  const encodedQuery = encodeURIComponent(query);
  const url = `https://api.openwebninja.com/jsearch/search?query=${encodedQuery}&page=1&num_pages=1&country=in&date_posted=month`;
  const res = await fetch(url, {
    method: "GET",
    headers: { "x-api-key": apiKey },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`JSearch API ${res.status}: ${body}`);
  }
  const data = await res.json();
  if (Array.isArray(data?.data?.jobs)) return data.data.jobs;
  if (Array.isArray(data?.data)) return data.data;
  return [];
}

function mapJob(raw: any): Record<string, any> {
  const skills: string[] = [];
  if (Array.isArray(raw.job_required_skills)) skills.push(...raw.job_required_skills);
  if (Array.isArray(raw.job_highlights?.Qualifications)) skills.push(...raw.job_highlights.Qualifications.slice(0, 5));

  const requirements: string[] = [];
  if (Array.isArray(raw.job_highlights?.Responsibilities)) requirements.push(...raw.job_highlights.Responsibilities.slice(0, 5));

  const title = raw.job_title || "Untitled";
  const domain = inferDomain(title);
  const type = inferType(title, raw.job_employment_type || "");
  const readiness = inferReadiness(type);

  // posted_at — prefer the API's UTC datetime; fall back to now
  const postedAt = raw.job_posted_at_datetime_utc || new Date().toISOString();

  return {
    external_id: raw.job_id,
    title,
    company: raw.employer_name || "Unknown Company",
    location: raw.job_city
      ? `${raw.job_city}, ${raw.job_state || raw.job_country || "India"}`
      : (raw.job_country || "India"),
    type,
    domain,
    experience: raw.job_required_experience?.required_experience_in_months
      ? `${Math.round(raw.job_required_experience.required_experience_in_months / 12)} years`
      : null,
    salary_range: raw.job_min_salary && raw.job_max_salary
      ? `${raw.job_min_salary}-${raw.job_max_salary} ${raw.job_salary_currency || "INR"}`
      : null,
    description: (raw.job_description || "").slice(0, 2000),
    requirements: requirements.length > 0 ? requirements : null,
    skills: skills.length > 0 ? skills : null,
    apply_link: raw.job_apply_link || raw.job_google_link || null,
    posted_at: postedAt,
    source: "jsearch",
    source_url: raw.job_apply_link || null,
    logo_url: raw.employer_logo || null,
    is_active: true,
    match_score: 75,
    readiness,
    updated_at: new Date().toISOString(),
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  const JSEARCH_API_KEY = Deno.env.get("JSEARCH_API_KEY");
  if (!JSEARCH_API_KEY) {
    return new Response(
      JSON.stringify({ error: "JSEARCH_API_KEY not configured" }),
      { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(
      JSON.stringify({ error: "Missing Supabase env vars" }),
      { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  let fetched = 0, inserted = 0, skipped = 0, embedded = 0, expired = 0;
  const errors: string[] = [];
  let rateLimitHits = 0;

  // ── Pick today's rotation group ──────────────────────────────────────────
  // UTC day-of-week: 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat.
  // Cron fires Mon(1)/Fri(5) → Group A, Wed(3)/Sun(0) → Group B.
  // Pass {"group": "A"|"B"|"all"} in the request body to override (e.g. for
  // manual backfills or testing) — "all" runs every domain in one call and
  // should only be used manually, never on the automated schedule, since it
  // burns through quota fast on the free tier.
  let body: any = {};
  try { body = await req.json(); } catch { /* empty body is fine */ }

  const dow = new Date().getUTCDay();
  const autoGroup = (dow === 1 || dow === 5) ? "A" : "B";
  const selectedGroup = (body?.group === "A" || body?.group === "B" || body?.group === "all")
    ? body.group
    : autoGroup;

  const queriesThisRun =
    selectedGroup === "all" ? buildQueriesForGroup(ALL_DOMAINS)
    : selectedGroup === "A" ? buildQueriesForGroup(ROTATION_GROUP_A)
    : buildQueriesForGroup(ROTATION_GROUP_B);

  try {
    // ── Step 1: Expire jobs older than 15 days ─────────────────────────────────
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 15);
    const { error: expireErr } = await sb
      .from("jobs")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .lt("posted_at", cutoff.toISOString())
      .eq("is_active", true);

    if (expireErr) {
      errors.push(`Expire old jobs: ${errStr(expireErr)}`);
    } else {
      // count how many were expired (approximate — Supabase doesn't return count from update)
      expired = -1; // flag that expiry ran; actual count unknown without a select first
    }

    // ── Step 2: Fetch new jobs from JSearch (today's rotation group only) ──────
    const allRawJobs: any[] = [];
    for (const query of queriesThisRun) {
      try {
        const jobs = await fetchJobs(query, JSEARCH_API_KEY);
        allRawJobs.push(...jobs);
        fetched += jobs.length;
      } catch (err) {
        const msg = errStr(err);
        if (msg.includes("429") || msg.toLowerCase().includes("rate limit") || msg.toLowerCase().includes("quota")) {
          rateLimitHits++;
        }
        errors.push(`Query "${query}": ${msg}`);
      }
      // Respect rate limits — 500ms between requests
      await new Promise(r => setTimeout(r, 500));
    }

    // ── Step 3: Deduplicate by external_id ─────────────────────────────────────
    const seen = new Set<string>();
    const uniqueJobs = allRawJobs.filter(j => {
      if (!j.job_id || seen.has(j.job_id)) return false;
      seen.add(j.job_id);
      return true;
    });

    // Also filter: only keep jobs posted in the last 15 days
    const fifteenDaysAgo = new Date();
    fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);
    const recentJobs = uniqueJobs.filter(j => {
      if (!j.job_posted_at_datetime_utc) return true; // include if no date (default to now)
      return new Date(j.job_posted_at_datetime_utc) >= fifteenDaysAgo;
    });

    // ── Step 4: Upsert new jobs into Supabase ──────────────────────────────────
    const newJobIds: string[] = [];
    for (const raw of recentJobs) {
      try {
        const mapped = mapJob(raw);
        // Check if already in DB by external_id
        const { data: existing } = await sb
          .from("jobs")
          .select("id")
          .eq("external_id", mapped.external_id)
          .maybeSingle();

        if (existing) {
          // Job already exists — reactivate if it was expired
          await sb
            .from("jobs")
            .update({ is_active: true, updated_at: new Date().toISOString() })
            .eq("id", existing.id);
          skipped++;
          continue;
        }

        const { data: newJob, error: insertErr } = await sb
          .from("jobs")
          .insert(mapped)
          .select("id")
          .single();

        if (insertErr) throw new Error(errStr(insertErr));
        newJobIds.push(newJob.id);
        inserted++;
      } catch (err) {
        errors.push(`Job ${raw.job_id}: ${errStr(err)}`);
      }
    }

    // ── Step 5: Embed each new job immediately ─────────────────────────────────
    for (const jobId of newJobIds) {
      try {
        const r = await fetch(`${SUPABASE_URL}/functions/v1/embed-profile`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({ type: "job", job_id: jobId }),
        });
        const result = await r.json();
        if (result.success) embedded++;
        else errors.push(`Embed ${jobId}: ${result.error || "unknown"}`);
        await new Promise(r => setTimeout(r, 100));
      } catch (err) {
        errors.push(`Embed ${jobId}: ${errStr(err)}`);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        rotation_group: selectedGroup,
        domains_queried: selectedGroup === "all" ? ALL_DOMAINS : selectedGroup === "A" ? ROTATION_GROUP_A : ROTATION_GROUP_B,
        queries_run: queriesThisRun.length,
        fetched, inserted, skipped, embedded,
        expired_marked: expired === -1 ? "ran" : expired,
        rate_limit_hits: rateLimitHits,
        errors,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: errStr(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ── pg_cron setup (run in Supabase SQL Editor) ────────────────────────────────
// Runs Monday, Wednesday, Friday, Sunday at 6:00 AM UTC — same schedule as
// before. The function itself now auto-picks Rotation Group A on Mon/Fri and
// Group B on Wed/Sun based on the UTC day, from a single cron job with an
// empty body — no cron changes needed if you already had the old schedule.
//
// QUOTA MATH (free tier, 200 req/month):
//   Group A = 4 domains × 2 queries = 8 calls/run
//   Group B = 4 domains × 2 queries = 8 calls/run
//   4 runs/week × ~4.33 weeks/month, alternating A/B ≈ 8 × 4 × 4.33
//   ≈ 139 calls/month — comfortably under 200, leaving headroom for retries
//   and any manual {"group":"all"} backfills you trigger by hand.
//
// SELECT cron.unschedule('job-feed-sync-am');  -- remove old schedules first
// SELECT cron.unschedule('job-feed-sync-pm');
//
// SELECT cron.schedule(
//   'job-feed-sync-weekly',
//   '0 6 * * 1,3,5,0',            -- Mon/Wed/Fri/Sun at 06:00 UTC
//   $$
//   SELECT net.http_post(
//     url := 'https://yhycjpsbuiidboadvchp.supabase.co/functions/v1/job-feed-sync',
//     headers := '{"Content-Type":"application/json","Authorization":"Bearer <SERVICE_ROLE_KEY>"}'::jsonb,
//     body := '{}'::jsonb            -- empty body = auto rotation by day-of-week
//   );
//   $$
// );
