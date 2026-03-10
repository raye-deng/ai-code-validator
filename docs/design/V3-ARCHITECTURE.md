# AI Code Validator V3 — 技术架构设计

> **版本**: 3.0 | **日期**: 2026-03-11
> **状态**: 设计阶段
> **作者**: AI Code Validator 架构组
> **前置文档**: [V3 升级总纲](../V3-UPGRADE-PLAN.md) | [AI 缺陷分类](../research/ai-defect-taxonomy.md) | [竞品分析](../research/competitor-analysis.md) | [新检测器设计](new-detectors.md) | [报告系统设计](report-redesign.md)

---

## 一、架构总览

### 1.1 系统架构图

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      AI Code Validator V3                                │
│                                                                          │
│  CLI / CI Entry                                                          │
│  ┌────────┐ ┌───────┐ ┌────────┐ ┌──────────────┐                      │
│  │ scan   │ │ login │ │ report │ │ GH Action /  │                      │
│  │        │ │       │ │        │ │ GitLab CI    │                      │
│  └───┬────┘ └───┬───┘ └───┬────┘ └──────┬───────┘                      │
│      └──────────┴─────────┴──────────────┘                              │
│                         │                                                │
│  License Gate ──────────┤ AICV-XXXX → 缓存24h → 放行/拒绝              │
│                         │                                                │
│  Detection Engine ──────┤                                                │
│  ┌────────────────────────────────────────────────────────────────┐     │
│  │ Tier 1: Fast (oxc-parser, <0.5s/100files) — 必选              │     │
│  │   Hallucination v2 │ LogicGap v2    │ ContextBreak v2         │     │
│  │   StaleAPI         │ SecurityPattern│ OverEngineering         │     │
│  │   Duplication v2                                              │     │
│  ├────────────────────────────────────────────────────────────────┤     │
│  │ Tier 2: Type-Aware (ts-morph, <5s/100files) — 默认启用        │     │
│  │   TypeSafety       │ DeepHallucination (npm + exports)        │     │
│  ├────────────────────────────────────────────────────────────────┤     │
│  │ Tier 3: AI Analysis (--ai) — 可选                             │     │
│  │   Ollama (local) ──┤── Result Fusion ──│── OpenAI/Claude      │     │
│  └────────────────────────────────────────────────────────────────┘     │
│                         │                                                │
│  Scoring Engine V3 ─────┤                                                │
│  ┌──────────────┐┌──────────────┐┌──────────────┐┌──────────────┐      │
│  │AI Faithfulness││Code Freshness││Context       ││Implementation│      │
│  │   35%         ││   25%        ││Coherence 20% ││Quality 20%   │      │
│  └──────────────┘└──────────────┘└──────────────┘└──────────────┘      │
│  Grade: A+ / A / B / C / D / F   │   Quality Gate: Pass / Fail         │
│                         │                                                │
│  Report System ─────────┤                                                │
│  Terminal │ Markdown │ HTML │ JSON │ SARIF │ Badge SVG                   │
│                         │                                                │
│  Web Portal ────────────┤ Next.js + Directus                            │
│  Landing │ Auth │ Dashboard │ License │ Reports │ Docs                   │
└─────────────────────────────────────────────────────────────────────────┘
```

### 1.2 模块划分

```
ai-code-validator/
├── packages/
│   ├── core/src/
│   │   ├── ast/                       # [NEW] AST 基础设施
│   │   │   ├── parser.ts              #   oxc-parser 封装
│   │   │   ├── walker.ts              #   ESTree 遍历器
│   │   │   └── utils.ts              #   AST 工具函数
│   │   ├── detectors/                 # 检测器 (4 重构 + 5 新增)
│   │   │   ├── hallucination.ts       #   v2: AST 升级
│   │   │   ├── logic-gap.ts           #   v2: AST 升级
│   │   │   ├── duplication.ts         #   v2: AST 升级
│   │   │   ├── context-break.ts       #   v2: AST 升级
│   │   │   ├── stale-api.ts           #   [NEW] 过时 API
│   │   │   ├── security-pattern.ts    #   [NEW] 安全反模式
│   │   │   ├── over-engineering.ts    #   [NEW] 过度工程化
│   │   │   ├── type-safety.ts         #   [NEW] Tier 2
│   │   │   └── deep-hallucination.ts  #   [NEW] Tier 2
│   │   ├── ai/                        # [NEW] AI 分析集成
│   │   │   ├── provider.ts / ollama.ts / openai.ts / anthropic.ts
│   │   │   ├── prompts.ts            #   Prompt 模板
│   │   │   └── fusion.ts             #   结果融合
│   │   ├── scorer/                    # 评分 + 报告
│   │   │   ├── scoring-engine.ts      #   v3: 4 维评分
│   │   │   ├── report.ts / html-report.ts / svg-charts.ts / badge.ts
│   │   ├── license/                   # [NEW] License 验证
│   │   │   ├── validator.ts / cache.ts / api-client.ts
│   │   ├── data/deprecated-apis.json  # [NEW] 废弃 API 数据库
│   │   └── types.ts                   # 统一类型
│   └── cli/src/
│       ├── index.ts                   # v3: 新命令
│       ├── commands/ (scan / login / config)
│       └── config-loader.ts           # .aicv.yml
├── apps/web/                          # Web Portal
│   └── src/app/ (login / register / dashboard / docs / api)
└── .github/ .gitlab/                  # CI 集成
```

### 1.3 数据流

```
用户代码 → CLI(License验证 → 配置加载 → glob文件发现)
                       │
     ┌─────────────────┼─────────────────┐
     ▼                 ▼                 ▼
  Tier 1            Tier 2           Tier 3
  (oxc-parser)      (ts-morph)       (AI)
  7 检测器           2 检测器          Ollama/OpenAI
     │                 │                 │
     └────────┬────────┘                 │
              ▼                          │
      静态 Issues ◄── Result Fusion ─────┘ (去重+合并)
              │
    Scoring Engine V3 (4维 → 总分 → Grade → Gate)
              │
    ┌─────────┼─────────┬──────────┐
    ▼         ▼         ▼          ▼
 Terminal  Markdown   HTML     JSON/SARIF
