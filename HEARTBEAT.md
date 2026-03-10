# HEARTBEAT - ai-code-validator 项目状态

> 本文件记录项目进展、待办事项和最新状态
> 最后更新: 2026-03-07

---

## 🎯 当前重点

**AI Code Validator** - 首个专为AI生成代码构建的CI/CD质量门禁工具

---

## ✅ 已完成

### M1: Core Engine + CLI
- [x] 4个检测器实现（幻觉检测、逻辑缺口、重复检测、上下文中断）
- [x] 评分引擎（0-100综合评分，4个维度）
- [x] AI Healer（为Copilot/Cursor/Claude生成修复提示）
- [x] CLI工具（`npx ai-code-validator scan ./src`）
- [x] NPM发布（`@ai-code-validator/core@0.1.0` + `ai-code-validator@0.1.0`）
- [x] Dogfood测试（airline-ticket-booking评分87/100）

### M2: GitHub Action
- [x] `action.yml` 完成
- [x] 完整实现（`packages/github-action/src/index.ts`）
- [x] Build打包（`dist/index.js` 1.4MB）
- [ ] 待：发布到GitHub Marketplace
- [ ] 待：真实测试PR评论和质量门禁

### M3: GitLab CI Component
- [x] `packages/gitlab-component/templates/validate.yml` 完成
- [ ] 待：发布到GitLab CI Catalog
- [ ] 待：Code Quality报告集成

### M4: Portal Website
- [x] Next.js项目骨架
- [x] 首页、定价页、Early Access页
- [x] 部署到Cloudflare Pages（https://codes.evallab.ai）
- [x] SEO优化（Meta tags, Open Graph）
- [x] 域名配置（codes.evallab.ai）
- [ ] 待：Early Access表单API（POST → Telegram Bot）

### M5: AI Self-Heal Loop
- [x] Prompt Builder（将验证报告转换为结构化修复提示）
- [ ] 待：Copilot集成（`.github/copilot-instructions.md`模板）
- [ ] 待：Cursor集成（`.cursorrules`模板）
- [ ] 待：Claude集成（结构化提示格式）

---

## 🚀 推广准备

### Reddit推广（待发布）
**状态**: ✅ 内容已准备，待发布

**准备好的帖子**:
1. **r/MachineLearning** - 侧重ML技术和代码生成
   - 标题: Built a CI/CD quality gate specifically for AI-generated code
   - 重点: 幻觉检测、逻辑缺口、AI自愈循环
   - 位置: `~/.openclaw/workspace/ai-code-validator-reddit-posts.md`

2. **r/SideProject** - 侧重组独立开发和产品发布
   - 标题: Launched AI Code Validator — first CI/CD tool that catches AI coding assistant bugs
   - 重点: 个人故事、开源、dogfood测试
   - 位置: `~/.openclaw/workspace/ai-code-validator-reddit-posts.md`

3. **r/Entrepreneur** - 侧重创业和商业模式
   - 标题: How I'm validating AI-generated code at scale
   - 重点: 商业机会、早期用户、定价策略
   - 位置: `~/.openclaw/workspace/ai-code-validator-reddit-posts.md`

**发布建议时间**:
- r/MachineLearning: 周二至周四，09:00-11:00 AM EST
- r/SideProject: 周末或工作日晚上
- r/Entrepreneur: 工作日早晨或周末

### Show HN（待发布）
**状态**: ✅ 内容已准备，待发布

- 文档: `docs/marketing/show-hn-submission.md`
- 建议时间: 2026-03-11（周二）或 2026-03-13（周四），09:00-11:00 AM PST
- 预期目标: 50-100 upvotes，20-50 comments

### 其他推广渠道
- [ ] LinkedIn: 个人故事分享
- [ ] Indie Hackers: 展示收入和用户指标
- [ ] Hacker News: Show HN发布
- [ ] Dev.to: AI代码缺陷技术博客
- [ ] Twitter/X: AI幻觉模式主题线程

---

## 📊 目标追踪

### 用户增长目标
| 里程碑 | 用户数 | MRR | 状态 |
|--------|--------|-----|------|
| Month 1 | 5 early access | $47.50 | 🚧 进行中 |
| Month 2 | 15 early access | $142.50 | 待开始 |
| Month 3 | 30 mixed | $380 | 待开始 |
| Month 6 | 100 users | $1,500 | 待开始 |
| Month 12 | 500 users | $7,500 | 待开始 |

### 发布后目标（Show HN）
- [ ] Upvotes: 50-100
- [ ] Comments: 20-50
- [ ] Website visits: 500-1,000
- [ ] NPM downloads: 50-100
- [ ] GitHub stars: 10-30

---

## 🔜 近期行动

### 本周（2026-03-07 - 2026-03-13）
- [ ] 发布Show HN帖子（目标: 2026-03-11周二）
- [ ] 发布r/MachineLearning帖子
- [ ] 发布r/SideProject帖子
- [ ] 发布r/Entrepreneur帖子
- [ ] 真实测试GitHub Action PR评论功能
- [ ] 完成Early Access表单API（Telegram Bot集成）

### 下周（2026-03-14 - 2026-03-20）
- [ ] 发布到GitLab CI Catalog
- [ ] 在自研项目dogfood（`geo-boost` GitHub Actions集成）
- [ ] 收集早期用户反馈
- [ ] 根据反馈调整检测器逻辑

---

## 📝 开发笔记

### 已知问题
1. GitHub Action的PR评论和质量门禁功能代码已实现，但尚未在真实PR中测试
2. GitLab CI的Code Quality报告功能待实现

### 待改进
1. 提高检测准确率（目标是≥80%）
2. 优化扫描速度（100文件项目<3秒）
3. 减少false positives（保守默认设置，容易抑制）

### 下一步功能优先级
1. 支持更多语言（Python、Go、Rust）
2. VS Code扩展（实时验证）
3. 团队功能（历史趋势、团队仪表板）
4. AI辅助自动修复（超越提示）

---

## 🔗 重要链接

- **GitHub**: https://github.com/raye-deng/ai-code-validator
- **NPM**: https://www.npmjs.com/package/ai-code-validator
- **Website**: https://codes.evallab.ai
- **Early Access**: https://codes.evallab.ai/early-access
- **Reddit推广帖子**: `~/.openclaw/workspace/ai-code-validator-reddit-posts.md`

---

_维护者: Raye Deng_
_最后更新: 2026-03-07 20:30 GMT+8_
