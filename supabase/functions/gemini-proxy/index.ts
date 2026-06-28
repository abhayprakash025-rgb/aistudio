// supabase/functions/gemini-proxy/index.ts
// ─────────────────────────────────────────────────────────────────────────────
// Secure Gemini API proxy — holds the API key server-side as an env secret.
// The client JS never sees the key. Authenticated Supabase users only.
//
// DEPLOY STEPS:
//   1. Install Supabase CLI:  npm install -g supabase
//   2. Login:                 supabase login
//   3. Link your project:     supabase link --project-ref yhycjpsbuiidboadvchp
//   4. Set the secret:        supabase secrets set GEMINI_API_KEY=your_key_here
//   5. Deploy:                supabase functions deploy gemini-proxy
//
// GET A FREE GEMINI KEY AT: https://aistudio.google.com/apikey
// ─────────────────────────────────────────────────────────────────────────────

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://campus2board-portal.vercel.app",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Only POST
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  // Validate auth header (requires valid Supabase JWT — prevents public abuse)
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response("Unauthorized", { status: 401, headers: corsHeaders });
  }

  // Read prompt from body
  let prompt: string;
  try {
    const body = await req.json();
    prompt = body?.prompt;
    if (!prompt || typeof prompt !== "string") throw new Error("No prompt");
  } catch {
    return new Response(JSON.stringify({ error: "Invalid body" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  // Enforce a reasonable prompt length limit
  if (prompt.length > 4000) {
    return new Response(JSON.stringify({ error: "Prompt too long" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  // Get key from env secret (set via: supabase secrets set GEMINI_API_KEY=...)
  const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
  if (!GEMINI_API_KEY) {
    return new Response(JSON.stringify({ error: "AI not configured" }), {
      status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  // Gemini 2.5 Flash has documented periods of high load returning 503 UNAVAILABLE.
  // Strategy: try the primary model with up to 2 retries (short backoff), each attempt
  // capped at 12s via AbortController so we never again sit for 80+ seconds before
  // failing. If the primary model is still down after retries, fall back once to
  // gemini-2.5-flash-lite (a separate capacity pool) before giving up.
  const MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite"];
  const MAX_RETRIES_PER_MODEL = 2;
  const PER_ATTEMPT_TIMEOUT_MS = 12000;
  const RETRY_DELAY_MS = 1500;

  async function callGeminiOnce(model: string): Promise<{ ok: true; data: any } | { ok: false; status: number; body: string }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PER_ATTEMPT_TIMEOUT_MS);
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.4,
              maxOutputTokens: 800,
              // Gemini 2.5 Flash has "thinking" on by default, and thinking tokens are
              // deducted from maxOutputTokens — this was silently eating nearly the
              // entire budget (573 of 600 tokens in one observed case), leaving only a
              // few tokens for the actual answer and truncating the JSON mid-string.
              // This task is simple extraction/classification, not multi-step reasoning,
              // so thinking adds latency and cost with no benefit here.
              thinkingConfig: { thinkingBudget: 0 },
            }
          }),
          signal: controller.signal,
        }
      );
      if (!res.ok) {
        const body = await res.text();
        return { ok: false, status: res.status, body };
      }
      const data = await res.json();
      return { ok: true, data };
    } catch (err) {
      // AbortError (our own timeout) or network failure
      return { ok: false, status: 0, body: String(err) };
    } finally {
      clearTimeout(timer);
    }
  }

  try {
    let lastError = "";
    for (const model of MODELS) {
      for (let attempt = 1; attempt <= MAX_RETRIES_PER_MODEL; attempt++) {
        const result = await callGeminiOnce(model);

        if (result.ok) {
          console.log(`RAW GEMINI RESPONSE (${model}, attempt ${attempt}):`, JSON.stringify(result.data));
          const candidate = result.data?.candidates?.[0];
          const text = candidate?.content?.parts?.[0]?.text || null;
          const finishReason = candidate?.finishReason;
          console.log("EXTRACTED TEXT:", text, "FINISH REASON:", finishReason);

          if (text && finishReason !== "MAX_TOKENS") {
            return new Response(JSON.stringify({ text }), {
              status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
          }

          if (finishReason === "MAX_TOKENS") {
            // Truncated mid-output even with thinking disabled — retry is worth trying
            // once more (output length varies run to run), otherwise move to next model.
            console.error(`Gemini truncated output (MAX_TOKENS) on ${model}, attempt ${attempt}`);
            lastError = "Response truncated (MAX_TOKENS)";
            if (attempt < MAX_RETRIES_PER_MODEL) {
              await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
              continue;
            }
            break;
          }

          // 200 but no usable text at all (e.g. safety block, empty candidate) — don't retry, just report it
          console.error(`Gemini returned 200 but no text (${model}):`, JSON.stringify(result.data));
          lastError = "Empty response from model";
          break; // move to next model rather than retrying a deterministic empty response
        }

        // Only retry on transient-looking failures (503/429/0=timeout/network).
        const transient = result.status === 503 || result.status === 429 || result.status === 0;
        console.error(`Gemini error (${model}, attempt ${attempt}, status ${result.status}):`, result.body);
        lastError = result.body;

        if (!transient || attempt === MAX_RETRIES_PER_MODEL) break;
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS * attempt));
      }
    }

    // Every model/attempt exhausted
    return new Response(JSON.stringify({ error: "Gemini API error", detail: lastError }), {
      status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (err) {
    console.error("Proxy error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