```

---

## 二、检测引擎重设计

### 2.1 检测优先级分层

**核心原则**：传统 lint 工具已覆盖的问题 → info/low 降权。AI 独有缺陷 → 核心价值，权重最高。

**AI 独有问题（核心价值）**

| 优先级 | 缺陷类型 | 严重级别 | 检测器 |
|--------|---------|---------|--------|
| 🔴 P0 | 幻觉包/API | critical | DeepHallucinationDetector |
| 🔴 P0 | 训练数据过时 | high | StaleAPIDetector |
| 🔴 P0 | 上下文窗口断裂 | medium | ContextBreakDetector v2 |
| 🟡 P1 | 过度工程化 | medium | OverEngineeringDetector |
| 🟡 P1 | 不完整实现 | medium | LogicGapDetector v2 |
| 🟡 P1 | AI 安全反模式 | high | SecurityPatternDetector |
| 🟢 P2 | 训练数据泄露 | low | （未来版本） |

**传统工具已覆盖（降权）**

| 类型 | 传统工具 | V3 处理 |
|------|---------|---------|
| 代码格式/命名/未使用变量 | ESLint/Prettier | info（不扣分） |
| 基础 TS 类型错误 | tsc | 不检测 |
| 简单重复代码 | SonarQube | low（轻微扣分） |
| 基础安全问题 | Snyk/Semgrep | info（除非 AI 特有模式） |

### 2.2 检测器接口统一

```typescript
// packages/core/src/types.ts

export enum AIDefectCategory {
  HALLUCINATION = 'hallucination',
  STALE_KNOWLEDGE = 'stale-knowledge',
  CONTEXT_LOSS = 'context-loss',
  SECURITY_ANTIPATTERN = 'security',
  OVER_ENGINEERING = 'over-engineering',
  INCOMPLETE_IMPL = 'incomplete',
  TYPE_SAFETY = 'type-safety',
  ERROR_HANDLING = 'error-handling',
  DUPLICATION = 'duplication',
  TRAINING_LEAK = 'training-leak',
}

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

