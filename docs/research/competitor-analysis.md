# 竞品深度分析报告

> **调研日期**: 2026-03-10
> **调研人**: AI Code Validator 团队
> **版本**: v1.0
> **数据来源**: 各工具官网、定价页面、文档、第三方评测文章

---

## 一、竞品总览

| 工具 | 定位 | AI 能力 | 本地部署 | 价格（起步） | 评分体系 |
|------|------|---------|---------|-------------|---------|
| **CodeRabbit** | AI PR 代码审查 | ✅ 原生 AI（LLM 驱动） | ❌ 仅企业版自托管 | Free / $24/人/月 | PR 级 issue 分类 |
| **Codacy** | 自动化代码质量+安全 | ⚠️ AI Guardrails + AI Reviewer（2025 新增） | ❌ 仅 Cloud | Free (OSS) / Pro $15/人/月起 / Business 定制 | Grade A-F + Issues/kLoC |
| **SonarQube/Cloud** | 代码质量+安全标杆 | ⚠️ AI CodeFix（新增） | ✅ Community Edition 免费自托管 | Free (50k LOC) / Team €30/月起 | Quality Gate (Pass/Fail) + SQALE |
| **Snyk Code** | AI 安全 SAST | ✅ DeepCode AI Engine | ❌ AI 自托管，Broker 代理 | Free (100 test/月) / Team $25/人/月 | 严重性评分 + Priority Score |
| **Semgrep** | 可编程静态分析 | ⚠️ Semgrep Assistant（GPT-4 驱动） | ✅ CLI 完全本地 | Free (10 repo) / Teams $30/人/月 | 规则严重性 + Auto-triage |
| **DeepSource** | AI 代码审查平台 | ✅ AI Review Agent + Autofix™ | ❌ 企业版可自托管 | Free (OSS) / Team $24/人/月 | PR Report Card（5 维度） |
| **Qodana** | JetBrains 静态分析 | ⚠️ 基于 IntelliJ 检查引擎 | ✅ Docker/CI 本地运行 | Community 免费 / Ultimate $contact | Quality Profile + Baseline |
| **Sourcery** | AI 代码审查（轻量） | ✅ LLM 驱动（OpenAI） | ❌ 支持 BYOLLM endpoint | Free (OSS) / Pro ~$20-30/人/月 | PR 级 issue 分类 |
| **CodeClimate → Qlty** | 代码健康平台 | ⚠️ AI Autofix（100-5000/月） | ✅ 开源 Rust CLI | Free / Pro $20/人/月 / Enterprise $30/人/月 | Maintainability + 趋势 |

---

## 二、各工具详细分析

### 1. CodeRabbit

- **官网**: https://coderabbit.ai
- **核心功能**:
  - AI 驱动的 PR 代码审查（2M+ 仓库接入，75M+ 缺陷发现）
  - PR 摘要 + 变更 walkthrough + 架构图生成
  - 40+ linter 和安全扫描器集成
  - 1-click commit 修复 + "Fix with AI" 按钮
  - 自定义编码规范（YAML 配置）
  - 自动化报告（standup、sprint review）
  - IDE + CLI 支持（2025 新增）
  - MCP Server 集成
- **评分维度**:
  - 无量化评分体系；以 issue 严重性分类（bug、security、performance、style）
  - Codebase intelligence（跨文件依赖分析）
  - 自定义 pre-merge quality checks（自然语言定义）
- **AI 集成方式**: 远端 LLM API（GPT-4 级别），不支持本地模型
- **报告格式**: PR comment（GitHub/GitLab/Bitbucket）、IDE 内审查、CLI 输出、自动化报告 Dashboard
- **价格**:
  - Free: $0（PR 摘要、公私仓库、IDE 审查）
  - Pro: $24/月/开发者（年付）或 $30/月/开发者（月付）—— 无限 PR 审查
  - Enterprise: 定制（自托管、多组织、SLA、API）
  - 按需 CLI add-on（用量计费）
- **优势**:
  - 最广泛的 AI 代码审查市场占有率（GitHub 最多安装 AI 应用）
  - 上下文理解强（代码图 + 外部上下文 + Jira/Linear 集成）
  - 学习反馈机制（通过对话训练 Learnings）
  - 40+ linter 集成减少噪音
- **劣势**:
  - 无量化质量评分体系（没有 A-F 等级或分数）
  - 无本地 AI 模型支持
  - 中等深度分析（在 OpenSSF CVE Benchmark 仅 61.21% 准确率）
  - 安全分析深度不如专业安全工具
- **我们可以学习的点**:
  - 自然语言定义 pre-merge checks 的思路
  - 代码图（Codegraph）跨文件依赖分析
  - 学习反馈机制（用户反馈 → 持续改进审查质量）
  - PR 摘要 + 架构图自动生成

---

### 2. Codacy

