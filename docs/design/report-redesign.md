# Report System Redesign

> Created: 2026-03-10  
> Status: Design Phase  
> Author: Worker 4 (Report System)  
> Related: [V3 Upgrade Plan](../V3-UPGRADE-PLAN.md)

---

## 一、Design Principles

| Principle | Description |
|-----------|-------------|
| **Progressive Disclosure** | Overview → File → Issue → Reference. Users drill down, never drown. |
| **Information Density Balance** | Scores + grades at a glance; details on demand via expand/collapse. |
| **Offline First** | HTML report is a single self-contained file. Zero external deps at runtime. |
| **Themeable** | Dark/light mode via CSS custom properties. Respect `prefers-color-scheme`. |
| **Attribution-Centric** | Every issue links to root cause category and community references. |
| **Platform-Native** | Each format leverages its platform's strengths (terminal colors, MD details, HTML interactivity). |

### Design References

| Reference | Borrowed Concepts |
|-----------|-------------------|
| **Google Lighthouse** | Single-file HTML, donut gauge score, category breakdown, expandable audits |
| **Istanbul Coverage** | File tree with color-coded bars, sortable columns, source drill-down |
| **SonarQube** | Quality gate pass/fail, dimension cards, severity badges, trend sparklines |
| **shields.io** | Badge SVG generation (`badge-maker` NPM), color scales, label-value format |
| **ESLint HTML Formatter** | Issue-per-file grouping, severity icons, rule links |

### Color System

| Entity | Color | Hex |
|--------|-------|-----|
| Grade A (90-100) | 🟢 Green | `#22c55e` |
| Grade B (80-89) | 🔵 Blue | `#3b82f6` |
| Grade C (70-79) | 🟡 Yellow | `#eab308` |
| Grade D (60-69) | 🟠 Orange | `#f97316` |
| Grade F (0-59) | 🔴 Red | `#ef4444` |
| Severity Critical | Red | `#ef4444` |
| Severity High | Orange | `#f97316` |
| Severity Medium | Yellow | `#eab308` |
| Severity Low | Blue | `#3b82f6` |
| Severity Info | Gray | `#6b7280` |

---

## 二、HTML Report Design

### 2.1 Page Structure (ASCII Wireframe)

```
┌────────────────────────────────────────────────────────────────┐
│  🔬 AI Code Validator Report                   ☀️/🌙 Toggle   │
├────────────────────────────────────────────────────────────────┤
│                     HEADER SECTION                             │
│  ┌──────────┐  ┌─────────────────────────────────────────┐    │
│  │  ╭────╮  │  │ Overall Score: 87 / 100                  │    │
│  │  │ 87 │  │  │ Grade: A   ✅ PASSED                    │    │
│  │  │  A │  │  │ Files: 12 scanned, 10 passed, 2 failed  │    │
│  │  ╰────╯  │  │ Issues: 7 (2 high, 5 medium)            │    │
│  │  Gauge   │  │ Generated: 2026-03-10 19:30 CST          │    │
│  └──────────┘  └─────────────────────────────────────────┘    │
│                                                                │
├──────────────── DIMENSION BREAKDOWN ──────────────────────────┤
│                                                                │
│  ┌──────────────────────────────────┐  ┌────┐┌────┐┌────┐    │
│  │       Radar Chart (SVG)          │  │ C  ││ Co ││ Cs │    │
│  │                                  │  │28  ││23  ││18  │    │
│  │        Completeness 28/30        │  │/30 ││/25 ││/25 │    │
│  │              ╱╲                  │  │93% ││92% ││72% │    │
│  │   Concise   ╱  ╲  Coherence     │  │████││████││███ │    │
│  │    18/20   ╱    ╲   23/25       │  └────┘└────┘└────┘    │
│  │            ╲    ╱               │  ┌────┐                 │
│  │             ╲  ╱                │  │ Cn │                 │
│  │         Consistency 18/25       │  │18  │                 │
│  │                                  │  │/20 │                 │
│  └──────────────────────────────────┘  │90% │                 │
│                                        └────┘                 │
├──────────────── ATTRIBUTION SUMMARY ──────────────────────────┤
│                                                                │
│  🧠 Hallucination (2)    ⏰ Stale Knowledge (1)              │
│  🔗 Context Loss (2)     🛡️ Security (1)                     │
│  📋 Incomplete Impl (1)                                       │
│                                                                │
├──────────────── FILE RESULTS ─────────────────────────────────┤
│                                                                │
│  ▶ src/auth/login.ts         82/100 🔵B   3 issues           │
│  ▶ src/api/handler.ts        91/100 🟢A   1 issue            │
│  ▼ src/utils/format.ts       67/100 🟠D   3 issues           │
│    ├─ Completeness ████████████████░░░░ 24/30                 │
│    ├─ Coherence    ██████████████░░░░░░ 18/25                 │
│    ├─ Consistency  ██████████░░░░░░░░░░ 13/25                 │
│    └─ Conciseness  ████████████████░░░░ 12/20                 │
│    ┌──────────────────────────────────────────────┐           │
│    │ 🔴 HIGH: Hallucinated API crypto.hash()     │           │
│    │ Line 42 · 🧠 Hallucination                  │           │
│    │ Fix: Use crypto.createHash() instead         │           │
│    │ 📎 nodejs.org/api/crypto · GH #xxx          │           │
│    ├──────────────────────────────────────────────┤           │
│    │ 🟡 MED: Empty catch block                   │           │
│    │ Line 58 · 📋 Incomplete Implementation      │           │
│    └──────────────────────────────────────────────┘           │
│                                                                │
├──────────────── FIX PRIORITY MATRIX ──────────────────────────┤
│  #  Issue               File          Sev   Effort  Auto-fix  │
│  1  Hallucinated API    format.ts:42  High  Trivial ✅        │
│  2  Hardcoded secret    config.ts:15  High  Small   ✅        │
│  3  Empty catch block   format.ts:58  Med   Small   ❌        │
│                                                                │
├──────────────── FOOTER ───────────────────────────────────────┤
│  Powered by AI Code Validator v0.5.0                           │
│  github.com/raye-deng/ai-code-validator                        │
└────────────────────────────────────────────────────────────────┘
```

