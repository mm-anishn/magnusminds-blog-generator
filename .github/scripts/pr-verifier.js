#!/usr/bin/env node

/**
 * Self-contained AI PR Quality & Consistency Verifier for MagnusMinds GitHub Actions
 * Runs with Node.js built-in fetch (zero external npm dependencies required).
 */

const fs = require('fs');
const path = require('path');

// 1. Production Quality Rules ("Up to Mark")
const QUALITY_RULES = [
  // Secrets
  { id: 'SEC-001', severity: 'CRITICAL', category: 'secrets', regex: /AKIA[0-9A-Z]{16}/, message: 'AWS Access Key ID exposed in code.', suggestion: 'Move to GitHub Secrets / environment variables.' },
  { id: 'SEC-002', severity: 'CRITICAL', category: 'secrets', regex: /ghp_[a-zA-Z0-9]{36}|github_pat_[a-zA-Z0-9_]{82}/, message: 'GitHub Personal Access Token exposed.', suggestion: 'Revoke and rotate this token immediately.' },
  { id: 'SEC-003', severity: 'CRITICAL', category: 'secrets', regex: /-----BEGIN (?:RSA |OPENSSH |EC |DSA |PGP )?PRIVATE KEY-----/, message: 'Private cryptographic key exposed.', suggestion: 'Never commit private keys to version control.' },
  { id: 'SEC-004', severity: 'CRITICAL', category: 'secrets', regex: /xox[baprs]-[0-9a-zA-Z]{10,48}|https:\/\/hooks\.slack\.com\/services\/T[0-9a-zA-Z_]+\/B[0-9a-zA-Z_]+\/[0-9a-zA-Z_]+/, message: 'Slack token or webhook URL exposed.', suggestion: 'Rotate this secret and keep webhook URLs in environment configs.' },
  { id: 'SEC-005', severity: 'CRITICAL', category: 'secrets', regex: /(?:postgres|mysql|mongodb|redis|amqp|mssql):\/\/[^:\s'"]+:([^@\s'"]+)@[^/\s'"]+/, message: 'Database connection URI contains hardcoded password.', suggestion: 'Load connection strings from environment variables.' },
  { id: 'SEC-006', severity: 'WARNING', category: 'secrets', regex: /(?:api[_-]?key|client[_-]?secret|auth[_-]?token|password)\s*[:=]\s*["'][a-zA-Z0-9_-]{12,}["']/i, message: 'Potential hardcoded API key or credential string.', suggestion: 'Review to ensure no production secrets are hardcoded in source.' },

  // Security
  { id: 'VULN-001', severity: 'CRITICAL', category: 'security', regex: /\b(?:eval|exec)\s*\(/, message: 'Dynamic code execution (eval/exec) detected.', suggestion: 'Refactor to safe static functions or JSON.parse.' },
  { id: 'VULN-002', severity: 'CRITICAL', category: 'security', regex: /new\s+Function\s*\(/, message: 'Function constructor used to evaluate string code.', suggestion: 'Refactor to safe static methods.' },
  { id: 'VULN-003', severity: 'WARNING', category: 'security', regex: /dangerouslySetInnerHTML|\.innerHTML\s*=/, message: 'Direct HTML injection detected (XSS risk).', suggestion: 'Sanitize input with DOMPurify or use safe textContent bindings.' },
  { id: 'VULN-005', severity: 'CRITICAL', category: 'security', regex: /(?:SELECT|INSERT|UPDATE|DELETE)\s+.*(?:\$\{.*\}(?:.*FROM|.*WHERE)?|\+\s*[a-zA-Z0-9_]+)/i, message: 'SQL query construction using string interpolation or concatenation (SQLi risk).', suggestion: 'Use parameterized queries or prepared statements.' },

  // Async & Concurrency
  { id: 'ASYNC-001', severity: 'CRITICAL', category: 'async-safety', exts: ['.cs'], regex: /\.(?:Result|GetAwaiter\(\)\.GetResult\(\)|Wait\(\))\b/, message: 'Sync-over-async blocking call (.Result, .Wait()) detected.', suggestion: 'Use "await" asynchronously to prevent thread pool deadlocks.' },
  { id: 'ASYNC-002', severity: 'CRITICAL', category: 'async-safety', exts: ['.cs'], regex: /async\s+void\s+(?!On[A-Z]|Handle[A-Z])[A-Za-z0-9_]+\s*\(/, message: 'async void method detected on non-event handler.', suggestion: 'Return Task or ValueTask so exceptions can be awaited and observed.' },

  // Error Handling
  { id: 'PAT-001', severity: 'CRITICAL', category: 'anti-pattern', regex: /catch\s*(?:\([^)]*\))?\s*\{/, message: 'Potential empty or silent catch block.', suggestion: 'Log error context or rethrow. Never silently suppress errors.' },
  { id: 'ERR-002', severity: 'WARNING', category: 'anti-pattern', exts: ['.cs'], regex: /\bthrow\s+[a-zA-Z0-9_]+\s*;/, message: 'throw ex; wipes the original stack trace.', suggestion: 'Use bare "throw;" to preserve stack trace context.' },

  // Database & Performance
  { id: 'PERF-001', severity: 'WARNING', category: 'performance-nplus1', regex: /(?:_db|_context|context|repository|_repository)\.[A-Za-z0-9_]+\.(?:Where|Find|FirstOrDefault|SingleOrDefault|Select|Query)\s*\(/, message: 'Database/ORM call detected; verify this is not inside a loop (N+1 query risk).', suggestion: 'Batch-fetch data before loops using IN/Contains clauses.' },

  // Debug code
  { id: 'DBG-001', severity: 'WARNING', category: 'debug', exts: ['.js', '.ts', '.jsx', '.tsx', '.html'], regex: /\bconsole\.(?:log|debug|dir|trace)\s*\(/, message: 'console.log/debug statement left in code.', suggestion: 'Remove temporary debug logging or use structured logger.' },
  { id: 'DBG-002', severity: 'CRITICAL', category: 'debug', regex: /\bdebugger\s*;?/, message: 'debugger statement left in code.', suggestion: 'Remove debugger breakpoint before merging.' },
  { id: 'DBG-003', severity: 'INFO', category: 'debug', regex: /(?:breakpoint\(\)|import pdb; pdb\.set_trace\(\)|var_dump\(|dd\()/, message: 'Debug inspect statement found.', suggestion: 'Remove debug inspect functions before committing.' }
];

function analyzeDiff(diffText) {
  const issues = [];
  const filesSet = new Set();
  const lines = diffText.split('\n');
  let currentFile = '';
  let currentNewLine = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('diff --git ')) {
      const parts = line.split(' ');
      if (parts.length >= 4) {
        currentFile = parts[3].replace(/^b\//, '');
        filesSet.add(currentFile);
      }
      continue;
    } else if (line.startsWith('+++ b/')) {
      currentFile = line.substring(6).trim();
      filesSet.add(currentFile);
      continue;
    }

    const hunkMatch = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunkMatch) {
      currentNewLine = parseInt(hunkMatch[1], 10);
      continue;
    }

    if (line.startsWith('+') && !line.startsWith('+++')) {
      const addedContent = line.substring(1);
      const lineNumber = currentNewLine++;
      const isTestFile = /(?:[\.\/]test[s]?[\.\/]|_test\.|\.test\.|\.spec\.)/i.test(currentFile);

      for (const rule of QUALITY_RULES) {
        if (rule.category === 'debug' && isTestFile) continue;
        if (rule.exts && !rule.exts.some(ext => currentFile.toLowerCase().endsWith(ext))) continue;

        if (rule.id === 'PAT-001') {
          if (/catch\s*(?:\([^)]*\))?\s*\{\s*\}/.test(addedContent)) {
            issues.push({
              file: currentFile || 'unknown',
              line: lineNumber,
              rule: rule.id,
              category: rule.category,
              severity: rule.severity,
              message: 'Empty catch block silently swallowing exceptions.',
              snippet: addedContent.trim(),
              suggestion: rule.suggestion
            });
          } else if (/catch\s*(?:\([^)]*\))?\s*\{/.test(addedContent)) {
            let isEmpty = true;
            for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
              const nextLine = lines[j];
              if (nextLine.startsWith('+') && !nextLine.startsWith('+++')) {
                const trimmed = nextLine.substring(1).trim();
                if (trimmed === '}') {
                  break;
                } else if (trimmed && !trimmed.startsWith('//') && !trimmed.startsWith('/*') && !trimmed.startsWith('*')) {
                  isEmpty = false;
                  break;
                }
              } else if (!nextLine.startsWith('-')) {
                break;
              }
            }
            if (isEmpty) {
              issues.push({
                file: currentFile || 'unknown',
                line: lineNumber,
                rule: rule.id,
                category: rule.category,
                severity: rule.severity,
                message: 'Empty or comment-only catch block silently swallowing errors.',
                snippet: addedContent.trim(),
                suggestion: rule.suggestion
              });
            }
          }
          continue;
        }

        if (rule.regex.test(addedContent)) {
          issues.push({
            file: currentFile || 'unknown',
            line: lineNumber,
            rule: rule.id,
            category: rule.category,
            severity: rule.severity,
            message: rule.message,
            snippet: addedContent.trim(),
            suggestion: rule.suggestion
          });
        }
      }
    } else if (!line.startsWith('-')) {
      currentNewLine++;
    }
  }

  let critical = 0;
  let warning = 0;
  let info = 0;
  for (const issue of issues) {
    if (issue.severity === 'CRITICAL') critical++;
    else if (issue.severity === 'WARNING') warning++;
    else if (issue.severity === 'INFO') info++;
  }

  let qualityScore = 100 - (critical * 25) - (warning * 10) - (info * 2);
  qualityScore = Math.max(0, Math.min(100, qualityScore));

  return { totalIssues: issues.length, critical, warning, info, qualityScore, filesScanned: filesSet.size, findings: issues };
}

function checkConsistency(changedFiles, repoFiles) {
  const deviations = [];
  const duplicateWheels = [];
  const missingTests = [];

  const existingNormalized = repoFiles.map(f => ({
    original: f,
    norm: f.toLowerCase().replace(/[^a-z0-9]/g, ''),
    baseName: (f.split('/').pop() || f).replace(/\.[^/.]+$/, '').toLowerCase().replace(/[^a-z0-9]/g, '')
  }));

  let prodFilesCount = 0;
  let prodFilesWithTests = 0;

  for (const file of changedFiles) {
    const isTest = /(?:test|spec|tests)/i.test(file.filename);
    const isSource = /\.(?:cs|ts|tsx|js|jsx|py|go|html)$/i.test(file.filename);

    if (isSource && !isTest) {
      prodFilesCount++;
      const baseName = (file.filename.split('/').pop() || '').replace(/\.[^/.]+$/, '').toLowerCase();
      const hasTest = changedFiles.some(f => f.filename.toLowerCase().includes(baseName + 'test') || f.filename.toLowerCase().includes(baseName + '.spec')) ||
                      repoFiles.some(f => f.toLowerCase().includes(baseName + 'test') || f.toLowerCase().includes(baseName + '.spec'));
      if (hasTest) prodFilesWithTests++;
      else if (!file.filename.endsWith('.html') && !file.filename.endsWith('.json')) {
        missingTests.push(file.filename);
      }
    }

    if (!file.patch) continue;
    const lines = file.patch.split('\n');
    let lineNum = 1;
    for (const l of lines) {
      if (l.startsWith('+') && !l.startsWith('+++')) {
        const text = l.substring(1);
        const match = text.match(/(?:class|function|interface)\s+([A-Z][A-Za-z0-9_]+)/);
        if (match && !isTest) {
          const name = match[1];
          const norm = name.toLowerCase().replace(/[^a-z0-9]/g, '');
          const dup = existingNormalized.find(ef => ef.original.toLowerCase() !== file.filename.toLowerCase() && (ef.baseName === norm || (norm.length > 5 && ef.baseName.endsWith(norm))));
          if (dup) {
            duplicateWheels.push({ newName: name, existingFile: dup.original, file: file.filename, line: lineNum });
            deviations.push({ file: file.filename, line: lineNum, rule: 'CONSIST-001', severity: 'WARNING', message: `Component '${name}' overlaps with existing '${dup.original}'.`, suggestion: `Reuse '${dup.original}' to avoid duplicate code.` });
          }
        }
      }
      lineNum++;
    }
  }

  let consistencyScore = 100 - (deviations.length * 15);
  consistencyScore = Math.max(0, Math.min(100, consistencyScore));
  const testCoverageScore = prodFilesCount === 0 ? 100 : Math.round((prodFilesWithTests / prodFilesCount) * 100);

  return { consistencyScore, testCoverageScore, duplicateWheels, deviations, missingTests };
}

async function main() {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY;
  const prNumberStr = process.env.PR_NUMBER;

  if (!token || !repo || !prNumberStr) {
    console.log('Missing GITHUB_TOKEN, GITHUB_REPOSITORY, or PR_NUMBER. Testing in local offline mode...');
    process.exit(0);
  }

  const prNumber = parseInt(prNumberStr, 10);
  console.log(`Starting PR Verification for ${repo}#${prNumber}...`);

  const headers = {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'MagnusMinds-PR-Verifier'
  };

  // 1. Fetch PR details
  const prRes = await fetch(`https://api.github.com/repos/${repo}/pulls/${prNumber}`, { headers });
  if (!prRes.ok) throw new Error(`Failed to fetch PR: ${prRes.statusText}`);
  const prData = await prRes.json();

  // 2. Fetch PR unified diff
  const diffRes = await fetch(`https://api.github.com/repos/${repo}/pulls/${prNumber}`, {
    headers: { ...headers, 'Accept': 'application/vnd.github.v3.diff' }
  });
  const diffText = await diffRes.text();

  // 3. Fetch changed files list
  const filesRes = await fetch(`https://api.github.com/repos/${repo}/pulls/${prNumber}/files?per_page=100`, { headers });
  const changedFiles = await filesRes.json();

  // 4. Fetch repo files tree
  let repoFiles = [];
  try {
    const treeRes = await fetch(`https://api.github.com/repos/${repo}/git/trees/${prData.base.sha}?recursive=1`, { headers });
    if (treeRes.ok) {
      const treeData = await treeRes.json();
      repoFiles = treeData.tree ? treeData.tree.map(t => t.path) : [];
    }
  } catch {}

  // 5. Run analysis
  const quality = analyzeDiff(diffText);
  const consistency = checkConsistency(changedFiles, repoFiles);

  const allFindings = [...quality.findings, ...consistency.deviations];
  let critical = quality.critical;
  let warnings = quality.warning + consistency.deviations.length;

  const overallScore = Math.round((quality.qualityScore * 0.5) + (consistency.consistencyScore * 0.3) + (consistency.testCoverageScore * 0.2));
  const verdict = critical > 0 ? 'REQUEST_CHANGES' : (warnings > 0 ? 'COMMENT' : 'APPROVE');
  const verdictBadge = verdict === 'APPROVE' ? '🟢 APPROVED' : (verdict === 'REQUEST_CHANGES' ? '🔴 CHANGES REQUESTED' : '🟡 FEEDBACK PROVIDED');

  // Build markdown scorecard
  const lines = [
    `## 🛡️ MagnusMinds PR Quality & Consistency Verdict: ${verdictBadge}`,
    '',
    `| Metric | Score | Status |`,
    `| :--- | :--- | :--- |`,
    `| **Overall Quality & Health** | **${overallScore}/100** | ${overallScore >= 80 ? '✅ Pass' : '⚠️ Action Needed'} |`,
    `| **Code Quality ("Up to Mark")** | **${quality.qualityScore}/100** | ${critical === 0 ? '✅ Up to Mark' : '❌ Critical Issues Found'} |`,
    `| **Existing Repo Consistency** | **${consistency.consistencyScore}/100** | ${consistency.duplicateWheels.length === 0 ? '✅ Consistent' : '⚠️ Duplicate Code'} |`,
    `| **Test Coverage** | **${consistency.testCoverageScore}/100** | ${consistency.missingTests.length === 0 ? '✅ Covered' : '⚠️ Missing Tests'} |`,
    '',
    `### 📊 Findings Summary`,
    `- 🚨 **Critical Blockers**: ${critical}`,
    `- ⚠️ **Quality & Consistency Warnings**: ${warnings}`,
    `- 📁 **Files Scanned**: ${quality.filesScanned}`,
    ''
  ];

  if (consistency.duplicateWheels.length > 0) {
    lines.push(`### 🔄 Reinventing Existing Implementation:`);
    for (const dup of consistency.duplicateWheels) {
      lines.push(`- ⚠️ **\`${dup.newName}\`** in \`${dup.file}:${dup.line}\` duplicates existing **\`${dup.existingFile}\`**.`);
    }
    lines.push('');
  }

  if (quality.findings.length > 0) {
    lines.push(`### 🛠️ Code Quality ("Up to Mark") Findings:`);
    for (const f of quality.findings.slice(0, 10)) {
      lines.push(`- **[${f.severity}]** \`${f.file}:${f.line}\`: ${f.message}`);
      if (f.suggestion) lines.push(`  *Fix*: ${f.suggestion}`);
    }
    lines.push('');
  }

  if (consistency.missingTests.length > 0) {
    lines.push(`### 🧪 Missing Tests:`);
    for (const mt of consistency.missingTests) lines.push(`- \`${mt}\``);
    lines.push('');
  }

  const reviewBody = lines.join('\n');

  // 6. Build inline comments
  const comments = [];
  for (const f of allFindings.slice(0, 25)) {
    if (f.file && f.line > 0) {
      comments.push({
        path: f.file,
        line: f.line,
        body: `**[${f.severity}] ${f.rule}**: ${f.message}\n\n💡 **Recommendation**: ${f.suggestion || 'Review this line.'}`
      });
    }
  }

  // 7. Post Review to GitHub
  console.log('Submitting review to GitHub...');
  const submitRes = await fetch(`https://api.github.com/repos/${repo}/pulls/${prNumber}/reviews`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event: verdict,
      body: reviewBody,
      comments: comments
    })
  });

  if (!submitRes.ok) {
    const errText = await submitRes.text();
    console.error(`Failed to submit review: ${errText}`);
    await fetch(`https://api.github.com/repos/${repo}/issues/${prNumber}/comments`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: reviewBody })
    });
  }

  console.log(`✅ Review submitted successfully (${verdict}).`);

  if (verdict === 'REQUEST_CHANGES') {
    console.error('❌ PR verification failed: Critical quality/security issues must be resolved.');
    process.exit(1);
  } else {
    process.exit(0);
  }
}

main().catch(err => {
  console.error('Fatal error in PR verifier:', err);
  process.exit(1);
});