- **官网**: https://www.codacy.com
- **核心功能**:
  - 自动化代码质量和安全分析（49 种语言）
  - AI Guardrails（IDE 内实时扫描 AI 生成代码）
  - AI Reviewer（AI 代码审查）
  - AI Risk Hub（AI 代码风险管理）
  - SAST + SCA + Secrets Detection + IaC + DAST
  - 测试覆盖率跟踪
  - IDE 插件（VS Code + JetBrains）
  - MCP 技术集成
- **评分维度**:
  - **Grade A-F**：加权平均（Issues + Complexity + Duplication + Coverage）
  - **Issues/kLoC**：每千行代码问题数
  - **Issue 分类**: Code Style、Error Prone、Code Complexity、Performance、Compatibility、Unused Code、Security、Documentation、Best Practice、Comprehensibility
  - **Complexity**: Cyclomatic complexity
  - **Duplication**: 代码克隆检测
  - **Code Coverage**: 行覆盖率
- **AI 集成方式**: 远端 AI（Guardrails 使用 MCP 技术与现有 AI 助手集成，不是自己的模型）
- **报告格式**: PR comment、Web Dashboard、IDE 内联、Email 通知、组织概览报告
- **价格**:
  - Open Source: 免费（仅公共项目）
  - Pro: 按席位计费（≤30 contributors，≤100 私有项目）—— 估算 $15-19/人/月
  - Business: 定制（>30 contributors，高级安全、报告、支持）
  - 14 天免费试用
- **优势**:
  - 评分体系成熟（A-F 等级 + 多维指标）
  - AI Guardrails 创新（IDE 内实时拦截 AI 生成的低质量代码）
  - 无需 CI/CD 管道集成（Webhook 异步扫描）
  - G2 上集成易用性评分 9.6/10（vs SonarQube 7.8/10）
- **劣势**:
  - 不支持自托管 Git（仅 GitHub/GitLab/Bitbucket Cloud）
  - 不支持本地 AI 模型
  - AI 能力相对较新（2025 才推出 Guardrails/Reviewer）
  - 安全扫描深度不如 Snyk
- **我们可以学习的点**:
  - A-F 评分体系（加权多维指标）
  - Issues/kLoC 标准化指标
  - AI Guardrails 概念（IDE 内实时拦截 AI 代码缺陷）
  - 10 类 issue 分类体系

---

### 3. SonarQube / SonarCloud

- **官网**: https://www.sonarsource.com
- **核心功能**:
  - 业界标杆代码质量平台（7M+ 开发者）
  - Quality Gate（Pass/Fail 质量门禁）
  - Quality Profile（可自定义规则集）
  - 36+ 语言支持
  - SAST + Taint Analysis + IaC 扫描
  - Secrets Detection（2025 增强）
  - AI CodeFix（AI 自动修复）
  - MCP Server
  - 架构管理（Architecture Management，2025 新增）
  - SCA + Advanced SAST（Advanced Security 附加订阅）
- **评分维度**:
  - **Quality Gate**: Pass/Fail（基于可配置条件集）
  - **默认 Quality Gate 条件**:
    - New code coverage > 80%
    - New code duplication < 3%
    - New issues severity（Blocker/Critical = 0）
    - New security hotspots reviewed = 100%
  - **SQALE 技术债务模型**:
    - Reliability（bugs）→ Rating A-E
    - Security（vulnerabilities）→ Rating A-E
    - Maintainability（code smells）→ Rating A-E
    - Coverage（测试覆盖率百分比）
    - Duplications（重复率百分比）
    - Size（LOC）
    - Complexity（cyclomatic + cognitive complexity）
  - **Security 报告**: OWASP Top 10、PCI-DSS、STIG、CASA
- **AI 集成方式**: AI CodeFix（远端 AI），无本地 AI 模型支持
- **报告格式**: Web Dashboard（项目级、组织级、Portfolio 级）、PR decoration、IDE 连接模式（SonarQube for IDE）、安全合规报告、可自定义项目 Dashboard
- **价格**:
  - **SonarQube Community (self-hosted)**: 免费开源
  - **SonarQube Cloud Free**: $0（50k LOC，5 用户上限）
  - **SonarQube Cloud Team**: 起步 €30/月（100k LOC），按 LOC 阶梯计费至 1.9M LOC
  - **SonarQube Cloud Enterprise**: 联系销售（SSO、Portfolio、审计日志）
  - **SonarQube Server (self-hosted)**: Enterprise 许可证
- **优势**:
  - 行业标杆，最成熟的质量门禁体系
  - 开源 Community Edition 可完全自托管
  - SQALE 技术债务模型被广泛认可
  - 最全面的安全合规报告（OWASP/PCI-DSS/STIG/CASA）
  - 架构管理是独特差异化功能