### 2.2 Score Visualization

#### Donut Gauge (Overall Score)

Lighthouse-inspired circular arc gauge. Pure SVG.

- Arc from 0° to 360° represents 0-100. `stroke-dashoffset = circumference × (1 - score/100)`.
- Center shows numeric score + grade letter.
- Arc color = grade color. Animated on page load via CSS transition.

```svg
<svg viewBox="0 0 120 120" class="score-gauge">
  <circle cx="60" cy="60" r="50" fill="none" stroke="var(--border)" stroke-width="8"/>
  <circle cx="60" cy="60" r="50" fill="none"
          stroke="#22c55e" stroke-width="8"
          stroke-dasharray="314.16" stroke-dashoffset="40.84"
          stroke-linecap="round" transform="rotate(-90 60 60)"/>
  <text x="60" y="55" text-anchor="middle" font-size="28" font-weight="700"
        fill="var(--text-primary)">87</text>
  <text x="60" y="72" text-anchor="middle" font-size="12"
        fill="var(--text-secondary)">Grade A</text>
</svg>
```

> `stroke-dashoffset` for score 87 = `314.16 × (1 - 0.87) = 40.84`

#### Radar Chart (Dimensions)

Pure SVG polygon chart for N scoring dimensions:

- Concentric grid polygons at 25%, 50%, 75%, 100% opacity
- Axis lines from center to each vertex
- Filled polygon (30% opacity) for actual scores
- Dots at score vertices; labels outside

```typescript
function radarSVG(dims: { name: string; score: number; max: number }[], size = 280): string {
  const cx = size / 2, cy = size / 2, r = size * 0.35, n = dims.length;
  const pt = (i: number, s: number) => {
    const a = (2 * Math.PI * i) / n - Math.PI / 2;
    return [cx + r * s * Math.cos(a), cy + r * s * Math.sin(a)];
  };
  const poly = (s: number) => dims.map((_, i) => pt(i, s).join(',')).join(' ');

  const grids = [.25, .5, .75, 1].map(s =>
    `<polygon points="${poly(s)}" fill="none" stroke="var(--grid)" stroke-width=".5"/>`).join('');
  const axes = dims.map((_, i) =>
    `<line x1="${cx}" y1="${cy}" x2="${pt(i,1)[0]}" y2="${pt(i,1)[1]}" stroke="var(--grid)" stroke-width=".5"/>`).join('');
  const data = dims.map((d, i) => pt(i, d.score / d.max).join(',')).join(' ');
  const dots = dims.map((d, i) => {
    const [x, y] = pt(i, d.score / d.max);
    return `<circle cx="${x}" cy="${y}" r="4" fill="var(--grade-color)"/>`;
  }).join('');
  const labels = dims.map((d, i) => {
    const [x, y] = pt(i, 1.2);
    return `<text x="${x}" y="${y}" text-anchor="middle" font-size="11" fill="var(--text-secondary)">${d.name} ${d.score}/${d.max}</text>`;
  }).join('');

  return `<svg viewBox="0 0 ${size} ${size}">${grids}${axes}
    <polygon points="${data}" fill="var(--grade-color)" fill-opacity=".25" stroke="var(--grade-color)" stroke-width="2"/>
    ${dots}${labels}</svg>`;
}
```

#### Chart Technology Decision

| Approach | Size | Offline | Theming | Verdict |
|----------|------|---------|---------|---------|
| **Pure SVG** | **0 KB** | ✅ | Full CSS vars | **✅ Chosen** |
| Chart.js inline | ~65 KB | ✅ | Plugin API | ❌ Too heavy |
| D3 micro-bundle | ~30 KB | ✅ | Full control | ❌ Overkill |

