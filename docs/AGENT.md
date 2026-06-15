# Agent 游玩协议总纲

> 本文档面向**所有想程序化操控酒馆的 agent**——无论是外部 LLM 驱动一局游戏、多 agent 模拟一个社会，还是 agent 辅助开发者扩展功能。

## 这个项目是什么

酒馆（Tavern）是一个 **AI 主持人驱动的桌游角色扮演器**。它不是聊天机器人，而是一个完整的 **TRPG 引擎**：

- **D&D 检定系统**（D20 + 属性调整值 vs DC，大成功/大失败）
- **计策系统**（DM 主持人协议，情报→准备→行动→转折→结局 五阶段）
- **生存系统**（HP / 金币 / 经验 / 等级 / 死亡结局 / 胜利结局）
- **角色信条系统**（每个 NPC 有 creed/redLines/values，会拒绝违背信条的事）
- **剧情弧引导**（storyArcs 节拍推进，AI 主动驱动剧情而非被动等玩家）
- **合理性协议**（约束"我说服了所有人"这种随意发挥）

## Agent 的三种用法

| 场景 | 含义 | 关键文档 |
|------|------|---------|
| **外部 agent 驱动游戏** | 你的 agent 通过 LLM API 扮演玩家，调用本项目的协议与 DM 交互 | [API_PROTOCOL.md](./API_PROTOCOL.md) |
| **多 agent 模拟社会** | 多个 agent 各扮演一个 NPC，自主互动产生涌现剧情 | [MULTI_AGENT.md](./MULTI_AGENT.md) |
| **agent 辅助开发** | agent 读懂代码后扩展功能、修 bug、写测试 | [ARCHITECTURE.md](./ARCHITECTURE.md) |

所有 agent 场景共享同一套**游戏状态结构**：[GAME_STATE.md](./GAME_STATE.md)

## 核心约束（所有 agent 必须遵守）

1. **人类可玩优先**——本项目首先是一个给人玩的游戏。agent 化改造不能破坏人类游玩体验。
2. **无构建系统**——纯静态 HTML + 原生 JS，无 React/Vue/打包工具/npm 依赖。新增代码必须遵守此约束。
3. **XSS 安全**——所有 DOM 拼接必须经 `Renderer.escapeHtml` / `escapeAttr` / `safeUrl`。
4. **状态白名单**——AI 不能直接修改 State，只能通过 `<state_update>` 补丁走白名单（见 API_PROTOCOL.md）。
5. **合理性高于讨好**——AI 是公正的 DM，不是许愿机。详见 prompt-builder.js 的"合理性协议"。

## 快速开始（外部 agent 驱动一局游戏）

最小可行流程：

```
1. 读 GAME_STATE.md，理解 scene 结构
2. 读 API_PROTOCOL.md，掌握：
   - LLM 请求体格式（PromptBuilder.build 返回的 body）
   - 回复末尾可用的标记（[check:] / [quest:] / [damage:] 等）
   - <state_update> 状态补丁格式
3. 你的 agent 扮演玩家，发送 user 消息
4. 把对话历史 + system prompt 发给 LLM API
5. 解析 LLM 回复：提取正文 + 标记 + state_update 补丁
6. 应用补丁更新游戏状态，把正文作为 DM 叙事呈现
7. 循环 3-6，直到触发 gameover 或 victory
8. 输出游玩报告（格式见 MULTI_AGENT.md）
```

## 当前实现边界

- `storyArcs.currentBeat` 目前只作为 prompt 上下文注入，系统不会自动推进；外部 agent 如需严格节拍，需要自行维护。
- `<state_update>` 是安全补丁，不是任意存档写入。玩家 HP、金币、经验、任务创建等优先使用方括号标记。
- 动态新角色只会补基础角色字段；深层信条、秘密、筹码需要后续人工或 agent 补全。
- 浏览器端使用 IndexedDB 持久化，外部 agent 若不驱动浏览器，需要自行实现等价的读写层。

## 文档索引

| 文档 | 内容 |
|------|------|
| [API_PROTOCOL.md](./API_PROTOCOL.md) | LLM API 协议、AI 标记格式、state_update 白名单 |
| [GAME_STATE.md](./GAME_STATE.md) | scene 全字段、角色结构、消息类型枚举 |
| [MULTI_AGENT.md](./MULTI_AGENT.md) | 多 agent 模拟场景、游玩报告格式 |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | 架构、文件职责、数据流、安全约束 |

## 关键代码入口

| 想做什么 | 看哪个文件 |
|---------|-----------|
| 组装 LLM 请求体 | `js/core/prompt-builder.js`（`build` / `buildGroup` / `buildDMNarration`） |
| 调用 LLM 流式 API | `js/core/api.js`（`API.stream`） |
| 解析 AI 回复的标记 | `js/features/group-chat.js`（`_parseMarkers` / `_handleCheckMarker` 等） |
| 应用状态补丁 | `js/features/strategy-manager.js`（`applyStateUpdate`） |
| 游戏状态定义 | `js/core/state.js`（`normalizeScene` / `createScene`） |
| 持久化 | `js/core/storage.js`（IndexedDB） |
| 世界/角色预设 | `js/features/world-generator.js` |
