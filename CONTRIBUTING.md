# Contributing to Open Code Review

Thanks for your interest in contributing! 🎉

## Quick Start

```bash
git clone https://github.com/raye-deng/open-code-review.git
cd open-code-review
pnpm install
pnpm build
```

## Development

```bash
# Run tests
pnpm test

# Run a single package tests
pnpm --filter @opencodereview/core test
pnpm --filter @opencodereview/cli test

# Build all packages
pnpm build

# Lint
pnpm lint
```

## Project Structure

```
packages/
  core/              # Detection engine + scoring
  cli/               # CLI tool (ocr command)
  github-action/     # GitHub Action wrapper
```

## How to Contribute

### Report Bugs
Open an [issue](https://github.com/raye-deng/open-code-review/issues) with:
- OS and Node.js version
- CLI command that triggered the bug
- Expected vs actual behavior
- Sample code (if applicable)

### Suggest Features
Open an issue with the `enhancement` label. Describe:
- The use case
- Expected behavior
- Any alternatives you've considered

### Submit Code

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Write code and tests
4. Ensure tests pass: `pnpm test`
5. Commit with a clear message
6. Push and open a Pull Request

### Add Detection Rules

Open Code Review uses pattern-based detection. To add a new rule:

1. Find the relevant detector in `packages/core/src/detectors/`
2. Add your pattern with tests in `packages/core/tests/`
3. Update documentation in `docs/`

### Add Language Support

1. Create a new parser in `packages/core/src/languages/`
2. Create a new extractor in `packages/core/src/parser/extractors/`
3. Register the language in `packages/core/src/languages/registry.ts`

## Code Style

- TypeScript strict mode
- Prettier for formatting
- ESLint for linting
- Write tests for new functionality

## Community Guidelines

- Be respectful and constructive
- Focus on the code, not the person
- Ask questions before assuming
- Welcome newcomers

## License

By contributing, you agree that your code will be under [BSL-1.1](LICENSE).
