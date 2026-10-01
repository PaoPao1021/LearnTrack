---
name: LearnTrack
description: 用清晰内容、轻量光效和明确交互反馈组织个人学习的工作台
colors:
  accent: "#007aff"
  accent-dark-fallback: "#0a84ff"
  accent-strong: "#0064d2"
  accent-strong-dark: "#0071e3"
  accent-press: "#0057ba"
  accent-press-dark: "#3395ff"
  ink: "#171c26"
  ink-dark: "#eef1f7"
  text-secondary: "#566070"
  text-secondary-dark: "#a7b0bf"
  text-tertiary: "#647084"
  text-tertiary-dark: "#a0adbf"
  bg-base: "#f5f7fb"
  bg-base-dark: "#0b0e14"
  surface-content: "#fff"
  surface-content-dark: "#181e27"
  surface-elevated: "#ffffff"
  surface-elevated-dark: "#202633"
  border-soft: "#dfe4eb"
  border-soft-dark: "#34404f"
  result-correct: "#147d40"
  result-correct-dark: "#86efac"
  result-incorrect: "#b42318"
  result-incorrect-dark: "#fca5a5"
  heat-0: "#ebedf0"
  heat-1: "#9be9a8"
  heat-2: "#40c463"
  heat-3: "#30a14e"
  heat-4: "#216e39"
  heat-0-dark: "#1e2735"
  heat-1-dark: "#0e4429"
  heat-2-dark: "#006d32"
  heat-3-dark: "#26a641"
  heat-4-dark: "#39d353"
typography:
  display:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif"
    fontWeight: 700
    lineHeight: 1.12
    letterSpacing: "-0.028em"
  headline:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif"
    fontSize: "26px"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "-0.025em"
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif"
    fontSize: "18px"
    fontWeight: 650
    lineHeight: 1.5
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif"
    fontSize: "13px"
    fontWeight: 500
  metric:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif"
    fontSize: "28px"
    fontWeight: 650
  duration:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif"
    fontSize: "30px"
    fontWeight: 600
    lineHeight: "36px"
rounded:
  card: "12px"
  control: "8px"
  dialog: "16px"
  pill: "999px"
  progress: "4px"
  heat-cell: "2px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "20px"
  "6": "24px"
  "8": "32px"
components:
  button-primary:
    backgroundColor: "{colors.accent-strong}"
    textColor: "#fff"
    rounded: "{rounded.control}"
    padding: "0 20px"
    height: "44px"
  button-primary-active:
    backgroundColor: "{colors.accent-press}"
    textColor: "#fff"
    rounded: "{rounded.control}"
  button-ghost:
    backgroundColor: "{colors.surface-elevated}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0 20px"
    height: "44px"
  input:
    backgroundColor: "{colors.surface-elevated}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "10px 16px"
    height: "44px"
  rail-link:
    textColor: "{colors.text-secondary}"
    rounded: "{rounded.control}"
    padding: "10px 14px"
    height: "44px"
  rail-link-active:
    backgroundColor: "color-mix(in srgb, var(--accent) 9%, transparent)"
    textColor: "{colors.accent-strong}"
    rounded: "{rounded.control}"
  preset-chip:
    backgroundColor: "{colors.surface-elevated}"
    textColor: "{colors.text-secondary}"
    rounded: "{rounded.pill}"
    padding: "5px 12px"
  work-section:
    backgroundColor: "{colors.surface-content}"
    rounded: "{rounded.card}"
    padding: "{spacing.6}"
  task-check:
    backgroundColor: "transparent"
    rounded: "{rounded.control}"
    width: "44px"
    height: "44px"
  task-check-done:
    backgroundColor: "{colors.accent-strong}"
    textColor: "#fff"
    rounded: "{rounded.control}"
    width: "44px"
    height: "44px"
---

# Design System: LearnTrack

## Overview

**Creative North Star: "学习工作台"**

