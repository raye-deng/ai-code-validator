# AI Code Validator + Agent Safehouse 产品整合研究

**日期:** 2026-03-09
**调研目标:** 探索将本地 AI Agent 安全沙盒集成到 ai-code-validator 的可能性

---

## 一、Agent Safehouse 技术分析

### 1.1 核心技术原理

**实现方式:**
- 基于 macOS 原生 `sandbox-exec` 命令
- 内核级访问控制（非应用层拦截）
- Deny-first 访问模型：默认拒绝所有，除非显式授权

**隔离能力:**
```bash
# 文件系统访问控制
~/my-project/read/write   ← 当前项目可读写
~/shared-lib/read-only    ← 共享库只读
~/.ssh/denied            ← SSH 私钥拒绝
~/.aws/denied            ← AWS 凭证拒绝
~/other-repos/denied      ← 其他仓库拒绝

# 运行示例
safehouse claude --dangerously-skip-permissions
# 自动授权：当前 git root 读写 + 工具链只读
# 拒绝：SSH keys、其他项目、个人文件
```

**验证示例:**
```bash
# 尝试读取 SSH 私钥 — 内核直接拦截
safehouse cat ~/.ssh/id_ed25519
# cat: /Users/you/.ssh/id_ed25519: Operation not permitted

# 列表其他项目 — 不可见
safehouse ls ~/other-project
# ls: /Users/you/other-project: Operation not permitted

# 当前项目正常工作
safehouse ls .
# README.md src/ package.json ...
```

### 1.2 优势与限制

**优势:**
- ✅ 零依赖：单个 shell script，无需构建
- ✅ 内核级隔离：性能开销极小
- ✅ 即装即用：一行命令下载，chmod +x
- ✅ Shell 集成：通过 wrapper 函数自动包装所有 agent 命令
- ✅ LLM 辅助配置：可用 Claude 生成定制化的 `sandbox-exec` profile

**限制:**
- ⚠️ macOS 原生：不跨平台（Linux/Windows 需要替代方案）
- ⚠️ 依赖 macOS sandbox 机制：需要系统版本支持
- ⚠️ 配置复杂性：定制化 profile 需要理解 sandbox 语法

### 1.3 与 ai-code-validator 的契合点

| Agent Safehouse 能力 | ai-code-validator 需求 | 契合度 |
|---------------------|----------------------|--------|
| 文件系统隔离 | 防止 AI 扫描敏感文件（SSH、.env） | 🟢 高 |
| 进程隔离 | 防止 AI 修改系统文件/配置 | 🟢 高 |
| 可审计的访问日志 | 记录 AI 实际访问的路径/资源 | 🟢 高 |
| 权限粒度控制 | 不同项目不同安全策略 | 🟢 高 |
| 自动包装命令 | CI/CD 环境中的 AI 代码验证 | 🟡 中 |
| LLM 辅助配置 | ai-code-validator 的自愈循环 | 🟡 中 |

---

## 二、产品整合方案设计

### 2.1 定位延伸：从 "代码质量检查" 到 "AI 开发安全套件"

**当前定位 (ai-code-validator):**
> AI 生成代码的 CI/CD 质量门禁

**延伸后定位:**
> **AI 开发全栈安全套件**
> - 代码质量验证（幻觉、逻辑、风格）
> - 运行时隔离（文件系统、网络、进程）
> - 可追溯审计（访问日志、变更历史）

**价值主张:**
```
传统安全工具：防止 "坏人" 攻击你的代码
AI 安全套件：防止 "好 AI" 意外毁掉你的系统
```

### 2.2 产品架构

```
┌─────────────────────────────────────────────────────────┐
│              AI 开发安全套件 (Suite)                  │
│                                                       │
│  ┌──────────────────────┐  ┌──────────────────────┐  │
│  │  代码质量验证       │  │  运行时隔离         │  │
│  │  (Code Quality)     │  │  (Sandbox)          │  │
│  ├──────────────────────┤  ├──────────────────────┤  │
│  │ • 幻觉包检测       │  │ • 文件系统隔离       │  │
│  │ • 逻辑缺口检测     │  │ • 网络请求拦截      │  │
│  │ • 风格一致性       │  │ • 进程权限控制      │  │
│  │ • AI 自愈循环      │  │ • 访问审计日志      │  │
│  └──────────────────────┘  └──────────────────────┘  │
│              ↓                      ↓                 │
│         ┌────────────────────────────────────┐        │
│         │  统一报告 & 治理仪表盘           │        │
│         │  (Unified Dashboard)             │        │
│         └────────────────────────────────────┘        │
└─────────────────────────────────────────────────────────┘
```

