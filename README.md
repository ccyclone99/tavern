# 酒馆 — AI 主持人驱动的角色扮演

一个纯静态 HTML + 原生 JS 的多角色 AI 聊天器，定位是“AI 主持人引导玩家制定并执行计策的酒馆”。

## Agent 入口

如果你要让外部 agent 驱动游戏、做多 agent 模拟，或让 agent 辅助开发，请先读：

- [docs/AGENT.md](docs/AGENT.md)：agent 游玩协议总纲
- [docs/API_PROTOCOL.md](docs/API_PROTOCOL.md)：LLM API、AI 标记和 `<state_update>` 协议
- [docs/GAME_STATE.md](docs/GAME_STATE.md)：`scene` 全字段、角色结构、消息类型
- [docs/MULTI_AGENT.md](docs/MULTI_AGENT.md)：多 agent 模拟场景和游玩报告格式
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)：架构、文件职责、数据流、安全约束
- [docs/SPEC.md](docs/SPEC.md)：下一阶段叙事 RPG 系统规格（知识边界、信息解锁、时钟、检定、计策闭环）
- [docs/UIUX_SPEC.md](docs/UIUX_SPEC.md)：下一阶段前端 UI/UX 优化规格（信息架构、自然输入、响应式、可访问性）
- [docs/INPUT_FLOW_SPEC.md](docs/INPUT_FLOW_SPEC.md)：下一阶段单输入框自然输入规格（自动意图识别、被动检定、pending 状态）
- [docs/SCENARIO_FLOW_SPEC.md](docs/SCENARIO_FLOW_SPEC.md)：下一阶段剧本与游戏流程强化规格（开局引导、阶段目标、卡住提示、失败推进）

## 核心体验

玩家通过一个主输入框提出对话、行动、观察、求助或计策意图后，AI 不直接替玩家成功执行，而是像主持人一样：
- 追问关键条件、筹码、风险偏好
- 在高风险行动前展示本地风险预览
- 在需要时要求检定，而不是让玩家主动选择“检定功能”
- 创建并更新计策卡
- 分阶段推进（情报 → 准备 → 行动 → 转折 → 结局）
- 让 NPC、任务、背包、地图、关系、时钟和世界状态产生具体后果
- 只向玩家展示已知线索，NPC 私密设定随调查逐步解锁
- NPC 会按日程离屏行动，并可能创建可调查、可反制的压力

## 行动预览说明

普通聊天、观察、询问、行动和计划都可以直接在主输入框输入。系统会自动判断是否需要行动预览或检定。

1. 输入明确行动，例如：“我想套出他隐瞒的货舱情报”。
2. 系统会先生成行动预览，显示行动类型、建议检定、风险、风险来源和失败后果。
3. 点击“确认行动”或在输入框输入“执行”后，AI 才会按主持人规则结算；点击“取消”或输入“取消”则不进入剧情。
4. 如果系统要求检定，输入区会出现检定卡；装备和非消耗物品会自动进入修正，消耗品和已解锁同伴协助可在检定卡点选，点击“掷骰”或输入“掷骰”后才结算并消耗。

单次具体动作会进入行动预览；多阶段计划、阴谋、拉拢、离间和长期目标会进入计策流程。

## 计策系统说明

### 1. 如何开始一条计策

1. 在聊天输入区直接输入你的目标或意图，例如：
   - “我想挑拨商会和城卫的关系”
   - “我打算用假账本栽赃商会会长”
2. 发送后，AI 会以主持人身份追问关键信息，并可能在回复末尾追加隐藏的 `<state_update>` 状态补丁。
3. 如果补丁包含新计策，右侧“计策”标签页会立即出现一张计策卡。

### 2. 计策卡包含什么

- **标题与目标**：你提出的核心意图
- **状态**：草稿 / 筹备中 / 执行中 / 已暴露 / 已解决 / 失败
- **阶段**：情报 → 准备 → 行动 → 转折 → 结局
- **风险条 / 进度条 / 世界紧张度**：量化的局势指标
- **暴露度 / 情报资源 / 反制解法**：显示计策依赖的线索和对方可能反制
- **步骤**：分阶段任务清单
- **参与 NPC**：他们的角色、信任、警觉
- **情报**：传闻 / 确认 / 虚假
- **最近结果**：AI 对局势发展的总结

### 3. AI 如何更新计策

AI 在每次回复末尾可以输出隐藏补丁：

```text
<state_update>
{
  "strategies": {
    "create": [{ "title": "...", "goal": "...", "phase": "intel", ... }],
    "update": [{ "id": "st_xxx", "phase": "setup", "risk": 35, ... }]
  },
  "intelAdd": [{ "text": "...", "source": "...", "reliability": "rumor" }],
  "factionsUpdate": [{ "name": "商会", "attitude": -10, "power": 60 }],
  "characterUpdates": [{ "characterId": "char_xxx", "suspicionDelta": 10 }],
  "clockUpdate": [{ "id": "clock_main_pressure", "delta": 1, "reason": "玩家休息" }],
  "storyArcUpdate": [{ "title": "主线", "advance": true, "reason": "玩家确认关键线索" }],
  "counterStrategyUpdate": [{ "title": "有人在调查你", "visibility": "hinted", "progress": 30 }],
  "npcAgendaUpdate": [{ "characterId": "char_xxx", "currentPlan": "监控证人" }],
  "scene": { "worldTensionDelta": 5 },
  "questsUpdate": [{ "questId": "q_xxx", "objectiveIdx": 0 }],
  "itemAdd": [{ "name": "假账本", "description": "...", "type": "quest", "quantity": 1 }],
  "locationUpdate": [{ "id": "market", "alertLevel": 20 }]
}
</state_update>
```