Two chart types (donut + radar) = simple polygon/arc math. No library justified.

### 2.3 Issue Attribution Display

#### Attribution Summary Cards

Grid layout, one card per AI defect category:

```
┌────────────────────┐ ┌────────────────────┐ ┌────────────────────┐
│ 🧠 Hallucination   │ │ ⏰ Stale Knowledge │ │ 🔗 Context Loss    │
│ 2 issues · 2 High  │ │ 1 issue · 1 Med    │ │ 2 issues · 2 Med  │
│ Non-existent APIs  │ │ Deprecated APIs    │ │ Cross-scope breaks │
└────────────────────┘ └────────────────────┘ └────────────────────┘
```

Each card links down to the matching issues in the file list.

#### Issue Detail Card

Each issue within an expanded file section shows:

1. **Severity badge** (colored) + **title** + **line number**
2. **Category badge** + **root cause** text
3. **Code snippet** (3-5 lines, error line highlighted with `<mark>`)
4. **Fix suggestion** + effort estimate + auto-fixable flag
5. **Reference links** (GitHub issues, docs, SO posts)

#### Fix Priority Matrix

Sortable table at bottom. Columns: `#`, Issue, File:Line, Category, Severity, Effort, Auto-fix.

Sorting logic: default = severity DESC, effort ASC (highest impact, lowest effort first).

### 2.4 Technical Implementation

#### Single-File Architecture

```
report.html (target < 50 KB for 20-file report)
├── <style>     ~5 KB minified (reset + themes + components)
├── <body>      ~varies (semantic HTML + inline SVG charts)
└── <script>    ~3 KB minified
    ├── REPORT_DATA = { ... }   // JSON blob from AggregateScore
    ├── expand/collapse logic
    ├── theme toggle
    ├── table sort
    └── mini code highlighter (~1.5 KB)
```

#### Theme System

CSS custom properties with `prefers-color-scheme` auto-detection + manual override via `data-theme`:

```css
:root {
  --bg: #fff; --bg2: #f8fafc; --card: #fff;
  --t1: #0f172a; --t2: #64748b; --bd: #e2e8f0; --grid: #cbd5e1;
}
@media (prefers-color-scheme: dark) {
  :root { --bg: #0f172a; --bg2: #1e293b; --card: #1e293b;
    --t1: #f1f5f9; --t2: #94a3b8; --bd: #334155; --grid: #475569; }
}
[data-theme="dark"] { /* same dark overrides */ }
[data-theme="light"] { /* same light overrides */ }
```

#### Code Highlighting (Minimal Tokenizer)

~1.5 KB minified. Only highlights keywords, strings, comments, numbers — sufficient for 3-5 line snippets.

```typescript
const RULES: [RegExp, string][] = [
  [/\/\/.*$/gm, 'cmt'],            // line comments
  [/\/\*[\s\S]*?\*\//g, 'cmt'],    // block comments
  [/(["'`])(?:(?!\1|\\).|\\.)*\1/g, 'str'],  // strings
  [/\b(const|let|var|function|return|if|else|import|export|class|async|await|try|catch)\b/g, 'kw'],
  [/\b\d+\.?\d*\b/g, 'num'],
];
function hl(code: string): string {
  let h = escapeHtml(code);
  for (const [re, c] of RULES) h = h.replace(re, `<span class="hl-${c}">$&</span>`);
  return h;
}
```

#### Report Generator Integration

```typescript
// packages/core/src/scorer/report.ts — extend ReportFormat
export type ReportFormat = 'terminal' | 'json' | 'markdown' | 'gitlab-report' | 'html';

// New class in packages/core/src/scorer/html-report.ts
export class HtmlReportGenerator {
  generate(result: AggregateScore): string {
    return `<!DOCTYPE html>
<html lang="en" data-theme="auto">
<head><meta charset="utf-8"><title>AICV Report</title>
<style>${this.css()}</style></head>
<body>
  ${this.header(result)}
  ${this.radar(result)}
  ${this.dimensionCards(result)}
  ${this.attributionSummary(result)}
  ${this.fileList(result)}
  ${this.priorityMatrix(result)}
  ${this.footer()}
  <script>const D=${JSON.stringify(result)};${this.js()}</script>
</body></html>`;
  }
}
```

---

## 三、Embed Widget Design

### 3.1 Badge SVG Template

shields.io-style badge generated as SVG. Two-part label: left = "AI Code Quality", right = score + grade.

#### SVG Template

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="230" height="20">
  <linearGradient id="b" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <!-- Left side: label -->
  <rect rx="3" width="230" height="20" fill="#555"/>
  <!-- Right side: value -->
  <rect rx="3" x="120" width="110" height="20" fill="#22c55e"/>
  <!-- Overlay gradient -->
  <rect rx="3" width="230" height="20" fill="url(#b)"/>
  <!-- Label text -->
  <g fill="#fff" text-anchor="middle" font-family="DejaVu Sans,sans-serif" font-size="11">
    <text x="60" y="15" fill="#010101" fill-opacity=".3">AI Code Quality</text>
    <text x="60" y="14">AI Code Quality</text>
    <text x="175" y="15" fill="#010101" fill-opacity=".3">87/100 Grade A</text>
    <text x="175" y="14">87/100 Grade A</text>
  </g>
</svg>
```