### 2.3 模块划分

#### 模块 1: `@ai-code-validator/core` (现有)
- AI 代码质量检测引擎
- 评分系统（0-100，4 维度）
- 自愈提示生成

#### 模块 2: `@ai-code-validator/sandbox` (新增)
- **macOS 版本**：集成 Agent Safehouse (sandbox-exec)
- **Linux 版本**：集成 Firejail / Bubblewrap
- **Windows 版本**：集成 Windows Sandbox App Container
- 统一 API：
  ```typescript
  interface SandboxConfig {
    allowRead: string[];      // 只读路径
    allowWrite: string[];     // 读写路径
    denyAll: boolean;         // 是否拒绝默认访问
    auditLog: boolean;        // 是否记录访问日志
  }

  interface SandboxResult {
    success: boolean;
    stdout: string;
    stderr: string;
    auditLog: AccessLog[];   // 访问审计记录
  }

  async function runInSandbox(
    command: string,
    config: SandboxConfig
  ): Promise<SandboxResult>;
  ```

#### 模块 3: `@ai-code-validator/cli` (扩展)
```bash
# 现有命令
npx ai-code-validator scan ./src

# 新增命令：沙盒模式运行 AI 工具
npx ai-code-validator sandbox --allow-read ./src,./lib --allow-write ./dist \
  -- claude "实现一个排序函数"

# 集成模式：扫描 + 沙盒运行
npx ai-code-validator secure-scan ./src \
  --with-sandbox \
  --run-fixes-in-sandbox \
  --audit-report sandbox-audit.json
```

#### 模块 4: `@ai-code-validator/dashboard` (新增)
- Web 仪表盘
- 代码质量报告 + 访问审计日志
- 跨项目的安全策略管理
- 告警规则（异常文件访问、敏感路径触碰）

### 2.4 核心功能

#### 功能 1: 敏感文件保护
```typescript
// 自动检测敏感文件，加入沙盒黑名单
const sensitivePatterns = [
  '**/.ssh/**',
  '**/.aws/**',
  '**/.env*',
  '**/*_key.pem',
  '**/credentials.json',
];

// CLI 自动配置
npx ai-code-validator sandbox --protect-sensitive-files \
  -- claude "部署到 AWS S3"
// 自动拒绝 ~/.aws/credentials 访问
```

#### 功能 2: 访问审计与异常检测
```typescript
// 访问日志结构
interface AccessLog {
  timestamp: number;
  operation: 'read' | 'write' | 'execute';
  path: string;
  success: boolean;
  sandboxed: boolean;
}

// 异常检测规则
const anomalyRules = [
  { type: 'sensitive-access', pattern: '**/.ssh/**', severity: 'critical' },
  { type: 'cross-project', pattern: '~/other-*/**', severity: 'high' },
  { type: 'network-request', pattern: 'https://*', severity: 'warning' },
];
```

#### 功能 3: CI/CD 集成（GitHub Actions）
```yaml
# .github/workflows/ai-secure-dev.yml
jobs:
  secure-dev:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4

      # 步骤 1: 扫描代码质量
      - name: Validate AI Code Quality
        uses: raye-deng/ai-code-validator/validate@v1
        with:
          threshold: 70

      # 步骤 2: 沙盒模式运行修复
      - name: Apply AI Fixes (Sandboxed)
        uses: raye-deng/ai-code-validator/sandbox@v1
        with:
          command: "claude --apply-fixes ai-heal-prompt.md"
          allow-read: "src,lib,package.json"
          allow-write: "src"
          deny-all: true

      # 步骤 3: 审计报告上传
      - name: Upload Sandbox Audit Log
        uses: actions/upload-artifact@v4
        with:
          name: sandbox-audit
          path: sandbox-audit.json
```

---

## 三、推广策略

### 3.1 开源项目贡献 PR 策略（用户建议）

**核心思路:** 成为开源项目的贡献者 → 集成 ai-code-validator → 获得推广

**目标项目分类:**

