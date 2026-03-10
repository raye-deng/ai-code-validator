# AI Code Validator V3 升级计划

> 创建: 2026-03-10
> 状态: 规划中

## 一、现状分析

### 当前检测器 (v0.2.0)
| 检测器 | 检测方式 | 深度 | 局限 |
|--------|---------|------|------|
| HallucinationDetector | 正则匹配 import + 函数调用 | 浅层 | 只查 package.json，不验证 API 是否真实存在 |
| LogicGapDetector | 正则匹配 catch/TODO/unreachable | 浅层 | 无 AST，只做文本模式匹配 |
| DuplicationDetector | 函数体字符串相似度 | 中等 | 无 token 级别对比，误报率高 |
| ContextBreakDetector | 命名风格 + 模块系统 + 异步模式 | 浅层 | 无跨文件分析 |

### 当前评分维度 (4个)
- Completeness (30) — 幻觉检测
- Coherence (25) — 逻辑缺口
- Consistency (25) — 风格一致性
- Conciseness (20) — 重复检测

### 核心问题
1. **检测太浅** — 全部基于正则/字符串匹配，没有 AST 解析
2. **无 AI 辅助检测** — 不支持本地/远端大模型深度分析
3. **问题无归因** — 检测到问题但不知道归类到哪种 AI 缺陷模式
4. **报告不够丰富** — 没有问题分类体系、没有社区链接、可视化不够
5. **无 Embed 能力** — 不能嵌入到其他工具/页面

---

## 二、升级目标

### 2.1 SLOC 深度检测（S-Level Of Concern 指标体系）

新增 AI 代码特有的缺陷检测维度，超越传统 linter：

| 新维度 | 描述 | 检测方式 |
|--------|------|---------|
| **幻觉 API 调用** | 调用不存在的 npm 包方法/参数 | AST + npm registry API 验证 |
| **过时 API 使用** | 使用已废弃的 API（AI 训练数据滞后） | AST + deprecation DB |
| **安全漏洞模式** | AI 生成的典型安全问题（硬编码密钥、SQL 注入模板等） | 正则 + AST 模式匹配 |
| **类型不完整** | any 滥用、缺少返回类型、参数无类型 | TypeScript AST |
| **错误处理缺失** | 更深层：未处理 Promise rejection、event listener 无 error | AST 控制流分析 |
| **上下文窗口断裂** | AI 在长文件中前后矛盾（变量重定义、接口不一致） | AST 跨作用域分析 |
| **过度工程化** | AI 倾向生成过度抽象的代码 | 复杂度分析 (cyclomatic + cognitive) |
| **训练数据泄露** | 代码片段与已知开源项目高度相似 | 代码指纹 + 数据库比对 |

### 2.2 本地 AI + 远端大模型双通道

参考 Agent Safehouse 的本地优先理念：

```
代码输入 → 静态分析（快速，零成本）
         → 本地 AI 分析（Ollama/llama.cpp，敏感代码不出内网）
         → 远端大模型分析（OpenAI/Claude，深度语义理解）
         → 结果融合 → 评分 → 报告
```

**配置层级**：
```yaml
# .aicv.yml
ai:
  # 本地模型（免费，隐私优先）
  local:
    enabled: true
    provider: ollama
    model: codellama:13b  # 或 deepseek-coder
    endpoint: http://localhost:11434
    
  # 远端模型（付费，深度分析）
  remote:
    enabled: false  # 默认关闭，需用户主动开启
    provider: openai  # openai | anthropic | custom
    model: gpt-4o-mini
    apiKey: ${OPENAI_API_KEY}
    
  # 策略
  strategy: local-first  # local-first | remote-first | local-only | remote-only
  fallback: true  # 本地失败时是否 fallback 到远端
```

### 2.3 问题归因分类体系

每个检测到的问题都归类到一个 **AI 缺陷分类**，并关联社区讨论：