LearnTrack 的视觉由实际学习任务组织：查看安排、开始计时、记录题目，再回看结果。整体采用系统字体、清晰内容区、细分隔线和靠近列表的操作，保持适合反复使用的工作密度。用户明确要求保留交互、动效和光效；去 AI 味针对模板化布局与空泛文案，不能被解释为全面扁平化或取消视觉反馈。

这份记录以当前应用外壳、今日流程、计划、练习、讲次模板、编程活动及已记录时长模块为依据。统计、学习路线、设置和旧记录等次级表面继承共享基础样式，但仍保留各自的旧组件与局部处理；这里不把它们视为完成了同一轮全面重写。全局样式中较早的玻璃、字体和光域声明，须以末尾覆盖规则及当前组件实际使用为准。

完成审查的结论是修复手机日历账户字段、历史周日均口径、手机时长模块和键盘可操作的时间格式选择后可交付。审查图位于 `.impeccable/review/`，包含桌面、手机和深色计划等状态；图中的成绩与账户来自隔离测试数据，Agent 与日历服务使用模拟响应。它们说明布局与状态，不是用户成绩或在线服务可用性的证明。本轮没有新增随产品交付的栅格图像。

**Key Characteristics:**

- 系统字体，中文和数字按系统原生方式排版。
- 浅色与深色均保持清晰工作区，以边界、近处阴影和局部微光建立层次。
- 蓝色承担操作和选中状态，分类色保留用户的数据含义。
- 列表、指标行、原生表单和可横向滚动表格形成主要组件语言。
- 手机保留五个底部主入口，表单随宽度重排。

## Colors

默认蓝色操作色配合中性的白色与石墨色表面；结果色和活动热图各自表达业务含义。上方 frontmatter 是本文件的规范数值，浅色与深色对应项须成对使用。sidecar 的八阶色带是用于面板预览的 OKLCH 派生色带，不替换已实现的颜色或五档活动编码。

### Primary

- **清晰蓝 · Accent**：默认持久化强调色，用于焦点轮廓、选中边界、浅色选中底和部分进度。用户可在设置中改色。深色 CSS 的 `accent-dark-fallback` 是没有内联用户设置时的备用值；启动时的持久化强调色可以覆盖它。
- **操作蓝 · Accent Strong**：白字主按钮、已完成任务、活动导航文字和链接的主要色。使用对应的深色变体。
- **按下蓝 · Accent Press**：主要按钮按下时的填充。使用对应的深色变体。

**The Action Blue Rule.** 用户强调色改变的是当前 `--accent`；主要填充按钮的 Strong 和 Press 仍取主题中已定义的蓝色。扩展页面时保留这一实际关系，不能假定所有蓝色都随设置变化。

### Neutral

- **墨色 · Ink**：页面标题、正文与输入内容。
- **次级文字 · Text Secondary**：字段说明、导航默认态、日期、口径与辅助信息。
- **辅助文字 · Text Tertiary**：占位提示和更轻的标签；采用末尾系统样式中的值。
- **工作区底色 · BG Base**：应用外壳的实色底。
- **内容表面 · Surface Content**：侧栏、移动页头、底部导航、主要分区和列表容器。
- **浮层与字段表面 · Surface Elevated**：输入、次要按钮和临时面板；深色中与内容表面形成小幅亮度差。
- **细边界 · Border Soft**：容器边框、行分隔与进度底轨。

### 业务语义

- **正确绿 · Result Correct**：练习记录中带“正确”文字的结果，浅色为较深的绿色，深色为较亮的绿色。
- **错误红 · Result Incorrect**：练习记录中的“错误”，以及表单错误提示。未作答采用次级文字，不用错误色替代。
- **活动热图 · Heat 0–4**：从无活动到较多贡献／提交的五档编码。浅色由浅灰到深绿，深色由石墨底到亮绿。分类颜色由用户的分类记录提供，不固定为新的品牌调色板。

**The Meaning Rule.** 颜色伴随文字或数据含义。正确／错误／未作答保留结果文字；热图保留图例和可展开的每日数据表，分类色用于相应科目和活动。

## Typography

