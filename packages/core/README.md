# @opencodereview/core

> Core detection engine for Open Code Review

## Installation

```bash
npm install @opencodereview/core
```

## Usage

```typescript
import { Scanner, DetectorRegistry } from '@opencodereview/core';

const scanner = new Scanner({
  sla: 'L2',
  ollamaUrl: 'http://localhost:11434'
});

const result = await scanner.scan('src/');
console.log(result.score, result.grade, result.issues);
```

## API

### Scanner

- `scan(path: string, options?: ScanOptions): Promise<ScanResult>`
- `scanDiff(base: string, head: string): Promise<DiffResult>`

### Detectors

- `deep-hallucination` - Detects AI hallucinated packages
- `stale-api` - Detects deprecated APIs
- `security-pattern` - Detects security vulnerabilities
- `logic-gap` - Detects empty catches and logic gaps
- `over-engineering` - Detects unnecessary complexity

## License

BSL-1.1 - See [LICENSE](../../LICENSE)