#### Dynamic Badge Generation

```typescript
// packages/core/src/badge/generator.ts

interface BadgeOptions {
  score: number;
  grade: string;
  style?: 'flat' | 'flat-square' | 'for-the-badge' | 'plastic';
  label?: string;
  color?: string; // auto-determined from grade if not specified
}

function generateBadgeSVG(opts: BadgeOptions): string {
  const color = opts.color ?? gradeToColor(opts.grade);
  const label = opts.label ?? 'AI Code Quality';
  const value = `${opts.score}/100 Grade ${opts.grade}`;
  // ... SVG template interpolation
}

function gradeToColor(grade: string): string {
  const map: Record<string, string> = {
    A: '#22c55e', B: '#3b82f6', C: '#eab308', D: '#f97316', F: '#ef4444',
  };
  return map[grade] ?? '#6b7280';
}
```

#### Markdown Embedding

```markdown
<!-- Static badge (generated at build time, committed to repo) -->
![AI Code Quality](https://img.shields.io/badge/AI_Code_Quality-87%2F100_Grade_A-22c55e)

<!-- Dynamic badge (via API endpoint) -->
![AI Code Quality](https://codes.evallab.ai/badge/project-id.svg)

<!-- HTML with link -->
<a href="https://codes.evallab.ai/report/project-id">
  <img src="https://codes.evallab.ai/badge/project-id.svg" alt="AI Code Quality: 87/100 Grade A">
</a>
```

### 3.2 Embeddable Widget

#### Widget Script Tag

```html
<div id="aicv-widget" data-project="my-project" data-theme="auto"></div>
<script src="https://codes.evallab.ai/embed.js" async></script>
```

#### Widget Behavior

1. Script fetches latest report data from API: `GET /api/v1/projects/{id}/latest`
2. Renders a compact card (~300×120px):

```
┌──────────────────────────────────────────┐
│ 🔬 AI Code Quality          ☀️          │
│                                          │
│  ┌──────┐  Score: 87/100                 │
│  │  87  │  Grade: A  ✅ Passed           │
│  │  ──  │  ▁▂▃▅▆▇█▇▆ (trend sparkline)  │
│  └──────┘  Last scan: 2h ago             │
│                                          │
│  [View Full Report →]                    │
└──────────────────────────────────────────┘
```

3. Clicking opens full HTML report in new tab

#### Widget Implementation (~5 KB)

```javascript
// embed.js
(function() {
  const el = document.querySelector('[data-project]') || document.getElementById('aicv-widget');
  if (!el) return;

  const project = el.dataset.project;
  const theme = el.dataset.theme || 'auto';
  const baseUrl = 'https://codes.evallab.ai';

  fetch(`${baseUrl}/api/v1/projects/${project}/latest`)
    .then(r => r.json())
    .then(data => {
      el.innerHTML = renderWidget(data, theme);
      el.style.cssText = 'font-family:system-ui;max-width:320px;';
    })
    .catch(() => {
      el.innerHTML = '<span style="color:#999">Score unavailable</span>';
    });

  function renderWidget(data, theme) {
    const color = gradeColor(data.grade);
    return `
      <div style="border:1px solid #e2e8f0;border-radius:8px;padding:12px;background:#fff">
        <div style="display:flex;align-items:center;gap:12px">
          <div style="width:48px;height:48px;border-radius:50%;border:3px solid ${color};
                      display:flex;align-items:center;justify-content:center;
                      font-weight:700;font-size:18px">${data.score}</div>
          <div>
            <div style="font-weight:600">Grade ${data.grade}</div>
            <div style="font-size:12px;color:#64748b">${data.passed ? '✅ Passed' : '❌ Failed'}</div>
            <div style="font-size:11px;color:#94a3b8">Last scan: ${timeAgo(data.timestamp)}</div>
          </div>
        </div>
        <a href="${baseUrl}/report/${data.projectId}" target="_blank"
           style="display:block;margin-top:8px;font-size:12px;color:${color};text-decoration:none">
          View Full Report →
        </a>
      </div>`;
  }
})();
```

### 3.3 API Design (Backend Support)

#### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/projects/:id/latest` | Latest report summary (score, grade, timestamp) |
| `GET` | `/api/v1/projects/:id/badge.svg` | Dynamic badge SVG |
| `GET` | `/api/v1/projects/:id/report` | Full HTML report (redirect to stored file) |
| `POST` | `/api/v1/projects/:id/reports` | Upload a new report (from CI) |
| `GET` | `/api/v1/projects/:id/trend` | Score history (last 30 data points for sparkline) |

