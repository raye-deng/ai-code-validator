# Agent Safehouse 独立产品调研

**日期:** 2026-03-09
**目标:** 设计独立的 Agent 运行时安全隔离产品，针对现有 Agent 生态

---

## 一、产品定位调整

### 1.1 核心原则

**与 ai-code-validator 完全独立:**

| 产品 | 定位 | 用户场景 | 品牌 |
|------|------|----------|------|
| **ai-code-validator** | AI 代码质量检查 | CI/CD 流水线、代码提交前 | @evallab |
| **agent-safehouse** | AI 运行时隔离 | 本地 Agent 开发、执行 | @evallab (可选独立子品牌) |

**不做统一 dashboard，分离推广优势:**
- ✅ 单一功能更易理解
- ✅ 降低用户决策成本（用哪个？都用了）
- ✅ 独立增长曲线，互不影响
- ✅ 可分别开源/商业化

### 1.2 品牌策略

**方案 A: 同品牌 @evallab**
- ai-code-validator.evallab.ai (代码质量)
- agent-safehouse.evallab.ai (运行隔离)
- 统一信任背书，交叉引流

**方案 B: 独立子品牌**
- codes.evallab.ai (现有)
- safehouse.dev (新建，更契合技术社区)

**推荐:** 方案 A（统一 @evallab），降低品牌认知成本

---

## 二、当前 AI Agent 生态调研

### 2.1 主流 Agent 部署模式

#### 模式 1: IDE 内嵌 Agent (Cursor, Continue)

**使用场景:**
```typescript
// Cursor 中使用 AI
用户: "帮我实现一个排序算法"
Cursor AI: 生成代码 + 直接插入编辑器
         ↓
// 风险:
- 可能删除重要文件
- 可能读取 .env 暴露凭证
- 可能修改 package.json 依赖
```

**部署特点:**
- Agent 以 VS Code 扩展运行
- 拥有完整的文件系统访问权限
- 用户无感知（不主动执行，AI 也可以操作）
- 最大的风险场景

**安全需求:**
- 文件操作白名单（只允许当前项目）
- 敏感路径黑名单（/.ssh, /.aws, /.env）
- 操作审计日志（哪些文件被修改了）

#### 模式 2: CLI Agent (OpenClaw, nano-claw)

**使用场景:**
```bash
# OpenClaw session
openclaw session start my-project
用户: "帮我部署这个项目到 AWS"
Agent: 调用 AWS SDK, 读取 ~/.aws/credentials
     ↓
# 风险:
- 读取云服务凭证
- 调用 AWS API（可能产生费用）
- 修改基础设施配置
```

**部署特点:**
- Agent 作为独立 CLI 进程运行
- 可以访问整个用户环境
- 具备系统级能力（网络调用、系统命令）
- 适合自动化任务

**安全需求:**
- 网络请求拦截（哪些 API 被调用了）
- 凭证隔离（不暴露真实凭证，使用测试凭证）
- 命令白名单（不允许执行 rm, chmod 等）

#### 模式 3: Web 端 Agent (Claude AI Projects, Artifacts)

**使用场景:**
```javascript
// Claude AI Projects
用户上传项目代码
Claude: 分析代码, 生成修复建议
     ↓
// Claude Artifacts
Claude: 运行生成的 HTML/JS 代码
     ↓
// 风险:
- 读取上传的代码中的敏感信息
- Artifacts 可能包含恶意代码
- 跨域请求窃取数据
```

**部署特点:**
- Agent 在云端运行（无法本地控制）
- 代码上传到第三方服务器
- 无法直接访问本地文件（需要上传）

**安全需求:**
- 本地代码脱敏（移除 .env, secrets）
- 下载代码的沙盒执行
- Web 沙盒隔离（iframe, CSP）

#### 模式 4: 框架 Agent (LangChain, AutoGPT)

**使用场景:**
```python
# LangChain Agent
from langchain.agents import initialize_agent

agent = initialize_agent(tools, llm)
agent.run("帮我分析这个日志文件, 并把结果发到 Slack")
     ↓
# 风险:
- 读取任意文件（日志可能包含密码）
- 调用 Slack API（发送错误信息）
- 执行 Python shell 命令
```

**部署特点:**
- Agent 作为 Python 库运行
- 用户自定义 tools（可访问任意资源）
- 完全自主执行（multi-step）

