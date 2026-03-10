# Architecture

## System Overview

Open Code Review is a monorepo containing:

```
open-code-review/
├── packages/
│   ├── core/              # Detection engine (pure TypeScript, no side effects)
│   ├── cli/               # CLI wrapper around core
│   ├── github-action/     # GitHub Actions integration
│   └── gitlab-component/  # GitLab CI Component
└── apps/
    └── web/               # Marketing website (Next.js)
```

## Core Engine (`open-code-review-core`)

The core package is the heart of the system. It's a pure TypeScript library with no platform-specific dependencies.

### Detectors

Each detector implements a specific AI code failure mode analysis:

1. **HallucinationDetector** — Finds phantom packages, undefined functions, non-existent APIs
2. **LogicGapDetector** — Catches empty catch blocks, TODO markers, unreachable code
3. **DuplicationDetector** — Identifies near-identical functions, duplicate imports
4. **ContextBreakDetector** — Detects naming inconsistencies, mixed module systems

### Scoring Engine

Aggregates detector results into a 0-100 composite score:

| Dimension | Weight | What It Measures |
|-----------|--------|-----------------|
| Completeness | 30 | No hallucinated variables/functions/packages |
| Coherence | 25 | No logic gaps, meaningful control flow |
| Consistency | 25 | Consistent style and patterns |
| Conciseness | 20 | No obvious duplication or redundancy |

### Report Generator

Formats results into multiple output types:
- **Terminal**: Human-readable with visual bars
- **JSON**: Machine-readable for CI integration
- **Markdown**: For PR comments
- **GitLab Code Quality**: For MR widget integration

### AI Healer (Prompt Builder)

Converts validation results into structured prompts for AI assistants:
- Prioritized by severity
- Includes specific fix suggestions
- Compatible with Copilot, Cursor, and Claude

## Data Flow

```
Source Files → Detectors → Scoring Engine → Report Generator
                                         → AI Healer (optional)
```

## Design Principles

1. **Zero runtime dependencies where possible** — Core uses only Node.js built-ins + minimal AST tools
2. **Platform-agnostic core** — CLI, GitHub Action, and GitLab CI are thin wrappers
3. **Conservative detection** — Prefer false negatives over false positives
4. **Fast execution** — Target <3s for 100-file projects
5. **Extensible** — New detectors can be added without modifying existing code