**Display Font / Body Font:** 系统无衬线栈。当前最终样式不会加载或要求 Outfit、Plus Jakarta Sans 等早期字体声明。

**Label/Mono Font:** 一般标签沿用系统字体；时长、指标和表格使用等宽数字特性。真实等宽字体变量是 `ui-monospace, Consolas, monospace`，不是正文的替代字体。

文字的性格来自清晰的层级和稳定的数字对齐。标题使用中等到较重字重，说明采用较小字号与次级文字；不需要额外的展示字体来区分功能。

### Hierarchy

- **Display**：共享标题辅助规则采用较重字重（700）、紧凑行高（1.12）与轻微收紧字距（−0.028em），字号由对应组件指定；它不是营销大标题的固定尺寸。
- **Headline**：计划与练习页标题采用清晰的页面级层级（26px、700、1.3）；手机收至（24px）。今日页标题使用其现有的（24px）组件尺寸。
- **Title**：标准工作分区标题（18px、650、1.5）。今日页旧卡片和时长分区仍有（20px）的标题，计时器标题另随断点变化。
- **Body**：页面基础正文（15px），任务、说明和表格主要采用（14px）。页面说明的行高采用（1.65），空状态文案采用（1.7）。
- **Label**：字段与图表口径以（13px、500）为主；结果与更小口径常用（12px）。不把早期大写小标签的字距推广到新表单。
- **Metric / Duration**：练习指标数字（28px、650），时长数字（30px、600）配（14px）单位。数字采用 tabular numerals；时长保持数字与单位同一基线。

**The Readable Data Rule.** 指标旁保留单位、分母或统计范围；没有足够数据的正确率显示破折号，不以装饰数字补空白。

## Layout

桌面以固定宽度侧栏（218px）与可伸缩主区组织工作。侧栏贴顶且可收起；主区居中，最大宽度（1160px），内边距（36px 32px 64px）。标准工作分区采用（24px）内边距和细边界，标题与操作栏允许换行。

主要间距来自 Tailwind 的（4px）步进，共享模块常用（8、12、16、20、24、32px）。工作列表按行排列，而不是把每条任务都拆成独立卡片；任务行垂直内边距（12px），最后一行去除分隔。操作直接放在所属分区或列表旁。

手机在宽度小于（768px）时隐藏侧栏，显示页头与固定底部导航。主区内边距为（24px 16px），下方预留（92px + safe-area-inset-bottom）；工作分区内边距为（18px 16px）。底部只有今日、计划、练习、统计、学习路线五个主入口，学习记录、主题切换和设置进入页头。

在（640px）及以上，练习资料与日期筛选扩展为横排，活动日历采用平台、用户名、年份和读取动作四列。更窄时，日历平台和用户名各占整行，年份和操作在下一行；字段保持可收缩，避免继承最小宽度撑出手机。时长模块从单列变为两列，时间格式标签和原生选择框可以随标题换行。今日安排与计时器在（1024px）及以上并排。

练习指标桌面四列、手机两列。知识点和明细表格保持数据列的可读宽度，在局部容器内横向滚动；活动热图也在局部容器内滚动，不压缩为难辨的小格。讲次编辑和练习表单使用随断点变化的字段网格。

**The Five Destinations Rule.** 移动主导航保持五个既定入口；附加功能进入页头、所属页面或设置。

## Elevation & Depth

主要分区和卡片以清晰表面、细边框、内缘高光和近处阴影定界。桌面鼠标经过时，微光跟随当前卡片内的指针，位于正文下方；移出、滚动或切换标签页即淡出。临时浮层保留玻璃层次，手机底部导航使用局部模糊；减少透明度偏好下改用实色。

保留的处理包括输入框的近处边缘阴影、焦点环、计时预设胶囊的轻阴影、次要按钮的微弱表面渐变，以及主要按钮从浅一点的 Strong 到 Strong 的小幅纵向渐变。旧今日页的节奏胶囊、时间轴和少数局部状态仍保留自身的透明度、blur 或阴影工具类；它们不构成新分区的玻璃规范。