```typescript
interface IssueClassification {
  // 缺陷分类
  category: AIDefectCategory;
  subcategory: string;
  
  // 严重程度
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  
  // 归因
  attribution: {
    rootCause: string;        // "训练数据滞后" | "上下文窗口限制" | "幻觉" | ...
    aiModel?: string;         // 哪个模型容易产生此问题
    frequency: 'common' | 'occasional' | 'rare';
  };
  
  // 社区参考
  references: {
    githubIssues: string[];   // 相关 GitHub Issues 链接
    discussions: string[];     // 社区讨论帖子
    articles: string[];        // 博客文章
    cwe?: string;             // CWE 编号（如安全相关）
  };
  
  // 修复建议
  fix: {
    description: string;
    autoFixable: boolean;
    effort: 'trivial' | 'small' | 'medium' | 'large';
  };
}

enum AIDefectCategory {
  HALLUCINATION = 'hallucination',        // 幻觉
  STALE_KNOWLEDGE = 'stale-knowledge',    // 训练数据过时
  CONTEXT_LOSS = 'context-loss',          // 上下文丢失
  SECURITY_ANTIPATTERN = 'security',      // 安全反模式
  OVER_ENGINEERING = 'over-engineering',   // 过度工程化
  INCOMPLETE_IMPL = 'incomplete',         // 不完整实现
  TYPE_SAFETY = 'type-safety',            // 类型安全
  ERROR_HANDLING = 'error-handling',       // 错误处理
  DUPLICATION = 'duplication',            // 重复代码
  TRAINING_LEAK = 'training-leak',        // 训练数据泄露
}
```

### 2.4 报告美化 & Embed

**Terminal 报告**：
- 彩色输出 + Unicode 图表
- 问题归因树状展示
- 可点击的参考链接

**HTML 报告**（新增）：
- 独立 HTML 文件，可直接浏览器打开
- 交互式图表（评分雷达图、趋势图）
- 问题详情展开/收起
- 代码片段高亮 + 标注问题行

**Embed Widget**（新增）：
- `<script>` 标签嵌入任何网页
- Badge 样式（像 shields.io）
- 可配置主题

**Markdown 报告增强**：
- 添加归因分类表格
- 添加参考链接
- 添加修复优先级矩阵

---

## 三、任务拆分 & 执行计划

### Worker 1: AI 缺陷模式调研 + 归因分类体系
**目标**: 深度调研 AI 生成代码的各种问题模式，建立完整分类体系，收集 GitHub Issues / 社区帖子

**输出**: `docs/research/ai-defect-taxonomy.md`

**任务**:
1. 搜索学术论文和博客：AI 生成代码的常见缺陷
2. 搜索 GitHub Issues：各大 AI 编码工具（Copilot、Cursor、Cline、Windsurf）的已知问题
3. 搜索社区讨论：Reddit、HN、Stack Overflow 上关于 AI 代码质量的帖子
4. 建立分类体系 + 每个类别关联 3-5 个真实链接
5. 分析哪些缺陷可以自动化检测

### Worker 2: 竞品深度分析
**目标**: 分析现有 AI 代码验证/审查工具的评分指标、检测方法

**输出**: `docs/research/competitor-analysis.md`

**任务**:
1. CodeRabbit、Codacy、SonarQube AI 相关功能
2. Snyk Code、Semgrep AI 规则
3. 各工具的评分维度、指标体系
4. 本地 AI + 远端 AI 的集成方式对比
5. 报告格式和可视化对比

### Worker 3: 新检测器设计 + AST 基础设施
**目标**: 设计新检测器的技术方案，评估 AST 工具选型

**输出**: `docs/design/new-detectors.md`

**任务**:
1. TypeScript AST 解析方案（ts-morph vs TypeScript Compiler API vs @swc/core）
2. 新检测器的详细设计（每个维度的检测算法）
3. 本地/远端 AI 分析的 prompt 设计
4. 性能基准测试方案

### Worker 4: 报告系统重设计
**目标**: 设计新的报告格式、HTML 报告、Embed Widget

**输出**: `docs/design/report-redesign.md`

**任务**:
1. HTML 报告模板设计（参考 Lighthouse、Istanbul 报告风格）
2. 评分雷达图 / 维度可视化方案
3. Embed Widget 技术方案
4. 社区链接集成方式

---

## 四、推广闭环设计

检测到的每个问题归类后，可以反向利用：

```
检测到 "幻觉 API 调用" 
  → 归因到 GitHub Issue: github.com/copilot/issues/123
  → 自动生成评论: "We built a tool that catches this automatically..."
  → 带链接: https://github.com/raye-deng/ai-code-validator

检测到 "过时 API 使用"
  → 归因到 Stack Overflow 帖子: stackoverflow.com/questions/xxx
  → 自动生成回答: "This is a common issue with AI-generated code..."
  → 带链接
```

这就是 **ai-social-seller 和 ai-code-validator 的联动点**。

---

## 五、里程碑

| 版本 | 内容 | 预计时间 |
|------|------|---------|
| v0.3.0 | 归因分类体系 + 新评分维度 + 参考链接数据库 | 1 周 |
| v0.4.0 | AST 检测器 + 本地 AI 集成 (Ollama) | 2 周 |
| v0.5.0 | 远端 AI 集成 + HTML 报告 | 1 周 |
| v0.6.0 | Embed Widget + Badge + 推广闭环 | 1 周 |
