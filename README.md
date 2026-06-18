# 酒馆 — AI 主持人驱动的角色扮演

一个纯静态 HTML + 原生 JS 的多角色 AI 聊天器，定位是“AI 主持人引导玩家制定并执行计策的酒馆”。

## Agent 入口

如果你要让外部 agent 驱动游戏、做多 agent 模拟，或让 agent 辅助开发，请先读：

- [docs/AGENT.md](docs/AGENT.md)：agent 游玩协议总纲
- [docs/API_PROTOCOL.md](docs/API_PROTOCOL.md)：LLM API、AI 标记和 `<state_update>` 协议
- [docs/GAME_STATE.md](docs/GAME_STATE.md)：`scene` 全字段、角色结构、消息类型
- [docs/MULTI_AGENT.md](docs/MULTI_AGENT.md)：多 agent 模拟场景和游玩报告格式
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)：架构、文件职责、数据流、安全约束

## 核心体验

玩家提出目标或计策意图后，AI 不直接替玩家成功执行，而是像主持人一样：
- 追问关键条件、筹码、风险偏好
- 创建并更新计策卡
- 分阶段推进（情报 → 准备 → 行动 → 转折 → 结局）
- 让 NPC、任务、背包、地图、关系和世界状态产生具体后果

## 计策系统说明

### 1. 如何开始一条计策

1. 在聊天输入栏左侧点击 `/计策` 按钮，切换到计策模式。
2. 输入你的目标或意图，例如：
   - “我想挑拨商会和城卫的关系”
   - “我打算用假账本栽赃商会会长”
3. 发送后，AI 会以主持人身份追问关键信息，并可能在回复末尾追加隐藏的 `<state_update>` 状态补丁。
4. 如果补丁包含新计策，右侧“计策”标签页会立即出现一张计策卡。

### 2. 计策卡包含什么

- **标题与目标**：你提出的核心意图
- **状态**：草稿 / 筹备中 / 执行中 / 已暴露 / 已解决 / 失败
- **阶段**：情报 → 准备 → 行动 → 转折 → 结局
- **风险条 / 进度条 / 世界紧张度**：量化的局势指标
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
  "scene": { "worldTensionDelta": 5 },
  "questsUpdate": [{ "questId": "q_xxx", "objectiveIdx": 0 }],
  "itemAdd": [{ "name": "假账本", "description": "...", "type": "quest", "quantity": 1 }],
  "locationUpdate": [{ "id": "market", "alertLevel": 20 }]
}
</state_update>
```

这些补丁会被自动解析并白名单应用到当前场景，玩家看不到补丁文本。

### 4. 玩家能做什么

- 切换 `/计策` 模式补充意图
- 在右侧计策面板查看风险、进度、情报
- 点击“放弃”让计策进入失败状态
- 点击“重新规划”快速进入计策模式并引用当前计策

AI 不会替玩家自动成功；最终选择和执行始终由玩家推动。

## 手动测试清单

### 旧流程回归

- [ ] 打开 `index.html`（或本地静态服务）
- [ ] 选择预设世界（审判庭黑船 / 天庭机械寺 / 第7区避难所）
- [ ] 创建玩家角色并保存
- [ ] 与角色自由聊天，确认消息渲染、头像、情绪标签正常
- [ ] 点击左侧角色查看详情
- [ ] 右侧切换到世界书，添加 / 编辑 / 删除条目
- [ ] 右侧切换到地图，点击节点移动
- [ ] 右侧切换到任务，手动勾选目标
- [ ] 右侧切换到背包，添加物品并装备 / 卸下
- [ ] 点击停止按钮后，发送/停止按钮状态恢复

### 新流程：计策

- [ ] 在输入栏点击 `/计策`，输入“我想挑拨商会和城卫”
- [ ] AI 不直接判定成功，而是追问目标、筹码或风险偏好
- [ ] 右侧“计策”面板出现计策卡
- [ ] 补充“我用假账本栽赃商会”，观察步骤 / 风险 / 情报是否更新
- [ ] 推进到执行阶段，确认至少一种后果：关系变化、警觉提升、任务更新、物品变化、世界紧张度变化
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
│   │   ├── chat.js            # 计策输入模式
│   │   └── ...
│   ├── features/
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