### Shadow Vocabulary

- **近处边缘 · Near**：用于保留的字段、胶囊和临时面板；浅色与深色精确值记录在 sidecar 的 `extensions.shadows`。
- **字段聚焦 · Field Focus**：以当前强调色的透明混色形成外环（3.5px），并改变字段边框。键盘操作仍保留明确的轮廓。
- **次要按钮悬停 · Ghost Hover**：表面、边界和轻微投影随悬停变化，按压时向下移动并轻微缩小。

微状态、普通状态和面板的现有时长分别为（140ms、220ms、320ms）。既有卡片以（240ms）短过渡出现，最大错开（75ms）；任务完成有一次勾选反馈。计时器运行时以科目色缓慢呼吸（5s），仅动画化光层透明度，暂停后保持静态暖色光。循环在离屏或标签页隐藏时暂停。品牌时计图标保留，悬停或键盘聚焦时转动。时长数字变化保留（700ms）计数动画。

减少动态效果偏好下，取消指针跟随、位移、缩放和循环，计时状态仍通过文字、边界及静态光层表达；保留轻微颜色反馈。

**The Feedback Rule.** 保留操作手感和局部光效；动效跟随操作与计时状态，不用全局禁用规则把所有组件压成静态平面。

## Shapes

容器的主要轮廓是轻微圆角矩形：工作分区与卡片（12px），主要／次要按钮、输入和任务完成控件（8px）。默认对话框使用更柔和的（16px）圆角。胶囊只用于既有计时预设等紧凑选择，不把所有控件都改成 pill。

常见主按钮、次要按钮和输入的最小高度为（44px）；图标操作同时保证最小宽度（44px）。这是本轮常用工作控件的尺寸，不代表旧页面每个小控件都已经扩大。完成控件在计划和讲次列表中是（44px）方形，使用边框、填充和勾号共同表达状态。

进度条使用短圆角（4px）；活动热图每格（12px）且圆角（2px），七行排列、间隔（4px）。以细边框和底部分隔保持矩形内容的稳定对齐。

## Components

### Buttons

具体、稳定的操作控件。

- **Primary:** 操作蓝配白字，常见控件最小高度（44px），水平内边距（20px），圆角（8px）。完整背景渐变及悬停变体在 sidecar 中保留。
- **Secondary / Ghost:** Elevated 表面、墨色文字与细边界；浅色与深色均保留微弱表面受光。悬停改变文字、底色、边界和投影，并微小上移。
- **Hover / Active / Focus:** 主要按钮悬停上移（1px）并加强轻微投影，按下使用 Press 色；主要与次要按钮按下时下移（1px）并缩至（0.97）。键盘焦点采用强调色轮廓（2px），外偏移（3px）。
- **Disabled:** 降低透明度（0.45），禁止交互，取消变换与阴影。标签在异步时表达保存中、加载中等实际状态。

### Chips

计时预设保留紧凑胶囊：较小文字（12px、500），内边距（5px 12px），边框与近处阴影。选中时通过强调色文字、边界和浅色填充表达状态。它们是既有计时器的辅助控件，尺寸不等同于主要操作按钮。

### Cards / Containers

工作分区使用清晰 Content 表面、细边框、圆角和内边距。列表与统计可以共用一个容器；近处投影、顶部高光和桌面指针微光构成局部层次，文字与操作不移动。今日页既有卡片的内边距通常为（24px），计时器在较大屏幕增加到（32px）。

### Inputs / Fields

输入、日期、数字、textarea 和 select 共用 Elevated 表面、边框、系统文字、圆角和常见最小高度。标签明确位于字段上方或用关联的隐藏标签；时间格式、平台、计划状态和学习资料等选择使用浏览器原生 select。

字段焦点同时改变边框和外环。错误文字使用 Incorrect 对应色，保留可读错误说明；占位文字采用 Tertiary。键盘焦点不依赖鼠标悬停。多行输入保留原生编辑行为。

### Navigation

