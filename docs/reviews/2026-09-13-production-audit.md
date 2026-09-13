# LearnTrack 上线级代码审计（任务 2）

> 审计日期：2026-09-13
> 范围：web 前端全部源码、domain/contracts 包、PWA/Service Worker、构建产物、依赖与安全基线
> 方法：全量人工走读 + 浏览器行为验证 + 依赖审计（`npm audit`）+ 构建/测试基线（21 项测试）

## 结论

无阻断性安全漏洞；数据层（备份校验、同步会话、离线队列事务、tombstone 删除）在此前审查中已加固并通过测试。本轮发现 **5 项 P1（上线前必须修）、4 项 P2（上线级体验/一致性）**，以及若干记录在案的 P3。P1 与 P2 全部在任务 3 中修复并复审。

## P1：上线前必须修

| # | 问题 | 位置 | 影响 | 修复 |
|---|------|------|------|------|
| 1 | 懒加载路由没有 ErrorBoundary | `app/App.tsx` | 发版后旧 Service Worker 缓存的 chunk 哈希失效、或网络抖动导致动态 import 失败时，整个应用白屏且无提示 | 新增 `ErrorBoundary`（含"重新加载"按钮）包裹路由 |
| 2 | 添加记录提交无进行中状态 | `components/common/EntryModal.tsx` | 弱网/慢设备上双击"保存"会写入两条相同记录（本地事务执行两次） | 增加 `submitting` 状态，提交期间禁用按钮 |
| 3 | `addQuickAction` 的 `count()` 在事务外读取 | `services/commands.ts` | 并发添加两个快捷项时 sortOrder 相同，排序不稳定 | 把计数移入同一 Dexie 事务 |
| 4 | `.zcode/` 会话目录被误提交 | 仓库根 | 会话内计划文件等非项目内容入库，上传仓库前必须清理 | `git rm --cached` + `.gitignore` |
| 5 | 构建无手动分包 | `apps/web/vite.config.ts` | echarts（约 633KB）产物与业务代码混在同一 chunk，任何一次业务改动都使图表大包缓存失效 | `manualChunks` 拆分 echarts / dexie / react，提升发版后缓存命中 |

## P2：上线级体验与一致性

| # | 问题 | 位置 | 修复 |
|---|------|------|------|
| 6 | 分类改名使用原生 `window.prompt`：与对话框设计体系割裂、无长度约束、部分嵌入式 WebView 拦截原生弹窗 | `features/settings/Settings.tsx` | 改为玻璃风格小对话框（Modal），保留归档按钮 |
| 7 | 图表 tooltip 标点中英混用（英文界面出现全角冒号/括号） | `features/analytics/Analytics.tsx` | 标点统一为随语言无关的紧凑格式 |
| 8 | 主题色选择块 28px 触控目标偏小 | `features/settings/Settings.tsx` | 放大到 32px 并增加间距 |
| 9 | 学习页删除路线/数量超限使用原生 `confirm()` | `features/learning-paths/Learning.tsx` | 本轮保留（原生弹窗可靠且可访问），记录为后续统一项 |

## 已核查无问题（本轮确认）

- 备份链路：导出含未同步状态；导入前校验 JSON 结构、formatVersion、各集合计数、checksum、ID 唯一性、分类引用与时间记录，恢复前展示摘要确认。
- 同步安全：会话凭据使用 HttpOnly cookie，本地不落盘密码；401 统一清理登录态；换服务器重置游标。
- 数据完整性：本地实体与 outbox 同事务写入；删除为 tombstone；冲突双候选留存并支持手动解决。
- 无障碍：dialog 语义/焦点陷阱/焦点返回、表单 label 关联、role=alert/status、图表 role=img 摘要与键盘等价路径（本轮浏览器实测）。
- 依赖：`npm audit` 0 已知漏洞；构建/测试基线 21 项通过。

## P3：记录在案（不在本轮处理）

- ECharts 体积本身（分包解决缓存问题，不减少总量；按需注册收益有限）。
- Service Worker 缓存版本串 `learntrack-shell-v2` 未随发版自动变更（network-first 策略已兜底）。
- 深度离线场景：多标签页同时写入的合并语义（Dexie 单连接 + opId 幂等可兜底，未做极端测试）。

## 任务 3 复审记录（修复后回填）

- P1-1~5、P2-6/7/8 全部修复；`npm run build`、21 项测试、`npm audit` 0 漏洞复验通过。
- 复验细节见任务 4 的功能测试记录。