#### Upload from CI

```yaml
# .github/workflows/validate.yml
- name: Upload Report
  run: |
    curl -X POST https://codes.evallab.ai/api/v1/projects/$PROJECT_ID/reports \
      -H "Authorization: Bearer $AICV_TOKEN" \
      -H "Content-Type: application/json" \
      -d @aicv-report.json
```

#### Response Format

```json
{
  "projectId": "my-project",
  "score": 87,
  "grade": "A",
  "passed": true,
  "totalFiles": 12,
  "issueCount": 7,
  "timestamp": "2026-03-10T11:30:00Z",
  "reportUrl": "https://codes.evallab.ai/report/my-project/run-42"
}
```

> **Note**: The API layer is a future enhancement (v0.6.0). MVP focuses on local badge SVG generation and static HTML reports. The embed widget can initially work with a static JSON file hosted anywhere (S3, GitHub Pages, etc.).

---

## 四、Terminal Report Upgrade

### 4.1 Color Output

**Current**: Uses Unicode box-drawing chars but no ANSI colors.

**Upgrade**: Use `picocolors` (3.5 KB, zero-dep) for color output.

```typescript
import pc from 'picocolors';

function gradeColor(grade: string): (s: string) => string {
  switch (grade) {
    case 'A': return pc.green;
    case 'B': return pc.blue;
    case 'C': return pc.yellow;
    case 'D': return (s) => pc.rgb(249, 115, 22)(s); // orange via rgb
    case 'F': return pc.red;
    default: return pc.gray;
  }
}

// Header
console.log(pc.bold('╔══════════════════════════════════════════════════════════════╗'));
console.log(pc.bold('║') + '              🔬 AI Code Validator — Quality Report           ' + pc.bold('║'));
console.log(pc.bold('╚══════════════════════════════════════════════════════════════╝'));
console.log('');
console.log(`  Overall Score: ${gradeColor(grade)(pc.bold(String(score)))} / 100`);
console.log(`  Grade: ${gradeColor(grade)(grade)}  Status: ${passed ? pc.green('✅ PASSED') : pc.red('❌ FAILED')}`);

// Dimension bar with color
function colorBar(pct: number, grade: string): string {
  const filled = Math.round(pct / 5);
  const empty = 20 - filled;
  const color = gradeColor(grade);
  return color('█'.repeat(filled)) + pc.dim('░'.repeat(empty));
}
```

**Why `picocolors` over `chalk`**:
- `picocolors`: 3.5 KB, zero deps, 2x faster
- `chalk` v5: 25 KB, ESM-only migration pain
- Both support the same color features we need

### 4.2 Attribution Tree Display

New tree-structured view grouping issues by defect category:

```
  Issue Attribution:
  
  🧠 Hallucination (2 issues)
  │
  ├── 🔴 src/utils/format.ts:42
  │   └─ crypto.hash() does not exist → Use crypto.createHash()
  │
  └── 🟡 src/api/client.ts:89
      └─ fetch.timeout option is not standard → Use AbortController
  
  ⏰ Stale Knowledge (1 issue)
  │
  └── 🟡 src/db/query.ts:23
      └─ mysql.escape() deprecated since mysql2@3.0 → Use parameterized queries
  
  🔗 Context Loss (2 issues)
  │
  ├── 🟡 src/utils/format.ts:15
  │   └─ Variable 'config' redefined with different type at line 67
  │
  └── 🟡 src/auth/login.ts:30
      └─ Mixed CJS require() and ESM import in same file
  
  🛡️ Security (1 issue)
  │
  └── 🔴 src/config/env.ts:8
      └─ Hardcoded API key → Move to environment variable

  📋 Incomplete (1 issue)
  │
  └── 🟡 src/utils/format.ts:58
      └─ Empty catch block swallows errors → Add error logging
```

Implementation:

```typescript
function renderAttributionTree(files: FileScore[]): string {
  const grouped = groupIssuesByCategory(files);
  const lines: string[] = [pc.bold('  Issue Attribution:'), ''];

  for (const [category, issues] of Object.entries(grouped)) {
    const icon = categoryIcon(category);
    lines.push(`  ${icon} ${pc.bold(categoryName(category))} (${issues.length} issue${issues.length > 1 ? 's' : ''})`);
    lines.push('  │');

    issues.forEach((issue, i) => {
      const isLast = i === issues.length - 1;
      const prefix = isLast ? '  └──' : '  ├──';
      const cont = isLast ? '      ' : '  │   ';
      const sevColor = severityColor(issue.severity);
      lines.push(`${prefix} ${sevColor(severityIcon(issue.severity))} ${pc.dim(issue.file + ':' + issue.line)}`);
      lines.push(`${cont}└─ ${issue.description}`);
    });
    lines.push('');
  }

  return lines.join('\n');
}
```

