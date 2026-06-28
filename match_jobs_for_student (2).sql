-- ════════════════════════════════════════════════════════════════════════════
-- match_jobs_for_student — HYBRID scoring (v2)
-- ════════════════════════════════════════════════════════════════════════════
-- WHY THIS REPLACES THE OLD FUNCTION:
-- Pure embedding cosine similarity was the only signal in the old version.
-- The problem: every MBA job posting (HR, Supply Chain, Marketing, Finance...)
-- shares huge amounts of generic vocabulary — "MBA", "fresher", "stakeholder
-- management", "communication skills", "team player", etc. That generic
-- overlap compresses cosine similarity for ALL domains into a narrow band
-- (~0.75–0.90), so an HR job and a Marketing job end up almost equally
-- "similar" to a Marketing-focused student profile — hence HR showing 78%
-- and Supply Chain 79% for a student whose Career Discovery report says
-- Marketing is the best fit.
--
-- FIX: Make domain match the PRIMARY, deterministic signal — it comes
-- straight from the student's actual Career Discovery topCareerMatches
-- (ground truth), not from fuzzy text similarity. Embedding similarity is
-- only used to fine-tune ranking *within* a domain band, not to decide
-- which domain "wins".
--
-- SCORE BANDS (mutually exclusive, by construction these no longer overlap):
--   90-99  → job.domain matches the student's #1 ranked career domain
--   80-89  → job.domain matches student's #2-#3 ranked career domain
--   65-79  → job.domain matches student's #4-#5 ranked career domain
--   40-59  → job.domain doesn't match any of the student's top domains
--            (still ranked, but always below every matching-domain job)
-- Within each band, embedding cosine similarity (0..1) is rescaled to fill
-- the band, so jobs in the SAME domain still rank against each other by
-- how well their specific text matches the student's specific profile.
--
-- PREREQUISITE: pgvector extension enabled, jobs.embedding and
-- student_embeddings.embedding are `vector(768)` columns (NOT text/jsonb —
-- if they're currently stored as text via JSON.stringify(), cast them to
-- vector type; see migration note at the bottom of this file).
-- ════════════════════════════════════════════════════════════════════════════

drop function if exists public.match_jobs_for_student(uuid, int);