/** 统一 Issue 格式 — 所有检测器的输出标准 */
export interface UnifiedIssue {
  detector: string;               // 检测器名
  type: string;                   // 问题子类型
  severity: Severity;
  file: string;
  line: number;
  column?: number;
  message: string;
  suggestion?: string;
  category: AIDefectCategory;
  attribution: {
    rootCause: string;            // "训练数据滞后" | "上下文窗口限制" | "幻觉"
    frequency: 'common' | 'occasional' | 'rare';
  };
  references?: { urls: string[]; cweId?: string };
  autoFixable: boolean;
  fixEffort: 'trivial' | 'small' | 'medium' | 'large';
  confidence: number;             // 0.0-1.0
  source: 'static' | 'ai' | 'both';
}

/** 统一 Detector 接口 */
export interface Detector {
  readonly name: string;
  readonly tier: 1 | 2 | 3;
  analyze(
    filePath: string,
    source: string,
    ctx: AnalysisContext
  ): DetectorResult | Promise<DetectorResult>;
}

export interface DetectorResult {
  detector: string;
  file: string;
  issues: UnifiedIssue[];
  durationMs: number;
}

export interface AnalysisContext {
  projectRoot: string;
  config: AICVConfig;
  astCache: Map<string, any>;           // AST 缓存（同 run 共享）
  registryCache: Map<string, { exists: boolean; checkedAt: number }>;
}
```

**V2 现有检测器迁移**：4 个现有检测器（Hallucination、LogicGap、Duplication、ContextBreak）将：
1. 实现统一 `Detector` 接口
2. 用 oxc-parser AST 替代正则匹配
3. 输出包含 `category`、`attribution`、`references` 的 `UnifiedIssue`
4. 旧 `analyze()` 签名标记 deprecated

### 2.3 新增检测器详细设计

#### 2.3.1 StaleAPIDetector — 过时 API 检测

- **维度**：Code Freshness (25%) | **Tier**: 1 (oxc-parser)
- **算法**：AST 遍历 `CallExpression`/`NewExpression` → 限定名解析 → `deprecated-apis.json` 匹配
- **数据库**：~50KB JSON，GitHub Actions 每周自动更新（Node.js DEP list + MDN + React）
- **优先覆盖**：`Buffer()`、`fs.exists()`、`crypto.createCipher()`、`url.parse()`、`componentWillMount`

#### 2.3.2 SecurityPatternDetector — 安全反模式

- **维度**：AI Faithfulness (35%) | **Tier**: 1 (oxc-parser)
- **子检测**：硬编码密钥 (CWE-798)、SQL 注入 (CWE-89)、eval (CWE-95)、弱加密 (CWE-328)、Math.random (CWE-338)
- **排除**：test 文件跳过 secret 检测；排除 tagged template (`sql`)；排除 `process.env` 引用

#### 2.3.3 OverEngineeringDetector — 过度工程化

- **维度**：Implementation Quality (20%) | **Tier**: 1 (oxc-parser)
- **阈值**：圈复杂度 >10 warn / >20 error；认知复杂度 >15 warn / >30 error；函数 >50 行 warn / >100 行 error；嵌套 >4 warn / >6 error；参数 >5 warn / >8 error

#### 2.3.4 TypeSafetyDetector — 类型安全

- **维度**：Implementation Quality (20%，降权 low) | **Tier**: 2 (ts-morph)
- **检测**：any 使用率 >10%、`as any` 断言、导出函数缺返回类型（>5 行）
- **降权理由**：`@typescript-eslint` 已覆盖大部分，仅标记 AI 特有的 any 滥用

#### 2.3.5 DeepHallucinationDetector — 深度幻觉

- **维度**：AI Faithfulness (35%) | **Tier**: 2 (ts-morph + npm registry)
- **Phase 1 — 包存在性**：`HEAD registry.npmjs.org/{pkg}` → 404 = phantom-package (critical)
- **Phase 2 — 导出验证**：读 `node_modules`/`@types` .d.ts → 导入名不存在 = phantom-export (critical)
- **Phase 3 — 方法验证**：ts-morph 类型检查 → 方法不存在 = phantom-method (critical)
- **缓存**：npm 查询 24h 缓存；网络错误 → 假设存在（保守，避免误报）

### 2.4 AI 分析集成

#### 本地 AI (Ollama) 配置

```yaml
# .aicv.yml
ai:
  local:
    enabled: true
    provider: ollama
    model: deepseek-coder-v2:16b
    endpoint: http://localhost:11434
    temperature: 0.1
    timeoutMs: 30000