这些补丁会被自动解析并白名单应用到当前场景，玩家看不到补丁文本。

### 4. 玩家能做什么

- 直接在输入框补充目标、资源、步骤或风险偏好
- 在右侧计策面板查看风险、进度、情报
- 点击“放弃”让计策进入失败状态
- 点击“重新规划”把当前计策上下文填入输入框

AI 不会替玩家自动成功；最终选择和执行始终由玩家推动。

## 手动测试清单

### 核心流程回归

- [ ] 打开 `index.html`（或本地静态服务）
- [ ] 选择预设世界（审判庭黑船 / 天庭机械寺 / 第7区避难所）
- [ ] 创建玩家角色并保存
- [ ] 与角色自由聊天，确认消息渲染、头像、情绪标签正常
- [ ] 直接输入高风险行动，确认出现风险预览且取消不发送
- [ ] AI 或规则要求检定时出现检定卡，点击“掷骰”或输入“掷骰”后生成检定结果
- [ ] 点击左侧角色查看详情
- [ ] 右侧切换到“局势”，确认当前位置、时钟、风险和可选行动显示正常
- [ ] 右侧“局势”中出现“最近事件”，能看到检定、奖励、购买、移动、升级等关键变化
- [ ] 检定部分成功/失败后，右侧“局势”显示未解决后果；再次进行相关行动时风险预览出现“未解决后果”修正，相关成功检定后后果可解除
- [ ] 右侧切换到“线索”，确认只显示玩家已知情报和已解锁档案
- [ ] 右侧切换到世界书，添加 / 编辑 / 删除条目
- [ ] 右侧切换到地图，点击节点移动
- [ ] 右侧切换到任务，手动勾选目标
- [ ] 右侧切换到背包，添加物品并装备 / 卸下；医疗或补给类物品显示“使用”并能恢复生命
- [ ] 在主输入框输入“休息”“使用应急医疗包”“装备短剑”“卸下短剑”“购买补给/医疗包/零件包/短剑/护甲/工具包/扫描仪”，确认本地结算、系统消息和金币/HP/背包变化
- [ ] 触发经验奖励升级后，详情页出现属性点；分配属性点后顶部属性、HP 和详情页同步刷新
- [ ] 点击停止按钮后，发送/停止按钮状态恢复

### 新流程：计策

- [ ] 在输入栏直接输入“我想挑拨商会和城卫”
- [ ] AI 不直接判定成功，而是追问目标、筹码或风险偏好
- [ ] 右侧“计策”面板出现计策卡
- [ ] 补充“我用假账本栽赃商会”，观察步骤 / 风险 / 情报是否更新
- [ ] 推进到执行阶段，确认至少一种后果：关系变化、警觉提升、任务更新、物品变化、世界紧张度变化
- [ ] 触发 clockUpdate / storyArcUpdate / counterStrategyUpdate 后，确认“局势”页刷新；按反制解法成功行动后，反制会被揭示、削弱或解决
- [ ] 触发一次失败 / 暴露 / 部分成功状态，确认不只有线性成功
- [ ] 刷新页面，确认计策状态仍保存在 IndexedDB

### 安全验收

- [ ] 角色名设置为 `<img src=x onerror=alert(1)>`，不执行脚本，只显示文本
- [ ] 世界书内容包含 `<script>alert(1)</script>`，不执行脚本
- [ ] avatar 设置为 `javascript:alert(1)`，不作为图片 URL 使用
- [ ] backgroundUrl 设置为 `javascript:alert(1)`，不执行
- [ ] AI 返回坏 JSON 的 `<state_update>` 时，聊天不中断，只 warn
- [ ] AI 试图在 state_update 中修改 `settings.apiKey` 时被忽略

### 代码检查

- [ ] 运行 `node --check js/core/*.js js/features/*.js js/ui/*.js js/main.js`，全部通过
- [ ] 确认没有新增 npm 依赖或构建系统
- [ ] 确认 API Key 没有写入可见 DOM 或 console.log

## 项目结构

```
<project-root>
├── index.html
├── docs/
│   ├── AGENT.md             # agent 游玩协议总纲
│   ├── API_PROTOCOL.md      # LLM API + 标记协议 + state_update
│   ├── GAME_STATE.md        # scene/角色/消息结构
│   ├── MULTI_AGENT.md       # 多 agent 模拟与报告格式
│   └── ARCHITECTURE.md      # 架构、数据流、安全约束
├── css/
│   ├── base.css
│   ├── components.css    # 含计策面板样式
│   ├── layout.css
│   └── themes.css
├── js/
│   ├── core/
│   │   ├── state.js      # 场景数据结构、旧存档兼容
│   │   ├── prompt-builder.js  # 计策主持人协议
│   │   └── ...
│   ├── ui/
│   │   ├── sidebar-right.js   # 计策面板渲染
│   │   ├── chat.js            # 输入栏、消息渲染、pending 操作
│   │   └── ...
│   ├── features/
│   │   ├── intent-router.js    # 单输入框自然语言路由
│   │   ├── strategy-manager.js # 计策创建、更新、状态补丁白名单
│   │   ├── group-chat.js       # 解析 state_update
│   │   ├── world-generator.js  # 矛盾、势力、情报、NPC 谋略素材
│   │   └── ...
│   └── main.js
└── README.md
```

## 技术约束

- 无 React / Vue / 构建系统
- 无 IndexedDB 重写
- 所有新增 DOM 拼接使用 `Renderer.escapeHtml` / `Renderer.escapeAttr` / `Renderer.safeUrl`
- AI 状态补丁必须白名单应用，禁止直接 `Object.assign` 到 State