**安全需求:**
- Tool 访问控制（限制 file-read, network-call）
- 步数限制（防止无限循环）
- 输出审查（检查敏感信息泄露）

### 2.2 目标 Agent 列表

| Agent | 类型 | Stars | 部署方式 | 风险等级 | 优先级 |
|--------|------|-------|----------|----------|--------|
| **Cursor** | IDE 内嵌 | VS Code 扩展 | 🔴 高 | 🟢 高 |
| **Continue.dev** | IDE 内嵌 | VS Code 扩展 | 🔴 高 | 🟢 高 |
| **OpenClaw** | CLI | Session/Node | 🔴 高 | 🟢 高 |
| **nano-claw** | CLI | (需调研) | 🟡 中 | 🟡 中 |
| **Claude AI Projects** | Web | Anthropic 云端 | 🟡 中 | 🟡 中 |
| **LangChain** | 框架 | Python 库 | 🔴 高 | 🟡 中 |
| **AutoGPT** | 自主 | Python 脚本 | 🔴 高 | 🟢 高 |
| **CrewAI** | 框架 | Python 库 | 🔴 高 | 🟡 中 |
| **GPT-Engineer** | CLI | Python 脚本 | 🔴 高 | 🟡 中 |
| **Aider** | CLI | Python 脚本 | 🔴 高 | 🟡 中 |

### 2.3 Agent Safehouse 针对性设计

#### 设计原则: **"一扫描、二诊断、三部署"**

**流程:**
```
用户选择 Agent
    ↓
Step 1: 扫描 Agent 行为模式
    - 检测文件访问倾向
    - 检测网络调用模式
    - 检测系统命令使用
    ↓
Step 2: 诊断安全风险
    - 识别敏感路径访问
    - 识别外部 API 调用
    - 识别系统修改操作
    ↓
Step 3: 一键部署 Safehouse
    - 生成定制化沙盒配置
    - 包装 Agent 命令
    - 提供审计日志
```

#### 针对 Cursor / Continue.dev 的 Safehouse

**扫描示例:**
```bash
# 自动检测 Cursor 配置和习惯
$ agent-safehouse scan cursor

✅ Found Cursor installation at ~/Library/Application Support/Cursor
✅ Detected 23 recent file operations (last 24h)
✅ Analyzing access patterns...

📊 Access Pattern Summary:
- Most accessed: ~/projects/my-app/src/
- Sensitive access: ~/.ssh/ (3 times), ~/.aws/ (2 times)
- Network calls: github.com (15), npmjs.org (8)

⚠️  Risk Assessment: MEDIUM
- 3 sensitive file accesses detected
- No file deletion attempts detected
```

**诊断示例:**
```bash
$ agent-safehouse diagnose cursor

🔍 Security Diagnosis for Cursor:

📁 File Access Risks:
  - High: Reads ~/.ssh/id_rsa (ssh key leakage)
  - Medium: Reads ~/.aws/credentials (AWS credentials)
  - Low: Reads ~/Documents/personal/notes.md (personal data)

🌐 Network Risks:
  - Low: npm install from registry (expected)
  - Medium: Unknown API calls to api.openai.com (cost control needed)

💡 Recommendations:
  1. Block ~/.ssh/*, ~/.aws/* access
  2. Monitor api.openai.com call frequency
  3. Enable audit logging
```

**一键部署示例:**
```bash
$ agent-safehouse deploy cursor --apply-recommendations

✅ Deployed Safehouse for Cursor

Configuration:
- Blocklist: [~/.ssh/*, ~/.aws/*, ~/Documents/personal/*]
- Allowlist: [~/projects/*, ~/.npm/*, ~/.config/git/*]
- Network monitoring: Enabled
- Audit log: ~/.safehouse/cursor-audit.log

Usage:
# Use cursor-sandbox instead of cursor
$ cursor-sandbox "帮我实现一个排序函数"

# Audit logs
$ agent-safehouse logs cursor --tail 20
```

**VS Code 集成:**
```json
// .vscode/settings.json
{
  "agentSafehouse.enabled": true,
  "agentSafehouse.agent": "cursor",
  "agentSafehouse.autoWrapCommands": true,
  "agentSafehouse.showWarnings": true
}
```

#### 针对 OpenClaw 的 Safehouse