- **劣势**:
  - 自托管版本 setup 复杂（需要数据库、服务器）
  - 学习曲线陡峭
  - AI 能力是后加的（CodeFix），不如原生 AI 工具深入
  - 无 SCA 依赖扫描（社区版）
  - 大型代码库扫描性能问题
  - 开发者体验评分较低（G2: 7.8/10 集成）
- **我们可以学习的点**:
  - **Quality Gate 机制**（最核心参考）
  - SQALE 技术债务评估模型（Reliability/Security/Maintainability 三维度）
  - A-E rating 评级标准
  - 安全合规报告格式（OWASP Top 10 映射）
  - 新代码 vs 全量代码分离分析

---

### 4. Snyk Code

- **官网**: https://snyk.io/product/snyk-code/
- **核心功能**:
  - AI 驱动的 SAST（DeepCode AI Engine）
  - 实时代码扫描（IDE 内联）
  - 自动修复（DeepCode AI Fix / Snyk Agent Fix）
  - 25M+ 数据流案例模型
  - 14+ 语言支持
  - LLM 库覆盖（90% LLM 库 如 OpenAI/Hugging Face）
  - 优先级评分（Priority Score）
  - 全 SDLC 集成（IDE → SCM → CI/CD）
- **评分维度**:
  - **Priority Score**: 综合评分（0-1000），考虑 CVSS、Exploit Maturity、Reachability、Business Context
  - **Severity**: Critical / High / Medium / Low
  - **Fix Priority**: 基于风险的修复优先级
  - 无代码质量评分（纯安全聚焦）
- **AI 集成方式**: 自托管 AI 引擎（DeepCode AI 是 Snyk 自有），代码不发送给第三方 LLM；自定义逻辑求解器
- **报告格式**: IDE 内联、PR checks、Web Dashboard（高级报告需付费）、API
- **价格**:
  - Free: $0（无限开发者，SAST 100 test/月，SCA 200 test/月）
  - Team: $25/人/月起（SAST 1000 test/月）
  - Ignite: 定制（<50 开发者，企业级）
  - Enterprise: 定制（无限测试）
- **优势**:
  - 安全领域专业度最高
  - 自托管 AI 引擎（隐私保护最佳）
  - 覆盖 LLM 库安全扫描（AI 代码安全独特优势）
  - Priority Score 风险优先级系统成熟
  - Stack Overflow 2024 开发者调查唯一入选 AI 安全工具
- **劣势**:
  - 纯安全工具，无代码质量评估
  - 价格较高（企业级）
  - Free tier 测试次数限制严格
  - 非安全类代码审查不覆盖
- **我们可以学习的点**:
  - Priority Score 综合评分模型
  - LLM 库安全扫描（AI 代码特有场景）
  - 自托管 AI 引擎架构
  - 修复建议 + 自动修复工作流

---

### 5. Semgrep

- **官网**: https://semgrep.dev
- **核心功能**:
  - 可编程静态分析引擎（35+ 语言）
  - 自定义规则编写（pattern-based，类似 grep 但语法感知）
  - SAST (Semgrep Code) + SCA (Supply Chain) + Secrets Detection
  - Semgrep Assistant（AI 驱动的分类和修复）
  - Cross-file 和 cross-function taint analysis（Pro Engine）
  - 恶意依赖检测
  - SBOM 生成
  - License Compliance
- **评分维度**:
  - 规则严重性：Critical / High / Medium / Low / Info
  - Auto-triage（AI 自动分类真/假阳性）
  - EPSS 漏洞利用概率评分（供应链）
  - 无综合质量评分
- **AI 集成方式**:
  - Semgrep Assistant 使用 GPT-4（远端 API）
  - Enterprise 支持 **Custom AI Model Provider**（可配置自定义模型端点）
  - AI Credits 配额制（Free 60/月，Teams 20/人/月，Enterprise 50/人/月）
  - CLI 完全本地运行（规则扫描不需要 AI）
- **报告格式**: CLI 输出（JSON/SARIF）、PR/MR comment、Web Dashboard、Slack/Email、Jira Ticketing、REST API
- **价格**:
  - Free: $0（10 私有 repo，10 contributors，基础 SAST+SCA）
  - Teams: $30/人/月（Code/Supply Chain 各 $30，Secrets $15）
  - Enterprise: 定制（自托管 SCM、自定义 CI/CD、无限 repo）
- **优势**:
  - **CLI 完全本地运行**（规则引擎无需网络）
  - 自定义规则能力最强（pattern-based，开发者友好）
  - Enterprise 支持自定义 AI 模型端点
  - 开源社区活跃（大量社区规则）
  - Cross-file taint analysis 能力强
- **劣势**:
  - AI 功能依赖外部 LLM（非自有模型）
  - 无代码质量评分（专注安全）
  - AI Credits 配额制可能限制使用
  - Pro 规则非开源
