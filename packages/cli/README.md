# @opencodereview/cli

> CLI tool for Open Code Review - AI code quality scanner

## Installation

```bash
npm install -g @opencodereview/cli
# or
npx @opencodereview/cli --help
```

## Usage

```bash
# Quick scan
ocr scan src/

# With L2 (embedding + Ollama)
ocr scan src/ --sla L2

# PR diff scan
ocr scan src/ --diff --base origin/main

# Output formats
ocr scan src/ --format json --output report.json
ocr scan src/ --format html --output report.html
ocr scan src/ --format sarif --output report.sarif
```

## Commands

- `scan` - Scan code for AI-generated defects
- `init` - Create .ocrrc.yml configuration
- `login` - Set up license key
- `config` - View or update configuration

## Links

- [Documentation](https://github.com/raye-deng/open-code-review#readme)
- [GitHub Repository](https://github.com/raye-deng/open-code-review)
- [Report Issue](https://github.com/raye-deng/open-code-review/issues)

## License

BSL-1.1 - See [LICENSE](../../LICENSE)