**扫描示例:**
```bash
$ agent-safehouse scan openclaw

✅ Found OpenClaw installation at ~/.nvm/versions/node/v22.22.0/lib/node_modules/openclaw
✅ Detected 45 recent session activities (last 48h)
✅ Analyzing command patterns...

📊 Command Pattern Summary:
- Most used: sessions_spawn, exec, read
- System commands: npm install, git clone, docker run
- Network access: git.makesall.cn, harbo.makesall.cn

⚠️  Risk Assessment: HIGH
- 7 docker run commands detected (container escape risk)
- 3 git push to private repos (data leak risk)
- 12 file modifications in system paths (/etc, /usr/local)
```

**诊断示例:**
```bash
$ agent-safehouse diagnose openclaw

🔍 Security Diagnosis for OpenClaw:

⚙️  System Command Risks:
  - Critical: docker run --privileged (container escape)
  - High: rm -rf /tmp/* (data loss)
  - Medium: chmod +x /usr/local/bin/* (system modification)

🌐 Network Risks:
  - High: Git push to git.makesall.cn (code leak)
  - Medium: Harbor image push (supply chain risk)
  - Low: npm install from registry (expected)

💡 Recommendations:
  1. Block --privileged docker flags
  2. Require confirmation for git push
  3. Audit Harbor image tags before push
  4. Enable command whitelist mode
```

**一键部署示例:**
```bash
$ agent-safehouse deploy openclaw --strict-mode

✅ Deployed Safehouse for OpenClaw

Configuration:
- Command whitelist: [sessions_spawn, exec, read, write, edit]
- Blocked flags: [--privileged, --rm -rf /]
- Confirmation required: [git push, docker run, docker exec]
- Audit log: ~/.safehouse/openclaw-audit.log

Usage:
# Auto-wrap openclaw commands
$ openclaw scan ./src
# → Running in Safehouse, blocking sensitive operations

# Manual bypass (emergency)
$ openclaw --skip-safehouse scan ./src
```

**针对 Worker Subagent 的特殊处理:**
```bash
# Worker subagent 专用配置
$ agent-safehouse deploy openclaw --mode worker

Configuration:
- Allow: file read/write (workspace only)
- Allow: exec (non-destructive commands only)
- Block: network requests (except internal APIs)
- Block: system modification (chmod, chown, rm)
- Audit: All session_spawn calls
```

#### 针对 LangChain / AutoGPT 的 Safehouse

**扫描示例:**
```bash
$ agent-safehouse scan langchain

✅ Found LangChain installation at ~/.local/lib/python3.11/site-packages/langchain
✅ Analyzing tool usage patterns...

📊 Tool Usage Summary:
- File tools: ReadFileTool (used 45 times)
- Shell tools: ShellTool (used 12 times)
- Network tools: RequestsTool (used 8 times)
- Custom tools: MyCustomTool (used 3 times)

⚠️  Risk Assessment: HIGH
- ShellTool usage detected (RCE risk)
- File tool reads sensitive paths (/.env, /.ssh)
```

**诊断示例:**
```bash
$ agent-safehouse diagnose langchain

🔍 Security Diagnosis for LangChain Agents:

🛠️  Tool Risks:
  - Critical: ShellTool (can execute arbitrary commands)
  - High: ReadFileTool with no path restrictions
  - Medium: RequestsTool (can call any URL)

💡 Recommendations:
  1. Replace ShellTool with RestrictedShellTool
  2. Add path whitelist to ReadFileTool
  3. Add URL whitelist to RequestsTool
  4. Enable tool call logging
```

**一键部署示例:**
```bash
$ agent-safehouse deploy langchain --python

✅ Deployed Safehouse for LangChain

Generated wrapper: ~/.local/bin/langchain-safehouse

Usage:
# Import safehouse wrapper instead of original tools
from langchain_safehouse import SafeReadFileTool, SafeShellTool

# Use in your agent
agent = initialize_agent(
    tools=[SafeReadFileTool(), SafeShellTool()],
    llm=llm
)

# Safehouse config file: ~/.langchain-safehouse.json
{
  "fileAccess": {
    "allowList": ["~/projects/*", "~/data/*"],
    "blockList": ["~/.ssh/*", "~/.aws/*", "~/.env*"]
  },
  "shellAccess": {
    "allowCommands": ["ls", "cat", "grep", "python"],
    "denyCommands": ["rm", "chmod", "chown", "sudo"]
  },
  "networkAccess": {
    "allowDomains": ["api.openai.com", "*.github.com"],
    "blockDomains": ["*"]
  }
}
```