```

#### 远端 AI (OpenAI/Claude) 配置

```yaml
ai:
  remote:
    enabled: false              # 默认关闭
    provider: openai            # openai | anthropic | custom
    model: gpt-4o-mini
    apiKey: ${OPENAI_API_KEY}
    maxFileSizeBytes: 50000     # 跳过大文件
```

#### 策略配置

```yaml
ai:
  strategy: local-first         # local-first | remote-first | local-only | remote-only
  fallback: true                # 本地失败时 fallback 到远端
```

#### Prompt 设计

三种专用模板（均要求输出严格 JSON）：

1. **Code Review** — 通用（逻辑、边界、AI 模式），输出 `issues[]` 含 line/severity/category/confidence
2. **Security** — 安全专项（注入/密钥/加密/认证），输出 `vulnerabilities[]` 含 cweId
3. **Logic Consistency** — 未实现函数、空 catch、null 风险、竞态

#### 结果融合

```
静态 Issues + AI Issues → 去重(同文件±3行+同category)
  → 置信度: 静态=0.9, AI确认静态=0.95, AI独有=conf×0.8, 矛盾=conf×0.5
  → 过滤 confidence<0.3 → 按 severity/confidence 排序
```

---

## 三、评分引擎重设计

### 3.1 新评分维度

| 维度 | 权重 | 聚焦 | 对应检测器 |
|------|------|------|-----------|
| **AI Faithfulness** | 35 | 幻觉 — 包/API/方法是否真实存在 | Hallucination v2, DeepHallucination, SecurityPattern |
| **Code Freshness** | 25 | 时效性 — 过时 API、废弃方法 | StaleAPI |
| **Context Coherence** | 20 | 连贯性 — 长文件一致性、跨函数逻辑 | ContextBreak v2 |
| **Implementation Quality** | 20 | 实现质量 — 完整性、错误处理、复杂度 | LogicGap v2, Duplication v2(降权), OverEngineering, TypeSafety(降权) |

### 3.2 严重级别定义

| 级别 | 扣分/个 | 说明 | 示例 |
|------|--------|------|------|
| critical | -15 | AI 幻觉导致运行时错误 | 引用不存在的包 |
| high | -10 | AI 生成的严重缺陷 | 过时 API、硬编码密钥 |
| medium | -5 | AI 典型问题 | 上下文断裂、过度工程化 |
| low | -2 | 轻微问题 | 命名不一致、简单重复 |
| info | 0 | 仅提示 | 传统 lint 已覆盖 |

### 3.3 扣分规则

```typescript
// 扣分计算
function scoreDimension(maxScore: number, issues: UnifiedIssue[]): number {
  const deductions = { critical: 15, high: 10, medium: 5, low: 2, info: 0 };
  let total = 0;
  for (const issue of issues) total += deductions[issue.severity];
  const normalized = Math.min(maxScore, (total / 100) * maxScore);
  return Math.max(0, Math.round((maxScore - normalized) * 100) / 100);
}