- **我们可以学习的点**:
  - **Custom AI Model Provider 机制**（用户配置自己的 LLM 端点）
  - CLI-first 本地运行架构
  - Pattern-based 自定义规则系统
  - Auto-triage AI 分类能力
  - SARIF 标准输出格式

---

### 6. DeepSource

- **官网**: https://deepsource.com
- **核心功能**:
  - AI 代码审查平台（混合静态分析 + AI Agent）
  - 5,000+ 确定性规则 + AI Review Agent
  - Autofix™（预生成的验证过补丁）
  - PR Report Card（5 维度结构化反馈）
  - Pull Request Gates（质量门禁）
  - Secrets Detection（165+ provider 验证）
  - OSS Vulnerability Scanning（可达性 + 污点分析）
  - Code Coverage 追踪
  - 合规报告（OWASP Top 10 / SANS Top 25）
  - IaC Review（Terraform/CloudFormation）
  - License Compliance
  - MCP Server（即将推出）
  - API & Webhooks
- **评分维度**:
  - **PR Report Card（5 维度）**:
    - Security（安全）
    - Reliability（可靠性）
    - Complexity（复杂度）
    - Hygiene（代码卫生）
    - Coverage（覆盖率）
  - **Overall PR Quality**：综合 PR 质量评估
  - **Focus Area + Guidance**：重点关注领域 + 修复指引
  - **Pull Request Gates**：可配置的合并门禁
- **AI 集成方式**: 远端 AI Agent（自有模型），不支持本地 AI
- **报告格式**: PR 内联 comment、PR Report Card、Web Dashboard（全代码库扫描）、合规报告
- **价格**:
  - Free: 未明确公开（OSS 免费）
  - Team: $24/人/月（年付）—— 无限 repo、无限 PR 审查
    - AI Review & Autofix™: $120 年度 credit/人 + 按需 ($8/100K input, $4/1K fixed lines)
    - OSS Dependency Scanning: 3 targets 含内 + $8/额外 target/月
  - Enterprise: 定制（自托管、SSO、SLA）
- **优势**:
  - **PR Report Card 5 维度评分**（最结构化的审查反馈）
  - OpenSSF CVE Benchmark 准确率最高（82.42%，超越 CodeRabbit 的 61.21%）
  - 混合分析（确定性规则 + AI Agent）减少误报
  - Autofix™ 是预验证的补丁（不是 AI 猜测）
  - SOC 2 Type II + GDPR 合规
- **劣势**:
  - AI Review 按用量计费（可能成本不可控）
  - 不支持本地 AI 模型
  - 相比 SonarQube 知名度较低
  - 自托管仅限 Enterprise
- **我们可以学习的点**:
  - **PR Report Card 5 维度评分体系**（最值得参考）
  - Overall PR Quality 综合评估
  - Focus Area + Guidance 指引模式
  - 确定性规则 + AI 混合分析架构
  - Autofix™ 预验证补丁模式

---

### 7. Qodana (JetBrains)

- **官网**: https://www.jetbrains.com/qodana/
- **核心功能**:
  - 基于 IntelliJ 检查引擎的静态分析
  - 与 JetBrains IDE 深度集成（IntelliJ、WebStorm 等）
  - Docker 容器化运行（CI/CD 集成）
  - Quality Profile 管理
  - Baseline 基线管理（增量分析）
  - 代码覆盖率
  - 漏洞检测
  - License 审计
  - Qodana Cloud Dashboard
- **评分维度**:
  - Quality Profile（基于 IntelliJ inspection severity）
  - Baseline diff（新增 issue vs 基线）
  - Severity: Critical / High / Medium / Low / Info
  - 代码覆盖率百分比
  - 无综合质量评分（无 A-F 或 Pass/Fail gate）
- **AI 集成方式**: 无 AI 能力（纯规则引擎，基于 IntelliJ 检查）；依赖 JetBrains AI Assistant 做 AI 修复建议
- **报告格式**: Qodana Cloud Dashboard、CI/CD badge、SARIF 输出、HTML 报告、IDE 内联
- **价格**:
  - Community: 免费（基础检查，有限语言）
  - Ultimate: 包含在 JetBrains All Products Pack（~$25/月/开发者起）或单独许可
  - Ultimate Plus: 高级安全功能（联系销售）
  - 60 天免费试用
- **优势**:
  - JetBrains 生态集成最佳（IDE 同步体验）
  - Docker 运行（完全本地，无代码外发）
  - IntelliJ 检查引擎成熟可靠
  - Baseline 增量分析实用
- **劣势**:
  - 无 AI 能力（在 AI 时代落后）
  - 绑定 JetBrains 生态
  - 官网和文档体验较差（JS 重，抓取困难）
  - 社区版功能有限
  - 无 PR comment 原生集成（需额外配置）