### 4.3 ASCII Radar Chart

Mini ASCII radar chart for terminal (inspired by `asciichart`):

```
                Completeness
                    93%
                   ╱╲
                  ╱  ╲
    Conciseness ╱    ╲ Coherence
       90%     ╱  ██  ╲  92%
               ╲  ██  ╱
                ╲    ╱
                 ╲  ╱
               Consistency
                  72%
```

**Simplified Implementation** (4-axis diamond):

```typescript
function asciiRadar(dims: { name: string; pct: number }[]): string {
  const [top, right, bottom, left] = dims;
  const W = 20; // max half-width

  const topH = Math.round((top.pct / 100) * 5);
  const rightW = Math.round((right.pct / 100) * W);
  const bottomH = Math.round((bottom.pct / 100) * 5);
  const leftW = Math.round((left.pct / 100) * W);

  const lines: string[] = [];
  const pad = W + 2;

  // Top label
  lines.push(' '.repeat(pad) + `${top.name} ${top.pct}%`);

  // Top half (expanding diamond)
  for (let row = 0; row < topH; row++) {
    const w = Math.round(rightW * (row + 1) / topH);
    const lw = Math.round(leftW * (row + 1) / topH);
    const line = ' '.repeat(pad - lw) + '╱' + '█'.repeat(lw + w) + '╲';
    lines.push(line);
  }

  // Middle line with left/right labels
  const mid = '█'.repeat(leftW + rightW + 2);
  lines.push(`${left.name} ${left.pct}%` + ' '.repeat(pad - leftW - `${left.name} ${left.pct}%`.length) + mid + ` ${right.name} ${right.pct}%`);

  // Bottom half (contracting diamond)
  for (let row = bottomH - 1; row >= 0; row--) {
    const w = Math.round(rightW * (row + 1) / bottomH);
    const lw = Math.round(leftW * (row + 1) / bottomH);
    const line = ' '.repeat(pad - lw) + '╲' + '█'.repeat(lw + w) + '╱';
    lines.push(line);
  }

  // Bottom label
  lines.push(' '.repeat(pad) + `${bottom.name} ${bottom.pct}%`);

  return lines.join('\n');
}
```

**Example output** with scores (93%, 92%, 72%, 90%):

```
                    Completeness 93%
                   ╱████████████████████╲
                  ╱██████████████████████╲
   Conciseness   ╱████████████████████████╲  Coherence
      90%       ████████████████████████████   92%
                 ╲██████████████████████╱
                  ╲████████████████████╱
                   ╲██████████████████╱
                    Consistency 72%
```

### 4.4 Clickable Terminal Hyperlinks (OSC 8)

Modern terminals (iTerm2, Windows Terminal, GNOME Terminal) support clickable links via OSC 8 escape sequences:

```typescript
function termLink(url: string, text: string): string {
  return `\x1b]8;;${url}\x07${text}\x1b]8;;\x07`;
}

// Usage in issue display
const refLink = termLink('https://nodejs.org/api/crypto.html', 'Node.js Crypto API');
console.log(`    📎 ${refLink}`);

// File paths link to VS Code (if installed)
const vsLink = termLink(`vscode://file/${filePath}:${lineNum}`, `${filePath}:${lineNum}`);
```

---

## 五、Markdown Report Upgrade

### 5.1 New Format Template

```markdown
## 🟢 AI Code Validator Report

**Score:** 87/100 | **Grade:** A | **Status:** ✅ Passed  
**Files:** 12 scanned, 10 passed, 2 failed | **Issues:** 7 total

### 📊 Dimension Scores

| Dimension | Score | Bar | Rating |
|-----------|-------|-----|--------|
| Completeness | 28/30 (93%) | 🟩🟩🟩🟩🟩🟩🟩🟩🟩⬜ | Excellent |
| Coherence | 23/25 (92%) | 🟩🟩🟩🟩🟩🟩🟩🟩🟩⬜ | Excellent |
| Consistency | 18/25 (72%) | 🟨🟨🟨🟨🟨🟨🟨⬜⬜⬜ | Acceptable |
| Conciseness | 18/20 (90%) | 🟩🟩🟩🟩🟩🟩🟩🟩🟩⬜ | Excellent |

### 🧬 Issue Attribution

| Category | Count | Severity | Auto-fixable |
|----------|-------|----------|-------------|
| 🧠 Hallucination | 2 | 🔴 High | ✅ 1/2 |
| ⏰ Stale Knowledge | 1 | 🟡 Medium | ✅ |
| 🔗 Context Loss | 2 | 🟡 Medium | ❌ |
| 🛡️ Security | 1 | 🔴 High | ✅ |
| 📋 Incomplete | 1 | 🟡 Medium | ❌ |

### 📁 File Details