// 总分 = 4 个维度分数之和 (满分 100)
const totalScore = faithfulness + freshness + coherence + quality;
```

每个维度扣分封顶为该维度满分。

### 3.4 Grade 计算

| Grade | 分数 | 含义 | 默认 Gate |
|-------|------|------|----------|
| **A+** | 95-100 | 无 AI 特有问题 | ✅ Pass |
| **A** | 90-94 | 极少 AI 问题 | ✅ Pass |
| **B** | 80-89 | 少量低级 AI 问题 | ✅ Pass |
| **C** | 70-79 | 有一些 AI 问题需关注 | ✅ Pass（默认阈值 70） |
| **D** | 60-69 | 多个 AI 问题需修复 | ❌ Fail |
| **F** | 0-59 | 严重 AI 问题，不建议合并 | ❌ Fail |

---

## 四、License 系统设计

### 4.1 License Key 格式和生成

**格式**：`AICV-XXXX-XXXX-XXXX-XXXX`（如 `AICV-8F3A-K9D2-P7X1-Q4M6`）

```typescript
function generateLicenseKey(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 去除 0/O/1/I/L
  const segment = () => Array.from({ length: 4 },
    () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `AICV-${segment()}-${segment()}-${segment()}-${segment()}`;
}
```

- **存储**：Directus 数据库 `licenses` collection
- **生成时机**：用户注册 Portal 时自动生成
- **限制**：无功能限制，仅做用户追踪和使用统计

### 4.2 验证流程

```
CLI 启动
 ├─ 读 License Key (优先级: --license > $AICV_LICENSE > .aicv.yml > ~/.aicv/config)
 ├─ 检查本地缓存 (~/.aicv/cache/license.json, TTL=24h)
 │   ├─ 缓存有效 → 放行
 │   └─ 过期/无缓存 → 在线验证
 ├─ POST https://codes.evallab.ai/api/v1/license/verify
 │   ├─ 200 → 缓存 → 放行
 │   ├─ 401 → 拒绝, 提示注册
 │   └─ 网络错误 → 宽松模式 (过期缓存也放行)
 └─ 无 License → 提示 `aicv login` 或注册
```

### 4.3 API 设计

| Method | Path | 描述 |
|--------|------|------|
| `POST` | `/api/v1/license/verify` | 验证 License Key |
| `POST` | `/api/v1/license/generate` | 注册时自动生成 |
| `POST` | `/api/v1/license/regenerate` | 重新生成（旧 key 失效） |
| `GET` | `/api/v1/license/info` | 查询 License 信息 |
| `POST` | `/api/v1/telemetry/scan` | 上报扫描统计（可选 opt-in） |

### 4.4 离线缓存

```json
// ~/.aicv/cache/license.json
{
  "key": "AICV-8F3A-K9D2-P7X1-Q4M6",
  "valid": true,
  "userId": "usr_xxx",
  "verifiedAt": "2026-03-11T00:00:00Z",
  "ttlSeconds": 86400
}
```

- TTL 24 小时，过期后下次运行时重新在线验证
- **网络不可用时的宽松模式**：即使缓存过期，只要曾经验证成功过，仍允许运行（最长宽限 7 天）
- 缓存文件权限 `0600`（仅用户可读写）

---

## 五、Web Portal 设计

### 5.1 页面路由

| 路由 | 页面 | 认证 | 说明 |
|------|------|------|------|
| `/` | Landing Page | 否 | 产品首页（已有，改造） |
| `/login` | 登录 | 否 | GitHub OAuth + Email Magic Link |
| `/register` | 注册 | 否 | 注册 → 自动生成 License |
| `/dashboard` | 仪表盘 | 是 | License Key、使用统计、最近扫描 |
| `/dashboard/license` | License 管理 | 是 | 查看/复制/重新生成 |
| `/dashboard/reports` | 报告历史 | 是 | 历史扫描结果列表 |
| `/docs` | 文档 | 否 | 安装、配置、CI 集成教程 |
| `/docs/[slug]` | 文档详情 | 否 | MDX 渲染 |

### 5.2 认证（NextAuth.js）

```typescript
// apps/web/src/lib/auth.ts
import NextAuth from 'next-auth';
import GitHub from 'next-auth/providers/github';
import Email from 'next-auth/providers/email';

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
    }),
    Email({
      server: process.env.EMAIL_SERVER,      // SMTP
      from: 'noreply@evallab.ai',
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      // 首次登录 → 在 Directus 创建用户 + 生成 License Key
      await ensureDirectusUser(user, account);
      return true;
    },
    async session({ session, token }) {
      session.user.licenseKey = token.licenseKey;
      return session;
    },
  },
});
```

### 5.3 Dashboard 功能

**仪表盘首页** (`/dashboard`)：
- License Key 显示 + 一键复制
- 使用统计：总扫描次数、最近 30 天趋势
- 最近 5 次扫描结果摘要（分数、Grade、文件数）
- 快速开始：安装命令、配置示例

**报告历史** (`/dashboard/reports`)：
- 扫描记录列表（时间、项目、分数、Grade）
- 点击查看完整 HTML 报告
- 数据从 CLI `--upload` 标志或 CI 上传

### 5.4 License 管理

**License 页面** (`/dashboard/license`)：
- 当前 License Key（带遮罩，点击显示）
- 复制到剪贴板按钮
- 重新生成按钮（旧 key 立即失效）
- 使用说明：环境变量 / 配置文件 / CLI 参数 / login 命令
- API 调用统计

### 5.5 数据库设计（Directus Collections）

#### `users` Collection

| 字段 | 类型 | 说明 |
|------|------|------|
| id | uuid | 主键 |
| email | string | 邮箱（唯一） |
| name | string | 用户名 |
| github_id | string | GitHub 用户 ID |
| avatar_url | string | 头像 |
| created_at | datetime | 注册时间 |

#### `licenses` Collection

| 字段 | 类型 | 说明 |
|------|------|------|
| id | uuid | 主键 |
| user_id | uuid → users | 关联用户 |
| key | string | License Key（唯一索引） |
| status | enum | active / revoked |
| created_at | datetime | 创建时间 |
| last_verified_at | datetime | 最后验证时间 |

#### `scan_records` Collection

| 字段 | 类型 | 说明 |
|------|------|------|
| id | uuid | 主键 |
| license_id | uuid → licenses | 关联 License |
| project_name | string | 项目名 |
| score | integer | 总分 |
| grade | string | 等级 |
| total_files | integer | 扫描文件数 |
| total_issues | integer | 问题数 |
| report_json | json | 完整报告 JSON |
| created_at | datetime | 扫描时间 |

---

## 六、CLI 升级

### 6.1 新命令

```bash
# 扫描（已有，增强）
aicv scan [paths...] [options]
  --threshold <n>        # 最低分数 (默认 70)
  --format <fmt>         # terminal | json | markdown | html | sarif
  --output <path>        # 输出文件
  --license <key>        # License Key
  --fast                 # 仅 Tier 1 (跳过 ts-morph)
  --deep                 # Tier 1 + 2 (默认)
  --ai                   # 启用 AI 分析 (Tier 3)
  --ai-provider <p>      # ollama | openai | anthropic
  --ai-model <m>         # 模型名
  --heal                 # 生成 AI 修复建议
  --badge                # 生成 Badge SVG
  --upload               # 上传报告到 Portal