- **我们可以学习的点**:
  - Baseline 增量分析机制
  - Docker 容器化本地运行架构
  - SARIF 标准输出

---

### 8. Sourcery

- **官网**: https://sourcery.ai
- **核心功能**:
  - AI 代码审查（PR 级 + IDE 级 + Repo 级）
  - 安全扫描（跨 repo）
  - 代码标准执行
  - 与 AI coding agent 集成（MCP）
  - GitHub / GitLab 集成
  - IDE 插件（VS Code、JetBrains）
  - 实时反馈 + 一键修复
- **评分维度**:
  - Issue severity 分类
  - 无量化评分体系
  - 无质量评级
- **AI 集成方式**:
  - 使用第三方 LLM（OpenAI）
  - **支持 Bring Your Own LLM endpoint**（企业版）
  - Zero-retention 选项
  - 代码不存储（通过服务器但不持久化）
- **报告格式**: PR comment（GitHub/GitLab）、IDE 内联、跨 repo 安全报告
- **价格**:
  - Free: 开源项目免费
  - Pro: ~$20-30/人/月（年付省 20%）
  - Enterprise: 定制
  - 仅对分配席位的开发者收费
- **优势**:
  - **支持 BYOLLM**（自带 LLM 端点）
  - 轻量易用（300k+ 开发者）
  - SOC 2 认证
  - 同时覆盖 PR + IDE + Agent 三场景
- **劣势**:
  - 功能深度不如 CodeRabbit/DeepSource
  - 无量化质量评分
  - 默认依赖 OpenAI（隐私顾虑）
  - 规模和生态较小
- **我们可以学习的点**:
  - **BYOLLM（Bring Your Own LLM）** 机制
  - Zero-retention 隐私选项
  - PR + IDE + Agent 三场景覆盖

---

### 9. CodeClimate → Qlty

- **官网**: https://qlty.sh（CodeClimate 已重品牌为 Qlty）
- **核心功能**:
  - 代码质量平台（Linting + Auto-formatting + Coverage）
  - Maintainability 评分
  - Duplication 检测
  - 趋势和热点分析（Trends & Hotspots）
  - AI Autofix
  - **开源 Rust CLI**
  - 共享配置（Shared Configurations）
  - 组织策略（Organization Policies）
- **评分维度**:
  - **Maintainability**: 可维护性评分
  - **Duplication**: 重复度
  - **Code Coverage**: 覆盖率
  - **Trends**: 时间趋势
  - **Hotspots**: 问题热点区域
  - 无综合 A-F 评分
- **AI 集成方式**: AI Autofix（按配额），AI 模型未公开
- **报告格式**: PR comment、Web Dashboard（趋势图）、CI badge
- **价格**:
  - Free: $0（无限 contributor，1k analysis minutes/月，100 AI autofix/月）
  - Pro: $20/人/月（20k analysis minutes，5k AI autofix/月，1 年历史）
  - Enterprise: $30/人/月（75k analysis minutes，高级分析，策略管理）
  - 年付送 2 个月
  - 开源项目免费
- **优势**:
  - **开源 Rust CLI**（本地运行、可扩展）
  - Analysis minutes 用量模型透明
  - 热点分析有独特价值
  - Bot/AI 贡献者也计费（诚实的 AI 时代定价）
- **劣势**:
  - 品牌重塑可能导致市场混乱
  - AI Autofix 按配额限制
  - 功能深度不如 SonarQube
  - 安全分析能力较弱
- **我们可以学习的点**:
  - **开源 Rust CLI** 架构（我们也是开源 + CLI）
  - Trends & Hotspots 分析
  - Analysis minutes 用量计费模型
  - Bot/AI 贡献者也计费的定价思路

---

## 三、评分指标体系对比

| 维度 | SonarQube | CodeRabbit | Codacy | DeepSource | Semgrep | 我们(v0.2) | 建议(v0.3) |
|------|-----------|------------|--------|------------|---------|-----------|-----------|
| **综合评分** | Quality Gate (Pass/Fail) | ❌ 无 | Grade A-F | PR Report Card (5维) | ❌ 无 | 基础分数 | ✅ 多维评分 + Grade |
| **安全** | Vulnerability Rating A-E | Issue 分类 | Security Issues | Security 维度 | Rule Severity | 部分覆盖 | ✅ Security Score |
| **可靠性** | Reliability Rating A-E | Bug detection | Error Prone | Reliability 维度 | ❌ 无 | 部分覆盖 | ✅ Reliability Score |
| **可维护性** | Maintainability A-E | Style/Perf | Code Style+Complexity | Complexity+Hygiene | ❌ 无 | 基础 | ✅ Maintainability Score |
| **复杂度** | Cyclomatic+Cognitive | ❌ 无 | Cyclomatic | Complexity 维度 | ❌ 无 | ❌ 无 | ✅ Complexity Score |
| **重复度** | Duplication % | ❌ 无 | Duplication % | ❌ 无 | ❌ 无 | ❌ 无 | ✅ Duplication % |
| **覆盖率** | Coverage % | ❌ 无 | Coverage % | Coverage 维度 | ❌ 无 | ❌ 无 | ⚠️ 外部集成 |
| **技术债务** | SQALE (时间) | ❌ 无 | ❌ 无 | ❌ 无 | ❌ 无 | ❌ 无 | ✅ Tech Debt Score |
| **AI 代码归因** | ❌ 无 | ❌ 无 | AI Risk Hub | ❌ 无 | ❌ 无 | ✅ 基础 | ✅ AI Attribution |
| **修复建议** | AI CodeFix | AI Fix | AI Autofix | Autofix™ | AI Autofix | 基础建议 | ✅ AI + 社区链接 |