| 类型 | 优先级 | 典型项目 | 推广策略 |
|------|--------|----------|----------|
| **AI 辅助开发工具** | 🔴 高 | Cursor, Continue.dev, Codeium | 贡献 "AI 代码质量检查插件" |
| **AI Agent 框架** | 🔴 高 | LangChain, AutoGPT, CrewAI | 集成 "安全运行沙盒" |
| **CI/CD 工具** | 🟡 中 | GitHub Actions 市场, GitLab Components | 官方收录，模板化配置 |
| **热门 AI 生成项目** | 🟡 中 | GitHub 上 AI 贡献 >50% 的热门 repo | PR 添加 CI check |
| **安全工具** | 🟢 低 | SonarQube, OWASP | "AI 代码验证" 扩展 |

#### 实施步骤（以 Cursor 为例）:

**Step 1: 成为贡献者**
```bash
# 1. Fork Cursor 仓库
# 2. 寻找易于上手的 issue（文档、小 bug、性能优化）
# 3. 提交 3-5 个高质量 PR，建立信任
# 4. 获得 collaborator 权限（或至少 reputation）
```

**Step 2: 设计集成点**
```typescript
// Cursor 扩展点：AI 响应后处理
cursor.on('ai.response', async (response) => {
  // 集成 ai-code-validator
  const quality = await validateCode(response.code);

  if (quality.score < 80) {
    cursor.showWarning('AI 代码质量评分: ' + quality.score);
    cursor.showFixSuggestion(quality.suggestions);
  }
});
```

**Step 3: 实现 PR**
```typescript
// 新增文件: packages/cursor-plugin-ai-validator/src/index.ts
import { validateCode } from '@ai-code-validator/core';

export function activate(context: ExtensionContext) {
  const disposable = cursor.onDidGenerateCode(async (event) => {
    const result = await validateCode({
      code: event.code,
      language: event.language,
      context: 'cursor-plugin',
    });

    if (result.score < 80) {
      cursor.showNotification(
        `AI Code Quality: ${result.score}/100`,
        result.issues.map(i => i.message)
      );
    }
  });
}
```

**Step 4: 文档与推广**
```markdown
# Cursor AI Code Validator Plugin

## Quick Start
1. Install: `cursor:install ai-code-validator`
2. Enable in Settings → AI → Code Validation
3. See real-time quality scores in your AI responses

## Why AI Code Validator?
- Detects hallucinated packages (npm packages that don't exist)
- Catches logic gaps from context limits
- Validates code style consistency
- Generates self-heal prompts for Cursor's AI
```

#### 项目清单（优先排序）:

1. **Continue.dev** (VS Code 扩展)
   - GitHub: `continuedev/continue`
   - Stars: ~20k
   - 理由: AI 辅助开发，已有插件体系
   - 集成点: AI 响应后自动验证

2. **Cursor**
   - 官方: cursor.sh
   - 可能需要加入官方插件市场申请
   - 理由: 最热门的 AI 编辑器，高净值用户

3. **LangChain**
   - GitHub: `langchain-ai/langchain`
   - Stars: ~80k
   - 理由: AI Agent 框架，可集成 "安全沙盒"
   - 集成点: Agent 工具调用时的文件访问控制

4. **AutoGPT**
   - GitHub: `ToranBruce Richards/AutoGPT`
   - Stars: ~150k
   - 理由: Autonomous Agent，安全沙盒刚需
   - 集成点: 任务执行前检查文件权限

5. **热门 AI 生成项目** (自动化筛选)
   ```bash
   # 查找 AI 贡献占比高的小型项目
   gh search "language:typescript stars:500..5000" \
     --json owner,name,url,createdAt | \
     jq '.[] | select(.name | contains("ai"))'
   ```

### 3.2 Agent Safehouse 集成推广

**策略:** 双向绑定

**方向 1: 集成 Agent Safehouse → 推广 ai-code-validator**
```bash
# 在 Agent Safehouse 仓库提交 PR
# 主题: "Add ai-code-validator integration for AI-generated code"

PR 内容:
1. 在 safehouse.sh 中添加 --ai-validator 选项
2. 运行 AI 代码后自动调用 ai-code-validator 扫描
3. 输出统一报告: 沙盒隔离结果 + 代码质量评分
```