# 登录（新增）
aicv login               # 打开浏览器登录 Portal，自动保存 License

# 配置（新增）
aicv config              # 显示当前配置
aicv config set <k> <v>  # 设置配置项

# 帮助
aicv help
aicv --version
```

### 6.2 配置文件 .aicv.yml

```yaml
# .aicv.yml — 项目根目录

# License Key（也可通过环境变量 AICV_LICENSE 或 CLI --license 传入）
license: AICV-8F3A-K9D2-P7X1-Q4M6

# 扫描配置
scan:
  paths:
    - src/**/*.ts
    - src/**/*.tsx
  exclude:
    - "**/*.test.*"
    - "**/*.spec.*"
    - "**/node_modules/**"
  threshold: 70               # Quality Gate 阈值

# 检测器配置
detectors:
  tier1: true                 # 快速检测（必选）
  tier2: true                 # 类型感知（默认启用）
  staleApi:
    enabled: true
    customDeprecations: []    # 自定义废弃 API 列表
  security:
    enabled: true
    skipTestFiles: true       # 测试文件跳过密钥检测
  overEngineering:
    cyclomaticThreshold: 10
    cognitiveThreshold: 15
    maxFunctionLength: 50

# AI 分析配置
ai:
  local:
    enabled: false
    provider: ollama
    model: deepseek-coder-v2:16b
    endpoint: http://localhost:11434
  remote:
    enabled: false
    provider: openai
    model: gpt-4o-mini
    apiKey: ${OPENAI_API_KEY}
  strategy: local-first       # local-first | remote-first | local-only | remote-only
  fallback: true