### 关键发现

1. **无工具同时具备综合评分 + AI 代码归因**：我们的差异化机会
2. **DeepSource 的 PR Report Card 5 维度最接近我们的目标**
3. **SonarQube 的 Quality Gate 是行业标准，必须兼容**
4. **Codacy 的 A-F 评分 + Issues/kLoC 是最直观的质量指标**
5. **所有工具都缺乏 "AI 生成代码特有缺陷" 检测维度**

---

## 四、报告格式对比

| 工具 | PR Comment | Web Dashboard | HTML 报告 | CLI 输出 | SARIF | IDE 内联 | API | Embed/Badge |
|------|-----------|--------------|----------|---------|-------|---------|-----|------------|
| CodeRabbit | ✅ 详细 | ✅ 基础 | ❌ | ✅ CLI | ❌ | ✅ | ✅ | ❌ |
| Codacy | ✅ PR check | ✅ 丰富 | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ Badge |
| SonarQube | ✅ PR decoration | ✅ 最丰富 | ✅ | ✅ Scanner | ✅ | ✅ Connected Mode | ✅ | ✅ Badge |
| Snyk | ✅ PR check | ✅ 高级报告 | ✅ | ✅ CLI | ✅ | ✅ | ✅ | ❌ |
| Semgrep | ✅ PR/MR | ✅ AppSec | ❌ | ✅ CLI (JSON/SARIF) | ✅ | ✅ | ✅ REST | ❌ |
| DeepSource | ✅ 内联+Report Card | ✅ Dashboard | ❌ | ❌ | ❌ | ❌ | ✅ GraphQL | ✅ Badge |
| Qodana | ⚠️ 需配置 | ✅ Qodana Cloud | ✅ HTML | ✅ CLI | ✅ | ✅ JetBrains | ✅ | ✅ Badge |
| Sourcery | ✅ PR comment | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| Qlty (CodeClimate) | ✅ PR comment | ✅ 趋势图 | ❌ | ✅ Rust CLI | ❌ | ❌ | ❌ | ✅ Badge |

### 报告格式建议（ai-code-validator v0.3）

我们应支持的输出格式优先级：

1. **CLI 输出（JSON + 人类可读）** — 开发者首选，CI/CD 集成基础
2. **SARIF 标准格式** — IDE 集成、GitHub Code Scanning 集成
3. **Markdown 报告** — PR comment + 独立报告
4. **HTML 报告** — 本地可视化查看（参考 SonarQube/Qodana）
5. **Badge/Embed** — README 展示
6. **Web Dashboard** — 长期目标（v1.0+）

---

## 五、本地 AI 能力对比

| 工具 | 本地运行 | 本地 AI | 自定义模型 | 代码外发 | 隐私等级 |
|------|---------|--------|-----------|---------|---------|
| **SonarQube CE** | ✅ 完全自托管 | ❌ AI 需 Cloud | ❌ | ❌ 规则引擎本地 | ⭐⭐⭐⭐⭐ |
| **Semgrep CLI** | ✅ CLI 本地 | ❌ Assistant 需远端 | ✅ Enterprise 自定义端点 | ❌ 规则扫描本地 | ⭐⭐⭐⭐ |
| **Qodana** | ✅ Docker 本地 | ❌ | ❌ | ❌ 检查本地 | ⭐⭐⭐⭐⭐ |
| **Qlty CLI** | ✅ Rust CLI 本地 | ❌ AI 需 Cloud | ❌ | ❌ Lint 本地 | ⭐⭐⭐⭐ |
| **Sourcery** | ❌ | ❌ | ✅ BYOLLM 端点 | ✅ 经服务器 | ⭐⭐ |
| **DeepSource** | ❌ 企业版可选 | ❌ | ❌ | ✅ Cloud 分析 | ⭐⭐ |
| **CodeRabbit** | ❌ 企业版可选 | ❌ | ❌ | ✅ Cloud 分析 | ⭐⭐ |
| **Codacy** | ❌ 仅 Cloud | ❌ | ❌ | ✅ Cloud 分析 | ⭐⭐ |
| **Snyk Code** | ❌ | ✅ 自托管 AI 引擎 | ❌ 自有引擎 | ⚠️ Broker 可用 | ⭐⭐⭐ |

