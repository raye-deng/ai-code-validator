# Open Code Review V3 — Roadmap & 执行计划

> 创建: 2026-03-11 | 状态: 执行中
> 设计文档: [V3-ARCHITECTURE.md](design/V3-ARCHITECTURE.md)

## 版本目标

**v0.3.0** — 从"TS-only 正则检测"升级为"5 语言 × 9 检测器 × AI 双通道 × SLA 服务标准"

### 核心交付

| 能力 | v0.2.0 (当前) | v0.3.0 (目标) |
|------|-------------|-------------|
| 支持语言 | TypeScript only | **TS/JS + Python + Java + Go + Kotlin** |
| 检测器数 | 4 (正则) | **9 (AST + AI)** |
| 检测方式 | 正则/字符串匹配 | **AST 解析 + 本地 AI + 远端 AI** |
| 评分体系 | 4 维度, error/warning | **4 维度, 5 级严重度, A+~F** |
| 传统 lint 降权 | 无 | **info 级别不扣分** |
| AI 分析 | 无 | **Ollama 本地 + OpenAI/Claude 远端** |
| SLA 标准 | 无 | **L1/L2/L3 三级 SLA** |
| License | 无 | **Portal 注册 → 自动生成 → CLI 验证** |
| Web Portal | 静态官网 | **登录/Dashboard/License/Reports/Docs** |
| 报告格式 | Terminal + JSON | **Terminal + HTML + JSON + Markdown + SARIF** |
| 商业模式 | 免费+付费 | **全免费 + License 追踪** |

---

## Phase 1 — Core 重构 + TS/JS + 评分 (Week 1)

**目标**: 基础架构重构，TS/JS 检测器升级到 AST，新评分体系上线

### 任务列表

| # | 任务 | 文件/模块 | 状态 |
|---|------|----------|------|
| 1.1 | 统一类型定义 | `packages/core/src/types.ts` | ✅ |
| 1.2 | LanguageAdapter 接口 + 语言注册表 | `packages/core/src/languages/` | ✅ |
| 1.3 | TS/JS 适配器 (oxc-parser) | `packages/core/src/languages/typescript/` | ✅ |
| 1.4 | 4 检测器 AST 重写 | `packages/core/src/detectors/` (v2) | ✅ |
| 1.5 | 评分引擎 V3 | `packages/core/src/scorer/scoring-engine.ts` (重写) | ✅ |
| 1.6 | SLA 计时框架 | `packages/core/src/sla/` | ✅ |
| 1.7 | .aicv.yml 配置解析器 | `packages/core/src/config/` | ✅ |
| 1.8 | 单元测试 | `packages/core/tests/` | ✅ |

### 验收标准
- [x] `npm test` 全通过（现有 + 新增）— 136 tests passing
- [ ] `npx open-code-review scan .` 对 TS/JS 文件输出新格式评分
- [ ] SLA 计时信息在报告中可见
- [ ] git tag v0.3.0-alpha.1

---

## Phase 2 — 新检测器 + Python (Week 2)

**目标**: 5 个新检测器实现，Python 语言支持

### 任务列表

| # | 任务 | 文件/模块 | 状态 |
|---|------|----------|------|
| 2.1 | StaleAPIDetector | `packages/core/src/detectors/stale-api.ts` + `data/deprecated-apis-js.json` | ✅ |
| 2.2 | SecurityPatternDetector | `packages/core/src/detectors/security-pattern.ts` | ✅ |
| 2.3 | OverEngineeringDetector | `packages/core/src/detectors/over-engineering.ts` | ✅ |
| 2.4 | DeepHallucinationDetector | `packages/core/src/detectors/deep-hallucination.ts` | ✅ |
| 2.5 | TypeSafetyDetector (TS only) | `packages/core/src/detectors/type-safety.ts` | ✅ |
| 2.6 | Python LanguageAdapter | `packages/core/src/languages/python/` | ✅ |
| 2.7 | PyPI + Python 废弃 API 数据库 | `data/deprecated-apis/python.json` | ✅ |
| 2.8 | 全检测器 × Python 单元测试 | `packages/core/tests/python/` | ✅ |

### 验收标准
- [ ] 9 个检测器对 TS/JS + Python 均有测试覆盖
- [ ] `npx open-code-review scan . --lang python` 可用
- [ ] git tag v0.3.0-alpha.2

---

## Phase 3 — License + Portal + Java/Go (Week 3)

**目标**: Web Portal 上线，License 全流程，Java/Go 语言支持

### 任务列表