# 报告配置
report:
  format: terminal            # terminal | json | markdown | html | sarif
  output: null                # 输出文件路径
  badge: false                # 是否生成 Badge SVG
  upload: false               # 是否上传到 Portal
```

**配置优先级**（从高到低）：
1. CLI 命令行参数
2. 环境变量 (`AICV_LICENSE`, `AICV_AI_PROVIDER` 等)
3. 项目 `.aicv.yml`
4. 用户全局 `~/.aicv/config.yml`
5. 内置默认值

### 6.3 输出格式

| 格式 | 标志 | 用途 | 说明 |
|------|------|------|------|
| **terminal** | `--format terminal` | 开发者本地使用 | 彩色输出 + Unicode + OSC 8 超链接 |
| **markdown** | `--format markdown` | PR comment | 支持 `<details>` 折叠 + emoji bar |
| **html** | `--format html` | 独立报告 | Lighthouse 风格，单文件 <50KB |
| **json** | `--format json` | 程序化消费 | 完整 AggregateScore 对象 |
| **sarif** | `--format sarif` | IDE + GitHub Code Scanning | SARIF 2.1.0 标准 |
| **badge** | `--badge` | README 展示 | shields.io 风格 SVG |

---

## 七、CI 集成

### 7.1 GitHub Action

```yaml
# .github/workflows/ai-validate.yml
name: AI Code Validation
on: [pull_request]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: AI Code Validator
        uses: raye-deng/ai-code-validator@v3
        with:
          license: ${{ secrets.AICV_LICENSE }}
          threshold: 70
          format: markdown
          paths: src/
          # 可选 AI 分析
          ai-provider: openai
          ai-model: gpt-4o-mini
          ai-api-key: ${{ secrets.OPENAI_API_KEY }}
      
      - name: Comment PR
        if: always()
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            const report = fs.readFileSync('aicv-report.md', 'utf8');
            github.rest.issues.createComment({
              ...context.repo,
              issue_number: context.issue.number,
              body: report
            });
```

**Action 工作流**：
1. 安装 `ai-code-validator` CLI
2. 验证 License（使用 GitHub Secret）
3. 运行扫描
4. 生成 Markdown 报告
5. 作为 PR Comment 发布
6. exit code 0/1 控制 CI 通过/失败

### 7.2 GitLab Component

```yaml
# .gitlab-ci.yml
include:
  - component: $CI_SERVER_FQDN/raye-deng/ai-code-validator/validate@v3
    inputs:
      license: $AICV_LICENSE
      threshold: 70
      paths: src/

# 或手动配置
ai-code-validate:
  stage: test
  image: node:22-slim
  script:
    - npx ai-code-validator scan src/ --license $AICV_LICENSE --threshold 70 --format gitlab-report --output gl-code-quality-report.json
  artifacts:
    reports:
      codequality: gl-code-quality-report.json
```

### 7.3 通用 CI（Jenkins / CircleCI 等）

```bash
# 任何 CI 系统
npm install -g ai-code-validator
export AICV_LICENSE=$LICENSE_KEY
ai-code-validator scan ./src --threshold 70 --format json --output report.json

# 检查退出码
if [ $? -ne 0 ]; then
  echo "AI Code Validation failed!"
  exit 1