---

## 三、开源贡献策略调整

### 3.1 目标项目筛选标准

**优先趋势好的小项目 (<5k stars):**

| 指标 | 权重 | 说明 |
|------|------|------|
| **Stars** | 30% | 500 ~ 5000，避免大型项目 |
| **Recent Activity** | 25% | 最近 3 个月活跃 |
| **AI 生成占比** | 20% | Issue/PR 中 AI 贡献占比高 |
| **Community Friendliness** | 15% | 维护者响应积极 |
| **Easy Integration** | 10% | 有明确的 extension/plugin 机制 |

### 3.2 候选项目列表

#### 优先级 1: 小而美的 AI 工具 (500-2000 stars)

| 项目 | Stars | 指标 | 集成方式 | 理由 |
|------|-------|------|----------|------|
| **gpt-engineer** | ~1.5k | 🟢 良好 | Pre-commit hook | CLI 工具，安全刚需 |
| **aider** | ~1.2k | 🟢 良好 | Wrapper script | AI 助手，需隔离 |
| **llama-index** | ~3k | 🟡 中等 | Data loader | 数据访问控制 |
| **memgpt** | ~800 | 🟢 优秀 | Memory plugin | 敏感数据隔离 |
| **smol-developer** | ~600 | 🟢 优秀 | CLI wrapper | 轻量级，易集成 |
| **open-interpreter** | ~4k | 🟡 中等 | Command filter | Shell 访问风险 |

#### 优先级 2: 新兴 Agent 框架 (1000-3000 stars)

| 项目 | Stars | 指标 | 集成方式 | 理由 |
|------|-------|------|----------|------|
| **crewai** | ~2k | 🟢 良好 | Tool wrapper | 多 agent 协作，隔离关键 |
| **autogen** | ~1.5k | 🟢 良好 | Agent decorator | Microsoft 出品，潜力大 |
| **phi-3-agents** | ~800 | 🟢 优秀 | Python decorator | 微软生态，新项目 |
| **multi-agent-orchestrator** | ~500 | 🟢 优秀 | Middleware | 小项目，易合并 |

#### 优先级 3: AI 辅助开发插件 (1000-3000 stars)

| 项目 | Stars | 指标 | 集成方式 | 理由 |
|------|-------|------|----------|------|
| **refact** | ~1.2k | 🟢 良好 | VS Code extension | 竞品，用户相似 |
| **codeium-vim** | ~800 | 🟢 优秀 | Vim plugin | 开发者工具用户 |
| **tabnine** | ~2.5k | 🟡 中等 | VS Code extension | 商业化项目，需谨慎 |

### 3.3 PR 策略

**Step 1: 成为贡献者**
- 寻找 "good first issue" 或 "help wanted"
- 优先文档、小 bug、性能优化
- 提交 3-5 个 PR，建立信任

**Step 2: 设计集成点**
- 找到最小侵入的集成方式
- 提供 "opt-in"（默认关闭，用户主动开启）
- 完善文档和测试

**Step 3: 提交 PR**
- 标题清晰：`feat: integrate agent-safehouse for secure agent execution`
- 描述详细：为什么要集成、解决了什么问题、如何使用
- 测试充分：集成测试 + 文档示例

**Step 4: 社区推广**
- PR 合并后，在项目 Issue 中宣传
- Show HN: "How we made [project] 10x safer with agent-safehouse"
- Twitter/Reddit: 分享成功案例

---

## 四、产品 MVP 功能定义

### 4.1 核心功能 (v0.1.0)

**支持的 Agent:**
- [ ] Cursor (macOS)
- [ ] Continue.dev (macOS)
- [ ] OpenClaw (macOS/Linux)
- [ ] LangChain (Python, 跨平台)

**核心命令:**
```bash
# 扫描 Agent 行为
agent-safehouse scan <agent-name>

# 诊断安全风险
agent-safehouse diagnose <agent-name>

# 一键部署 Safehouse
agent-safehouse deploy <agent-name> [options]

# 查看审计日志
agent-safehouse logs <agent-name> [--tail N]

# 移除 Safehouse
agent-safehouse remove <agent-name>
```