| # | 任务 | 文件/模块 | 状态 |
|---|------|----------|------|
| 3.1 | License Key 生成/验证模块 | `packages/core/src/license/` | ✅ |
| 3.2 | CLI `login` 命令 + `config` 命令 + `--license` 参数 | `packages/cli/src/index.ts` | ✅ |
| 3.3 | Directus 数据模型配置 | `apps/web/directus/` (schema) | ⬜ |
| 3.4 | Portal: NextAuth.js 认证 | `apps/web/src/app/api/auth/` | ⬜ |
| 3.5 | Portal: /login + /register | `apps/web/src/app/(auth)/` | ⬜ |
| 3.6 | Portal: /dashboard + /dashboard/license | `apps/web/src/app/dashboard/` | ⬜ |
| 3.7 | License API (CF Worker 或 Next API) | `apps/web/src/app/api/license/` | ⬜ |
| 3.8 | Java LanguageAdapter | `packages/core/src/languages/java/` | ✅ |
| 3.9 | Go LanguageAdapter | `packages/core/src/languages/go/` | ✅ |
| 3.10 | Maven Central + pkg.go.dev 验证 | 各语言 `package-verifier.ts` | ✅ |

### 验收标准
- [ ] Portal 可访问，GitHub OAuth 登录 → 自动获取 License
- [ ] CLI `npx open-code-review login` → 浏览器跳转 → License 保存到 `~/.aicv`
- [ ] Java/Go 文件可扫描
- [ ] git tag v0.3.0-beta.1

---

## Phase 4 — AI 集成 + 报告 + Kotlin (Week 4)

**目标**: AI 双通道，美化报告，Kotlin 支持，功能完整

### 任务列表

| # | 任务 | 文件/模块 | 状态 |
|---|------|----------|------|
| 4.1 | AI Provider 抽象层 | `packages/core/src/ai/` | ✅ |
| 4.2 | Ollama 集成 | `packages/core/src/ai/ollama-provider.ts` | ✅ |
| 4.3 | OpenAI/Anthropic 集成 | `packages/core/src/ai/openai-provider.ts`, `anthropic-provider.ts` | ✅ |
| 4.4 | Prompt 模板（多语言） | `packages/core/src/ai/prompts.ts` | ✅ |
| 4.5 | Result Fusion 引擎 | `packages/core/src/ai/fusion.ts` | ⬜ |
| 4.6 | HTML 报告 (Lighthouse 风格) | `packages/core/src/reporter/html-reporter.ts` | ✅ |
| 4.7 | Terminal 报告升级 | `packages/core/src/reporter/terminal-reporter.ts` | ✅ |
| 4.8 | Markdown 报告升级 | `packages/core/src/reporter/markdown-reporter.ts` | ✅ |
| 4.9 | SARIF 输出 | `packages/core/src/reporter/sarif-reporter.ts` | ✅ |
| 4.10 | Kotlin LanguageAdapter | `packages/core/src/languages/kotlin/` | ✅ |
| 4.11 | SLA 指标嵌入所有报告 | 各 reporter | ✅ |

### 验收标准
- [ ] `--ai local` 使用 Ollama 分析
- [ ] `--format html` 生成可浏览器打开的报告
- [ ] 5 语言全部可扫描
- [ ] SLA 指标在所有报告格式中可见
- [ ] git tag v0.3.0-rc.1

---

## Phase 5 — 发布 + 运营 (Week 5+)

### 任务列表

| # | 任务 | 状态 |
|---|------|------|
| 5.1 | npm 发包 v0.3.0 | ⬜ |
| 5.2 | GitHub Action 发布到 Marketplace | ⬜ |
| 5.3 | GitLab Component 发布 | ⬜ |
| 5.4 | Portal 文档页 (/docs) | ⬜ |
| 5.5 | Show HN v2 | ⬜ |
| 5.6 | Reddit/DevTo/Medium 博客 | ⬜ |
| 5.7 | 废弃 API 数据库周更 cron | ⬜ |
| 5.8 | Dashboard: 历史报告 + SLA 趋势 | ⬜ |

---

## Worker 分配策略

每个 Phase 拆成 2-3 个并行 Worker：

| Phase | Worker A | Worker B | Worker C |
|-------|---------|---------|---------|
| 1 | Core 类型 + 语言架构 + 检测器重写 | 评分引擎 + SLA + 配置 | — |
| 2 | 新检测器（5个） | Python 适配器 + 测试 | — |
| 3 | License + CLI login | Portal 认证 + Dashboard | Java/Go 适配器 |
| 4 | AI Provider + Prompt + Fusion | 报告系统（HTML/Terminal/MD/SARIF） | Kotlin 适配器 |
| 5 | 发包 + CI Action | 文档 + 推广 | — |

**Worker 要求**：
- 每完成一个任务立即 `git commit + push`
- 进度更新到本文档（更新 ⬜ → ✅）
- 单元测试必须通过
- 不阻塞主线

---

_更新于 2026-03-11_