fi
```

---

## 八、实施计划

### Phase 1（1 周）：Core 重构 + 评分重设计

| 任务 | 描述 | 优先级 |
|------|------|--------|
| 统一类型定义 | `types.ts` — UnifiedIssue, Detector, AIDefectCategory | P0 |
| AST 基础设施 | 集成 oxc-parser，构建 walker/utils | P0 |
| 4 个检测器 AST 升级 | Hallucination/LogicGap/Duplication/ContextBreak → v2 | P0 |
| 评分引擎 V3 | 4 维度 + 新扣分规则 + A+~F 等级 | P0 |
| 配置系统 | .aicv.yml 解析器 + 优先级链 | P1 |

**交付物**：`packages/core` 完成重构，所有现有测试通过，新评分体系就绪。

### Phase 2（1 周）：新检测器实现

| 任务 | 描述 | 优先级 |
|------|------|--------|
| StaleAPIDetector | 废弃 API 检测 + deprecated-apis.json 数据库 | P0 |
| SecurityPatternDetector | 5 类安全反模式检测 | P0 |
| OverEngineeringDetector | 圈复杂度 + 认知复杂度 + 函数长度 | P0 |
| TypeSafetyDetector | ts-morph 集成 + any 检测 | P1 |
| DeepHallucinationDetector | npm registry 验证 + 导出检查 | P1 |

**交付物**：9 个检测器全部可用，Tier 1 + Tier 2 完整。

### Phase 3（1 周）：License + Portal

| 任务 | 描述 | 优先级 |
|------|------|--------|
| License 验证模块 | validator + cache + api-client | P0 |
| CLI login 命令 | 浏览器 OAuth 流程 | P0 |
| Portal 认证 | NextAuth.js (GitHub + Email) | P0 |
| Dashboard 页面 | License 管理 + 使用统计 | P1 |
| Directus 数据模型 | users + licenses + scan_records | P0 |
| License API | verify / generate / regenerate | P0 |

**交付物**：用户可注册获取 License，CLI 可验证并运行。

### Phase 4（1 周）：AI 集成 + 报告美化

| 任务 | 描述 | 优先级 |
|------|------|--------|
| AI Provider 框架 | 抽象接口 + Ollama 实现 | P0 |
| Prompt 模板 | 3 种专用 prompt | P0 |
| Result Fusion | 去重 + 置信度合并 | P0 |
| OpenAI/Anthropic 实现 | 远端 AI 集成 | P1 |
| HTML 报告 | Lighthouse 风格 + SVG 图表 | P0 |
| Terminal 报告升级 | 彩色 + 归因树 + OSC 8 链接 | P1 |
| Markdown 报告升级 | 折叠详情 + emoji bar + 归因表 | P1 |
| Badge SVG | shields.io 风格 | P2 |

**交付物**：完整的 V3 功能，本地/远端 AI 可用，多格式美化报告。

### Phase 5（持续）：运营 + 推广

| 任务 | 描述 |
|------|------|
| GitHub Action 发布 | Marketplace 上架 |
| GitLab Component 发布 | components.gitlab.com |
| 用户文档 | 安装/配置/CI 集成指南 |
| Portal 文档页 | MDX 渲染 /docs 路由 |
| 社区推广 | HN/Reddit/GitHub 评论 + 博客 |
| 废弃 API 数据库自动更新 | 每周 GitHub Actions cron |
| 报告上传 + 历史 | Dashboard 报告页功能 |

---

## 附录：技术选型摘要

| 组件 | 选型 | 理由 |
|------|------|------|
| AST 解析 (Tier 1) | **oxc-parser** | 3x 快于 SWC，ESTree 兼容，~0.1s/100 files |
| AST 解析 (Tier 2) | **ts-morph** (optional dep) | 最佳 DX，完整类型信息，~3s/100 files |
| Terminal 颜色 | **picocolors** | 3.5KB 零依赖，2x 快于 chalk |
| 配置文件 | **YAML** (.aicv.yml) | 业界标准，人类可读 |
| Web 框架 | **Next.js 15** (已有) | SSR + API Routes |
| 认证 | **NextAuth.js v5** | GitHub OAuth + Email Magic Link |
| 后端 CMS | **Directus** (已部署) | headless CMS + 用户/License 数据 |
| HTML 图表 | **纯 SVG** | 0KB 依赖，donut + radar 足够 |
| CI 报告格式 | **SARIF 2.1.0** | GitHub Code Scanning + IDE 集成 |

---

> **总结**：V3 的核心转变是从"通用代码质量检查"转向"AI 代码独有缺陷检测"。通过传统 lint 降权、AI 独有问题升权、免费 License 全平台可用的策略，我们在竞品完全没有覆盖的蓝海领域建立差异化。9 个检测器 + 三层 Tier 架构 + 本地/远端 AI 双通道，为开发者提供从快速扫描到深度分析的完整解决方案。