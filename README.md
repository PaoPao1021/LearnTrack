<div align="center">

<p align="center">
  <img src="docs/screenshots/dashboard-preview.png" alt="LearnTrack Hero Banner" width="100%" style="border-radius: 16px; box-shadow: 0 20px 50px rgba(0,0,0,0.15);" />
</p>

# ⏱️ LearnTrack

**本地优先 · 液态玻璃美学 · 高精度学习时间账本**

*每一次专注都清晰可感，每一份投入皆有迹可循。*

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178c6.svg?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18.3-61dafb.svg?style=flat-square&logo=react&logoColor=black)](https://reactjs.org/)
[![Vite](https://img.shields.io/badge/Vite-8.3-646cff.svg?style=flat-square&logo=vite&logoColor=white)](https://vitejs.dev/)
[![Dexie](https://img.shields.io/badge/Dexie.js-IndexedDB-orange.svg?style=flat-square)](https://dexie.org/)
[![ECharts](https://img.shields.io/badge/ECharts-6.1-aa344d.svg?style=flat-square&logo=apacheecharts&logoColor=white)](https://echarts.apache.org/)
[![Tests](https://img.shields.io/badge/Tests-29%20passed-brightgreen.svg?style=flat-square)](packages/domain/src/index.test.ts)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square)](CONTRIBUTING.md)

[功能特性](#-功能特性) • [UI 视觉与交互美学](#-ui-视觉与交互美学) • [真机运行预览](#-真机运行预览) • [快速开始](#-快速开始) • [架构设计](#-架构设计) • [技术栈](#-技术栈) • [开源协议](#-开源协议)

</div>

---

## 🌟 项目简介

**LearnTrack** 是一款专为终身学习者、考研考证党与深度思考者打造的 **本地优先（Local-First）学习时间记账与自我量化工具**。

不同于市面上繁重且依赖强制联网的打卡软件，LearnTrack 遵循 **“数据绝对私有、极速响应、离线可用”** 原则。所有学习与专注数据均实时加密存储于浏览器的本地数据库（IndexedDB）中；界面全面采用**高级液态拟物玻璃（Liquid Glass）视觉体系**与**原生微机械动效**，让每一次进入学习状态都充满神圣的仪式感。

---

## 🎨 UI 视觉与交互美学

LearnTrack 在 UI 细节与动效质感上进行了深度打磨，融合了拟物物理质感与现代数字界面的通透灵动：

### 1. 纯色卡片鼠标动态聚光（Spotlight Cursor Follow）
全局所有信息卡片均注入实时微光聚光灯算法。鼠标在界面掠过时，卡片内壁映射出随光标精确位移的柔和高光（Radius 420px），并采用 `requestAnimationFrame` 硬件级帧率节流，在 120Hz/144Hz 高刷新率屏幕上带来如水银般顺滑的物理反光质感。

### 2. 精密机械联动时计（Mechanical Chronograph Logo）
界面左上角标识内置自研 SVG 机械轮系：外层天体刻度星齿以 18 秒周期顺时针运转，中层测速轨道逆时针环绕，精密时针与秒针呈 6:1 机械差速匀速滑扫，鼠标悬停时自动激发加速齿轮啮合动效。

### 3. 全屏沉浸专注模式（Zen Mode & Flow Field）
一键全屏隐藏所有侧边栏与繁杂干扰，中央呈现呼吸律动时针大表盘。内置 **纯原生 Web Audio 声学心流场**，无需下载任何外部音频文件，零网络开销动态合成真实雨声、深海潮汐与阻断脑电波杂讯的 1/f² 深度棕色噪点（Brown Noise）。

### 4. 几何无点圆润数字排印（Tick-Text Typography）
告别传统生硬的打孔数字，全局数字均采用圆润饱满的几何几何字体，并强制开启 OpenType `tnum`（等宽对齐）与 `zero: 0` 特性，确保倒计时跳动、秒数递增时数字骨架绝对稳固、零晃动。

### 5. 晶体高对比度微热力日历（Glass Calendar）
剔除冗余遮挡滤镜，以纯粹的高透晶体面板呈现当月日期。每个日期格子底部配备活动微型多色指示点（Activity Micro-Dots），支持上一年/下一月快速穿梭与一键回溯历史复盘。

---

## 📸 真机运行预览

### 💻 仪表盘全景（Dashboard）
*全局沉浸主页：专注时钟、多维时长统计、今日待办清单与学习路径合一。*
![Dashboard Overview](docs/screenshots/dashboard-preview.png)

---

### 🧘 全屏专注模式与心流声学（Zen Focus Mode）
*全屏零干扰，呼吸律动倒计时，随心切换雨声、海浪与深度棕噪。*
![Zen Focus Mode](docs/screenshots/zen-mode.png)

---

### 📊 多维深度统计看板（Analytics）
*实心内层核心领域 + 加粗外层细分科目双层环扇形图，GitHub 同款五档色阶年度热力图。*
![Analytics Dashboard](docs/screenshots/analytics-preview.png)

---

### 🗓️ 晶体热力日历与复盘穿梭（Glass Calendar）
*高对比度多层玻璃质感，集成微活动色彩指示器，支持快速时间旅行。*
![Calendar Modal](docs/screenshots/calendar-modal.png)

---

### 🗺️ 体系化学习路线（Learning Paths）
*树状章节清单、数量型目标推进，进度与专注时间双向精确绑定。*
![Learning Paths](docs/screenshots/learning-preview.png)

---

### 🌙 深色模式对比（Dark Theme）
*支持深色模式与浅色模式无缝瞬切，或设置定时自动切换，冷灰黑底色防眩光。*
![Dark Theme](docs/screenshots/dashboard-dark.png)

---

## ✨ 核心功能特性

### ⏱️ 专注计时与时间账本
- **正计时 / 倒计时**：专注中途支持随时暂停，自动闭合暂停区间；支持超额记录。
- **抗休眠与刷新恢复**：采用绝对壁钟时间戳（Wall-Clock Timestamps）恢复状态，电脑合盖休眠或误关页面，时长精准如初。
- **跨午夜智能分摊**：支持通宵或深夜学习记录，跨午夜段按当地日期自动拆解统计。
- **三级分类体系**：`大类领域 → 具体科目 → 细分活动`，支持多层级自定义专属颜色，历史记录永不因分类调整而丢失。

### 📊 深度量化与统计洞察
- **重构双层分布圆盘**：实心内圆代表核心大类，外围加粗粗环展示详细活动，外置独立高光投入数据条。
- **GitHub 风格年度贡献热力图**：全年度学习密度按 5 档色阶直观分布，点击任意网格直接下钻查看该日原始记录。
- **多维度交叉分析**：多科目日/周/月叠加渐变趋势图、单次时长区间分布（<30m、1h、2h+）及 24 小时精力分布波峰。

### 🛡️ 本地优先与隐私安全
- **100% 离线可用**：所有业务逻辑、数据库驱动与音频合成全部运行在浏览器本地，断网状态丝滑无阻。
- **幂等同步引擎**：内置 Outbox 队列事务，联网后与私有同步服务（Node.js + SQLite）双向推送，版本冲突由用户自主裁决。
- **四重防篡改备份**：一键导出 JSON 镜像，支持结构、计数、SHA-256 校验和与关系完整性全量验证；同时支持导出 CSV 供 Excel/Python 进阶分析。

---

## 🚀 快速开始

### 前置要求
- [Node.js](https://nodejs.org/) ≥ 20.0.0
- npm ≥ 10.0.0

### 本地开发

```bash
# 1. 克隆代码仓库
git clone https://github.com/PaoPao1021/LearnTrack.git
cd LearnTrack

# 2. 安装 Monorepo 所有依赖
npm install

# 3. 启动前端 Web 开发服务
npm run dev:web
```

启动完成后，在浏览器访问：**`http://localhost:5173`** 即可即刻体验。

### 可选：启动多端同步服务（API）

```bash
# 启动配套的 Fastify 同步服务端（默认运行在 http://localhost:8787）
npm run dev:api
```

> **说明**：无需启动 API 服务亦可完整使用全部时间记账、图表分析与数据导出功能。

---

## 🧪 自动化测试与质量保障

项目严格践行测试驱动与防御式编程，已涵盖领域计算纯函数、离线队列一致性、计时器抗休眠等 29 项核心单元测试：

```bash
# 运行全工作区单元测试（Vitest）
npm test

# 执行生产环境编译打包检查（TypeScript 严格检查 + Vite 优化分包）
npm run build
```

```text
 ✓ packages/domain   14 passed (14)
 ✓ apps/api           3 passed (3)
 ✓ apps/web          12 passed (12)
 ────────────────────────────────────
 Test Files  6 passed (6)
      Tests  29 passed (29)
   Duration  1.48s
```

---

## 🏛️ 架构设计

```
┌─────────────────────────────────────────────────────────────┐
│                       浏览器宿主 (Web App)                    │
│                                                             │
│   ┌─────────────────────────────────────────────────────┐   │
│   │               React 18 + Tailwind UI 层              │   │
│   │   (Liquid Glass · Zen Mode · Chrono SVG · ECharts)  │   │
│   └──────────────────────────┬──────────────────────────┘   │
│                              │ 读写操作                      │
│                              ▼                              │
│   ┌─────────────────────────────────────────────────────┐   │
│   │           Dexie.js (浏览器 IndexedDB 本地库)          │   │
│   │  (Categories · Entries · Paths · Todos · Goals)     │   │
│   └──────────────────────────┬──────────────────────────┘   │
│                              │ 同事务双写                    │
│                              ▼                              │
│   ┌─────────────────────────────────────────────────────┐   │
│   │                 Local Outbox 事务队列                │   │
│   └──────────────────────────┬──────────────────────────┘   │
└──────────────────────────────┼──────────────────────────────┘
                               │ 在线时双向幂等同步 (Op-Log)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                    自托管私有同步服务 (Fastify)               │
│               SQLite · Session Auth · 冲突保留               │
└─────────────────────────────────────────────────────────────┘
```

---

## 🧱 技术栈

| 层次 | 技术选型 | 用途与优势 |
| :--- | :--- | :--- |
| **基础框架** | [React 18](https://react.dev/) + [TypeScript 5.6](https://www.typescriptlang.org/) | 强类型组件化开发，确保运行时零异常 |
| **工程构建** | [Vite 8](https://vitejs.dev/) + [Rollup](https://rollupjs.org/) | 秒级热更新，生产环境智能代码分块 |
| **本地存储** | [Dexie.js](https://dexie.org/) (IndexedDB) | 纯前端本地持久化，支持响应式 liveQuery 查询 |
| **状态流转** | [Zustand 5](https://zustand-demo.pmnd.rs/) | 轻量、无样板代码，与 LocalStorage 实时同步时计状态 |
| **数据可视化** | [Apache ECharts 6](https://echarts.apache.org/) | 按需注册 Tree-shaking，支持全套无障碍读屏等价物 |
| **声音系统** | Web Audio API (Native Oscillator) | 100% 离线可用的心流场白噪音与微触感回馈音 |
| **样式体系** | [Tailwind CSS 3](https://tailwindcss.com/) + 自定义设计令牌 | 纯原生 CSS 变量驱动，完美支持深/浅主题与强调色无缝切换 |
| **多语言** | 自研轻量类型安全 `i18n` | 支持简中、英文随心热切换，词条完整覆盖 |

---

## 📁 目录结构

```text
LearnTrack/
├── apps/
│   ├── web/                     # 前端单页应用（PWA · 离线优先）
│   │   ├── public/              # 静态资源与 PWA ServiceWorker
│   │   └── src/
│   │       ├── components/      # 通用液态玻璃组件（Modal, Combobox, Logo, Toast）
│   │       ├── features/        # 核心业务模块（Dashboard, Analytics, Entries...）
│   │       ├── services/        # 声音引擎 (Soundscape), 备份恢复, 指令队列
│   │       ├── stores/          # Zustand 状态机（计时器核心）
│   │       ├── db/              # Dexie 数据库架构与种子数据
│   │       └── styles/          # 全局设计令牌、卡片聚光灯与关键帧动画
│   └── api/                     # 极轻量私有同步服务（Fastify + SQLite）
├── packages/
│   ├── domain/                  # 核心纯函数领域层（时间算法、跨午夜分摊、统计模型）
│   └── contracts/               # 跨端 Zod 契约模式（同步协议、备份校验规范）
├── docs/                        # 设计文档与真机运行截图预览
└── infrastructure/              # 容器化部署脚本
```

---

## 🤝 贡献指南 (Contributing)

我们非常欢迎社区贡献！无论是新功能想法、UI 建议还是代码重构：

1. **Fork** 本仓库；
2. 新建你的功能分支 (`git checkout -b feature/amazing-feature`)；
3. 确保所有类型检查与测试通过 (`npm test && npm run build`)；
4. 提交你的更改 (`git commit -m 'feat: add some amazing feature'`)；
5. 推送到分支 (`git push origin feature/amazing-feature`)；
6. 提交 **Pull Request**！

---

## 📄 开源协议 (License)

本项目采用 [MIT License](LICENSE) 开源协议。你可以自由使用、修改与二次分发，但请保留原作者版权说明。

---

<div align="center">
  <sub>Built with ❤️ for lifelong learners. Keep learning, keep tracking.</sub>
</div>
