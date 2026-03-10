# Development Guide

## Prerequisites

- Node.js 20+
- pnpm 9+

## Setup

```bash
# Clone the repository
git clone https://github.com/raye-deng/open-code-review.git
cd open-code-review

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test
```

## Project Structure

```
open-code-review/
├── packages/
│   ├── core/          # npm: open-code-review-core
│   ├── cli/           # npm: open-code-review
│   ├── github-action/ # GitHub Marketplace action
│   └── gitlab-component/ # GitLab CI Component
├── apps/
│   └── web/           # Marketing site
└── docs/              # Documentation
```

## Development Workflow

### Working on Core

```bash
cd packages/core

# Run tests in watch mode
pnpm test:watch

# Build
pnpm build
```

### Working on CLI

```bash
cd packages/cli

# Run locally
pnpm dev scan ../core/src

# Build
pnpm build
```

### Working on Website

```bash
cd apps/web

# Start dev server
pnpm dev

# Build static export
pnpm build
```

## Adding a New Detector

1. Create a new file in `packages/core/src/detectors/`
2. Implement the detector class with `analyze(filePath, source)` method
3. Export from `packages/core/src/detectors/index.ts`
4. Integrate into `ScoringEngine` dimensions
5. Add tests in `packages/core/tests/`
6. Update documentation

### Detector Template

```typescript
export interface MyDetectorIssue {
  type: string;
  severity: 'error' | 'warning';
  file: string;
  line: number;
  message: string;
  suggestion?: string;
}

export interface MyDetectorResult {
  file: string;
  issues: MyDetectorIssue[];
  score: number;
}

export class MyDetector {
  analyze(filePath: string, source: string): MyDetectorResult {
    const issues: MyDetectorIssue[] = [];
    // ... detection logic ...
    return { file: filePath, issues, score: 100 };
  }
}
```

## Testing

We use Vitest for testing.

```bash
# Run all tests
pnpm test

# Run with coverage
pnpm -r exec vitest run --coverage

# Run specific test file
pnpm --filter open-code-review-core exec vitest run tests/detectors.test.ts
```

## Releasing

### CLI (npm)

```bash
cd packages/cli
npm version patch
npm publish
```

### GitHub Action

Tag a release on GitHub:
```bash
git tag v1.0.0
git push origin v1.0.0
```

### GitLab Component

Push to `main` branch — the component is referenced by branch/tag:
```yaml
include:
  - component: INTERNAL_REGISTRY/fengsen.deng/open-code-review/validate@main
```

## Code Style

- TypeScript strict mode
- ESM modules (`.js` extension in imports)
- Functional style where possible
- JSDoc comments on public APIs
- No `any` types (use `unknown` + type guards)