### 关键发现

1. **没有任何工具同时支持完全本地 AI + 自定义模型选择**
2. Semgrep Enterprise 的 Custom AI Model Provider 最接近
3. Sourcery 的 BYOLLM 仅限远端端点，不是本地模型
4. Snyk 的 DeepCode AI 是自托管但不可更换
5. **本地 AI 代码审查是一个巨大的市场空白**

### 开源本地 AI 代码审查工具现状

目前市场上几乎没有成熟的开源本地 AI 代码审查工具。现有方案：

- **PR-Agent (Qodo)** — 开源，支持自定义 LLM，但聚焦 PR 审查
- **Aider** — AI 编码助手，非代码审查
- **Continue** — IDE AI 助手，非质量评估
- **各种 LLM wrapper** — 简单包装 LLM API 做代码审查，无评分体系

**结论：完全本地运行 + 可选本地/远端 AI + 量化评分体系 = 我们的核心差异化**

---

## 六、差异化机会

### 市场缺口分析

```
现有工具覆盖:
┌─────────────────────────────────────────┐
│  代码质量     安全分析     AI 审查       │
│  SonarQube    Snyk        CodeRabbit    │
│  Codacy       Semgrep     DeepSource    │
│  Qlty         Qodana      Sourcery      │
└─────────────────────────────────────────┘

我们的差异化定位:
┌─────────────────────────────────────────┐
│                                         │
│  ┌───────────────────────────────────┐  │
│  │  AI 代码特有缺陷检测              │  │
│  │  (非通用 lint/SAST)               │  │ ← 无竞品
│  └───────────────────────────────────┘  │
│                                         │
│  ┌───────────────────────────────────┐  │
│  │  本地 AI + 远端 AI 双通道         │  │ ← 极少竞品
│  │  (Ollama/自定义模型 + OpenAI)     │  │
│  └───────────────────────────────────┘  │
│                                         │
│  ┌───────────────────────────────────┐  │
│  │  AI 代码归因分类                  │  │ ← 仅 Codacy 初步
│  │  + 社区修复链接                   │  │
│  └───────────────────────────────────┘  │
│                                         │
│  ┌───────────────────────────────────┐  │
│  │  开源 + 自托管 + CI/CD Gate       │  │ ← SonarQube CE 最近
│  │  (完全免费的本地方案)             │  │   但无 AI
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

### ai-code-validator 差异化定位建议

#### 1. AI 代码特有缺陷检测（核心差异化 — 无竞品）

所有现有工具都是通用代码分析，没有专门针对 AI 生成代码的缺陷模式：
- AI 幻觉 API（调用不存在的方法/库）
- 过度简化的错误处理（AI 常见模式）
- 样板代码过多（AI 复制粘贴风格）
- 上下文丢失问题（AI 不理解项目架构）
- 安全反模式（AI 生成的 hardcoded secrets、SQL 拼接）
- 依赖版本过时（AI 训练数据截止日期问题）

#### 2. 本地 AI + 远端 AI 双通道（极少竞品）

- 支持 Ollama / LM Studio / vLLM 等本地模型
- 支持 OpenAI / Anthropic / DeepSeek 等远端 API
- 参考 Semgrep 的 Custom AI Model Provider 机制
- 参考 Sourcery 的 BYOLLM 方式
- **规则引擎完全本地，AI 分析可选本地/远端**

#### 3. 归因分类 + 社区链接（弱竞品）

- 标记 issue 是 AI 生成还是人工编写
- 链接到 Stack Overflow / GitHub Issues / 官方文档
- 类似 Snyk 的知识库但专注 AI 代码模式
- 参考 Codacy 的 AI Risk Hub 但更深入

#### 4. 开源 + 自托管 + 量化评分（SonarQube CE 对标但更现代）

- 完全开源（MIT/Apache）
- CLI-first（参考 Semgrep/Qlty）
- 量化评分（融合 SonarQube Quality Gate + DeepSource Report Card）
- 零配置开箱即用

---

## 七、功能优先级矩阵

| 功能 | 用户价值 | 实现难度 | 竞品覆盖度 | 优先级 |
|------|---------|---------|-----------|--------|
| **AI 代码特有缺陷规则库** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ 中 | 🔴 无竞品 | 🔥 P0 |
| **多维评分体系（5维 Report Card）** | ⭐⭐⭐⭐⭐ | ⭐⭐ 低 | 🟡 DeepSource/SonarQube | 🔥 P0 |
| **Quality Gate (Pass/Fail)** | ⭐⭐⭐⭐⭐ | ⭐⭐ 低 | 🟢 SonarQube/DeepSource | 🔥 P0 |
| **本地 AI 模型支持（Ollama）** | ⭐⭐⭐⭐ | ⭐⭐⭐ 中 | 🔴 无竞品 | 🔥 P0 |
| **远端 AI 支持（OpenAI/Anthropic）** | ⭐⭐⭐⭐ | ⭐⭐ 低 | 🟡 多家有 | P1 |
| **CLI JSON/SARIF 输出** | ⭐⭐⭐⭐ | ⭐ 低 | 🟢 多家有 | P1 |
| **PR comment 集成** | ⭐⭐⭐⭐ | ⭐⭐ 低 | 🟢 所有竞品 | P1 |
| **AI 代码归因分类** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ 高 | 🔴 仅 Codacy 初步 | P1 |
| **Markdown/HTML 报告** | ⭐⭐⭐ | ⭐ 低 | 🟢 多家有 | P1 |
| **社区修复链接** | ⭐⭐⭐ | ⭐⭐ 低 | 🟡 Snyk 有类似 | P2 |
| **自定义规则编写** | ⭐⭐⭐ | ⭐⭐⭐ 中 | 🟢 Semgrep 最强 | P2 |
| **覆盖率集成** | ⭐⭐⭐ | ⭐⭐ 低 | 🟢 多家有 | P2 |
| **IDE 插件** | ⭐⭐⭐ | ⭐⭐⭐⭐ 高 | 🟢 多家有 | P3 |
| **Web Dashboard** | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ 很高 | 🟢 多家有 | P3 (v1.0+) |
| **趋势分析 & 热点** | ⭐⭐ | ⭐⭐⭐ 中 | 🟡 Qlty/SonarQube | P3 |
| **MCP Server** | ⭐⭐ | ⭐⭐ 低 | 🟡 新兴 | P3 |

### v0.3 建议聚焦

```
P0 (Must Have):
├── AI 代码特有缺陷规则库（10-20 条核心规则）
├── 5 维评分体系（Security/Reliability/Maintainability/Complexity/AIQuality）
├── Quality Gate (Pass/Fail + 可配置阈值)
└── 本地 AI 模型支持（Ollama 集成）

