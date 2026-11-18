// Vercel Serverless Function: /api/generate
// Handles real-time AI generation of publication-ready MagnusMinds blogs

export default async function handler(req, res) {
  // 1. Enable CORS for GitHub Pages and any team domain
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, X-Gemini-Key'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  try {
    const { topic, angle = 0 } = req.body || {};
    if (!topic || typeof topic !== 'string' || !topic.trim()) {
      return res.status(400).json({ error: 'Missing required field: "topic"' });
    }

    const cleanTitle = topic.replace(/\s*\|\s*MagnusMinds$/i, '').trim();

    // 2. Read Gemini API key from environment variable (or optional header override)
    const apiKey = process.env.GEMINI_API_KEY || req.headers['x-gemini-key'];
    if (!apiKey) {
      return res.status(500).json({
        error: 'Serverless AI API key is not configured. Please set GEMINI_API_KEY in Vercel / Cloudflare environment variables.'
      });
    }

    const angleModifiers = [
      'Focus on deep architectural design, runtime mechanics, and foundational concepts.',
      'Focus on zero-allocation memory optimization, empirical benchmarks, and concurrency resilience.',
      'Focus on enterprise resilience, security post-mortems, failure modes, and production migration guardrails.'
    ];
    const selectedAngle = angleModifiers[angle % angleModifiers.length];

    const systemPrompt = `You are a Principal Software Architect writing for MagnusMinds (a top enterprise engineering consultancy).
Write an in-depth, publication-ready technical blog post for this EXACT topic: "${cleanTitle}".

Specific Technical Angle: ${selectedAngle}

CRITICAL EDITORIAL RULES:
1. Deep Contextual Relevance: You MUST directly address the specific words in the title. For example, if the topic contains "After php2shell: why we build everything on .NET", you must analyze what php2shell is (arbitrary file upload, PHP web shells, RCE vulnerabilities), why PHP's execution model allowed it, and why compiled type-safe ASP.NET Core with strict Kestrel pipeline, memory isolation, and defense-in-depth eliminates this attack vector.
2. NO GENERIC TEMPLATES: Do NOT use numbered "1.", "2.", "3." headings and do NOT use boilerplate "Introduction" or "Conclusion" headings. Use organic, narrative, topic-specific headings (e.g. "The Catalyst: Anatomy of the php2shell Breach", "Why Interpreted Scripting Runtimes Crack Under Attack", "The Architectural Remedy in .NET", etc.).
3. Real Production Code Example: Provide a complete, syntactically valid code block with inline comments demonstrating the production pattern or defense.
4. Technical Comparison / Benchmark Table: Provide a markdown comparison table contrasting architectures, performance metrics, or security postures.
5. Actionable Implementation Checklist: Provide bullet points of concrete production guardrails.

Format your entire response as a single valid JSON object with EXACTLY these keys:
{
  "title": "${cleanTitle}",
  "category": "High-level category (e.g. Cybersecurity, .NET Core, Backend Architecture, Database Engine)",
  "tags": ["Tag1", "Tag2", "Tag3", "Tag4", "Tag5"],
  "metaDescription": "Compelling 1-2 sentence SEO meta description (under 160 characters) directly addressing ${cleanTitle}.",
  "visualText": "Clean, formatted plain text starting at the hook (no asterisks or markdown hash symbols, suitable for direct pasting into CKEditor Visual view).",
  "sourceHtml": "Clean, semantic HTML with <h2>, <p>, <pre><code class=\\"language-...\\">, <table>, <ul>, <li> ready for CKEditor Source view.",
  "imagePrompt": "Detailed 3D isometric infographic prompt for 16:9 widescreen blog banner matching this exact description."
}`;

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

    const geminiResp = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: systemPrompt }] }],
        generationConfig: {
          temperature: 0.7,
          responseMimeType: 'application/json'
        }
      })
    });

    if (!geminiResp.ok) {
      const err = await geminiResp.json().catch(() => ({}));
      return res.status(geminiResp.status).json({
        error: err.error?.message || `Gemini API returned status ${geminiResp.status}`
      });
    }

    const data = await geminiResp.json();
    const rawJson = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawJson) {
      return res.status(502).json({ error: 'Gemini returned empty response.' });
    }

    const blogData = JSON.parse(rawJson);
    return res.status(200).json({
      success: true,
      blog: blogData,
      generatedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('Serverless error in /api/generate:', error);
    return res.status(500).json({
      error: error.message || 'Internal server error while generating blog.'
    });
  }
}