**配置能力:**
- [ ] 文件路径白名单/黑名单
- [ ] 命令白名单/黑名单
- [ ] 网络域名白名单/黑名单
- [ ] 审计日志开关
- [ ] 严格模式（全部拦截，手动放行）

### 4.2 扩展功能 (v0.2.0)

- [ ] Web UI（浏览器查看审计日志）
- [ ] 告警规则（异常访问触发通知）
- [ ] 多 Agent 管理（同时管理多个 agent）
- [ ] 配置模板（社区分享安全策略）
- [ ] AI 辅助诊断（基于访问模式推荐配置）

### 4.3 企业功能 (v1.0.0)

- [ ] 团队共享配置
- [ ] 策略合规审计（SOC2, ISO27001）
- [ ] 集成 SIEM（发送审计日志到 Splunk/DataDog）
- [ ] 访问权限 RBAC
- [ ] SSO 集成

---

## 五、技术实现方案

### 5.1 macOS 原生实现

**基础:** 基于 Agent Safehouse (`sandbox-exec`)

```bash
# 核心命令
/usr/bin/sandbox-exec -f <profile.sb> <command>

# 示例 profile
(version 1)
(deny default)
(allow file-write* (subpath "/Users/you/projects"))
(deny file-write* (subpath "/Users/you/.ssh"))
(allow network-outbound (remote tcp))
```

**实现流程:**
1. 扫描 Agent → 生成访问模式报告
2. 诊断风险 → 生成建议配置
3. 部署 → 生成 sandbox-exec profile
4. 包装命令 → `agent-safehouse exec <agent>`

### 5.2 Linux 实现

**基础:** Firejail / Bubblewrap

```bash
# Firejail 示例
firejail --private-dev --profile=/etc/firejail/cursor.profile cursor

# Bubblewrap 示例
bwrap --ro-bind /usr /usr --dev /dev --proc /proc cursor
```

### 5.3 Python Agent 集成

**方案:** Agent 运行时 Hook

```python
# LangChain 集成示例
from langchain.tools import Tool
from agent_safehouse import SafeToolWrapper

# 包装原始工具
safe_tool = SafeToolWrapper(
    original_tool=file_tool,
    config={
        "fileAccess": {
            "allowList": ["~/projects/*"],
            "blockList": ["~/.ssh/*"]
        }
    }
)

# 替换原始工具
agent.tools = [safe_tool if t == file_tool else t for t in agent.tools]
```

---

## 六、开发优先级

### Phase 1: 核心引擎 (2-3 周)
- [ ] macOS sandbox-exec 封装
- [ ] 扫描引擎（Agent 行为分析）
- [ ] 诊断引擎（风险评估）
- [ ] 配置生成器

### Phase 2: Agent 适配 (4-6 周)
- [ ] Cursor 适配
- [ ] Continue.dev 适配
- [ ] OpenClaw 适配
- [ ] LangChain Python 集成

### Phase 3: 开源集成 (6-8 周)
- [ ] gpt-engineer PR
- [ ] aider PR
- [ ] crewai PR
- [ ] 社区推广

### Phase 4: 增强功能 (8-12 周)
- [ ] Web UI
- [ ] 告警规则
- [ ] 配置模板市场

---

## 七、下一步行动

**本周 (2026-03-09 ~ 03-16):**
1. [ ] 调研 nano-claw（是什么，如何部署）
2. [ ] 深入研究 Agent Safehouse 源码
3. [ ] 设计扫描引擎 API
4. [ ] 开始 gpt-engineer 贡献（寻找 easy issues）

**下周 (2026-03-16 ~ 03-23):**
1. [ ] 实现 macOS sandbox-exec 封装
2. [ ] 实现 Cursor 扫描器
3. [ ] 实现 Cursor 一键部署
4. [ ] gpt-engineer 第一个 PR

---

## 附录：资源链接

- **Agent Safehouse**: https://agent-safehouse.dev/
- **gpt-engineer**: https://github.com/gpt-engineer-org/gpt-engineer (~1.5k stars)
- **aider**: https://github.com/paul-gauthier/aider (~1.2k stars)
- **crewai**: https://github.com/joaomdmoura/crewAI (~2k stars)
- **LangChain**: https://github.com/langchain-ai/langchain (~80k stars)