P1 (Should Have):
├── 远端 AI 双通道（OpenAI/Anthropic）
├── CLI JSON + SARIF 输出
├── GitHub/GitLab PR comment
├── AI 代码归因分类
└── Markdown 报告生成

P2 (Nice to Have):
├── 社区修复链接
├── 自定义规则
└── 覆盖率集成
```

---

## 八、定价策略参考

| 竞品 | 定价模式 | 免费层 | 付费起步 |
|------|---------|-------|---------|
| CodeRabbit | 按人/月 | ✅ 有限功能 | $24/人/月 |
| Codacy | 按人/月 | ✅ OSS only | ~$15-19/人/月 |
| SonarQube | 按 LOC | ✅ 50k LOC | €30/月(100k LOC) |
| Snyk | 按人/月 | ✅ 有限测试 | $25/人/月 |
| Semgrep | 按人/月 | ✅ 10 repo | $30/人/月 |
| DeepSource | 按人/月 + AI 用量 | ✅ OSS | $24/人/月 + AI credit |
| Qlty | 按人/月 + 分析分钟 | ✅ 1k min/月 | $20/人/月 |
| Sourcery | 按席位/月 | ✅ OSS | ~$20-30/人/月 |

### 我们的定价建议

- **开源核心免费**（CLI + 规则引擎 + 本地 AI）
- **Cloud/SaaS 增值收费**（Dashboard + 团队管理 + 高级报告）
- **AI Credits 按需**（远端 AI 调用按用量）
- 参考 Qlty 的 analysis minutes 模型和 DeepSource 的 AI credit 模型

---

## 九、总结

### 竞争格局

```
                    AI 能力强
                       ↑
                       │
          CodeRabbit  DeepSource
          Sourcery     │
                       │
  安全聚焦 ←──────────┼──────────→ 质量聚焦
                       │
          Snyk    SonarQube  Codacy
          Semgrep     Qodana   Qlty
                       │
                       ↓
                    规则引擎
```

### 我们的定位

**ai-code-validator = "AI 代码的 SonarQube" + 本地 AI 能力**

核心差异化三角：
1. 🎯 **AI 代码专属**：不做通用 lint，专注 AI 生成代码的特有问题
2. 🏠 **本地优先**：CLI + 本地 AI，代码不离开你的机器
3. 📊 **量化评分**：不只是找 bug，给你一个质量分数和改进方向

> **最大市场空白**：没有任何现有工具专门针对 AI 生成代码提供量化质量评估 + 本地 AI 分析能力。这是我们的蓝海。