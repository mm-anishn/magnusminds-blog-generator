# MagnusMinds Blog Generator (Serverless Cloud AI & Web Engine)

A high-performance technical blog generator and CMS publisher for MagnusMinds.

## Features
- **100% Dynamic Content (Way 1 Serverless AI)**: Powered by Gemini 2.0 Flash via serverless endpoints (`/api/generate` or Cloudflare Worker). Never repeats static templates.
- **Deep Technical Context**: Automatically generates domain-accurate architectures, code blocks, comparison tables, and checklists (handles complex topics like `After php2shell: why we build everything on .NET`, `SQL Server Performance Optimization`, etc.).
- **5-Style Vector & Infographic Banner Synthesizer**: 1200×630 HD covers matching the exact generated technical description.
- **CMS Ready**: 1-to-1 copy-paste fields for Title, Keyword, Meta Description, Categories, Tags, Slug, and CKEditor Description (Visual Text and Source HTML).

---

## Way 1: Serverless Deployment Options

### Option A: Cloudflare Workers (Free Forever, Zero Cold Starts)
1. In the repository root, set your free Google Gemini API key:
   ```bash
   npx wrangler secret put GEMINI_API_KEY
   # Paste your free key from https://aistudio.google.com/apikey
   ```
2. Deploy the worker:
   ```bash
   npx wrangler deploy
   ```
3. Copy your worker URL (e.g., `https://magnusminds-blog-api.<your-subdomain>.workers.dev`).
4. In `index.html` (or via the UI modal), paste this URL into **Way 1: Serverless Cloud API URL**.

### Option B: Vercel (1-Click Deployment)
1. Import this repository into [Vercel](https://vercel.com/new).
2. Add an environment variable in Vercel project settings:
   - `GEMINI_API_KEY`: Your free Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey).
3. Deploy! Vercel automatically serves the frontend and the `/api/generate` serverless API on the same domain.

---

## Team Sharing (Zero Setup for Coworkers)
Once your serverless API is deployed, share the link with your team:
```
https://mm-anishn.github.io/magnusminds-blog-generator/?api=https://your-worker.workers.dev
```
When coworkers open that link:
- The site **automatically binds to your serverless AI backend**.
- Coworkers need **zero accounts, zero keys, and zero technical setup**.
- Every time they click **Generate Blog** or **🔄 New Technical Angle**, it generates a completely unique, non-fixed description and banner image.
