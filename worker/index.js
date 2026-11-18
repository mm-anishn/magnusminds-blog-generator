// Cloudflare Worker: worker/index.js
// Handles real-time AI generation of publication-ready MagnusMinds blogs

export default {
  async fetch(request, env) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Gemini-Key',
      'Content-Type': 'application/json'
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed. Use POST.' }), {
        status: 405,
        headers: corsHeaders
      });
    }

    try {
      const body = await request.json().catch(() => ({}));
      const { topic, angle = 0 } = body;

      if (!topic || typeof topic !== 'string' || !topic.trim()) {
        return new Response(JSON.stringify({ error: 'Missing required field: "topic"' }), {
          status: 400,
          headers: corsHeaders
        });
      }

      const cleanTitle = topic.replace(/\s*\|\s*MagnusMinds$/i, '').trim();
      const apiKey = env.GEMINI_API_KEY || request.headers.get('x-gemini-key');

      if (!apiKey) {
        return new Response(JSON.stringify({
          error: 'Cloudflare Worker: GEMINI_API_KEY secret is not set. Run `npx wrangler secret put GEMINI_API_KEY`.'
        }), { status: 500, headers: corsHeaders });
      }

      const angleModifiers = [
        'Focus on deep architectural design, runtime mechanics, and foundational concepts.',
        'Focus on zero-allocation memory optimization, empirical benchmarks, and concurrency resilience.',
        'Focus on enterprise resilience, security post-mortems, failure modes, and production migration guardrails.'
      ];
      const selectedAngle = angleModifiers[angle % angleModifiers.length];

      const prompt = `You are a Principal Software Architect writing for MagnusMinds (a top enterprise engineering consultancy).
Write an in-depth, publication-ready technical blog post for this EXACT topic: "${cleanTitle}".

Specific Technical Angle: ${selectedAngle}

CRITICAL EDITORIAL RULES:
1. Deep Contextual Relevance: Directly address the specific words in the title (e.g. if topic has "php2shell", analyze web shells, PHP RCE vulnerabilities, and why compiled type-safe ASP.NET Core prevents this).
2. NO GENERIC TEMPLATES: Do NOT use numbered "1.", "2.", "3." headings and do NOT use boilerplate "Introduction" or "Conclusion" headings. Use organic, narrative, topic-specific headings.
3. Real Production Code Example: Complete, syntactically valid code block with inline comments demonstrating the production pattern.
4. Technical Comparison / Benchmark Table: Detailed markdown comparison table contrasting architectures or metrics.
5. Actionable Implementation Checklist: Bullet points of concrete production guardrails.

Format output as a single valid JSON object:
{
  "title": "${cleanTitle}",
  "category": "High-level category",
  "tags": ["Tag1", "Tag2", "Tag3", "Tag4", "Tag5"],
  "metaDescription": "Compelling 1-2 sentence SEO meta description (under 160 characters).",
  "visualText": "Clean formatted text starting at the hook (no asterisks or markdown hash symbols, ready for direct visual paste into CKEditor).",
  "sourceHtml": "Clean semantic HTML with <h2>, <p>, <pre><code class=\\"language-...\\">, <table>, <ul>, <li> ready for CKEditor Source view.",
  "imagePrompt": "Detailed 3D isometric infographic prompt for 16:9 widescreen blog banner."
}`;

      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
      const geminiResp = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.7,
            responseMimeType: 'application/json'
          }
        })
      });

      if (!geminiResp.ok) {
        const err = await geminiResp.json().catch(() => ({}));
        return new Response(JSON.stringify({
          error: err.error?.message || `Gemini returned HTTP ${geminiResp.status}`
        }), { status: geminiResp.status, headers: corsHeaders });
      }

      const data = await geminiResp.json();
      const rawJson = data.candidates?.[0]?.content?.parts?.[0]?.text;
      const blogData = JSON.parse(rawJson);

      return new Response(JSON.stringify({
        success: true,
        blog: blogData,
        generatedAt: new Date().toISOString()
      }), { status: 200, headers: corsHeaders });

    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
    }
  }
};