| File | Score | Grade | Issues |
|------|-------|-------|--------|
| `src/auth/login.ts` | 82/100 | 🔵 B | 3 |
| `src/api/handler.ts` | 91/100 | 🟢 A | 1 |
| `src/utils/format.ts` | 67/100 | 🟠 D | 3 |

<details>
<summary>🔍 <code>src/utils/format.ts</code> — 67/100 🟠 D (3 issues)</summary>

#### Issues

**🔴 HIGH — Hallucinated API: `crypto.hash()`** (Line 42)
- 🧠 Category: Hallucination
- Root Cause: `crypto.hash()` does not exist in Node.js crypto module
- 💡 Fix: Use `crypto.createHash('sha256').update(data).digest('hex')`
- 📎 [Node.js Crypto API](https://nodejs.org/api/crypto.html)

**🟡 MEDIUM — Empty catch block** (Line 58)
- 📋 Category: Incomplete Implementation
- Root Cause: Error silently swallowed
- 💡 Fix: Add error logging or rethrow

**🟡 MEDIUM — Variable redefined with different type** (Line 15 → 67)
- 🔗 Category: Context Loss
- Root Cause: AI context window break between line 15 and 67

</details>

<details>
<summary>🔍 <code>src/auth/login.ts</code> — 82/100 🔵 B (3 issues)</summary>
...
</details>

### 🎯 Fix Priority

| # | Issue | File | Severity | Effort | Auto-fix |
|---|-------|------|----------|--------|----------|
| 1 | Hallucinated API | `format.ts:42` | 🔴 High | Trivial | ✅ |
| 2 | Hardcoded secret | `config.ts:15` | 🔴 High | Small | ✅ |
| 3 | Empty catch block | `format.ts:58` | 🟡 Med | Small | ❌ |

---
*Powered by [AI Code Validator](https://github.com/raye-deng/ai-code-validator) v0.5.0*
```

### 5.2 Folding Details Usage

GitHub and GitLab both support `<details>/<summary>` in Markdown. Use for:

1. **Per-file issue details** — collapsed by default, expand to see issues
2. **Code snippets** — collapsed within issue descriptions
3. **Full issue list** — when >10 issues, collapse the tail

```markdown
<details>
<summary>🔍 <code>src/utils/format.ts</code> — 67/100 🟠 D (3 issues)</summary>

...issue details...

</details>

<details>
<summary>📋 Show all 15 issues</summary>

| # | Issue | File | Severity |
|---|-------|------|----------|
| 1 | ... | ... | ... |
...

</details>
```

**Rules**:
- Files with score ≥ 90 (Grade A): always collapsed
- Files with issues: first 3 files expanded, rest collapsed
- Attribution summary: always visible
- Fix priority matrix: always visible

### 5.3 Attribution Summary Table

```markdown
### 🧬 Issue Attribution Summary

| Category | Icon | Count | Most Severe | Root Cause | Reference |
|----------|------|-------|-------------|------------|-----------|
| Hallucination | 🧠 | 2 | 🔴 High | Training data hallucination | [Common AI Hallucinations](link) |
| Stale Knowledge | ⏰ | 1 | 🟡 Med | Training data cutoff | [API Deprecation DB](link) |
| Context Loss | 🔗 | 2 | 🟡 Med | Context window limits | [Context Window Issues](link) |
| Security | 🛡️ | 1 | 🔴 High | Security anti-pattern | [CWE-798](link) |
| Incomplete | 📋 | 1 | 🟡 Med | Incomplete generation | [Incomplete Code Patterns](link) |
```

Each category links to a curated reference page explaining the AI defect pattern and how to avoid it.

---

## 六、Scoring Dimension → Visualization Mapping

Current 4 dimensions + planned new dimensions from V3 upgrade:

| Dimension | Icon | Color | Terminal Visual | HTML Visual | Radar Axis |
|-----------|------|-------|----------------|-------------|------------|
| **Completeness** | 🧩 | `#22c55e` green | `████░░` bar | Filled bar + percentage | Top vertex |
| **Coherence** | 🔗 | `#3b82f6` blue | `████░░` bar | Filled bar + percentage | Right vertex |
| **Consistency** | 🎯 | `#8b5cf6` purple | `████░░` bar | Filled bar + percentage | Bottom vertex |
| **Conciseness** | ✂️ | `#06b6d4` cyan | `████░░` bar | Filled bar + percentage | Left vertex |
| **Security** *(v3)* | 🛡️ | `#ef4444` red | `████░░` bar | Filled bar + severity count | New axis |
| **Type Safety** *(v3)* | 📐 | `#f59e0b` amber | `████░░` bar | Filled bar + percentage | New axis |
| **Error Handling** *(v3)* | 🚨 | `#ec4899` pink | `████░░` bar | Filled bar + percentage | New axis |
| **Freshness** *(v3)* | ⏰ | `#14b8a6` teal | `████░░` bar | Filled bar + staleness count | New axis |

### Visual Encoding Rules

| Score Range | Bar Color | Emoji | Label |
|-------------|-----------|-------|-------|
| 90-100% | Green blocks `🟩` | ✅ | Excellent |
| 75-89% | Blue blocks `🟦` | 🔵 | Good |
| 60-74% | Yellow blocks `🟨` | 🟡 | Acceptable |
| 40-59% | Orange blocks `🟧` | 🟠 | Needs Work |
| 0-39% | Red blocks `🟥` | 🔴 | Critical |

### Radar Chart Scaling

When dimensions have different max scores (e.g., Completeness=30, Coherence=25), the radar chart normalizes all to 0-100%:

```typescript
const radarData = dimensions.map(d => ({
  name: d.name,
  pct: Math.round((d.score / d.maxScore) * 100),
}));
```

This ensures the radar shape is meaningful regardless of absolute max scores.

---

## 七、Implementation Priority

### Phase 1: HTML Report (v0.5.0) — 3 days

| Task | Effort | Description |
|------|--------|-------------|
| `HtmlReportGenerator` class | 1 day | Core HTML generation with all sections |
| SVG donut gauge | 0.5 day | Score visualization |
| SVG radar chart | 0.5 day | Dimension breakdown |
| Theme system (CSS vars) | 0.5 day | Light/dark + auto-detect |
| Expand/collapse + sort | 0.5 day | Interactive file list and priority matrix |

**Output**: `--format html` flag in CLI produces `aicv-report.html`

### Phase 2: Markdown Upgrade (v0.5.0) — 1 day

| Task | Effort | Description |
|------|--------|-------------|
| Attribution summary table | 0.25 day | Category → count → severity mapping |
| Folding details | 0.25 day | `<details>/<summary>` for file sections |
| Fix priority matrix | 0.25 day | Sorted table of all issues |
| Emoji bar charts | 0.25 day | `🟩🟩🟩🟨⬜` for dimension scores |

### Phase 3: Terminal Upgrade (v0.5.0) — 1 day

| Task | Effort | Description |
|------|--------|-------------|
| Color output (picocolors) | 0.25 day | Grade-colored scores and bars |
| Attribution tree | 0.5 day | Tree-structured issue display |
| OSC 8 links | 0.25 day | Clickable URLs and file paths |

### Phase 4: Badge SVG (v0.6.0) — 0.5 day

| Task | Effort | Description |
|------|--------|-------------|
| Badge SVG generator | 0.25 day | shields.io-style SVG output |
| CLI `--badge` flag | 0.25 day | Generate badge alongside report |

### Phase 5: Embed Widget (v0.6.0) — 2 days

| Task | Effort | Description |
|------|--------|-------------|
| API endpoints | 1 day | REST API for latest score, badge, report |
| Widget JS | 0.5 day | Embeddable `<script>` tag widget |
| Trend sparkline | 0.5 day | Mini chart from historical data |

### Total Estimate

| Phase | Version | Duration | Priority |
|-------|---------|----------|----------|
| HTML Report | v0.5.0 | 3 days | 🔴 P0 — Critical |
| Markdown Upgrade | v0.5.0 | 1 day | 🔴 P0 — Critical |
| Terminal Upgrade | v0.5.0 | 1 day | 🟡 P1 — High |
| Badge SVG | v0.6.0 | 0.5 day | 🟡 P1 — High |
| Embed Widget + API | v0.6.0 | 2 days | 🟢 P2 — Medium |

**Total: ~7.5 days of focused development**

### Dependencies

```
Phase 1 (HTML) ──┐
Phase 2 (MD)   ──┼── Can run in parallel (no deps between them)
Phase 3 (Term) ──┘
                  │
                  ▼
Phase 4 (Badge) ── Depends on grade color system from Phase 1
                  │
                  ▼
Phase 5 (Widget) ── Depends on API layer + Badge from Phase 4
```

### Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `packages/core/src/scorer/html-report.ts` | **Create** | HTML report generator |
| `packages/core/src/scorer/html-template.ts` | **Create** | CSS + JS template strings |
| `packages/core/src/scorer/svg-charts.ts` | **Create** | Donut gauge + radar chart SVG |
| `packages/core/src/badge/generator.ts` | **Create** | Badge SVG generation |
| `packages/core/src/scorer/report.ts` | **Modify** | Add `html` format, upgrade terminal/markdown |
| `packages/cli/src/index.ts` | **Modify** | Add `--format html` and `--badge` flags |
| `packages/core/src/types.ts` | **Modify** | Add `IssueClassification`, `AIDefectCategory` types |

---

> **Summary**: This redesign transforms the report system from basic ASCII tables to a multi-format, attribution-rich output system. The HTML report (Lighthouse-inspired, single-file, offline-capable) is the flagship. Markdown and Terminal formats get significant upgrades with attribution trees and colored output. Embed widgets and badges enable external visibility. Total implementation: ~7.5 focused development days across v0.5.0 and v0.6.0 milestones.