桌面 rail 行采用图标加文字，较小正文（14px），内边距（10px 14px），最小高度（44px）。默认次级文字，悬停轻微强调色底；活动项使用更明显的浅强调色底、Strong 文字和较重字重（600）。手机底部导航使用图标与（12px）文字，上边界与 safe area 保留。

练习页内导航使用可以换行的文字标签与底部选中线，最小高度（44px）。外壳保留“跳转到内容”链接；键盘焦点与当前页面状态都有明确标识。

### Task Lists and Lecture Rows

2026-10-01 的复习流程审查保留既有按钮反馈、卡片微光和主题样式。到期清单沿用原生资料选择、带标签的日期字段与列表行；全部资料模式下每题标注来源，重做自动切到对应资料。截止日期、资料、页面和重做入口由 URL 保存；练习草稿按当前标签页独立恢复，并明确其暂存范围。桌面截图与浏览器回归检查通过，本轮未新增交付栅格图像。

计划与讲次列表使用底部分隔、完成按钮、伸缩文字区和行内操作。任务标题允许长文本换行；完成状态同时显示填充、勾号、文字样式与可访问状态。讲次编辑在当前行下方展开。

讲次档案是编号模板，用户可填写手头教材标题。资料说明继续保留“教材正文与原题不随应用分发”和知识点分组不等于官方目录的事实，不能把模板呈现成已核实的完整教材内容。

### Metrics, Tables and Duration

练习指标采用边界清楚的数字行，旁列分子／分母、单位和范围说明。表格保持表头、行分隔和等宽数字，手机使用容器滚动。正确、错误和未作答保留文字结果。

已记录时长使用一个分区中的当日与本周两块数据区，手机纵向排列。原生时间格式选择支持小时／分钟、h／m、小数小时。未保存计时单独提示；当日占本周的进度和本周日均有明确标签。本周合计到所选日期，日均分母包括该周周一到所选日期之间所有天，即使某天没有记录。

### Contributions and Assistant Review

活动日历保留五档热图、少／多图例、更新说明和可展开的每日数据表。它表达贡献或提交次数；不把它换算为学习时长，也不把力扣提交数显示成解题数。

学习助手沿用工作分区、原生选择、明确字段和任务行。用户先看发送摘要和同意控件，再生成建议；建议任务在用户明确确认后进入待办。没有真实结果时使用说明和空态，不以模拟建议填充产品默认界面。

### Dialogs and Empty States

默认对话框是居中的近实色玻璃面板，配黑色遮罩、清晰标题、取消与保存操作。面板最大高度（90dvh）并可垂直滚动；保留焦点陷阱、Escape 关闭和返回触发位置的行为。

空状态用次级文字解释下一步；统计空态保留破折号或无记录说明。它们的目的在于帮助完成任务，不添加虚构成绩或未核实的资源完整性。

## Do's and Don'ts

### Do:

- **Do** 沿用系统字体、清晰表面、细边框，并保留按钮、卡片和计时器的交互反馈。
- **Do** 让字段标签、单位、分母和日期范围跟随数据一起显示。
- **Do** 保留当前用户强调色、分类色及浅／深色配对，遵守 Strong 操作蓝的实际关系。
- **Do** 使用常见（44px）工作控件，保留可见焦点与原生选择操作。
- **Do** 在手机重排字段、堆叠时长模块，并让宽表格和热图在局部滚动。
- **Do** 保留模板、独立统计口径和 Agent 确认步骤的真实说明。

### Don't:

- **Don't** 把去 AI 味等同于删除动效、光效、品牌图标或操作手感，也不把状态光效扩散为整页持续动画。
- **Don't** 增加第六个移动底部主入口，或让字段最小宽度撑出视口。
- **Don't** 用颜色替代结果文字、统计口径或错误说明。
- **Don't** 把审查测试数据、模拟服务响应或教材编号模板写成真实成绩、可用性保证或完整官方内容。
- **Don't** 假定所有次级页面已经统一重写，或在扩展时擅自替换其已保留的行为。