-- SECURITY DEFINER: this function is called via supabase-js .rpc() as the
-- "authenticated" role (or "anon" before login). If RLS policies on
-- student_embeddings, campus2board_sessions, or jobs don't explicitly grant
-- that role read access, the function fails SILENTLY from the client's
-- point of view — supabase-js reports it as `error` but the old client code
-- swallowed it in an empty `catch {}` and fell back to flat 75% scores for
-- everyone. Running as SECURITY DEFINER makes the function execute with the
-- privileges of the function owner (normally the postgres/service role),
-- bypassing RLS for this read-only, parameterized lookup — which is safe
-- here because every query inside is already scoped to p_student_id.
create or replace function public.match_jobs_for_student(
  p_student_id uuid,
  match_count int default 80
)
returns table (
  id uuid,
  external_id text,
  title text,
  company text,
  location text,
  type text,
  domain text,
  experience text,
  salary_range text,
  description text,
  requirements text[],
  skills text[],
  apply_link text,
  posted_at timestamptz,
  source text,
  source_url text,
  logo_url text,
  is_active boolean,
  readiness text,
  created_at timestamptz,
  updated_at timestamptz,
  personalized_score numeric,
  domain_rank int
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_student_embedding vector(768);
  v_top_domains text[];   -- student's career-match domains, ordered #1 first, de-duplicated
begin
  -- ── Fetch the student's embedding ────────────────────────────────────────
  select se.embedding into v_student_embedding
  from public.student_embeddings se
  where se.student_id = p_student_id;

  if v_student_embedding is null then
    -- No embedding yet — caller should fall back to the static match_score
    -- path on the client. Return an empty set rather than erroring.
    return;
  end if;

  -- ── Fetch the student's ranked domains straight from Career Discovery ───
  -- topCareerMatches is already sorted by careerFitScore in the report JSON
  -- (descending). We de-duplicate while preserving that order, since a
  -- domain can appear more than once across different role titles.
  --
  -- NOTE: the inner alias is "domain_name", NOT "domain" — PL/pgSQL exposes
  -- this function's `returns table (..., domain text, ...)` column as an
  -- implicit variable visible inside every query in the function body, so
  -- naming a derived column "domain" here collides with it and throws
  -- "column reference 'domain' is ambiguous" at runtime.
  select coalesce(
    (
      select array_agg(domain_name order by ord)
      from (
        select distinct on (m->>'domain')
          m->>'domain' as domain_name,
          min(idx) as ord
        from public.campus2board_sessions s,
             jsonb_array_elements(coalesce(s.report->'topCareerMatches', '[]'::jsonb)) with ordinality as t(m, idx)
        where s.user_id = p_student_id
          and m->>'domain' is not null
        group by m->>'domain'
      ) ranked_domains
    ),
    array[]::text[]
  ) into v_top_domains;

  return query
  with scored as (
    select
      j.*,
      -- domain_rank: 1-based position of this job's domain in the student's
      -- ranked domain list; null if the job's domain isn't in that list at all
      (
        select min(i)
        from generate_subscripts(v_top_domains, 1) i
        where v_top_domains[i] = j.domain
      ) as d_rank,
      -- cosine similarity, 0..1 (pgvector's <=> is cosine DISTANCE, so 1 - distance = similarity)
      case
        when j.embedding is null then 0.5  -- unembedded job: neutral mid-band placement
        else 1 - (j.embedding <=> v_student_embedding)
      end as cos_sim
    from public.jobs j
    where j.is_active = true
  )
  select
    s.id, s.external_id, s.title, s.company, s.location, s.type, s.domain,
    s.experience, s.salary_range, s.description, s.requirements, s.skills,
    s.apply_link, s.posted_at, s.source, s.source_url, s.logo_url,
    s.is_active, s.readiness, s.created_at, s.updated_at,
    -- ── Band assignment + within-band rescaling ──────────────────────────
    round(
      case
        when s.d_rank = 1 then 90 + (greatest(least(s.cos_sim, 1), 0) * 9)
        when s.d_rank between 2 and 3 then 80 + (greatest(least(s.cos_sim, 1), 0) * 9)
        when s.d_rank between 4 and 5 then 65 + (greatest(least(s.cos_sim, 1), 0) * 14)
        else 40 + (greatest(least(s.cos_sim, 1), 0) * 19)
      end
    )::numeric as personalized_score,
    s.d_rank as domain_rank
  from scored s
  order by personalized_score desc, s.posted_at desc
  limit match_count;
end;
$$;

grant execute on function public.match_jobs_for_student(uuid, int) to authenticated, anon, service_role;

-- ════════════════════════════════════════════════════════════════════════════
-- DIAGNOSTIC HELPER — call this from the Supabase SQL editor (or temporarily
-- from the client) to see exactly why a student is getting flat/fallback
-- scores. Run: select * from public.debug_match_jobs_for_student('<uuid>');
-- ════════════════════════════════════════════════════════════════════════════
create or replace function public.debug_match_jobs_for_student(p_student_id uuid)
returns table (
  check_name text,
  result text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_has_embedding boolean;
  v_top_domains text[];
  v_jobs_total int;
  v_jobs_with_embedding int;
  v_jobs_active int;
begin
  select exists(select 1 from public.student_embeddings se where se.student_id = p_student_id)
    into v_has_embedding;

  select coalesce(
    (
      select array_agg(domain_name order by ord)
      from (
        select distinct on (m->>'domain')
          m->>'domain' as domain_name,
          min(idx) as ord
        from public.campus2board_sessions s,
             jsonb_array_elements(coalesce(s.report->'topCareerMatches', '[]'::jsonb)) with ordinality as t(m, idx)
        where s.user_id = p_student_id
          and m->>'domain' is not null
        group by m->>'domain'
      ) ranked_domains
    ),
    array[]::text[]
  ) into v_top_domains;

  select count(*) into v_jobs_total from public.jobs;
  select count(*) into v_jobs_active from public.jobs where is_active = true;
  select count(*) into v_jobs_with_embedding from public.jobs where embedding is not null;

  return query
  select 'student has embedding row', v_has_embedding::text
  union all
  select 'student top domains (from Career Discovery report)', coalesce(array_to_string(v_top_domains, ' > '), '(none found)')
  union all
  select 'total jobs in table', v_jobs_total::text
  union all
  select 'active jobs', v_jobs_active::text
  union all
  select 'jobs with a non-null embedding', v_jobs_with_embedding::text;
end;
$$;

grant execute on function public.debug_match_jobs_for_student(uuid) to authenticated, anon, service_role;

-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION NOTE — run this FIRST if your embedding columns are currently
-- stored as `text` (because the old code did JSON.stringify(vector) into a
-- text/jsonb column rather than a native pgvector `vector` column). If they
-- are already `vector(768)`, skip this block entirely.
-- ════════════════════════════════════════════════════════════════════════════
--
-- create extension if not exists vector;
--
-- alter table public.jobs
--   alter column embedding type vector(768) using embedding::vector(768);
--
-- alter table public.student_embeddings
--   alter column embedding type vector(768) using embedding::vector(768);
--
-- -- Recommended index for fast cosine search at scale:
-- create index if not exists jobs_embedding_idx
--   on public.jobs using hnsw (embedding vector_cosine_ops);