**方向 2: ai-code-validator 沙盒模块 → 推广 Agent Safehouse**
```markdown
# ai-code-validator README 更新

## 🛡️ 安全运行 AI 代码

ai-code-validator 不仅检查代码质量，还可以在沙盒中安全运行 AI 生成的修复代码。

### macOS 用户 (推荐)
```bash
npx ai-code-validator secure-run \
  --sandbox macOS \
  --allow-read ./src \
  --allow-write ./dist \
  -- claude --apply-fixes ai-heal-prompt.md
```

基于 [Agent Safehouse](https://agent-safehouse.dev/) 的 macOS 原生沙盒技术。
```

### 3.3 社区运营策略

**渠道 1: Hacker News**
- 发布 "AI Code Validator + Agent Safehouse" Show HN 帖子
- 标题: "We built an AI dev security suite: code quality checks + macOS sandbox"
- 突出: "解决 Claude 22 个 Firefox 漏洞的安全问题"

**渠道 2: Reddit**
- r/programming: "AI 开发者必看的安全工具组合"
- r/artificial: "如何安全地在本地运行 LLM Agents？"
- r/TypeScript: "TypeScript + AI + 沙盒：我的开发工作流"

**渠道 3: YouTube / Twitter**
- 技术演示：对比 "有/无沙盒" 的 AI 代码执行风险
- 真实案例：Claude 发现的 Firefox 漏洞，如果没有沙盒会怎样

---

## 四、开发优先级与时间线

### Phase 1: MVP 集成 (2-3 周)
- [ ] 研究 Agent Safehouse 源码
- [ ] 创建 `@ai-code-validator/sandbox-macos` 包
- [ ] 实现基础 `runInSandbox()` API
- [ ] CLI 命令: `ai-code-validator sandbox`
- [ ] 更新 README，添加沙盒使用示例

### Phase 2: 跨平台支持 (4-6 周)
- [ ] Linux 版本: Firejail 集成
- [ ] Windows 版本: Sandbox App Container
- [ ] 统一 API 跨平台测试
- [ ] 文档: 不同平台的使用指南

### Phase 3: 开源集成 (6-8 周)
- [ ] 选择 1-2 个目标项目（Continue.dev + LangChain）
- [ ] 成为贡献者（提交 3+ PR）
- [ ] 实现集成插件
- [ ] 提交 PR + 社区推广

### Phase 4: Dashboard (8-12 周)
- [ ] Web 仪表盘原型
- [ ] 访问审计日志可视化
- [ ] 多项目安全策略管理
- [ ] 告警与通知

---

## 五、风险评估与缓解

| 风险 | 概率 | 影响 | 缓解策略 |
|------|------|------|----------|
| Agent Safehouse 开源项目停止维护 | 🟡 中 | 🟡 中 | Fork 到 ai-code-validator org，自主维护 |
| 跨平台实现复杂度超预期 | 🔴 高 | 🟢 低 | 先只支持 macOS，其他平台后续迭代 |
| 开源项目 PR 被拒绝 | 🟡 中 | 🟡 中 | 选择多个目标项目，分散风险 |
| 性能开销（沙盒 + 验证） | 🟢 低 | 🟡 中 | 提供 "轻量模式"（只验证，不沙盒） |

---

## 六、下一步行动

**本周 (2026-03-09 ~ 03-16):**
1. [ ] 阅读 Agent Safehouse 源码 (`eugene1g/agent-safehouse`)
2. [ ] 设计 `@ai-code-validator/sandbox` API
3. [ ] 创建本地沙盒测试环境
4. [ ] 开始 Continue.dev 贡献（寻找 easy-fix issues）

**下周 (2026-03-16 ~ 03-23):**
1. [ ] 实现 macOS 沙盒 MVP
2. [ ] CLI 命令: `ai-code-validator sandbox`
3. [ ] Continue.dev 第一个 PR
4. [ ] 更新 README，增加沙盒章节

---

## 附录：资源链接

- **Agent Safehouse**: https://agent-safehouse.dev/
- **GitHub**: https://github.com/eugene1g/agent-safehouse
- **Hacker News**: https://news.ycombinator.com/item?id=47301085 (473 points)
- **ai-code-validator**: https://github.com/raye-deng/ai-code-validator
- **Continue.dev**: https://github.com/continuedev/continue
- **LangChain**: https://github.com/langchain-ai/langchain
