# Tavern SPEC

本文档定义 Tavern 从“AI 角色扮演聊天器”升级为“可博弈的叙事 RPG”的核心规格，并记录当前实现边界。

## 1. 目标

Tavern 的核心循环应从：

```text
玩家输入 -> AI 回复 -> 状态轻量更新
```

升级为：

```text
探索信息 -> 验证线索 -> 建立筹码 -> 制定行动/计策 -> 承担后果 -> 解锁更深信息
```

系统必须保证：

- 玩家不知道的内容不能在 UI 中直接公开。
- NPC 不应天然知道所有对话和玩家秘密。
- 世界会在玩家行动之外继续变化。
- 检定、物品、情报、关系和场合共同影响结果。
- 失败会推进剧情，而不是只阻断玩家。

## 2. 非目标

当前阶段不做：

- 大型战斗系统。
- 联机多人。
- 完整职业/技能树。
- 重写 IndexedDB 架构到后端服务。
- 引入 React/Vue/构建系统。

如需新增字段，必须继续遵守现有静态应用约束：更新 `State.createScene()`、`State.normalizeScene()`、相关 prompt、UI 和文档。

## 3. 核心原则

### 3.1 玩家知识边界

系统知道的信息、NPC 知道的信息、玩家知道的信息必须分开。

```text
GM 私密事实 != NPC 个人认知 != 玩家已知情报 != UI 可见信息
```

任何角色的真实动机、秘密、恐惧、筹码、底线，不应默认展示给玩家。它们只能通过观察、调查、对话、关系门槛、检定、物品证据或剧情事件逐步解锁。

### 3.2 失败推进剧情

检定失败不能只输出“你失败了”。失败必须生成至少一种后果：

- 暴露风险。
- 关系变化。
- 时钟推进。
- 资源损失。
- 获得不完整或错误线索。
- 被迫进入新场景。
- 新增债务、人情、把柄或反制。

### 3.3 NPC 是行动者

NPC 不是等待玩家点击的对话对象。每个重要 NPC 都应有目标、计划、资源、时限和反应策略。

### 3.4 可解释裁决

玩家应该能理解一次行动为什么成功、失败或付出代价。系统可默认收起裁决依据，但必须能解释：

- 使用了哪个属性。
- DC 为什么是这个值。
- 哪个物品、情报或关系产生修正。
- 失败风险是什么。
- 后果影响了哪些状态。

## 4. 系统模块

### 4.1 玩家知识账本

新增玩家视角的知识账本，用来记录玩家真正掌握的信息。

建议字段：

```js
scene.knowledge = {
  discoveries: [],
  suspicions: [],
  evidence: [],
  debts: [],
  leverage: [],
  unresolvedQuestions: []
}
```

知识条目结构：

```js
{
  id: "disc_...",
  subjectType: "character",      // character | faction | location | item | event | strategy
  subjectId: "char_...",
  level: "hint",                 // hint | rumor | evidence | inference | truth
  title: "机械义眼的异常延迟",
  text: "审判官的机械义眼在提到货舱时短暂失焦。",
  source: "观察",
  reliability: "unverified",     // unverified | contested | confirmed | false
  tags: ["审判官", "异常", "可验证"],
  evidenceIds: [],
  discoveredAt: 1710000000000
}
```

要求：

- `scene.intel` 逐步迁移为玩家已知情报，不再承载隐藏真相。
- 未公开的秘密放入隐藏池，不直接进入玩家知识账本。
- UI 只展示 `scene.knowledge` 和已解锁档案。

### 4.2 NPC 档案与信息解锁

角色信息拆为五层：

| 层级 | 玩家可见性 | 示例 |
|---|---|---|
| public | 初见可见 | 姓名、外貌、身份、第一印象 |
| observed | 观察后可见 | 口癖、情绪、行为模式 |
| rumored | 听闻后可见 | 传言、未确认关系、可疑事件 |
| confirmed | 证实后可见 | 证据、确定动机、真实立场 |
| private | 永不直接公开 | 真实秘密、内心恐惧、隐藏计划 |

建议角色结构：

```js
character.profile = {
  public: {
    title: "审判官",
    firstImpression: "冷酷、权威、正在审视你"
  },
  hiddenFacts: [
    {
      id: "silas_eye_recording",
      type: "secret",
      title: "机械义眼的异常记录",
      hint: "他的机械义眼偶尔会出现不自然延迟。",
      truth: "机械义眼曾记录到一段无法解释的影像。",
      unlock: {
        trust: 25,
        suspicionBelow: 40,
        check: { stat: "感知", dc: 15 },
        locations: ["interrogation", "bridge"],
        evidenceItem: "审讯影像备份"
      }
    }
  ]
}
```

玩家解锁状态：

```js
scene.discoveries = {
  characters: {
    "char_xxx": {
      "silas_eye_recording": {
        state: "hinted",          // locked | hinted | suspected | confirmed
        evidence: ["观察到义眼延迟"],
        discoveredAt: 1710000000000
      }
    }
  }
}
```

UI 要求：

- 角色详情页改为“档案页”。
- 未解锁字段显示为 `???` 或不显示。
- 可显示解锁提示，例如“需要更多信任”“需要调查舰桥”“需要感知检定”。
- 移除普通玩家流程里的完整剧透角色卡；完整角色卡和 NPC 编辑入口仅在作者/调试剧透开关开启时显示。

### 4.3 NPC 知识边界

每条消息必须逐步支持可见性。NPC prompt 不应默认看到所有历史。

建议消息字段：

```js
message.visibility = {
  locationId: "bridge",
  participants: ["char_a", "char_b"],
  overheardBy: [],
  public: false
}
```

Prompt 构建规则：

- 当前 NPC 可见：自己参与的消息。
- 当前 NPC 可见：公开场合消息。
- 当前 NPC 可见：通过 `overheardBy`、被告知、谣言传播获得的消息。
- 当前 NPC 不可见：其他地点的私密对话。

最低实现可以先做：

- 消息新增 `participants`。
- 玩家选择当前对话对象时，将该 NPC 写入 user message。
- `PromptBuilder` 对当前 NPC 只注入相关历史。

### 4.4 NPC 日程与离屏行动

重要 NPC 应有行动计划。

```js
character.agenda = {
  goal: "找出船上的混沌源头",
  currentPlan: "秘密监控灵能者隔离舱",
  resources: ["审讯权", "侍僧小队"],
  deadlineTurn: 8,
  lastActionTurn: 3,
  riskTolerance: 60
}
```

系统每隔若干轮或关键事件后推进 NPC 离屏行动：

- NPC 获取新情报。
- NPC 对玩家产生怀疑。
- NPC 主动联系玩家。
- NPC 设伏、跟踪、交易或背叛。
- NPC 之间形成冲突。

离屏行动应通过系统消息、事件、知识条目或时钟体现，而不是只藏在 prompt 里。

### 4.5 局势时钟

世界紧张度应升级为多个具体时钟。

```js
scene.clocks = [
  {
    id: "clock_corruption",
    name: "黑船混沌腐蚀",
    value: 2,
    max: 6,
    visibility: "known",         // hidden | hinted | known
    triggers: [
      { at: 3, event: "低语扩散到牢房区" },
      { at: 6, event: "亚空间实体显现" }
    ]
  }
]
```

推进来源：

- 玩家拖延。
- 地图移动。
- 休息。
- 检定失败。
- 计策暴露。
- NPC 离屏行动。
- 使用错误情报。

UI 要求：

- 已知时钟显示名称和格数。
- 隐藏时钟只显示模糊压力，例如“船上有事正在恶化”。
- 时钟触发时必须产生具体事件。
- 同一批 `clockUpdate` 必须逐条结算；如果某条时钟更新触发 `failureStates` 并进入结局，后续时钟更新必须停止，不能在结局后继续推进其它时钟。

### 4.6 行动意图与结算

玩家输入应识别为行动意图，而不只是聊天文本。

行动类型：

- talk：闲聊。
- observe：观察。
- ask：询问。
- probe：试探。
- lie：欺骗。
- threaten：威胁。
- persuade：说服。
- investigate：调查。
- sneak：潜行。
- trade：交易。
- use_item：使用物品。
- strategy：计策。
- rest：休息。

建议行动上下文：

```js
scene.pendingAction = {
  type: "threaten",
  targetCharacterId: "char_xxx",
  intent: "逼他说出货舱钥匙在哪",
  risks: ["怀疑上升", "守卫介入"],
  suggestedCheck: { stat: "魅力", dc: 16 },
  modifiers: [
    { source: "把柄：走私记录", value: -3 },
    { source: "对方信条抵触", value: +4 }
  ]
}
```

高风险行动建议先展示风险卡，玩家确认后再结算。

当前基础实现：

- `/行动` 模式会用本地 `ActionPlanner` 生成 `scene.pendingAction`。
- 输入区显示行动类型、建议检定、风险百分比、风险来源和失败推进。
- 玩家确认后写入 `type: "action_intent"` 的用户消息，并由 PromptBuilder 注入 `[玩家行动意图]`。
- AI 输出 `[check:]` 时会创建 `scene.pendingCheck`，输入区显示检定卡，玩家点击“掷骰”或输入“掷骰”后再生成结果。

下一阶段输入流：

- 玩家默认不需要切换 `/行动` 或 `/计策` 模式。
- `IntentRouter` 或等价逻辑应从同一个输入框识别闲聊、帮助、观察、行动、计策和 OOC。
- 高风险行动仍生成 `scene.pendingAction`，但触发来源是自然语言，而不是按钮模式。
- 检定不是主动功能；只有玩家描述了有风险且结果不确定的行动后，系统才要求检定。
- 当 `pendingAction.suggestedCheck` 或 `pendingAction.adjudication` 存在时，后续检定必须沿用同一个属性和 DC。
- 复合行动可以记录同一挑战内的次级方法，但不能产生第二个 DC；掷骰后由 `WorldEngine.resolveChallengeCheck()` 结算 `secondaryResults`：大成功触发次级方法完整收益，成功追加进展，部分成功/失败追加压力和持续后果，并把结果注入 DM 续写上下文。
- 同一批 `challengeUpdate` 必须逐条结算挑战奖励、任务联动、阶段联动和通关检查；如果某条挑战更新触发 `defeated/victorious`，后续挑战更新和自动激活下一挑战必须停止。
- 细则见 `docs/INPUT_FLOW_SPEC.md`。

### 4.7 检定卡

`[check:]` 现在会生成交互式检定卡：

1. AI 或规则在行动上下文中提出检定。
2. UI 显示属性、DC、风险、自动加成、可点选/可输入投入的消耗品和同伴协助。
3. 玩家点击“掷骰”，或在主输入框输入“掷骰”。
4. 系统生成结果。
5. AI 根据结果进行 fail-forward 叙事。

结果分层：

- critical_success：大成功，额外收益。
- success：成功。
- partial：部分成功，达成目标但付出代价。
- fail：失败但推进剧情。
- critical_fail：大失败，触发严重后果。

当前基础实现中，非自然 1/20 时，`total >= DC` 为成功，`total >= DC - 3` 为部分成功，其余为失败推进。结果会写入 `checkData.outcome`、`resultLabel`、`consequenceHint` 和 `consequenceOptions`，供检定卡和 DM 续写使用。

检定物品语义：

- 已装备物品和非消耗任务物品的 `check_bonus` 会自动进入 `itemModifiers` 和 `mod`。
- 带 `consume: true` 的消耗品会进入 `availableItemModifiers`，玩家可在检定卡点选或输入“投入资源名”，掷骰时才扣除 `uses` 或数量。
- 可点选消耗品必须使用基于物品 `id` 的稳定资源 ID；旧存档缺失或重复物品 id 时，`WorldEngine.normalizeScene()` 必须先补齐唯一 id。名称只能作为旧选择兼容，且该名称在当前可选资源中必须唯一；背包顺序变化、重新渲染或刷新不能让玩家已选资源错位到其它物品。
- `companionResources` 只有满足 `unlock` 后才会进入 prompt、右侧局势和 `availableCompanionModifiers`；玩家可在检定卡点选或输入“请某人帮忙/投入协助名”，掷骰后扣除协助次数，并结算检定修正、证据可信度、后果解除、时钟变化、`cost.trust`、`cost.time` 与可能代价。同伴协助应绑定真实 `characterId`；生成、导入或旧档兼容回填时只允许按当前场景唯一角色名修复，重名、模糊或资源名同时提到多个角色时不能猜测绑定。同一次检定结算中，同一个 `resourceId` 即使因旧存档或 UI 异常重复出现在 modifiers，也只能扣除一次 uses 和代价。`unlock.revelationIds` 默认要求对应结论已 `confirmed`，不能因 `suspected` 过早公开同伴底牌；需要怀疑阶段解锁时必须显式声明。
- 检定结算期间，如果消耗品腾出背包格子，已完成任务的待领物品奖励必须延后到当前检定的挑战、反制和后果结算结束后再重试；如果同伴协助、时钟或失败条件在中途把 `gameState` 变为 `defeated/victorious`，后续挑战奖励、反制解除、后果解除和回合推进必须停止。`consumeCheckItems()` 和 `consumeCompanionResources()` 在非 `playing` 场景必须 no-op，防止未来 UI 或外部调用在结局后继续扣资源；同一轮检定内，若某个同伴协助的代价或效果触发结局，后续同伴协助和该协助尚未写入的风险后果也必须停止。

### 4.8 计策与情报资源

计策必须依赖情报和筹码。

计策风险计算应考虑：

- 是否有确认情报。
- 是否只有传闻。
- 是否掌握把柄。
- 目标 NPC 的信任、怀疑、畏惧。
- 当前地点是否公开。
- 相关时钟压力。
- 是否有合适物品。

计策字段建议扩展：

```js
strategy.requiredIntel = ["disc_xxx"];
strategy.usedIntel = ["disc_xxx"];
strategy.exposure = 20;
strategy.counterplay = [];
```

当玩家用假情报推进计策时，应提高暴露风险或触发 NPC 反制。

`strategies.create` / `strategies.update` 必须限量和限幅：单条状态补丁最多创建 4 条计策、更新 12 条计策，场景总计策最多 24 条；`title/goal/stakes/latestOutcome` 和步骤、参与者、资源、情报、反制数组都必须由 `StrategyManager.normalizeStrategy()` 截断，避免 AI 生成超长计策污染存档和 UI。

### 4.9 NPC 反制

NPC 可以创建反制卡，但玩家不一定知道详情。

```js
scene.counterStrategies = [
  {
    id: "counter_...",
    ownerCharacterId: "char_xxx",
    visibility: "hinted",
    title: "有人在调查你",
    hiddenTitle: "审判官追踪玩家接触过的证人",
    progress: 30,
    riskToPlayer: 45
  }
]
```

玩家可通过观察、调查、反跟踪来揭示反制来源。

当前规则：

- `active` 表示反制仍在暗处推进，`revealed` 表示玩家已识别来源但压力仍存在，`resolved` 表示反制被解决。
- 玩家执行命中 `counterplay`、标题、目标或提示语义的观察、调查、试探、谈判、潜入等行动，并在检定中取得部分成功以上时，会揭示或削弱相关反制。
- 成功和大成功会降低反制进度并提高暴露度；进度降到 0 或暴露度达到 100 时，反制进入 `resolved`，不再进入行动风险、局势压力或失败触发。
- 同一批 `counterStrategyUpdate` 必须逐条结算；如果某条反制更新触发 `failureStates` 并进入结局，后续反制更新必须停止，不能在结局后继续推进其它反制。

### 4.10 关系维度

关系不应只有好感。

```js
relation = {
  affection: 0,
  trust: 0,
  suspicion: 0,
  fear: 0,
  debt: 0,
  leverage: [],
  mood: "平静",
  memories: []
}
```

用途：

- trust 解锁秘密和合作。
- suspicion 提高隐瞒和反制概率。
- fear 影响威胁成功率，但可能导致背叛。
- debt 表示人情债，可用于请求帮助。
- leverage 表示把柄，可用于计策。

### 4.11 物品与装备效果

物品必须参与行动结算。

```js
item.effects = [
  { type: "check_bonus", stat: "dexterity", value: 2, when: "lockpick" },
  { type: "heal", value: 4, consume: true },
  { type: "clock_resist", clockTag: "radiation", value: -1 },
  { type: "strategy_leverage", tag: "forgery" }
]
item.uses = 3;
item.tags = ["工具", "伪造", "可疑"];
```

UI 要求：

- 检定卡展示自动生效物品、可点选/可输入投入的消耗品和同伴协助。
- 消耗品必须经过玩家显式选择后才扣除；当前稳定版在检定卡提供点选 UI，也支持主输入框“投入资源名/不用资源名”，选中后随掷骰消耗。
- 武器、防具和饰品可在背包按钮装备 / 卸下，也可直接输入“装备物品名”“卸下物品名”完成本地结算。
- 运行态背包物品必须有唯一 `id`；规则层会为旧存档缺失或重复的物品 id 补齐稳定运行态 id。装备槽展示名保存在 `scene.equipment`，真实物品 id 保存在 `scene.equipmentRefs`；规则层必须 id 优先、名称兼容，旧存档缺失引用时由当前背包和 `equipped` 标记修复，避免同名物品误卸、误消耗或错误显示。
- 背包中带 `heal/gold/exp/clock_delta/clock_resist/world_tension` 等直接效果的物品显示“使用”，点击或输入“使用物品名”会立即结算并消耗；`world_tension` 复用 `WorldEngine.addWorldTension()`，`clock_delta`/`clock_resist` 可通过 `clockId`、唯一 `clockTag`、唯一 `clockName` 或物品标签匹配唯一公开时钟，匹配不到或不唯一时不消耗物品。
- 物品直接效果中的 `heal` 和 `gold` 必须分别复用 `WorldEngine.applyPlayerHealing()` 与 `WorldEngine.addGold()`，避免背包按钮、输入命令和 AI 标记各自改状态。
- 直接使用型效果必须来自 `type:"consumable"`、带 `uses` 的物品，或显式 `effect.consume:true`；非消耗装备/杂物不能反复点击刷金币、经验、治疗或时钟效果。
- 直接使用的消耗品只有在至少一个直接效果真实改变状态时才扣除；满血治疗、金币/经验/时钟/紧张度无变化或找不到目标时，只给失败提示，不消耗物品。
- 直接使用物品期间，如果某个 `clock_delta`、`clock_resist` 或 `world_tension` 效果触发 `defeated/victorious`，后续直接效果、物品消耗和背包腾位后的奖励补领必须停止；结局消息由规则层写入。
- AI 标记和 `<state_update>.itemAdd` 生成的物品必须受同一资源上限约束：单次补丁同名物品最多增加 20 个单位/次数，物品效果数值按类型限幅，不能生成超大 `uses` 或 +999 检定/金币效果；状态补丁显式提供 `effects` 时，以显式效果为准，不再叠加名称推断效果。
- AI 生成世界、模板导入和默认起始背包也必须走生成型物品归一化：单个起始物品 `quantity/uses` 不能超过 20，非法类型回退为 `misc`，效果数值继续按类型限幅。
- 检定卡中的可消耗物品支持 `check_bonus`、`dc_delta` 和 `risk_delta`；选中后才改变检定总值/DC/风险说明并扣除次数。`risk_delta` 不能只是展示文本，必须折算进最终 DC，同时在结果数据中保留原始风险修正。
- 基础商店、探索奖励和名称推断生成的可消耗检定物品必须带有明确 `stat`、`actionType` 或等价适用条件；例如探索补给只辅助观察、潜行穿越或强行突破，备用零件只辅助修复、破解或设备操作，不能作为所有检定的万能 +2。
- 检定卡中已选消耗品必须按稳定 ID 追踪，并兼容旧存档的 `item:xxx:序号` 资源 ID；取消选择时要移除同一资源的所有别名，避免重复记录。
- 带 `uses` 的消耗品用尽后移出背包；直接使用和检定投入使用同一个消耗入口。
- 出售、剧情移除和阶段代价必须把 `uses` 当作可扣数量处理；出售价格按实际售出的次数计算，不能用剩余总次数抬高单次售价。
- `strategy_leverage` 会让物品进入当前计策的“可用物品”列表；系统按物品名、标签、`effect.tag` 与计策目标/资源/情报文本匹配，并把风险修正注入计策 prompt。
- 计策处于计划阶段时列出可用物品不会扣除；当 `<state_update>.strategies.update` 明确把可消耗物品名或物品 ID 写入 `resources` 或 `usedIntel`，且计策推进到 `action/complication/resolution` 或 `executing/resolved/failed` 时，系统会消耗该物品一次并用 `consumedItemResourceIds` 防重复。若物品已在筹备阶段登记到计策的 `resources/usedIntel`，后续补丁首次把计策推进到执行/结算阶段时，即使没有重复写物品名，也必须扣除已登记的可消耗物品。只写物品名时该名称必须在背包中唯一；同名或模糊不唯一时写入“计策资源待确认”并不扣除。去重键必须兼容物品 `id`、物品名和 `strategy_item:xxx` UI 资源 ID；标签、效果标签和风险说明只用于展示/匹配可用性，不能单独触发扣除，避免一个泛化标签误扣多个物品。
- 医疗、治疗、补给类消耗品即使没有显式 `heal`，也会有保守的本地恢复兜底。
- 任务奖励和 `[item_add:]` 只给出物品名时，系统会对治疗药水、补给、零件包、武器、防具、地图、钥匙、证据等常见名称做轻量规则推断，生成可使用或可加成的物品。
- `[item_add:]` 和 `[item_remove:]` 必须分别走 `WorldEngine.grantInventoryItem()` / `WorldEngine.removeInventoryItem()`，统一堆叠、事件日志、装备槽/`equipmentRefs` 清理和侧栏刷新。移除、出售、装备、卸下、使用和阶段代价消耗物品时应优先使用物品 id；只按名称操作时名称必须唯一，不唯一则跳过并提示，不能默认命中第一个同名物品。
- 直接使用导致物品耗尽并从背包移除时，也必须按物品 id 清理对应装备槽，避免装备面板引用已不存在的物品。
- 计策面板展示可用于当前计策的物品。

### 4.12 探索与证据奖励

探索、调查、观察、破解和危险地点行动取得证据时，系统必须把收益落到规则层，而不只停留在叙事文本。

当前规则：

- `evidenceAdd` 会写入 `evidenceLedger`，同步 `knowledge.discoveries`。
- 同一证据再次同步到 `knowledge.discoveries` 时必须更新既有条目并合并标签/证据 ID，不能生成重复线索卡。
- 证据支持某个 `revelation` 或 `clueGraph` 时，会把证据挂到对应线索链，并推进线索阶段或状态。
- 首次取得可见证据会获得少量经验：confirmed 证据更多，partial 证据较少。
- 路线、医疗、设备、封印、协议等主题证据会额外生成一次性补给或工具，进入背包并可在后续检定卡点选消耗。
- `explorationRewardLog` 记录已发放奖励的证据，防止重复刷取。
- 探索奖励生成的物品必须走 `WorldEngine.grantInventoryItem()`；背包已满且无法合并时，必须写入 `pendingExplorationRewards`，探索收获消息明确说明已记录待领取，玩家出售、移除或消耗物品腾出背包格后自动补发，不能静默丢失。
- `scene.gameState` 不是 `playing` 时，`evidenceAdd` 和探索奖励不得继续改变证据账本、知识账本、经验或背包。

这些奖励不代表自动胜利；它们只把玩家的准备转化为后续检定、谈判或探索中的实际优势。

### 4.13 休息与基础交易

系统提供少量本地生存/经济入口，避免所有资源操作都依赖 AI 标记：

- 输入“休息”“短休”“扎营休息”等短命令，会恢复一部分生命，并以 `rest` 原因推进回合、时钟和离屏行动。
- 输入“商店”“能买什么”“购买”等目录查询，会本地展示基础商店价格和用途，不进入 AI 叙事。
- 输入“购买补给”“购买医疗包”“购买零件包”“购买短剑”“购买护甲”“购买工具包”“购买扫描仪”，会按固定价格扣金币并通过 `WorldEngine.grantInventoryItem()` 添加基础消耗品或装备；金币不足、重复购买已有非消耗装备，或背包已满且无法合并时只写系统提示，不扣金币、不改变背包。
- 输入“卖掉物品名”“出售全部物品名”，会出售非任务、未装备物品，移除背包数量并通过 `WorldEngine.addGold()` 获得金币；任务物品和已装备物品不会被直接出售。
- 复杂交易、讨价还价、黑市交换、以物易物仍走普通行动/计策/AI 叙事。

### 4.14 等级与属性点

经验和升级必须形成可见成长，而不是只显示数字。

当前规则：

- `[exp:N]`、任务奖励和挑战/探索里程碑都进入同一经验池。
- 经验结算统一走 `WorldEngine.addExperience()`；任务面板、剧情标记、物品使用、探索奖励和挑战奖励不能各自只做 `scene.exp += N`。
- 动态新增任务统一走 `WorldEngine.addQuest()`；`[quest:]`、AI 动态任务和 UI 入口不能直接 push 到 `scene.quests`，必须由规则层规范字段、限制数量、去重、检查结局状态并写系统留痕。
- 任务奖励统一走 `WorldEngine.grantQuestReward()`；手动完成、叙事自动完成、挑战支持完成和状态补丁完成都必须发放同一套奖励，并用 `quest.rewardGranted` 防重复。
- 任务奖励中的金币、经验和物品分别落到经济、成长和背包事件日志，另插入一条玩家可见的任务奖励摘要。
- 任务奖励包含物品时必须先做背包容量预检；背包满且无法合并时整套奖励不发放，`rewardGranted` 保持 `false`，避免金币/经验已发但物品静默丢失。
- 玩家出售、移除或消耗物品后如果真实腾出背包格子，系统会自动重试已完成但 `rewardGranted:false` 的任务奖励；补发仍复用 `grantQuestReward()`，重试失败不重复刷屏。
- 检定投入物品时触发的任务奖励补领不能插队到检定核心结算之前；它只能在当前检定消耗、挑战、反制和后果处理完成且 `gameState` 仍为 `playing` 时执行。
- 通关检查必须调用 `WorldEngine.checkVictory()`，先结算所有已完成主线任务的未发奖励；如果背包空间不足导致主线奖励未发放，`scene.gameState` 继续保持 `playing`，提示玩家清理背包，补领奖励成功后再自动进入胜利。
- 当前等级所需经验为 `level * 100`；升级后扣除所需经验，等级 +1，获得 2 点属性点。
- 升级会按等级和体质重新计算最大生命，并回满生命。
- 属性点可在玩家详情面板分配，也可通过单输入框命令分配（如“加一点敏捷”“体质+1”）；每次 +1 后立刻刷新顶部属性、检定修正和 HP。
- 属性点分配必须调用 `WorldEngine.allocateStatPoint()`；UI 和输入命令不能直接改写 `scene.playerStats` 或 `scene.attrPoints`。
- 待检定或待行动预览期间，合法加点命令仍应作为本地成长命令处理，而不是被 pending 流程当作改写行动或“请先掷骰”拦截；待检定总值必须读取当前属性。待行动预览期间，移动、装备/卸下/使用物品、购买、出售、休息和整理背包等本地准备命令也不能被当成改写行动；准备完成后应按最新状态重算预览。
- 当前可用成长/准备提示必须由 `WorldEngine.getPreparationHints()` 统一生成，覆盖属性点、低生命恢复、可装备/可使用物品、基础商店购买建议和待领取探索奖励；聊天 chips、顶部摘要和局势面板读取同一结果，避免提示不一致。
- 待领取探索奖励的准备提示必须给出能真实腾出背包格的命令；如果候选物品有多个数量或 uses，应推荐“出售全部物品名”而不是只出售 1 个。输入“整理背包/清理背包”必须由本地路由展示清理建议，不进入 AI 剧情。
- 体质加点会重新计算最大生命，最大生命提升时同步增加当前生命。
- 当前属性点分配上限为单项 20；超过上限需要后续专门的突破/装备规则。

生命变化同样必须走规则层：

- `[damage:N|原因]` 调用 `WorldEngine.applyPlayerDamage()`，写入 survival 事件，刷新顶部生命值。
- `[heal:N|原因]` 调用 `WorldEngine.applyPlayerHealing()`，按实际恢复量写入 survival 事件。
- HP 降到 0 时必须由 `WorldEngine.triggerHpGameOver()` 触发 HP 归零失败结局，并生成通关/失败回顾记录；聊天层只保留兼容包装器，不直接改写 `gameState`。

### 4.15 剧情弧推进

`storyArcs.currentBeat` 已支持通过 `storyArcUpdate` 半自动推进；时钟和离屏行动由 `WorldEngine` 在玩家回合、休息和失败/部分成功后推进。

可选协议：

```json
{
  "storyArcUpdate": [
    {
      "title": "混沌渗透之谜",
      "advance": true,
      "phase": "twist",
      "reason": "玩家确认货舱遗物异常"
    }
  ]
}
```

要求：

- 一个 beat 推进必须有原因。
- 推进时可生成系统摘要、知识条目或当前局势变化。
- 不允许 AI 一次跳过多个 beat，除非明确结局。
- 当前实现会在 `WorldEngine.applyStoryArcUpdate()` 中强制以上规则：缺少 `reason` 不推进，非 `resolution` 阶段跳跃推进会夹到下一步。

阶段推进闸门：

- `storyPhaseUpdate` 激活下一阶段或完成当前 active 阶段时，必须满足：当前阶段至少完成 1 个挑战；或当前阶段失败并触发替代路线；或玩家绕过阶段但付出明确资源、关系、时钟、金币、后果等代价。
- 当前实现会在 `WorldEngine.applyStoryPhaseUpdate()` 中强制以上规则；不满足时不改阶段状态，只记录“剧情阶段待确认”。
- 通过绕过代价推进阶段时，结构化代价必须真实结算：`goldCost` 会扣金币，`worldTensionDelta` 会改变世界紧张度，`clockDelta` 搭配唯一 `clockId/clockTag/clockName` 会推进时钟，若缺失或不唯一则拦截阶段推进；`costs` 中的 `item` 会移除背包物品，`consequence` 会写入后果账本。
- 如果绕过代价中的世界紧张度或时钟触发 `defeated/victorious`，后续代价、阶段状态变更和待领奖励重试必须停止，不能在结局后继续扣物品、写后果或把阶段标记为完成/激活。

### 4.16 冒险日志

玩家需要能回顾过程中的关键变化，而不是只能在通关/失败后看总结。

当前规则：

- `scene.eventLog` 记录检定、任务、探索、挑战、资源消耗、购买、物品、移动、升级、生存变化和结局事件。
- `scene.gameState` 进入 `victorious` 或 `defeated` 后，输入框、地图、背包、交易、休息、属性点、玩家人物卡、世界书编辑、任务手动操作、行动预览、检定卡、消息删除/重新生成和计策创建/更新/放弃不得再改变世界状态；结束后只允许 OOC、帮助和回顾。旧存档或读档中残留的 `pendingAction/pendingCheck` 必须在归一化时清空，输入区也不能再显示执行、取消、投入资源或掷骰引导；右侧局势里的推荐行动、挑战方法和准备项只能以只读回顾标签展示，地图节点不能绑定移动事件，世界书新增/AI 生成按钮必须禁用。
- 结局锁必须同时存在于 UI/输入入口和规则层：`StrategyManager.applyStateUpdate()` 先拦截，`WorldEngine.apply*Update()` 在非 `playing` 场景也必须 no-op，防止外部 agent 或未来 UI 误调用继续推进世界状态。
- 同一批 `failureStateUpdate` 中，如果某条更新手动触发 `defeated`，后续失败条件更新必须停止，不能在失败结局后继续禁用、改写或新增失败条件。
- 日志条目只保存摘要和引用，不复制完整聊天文本。
- 地图移动统一走 `WorldEngine.moveToLocation()`；UI、输入路由和 `[move:]` 标记不能直接改写 `scene.currentLocation`，必须复用相邻地点校验、结局锁、移动消息和 `eventLog.movement`。按地点名移动必须先由 `WorldEngine.resolveLocationReference()` 唯一解析，重名或模糊不唯一时提示/跳过，不能默认移动到第一个同名地点。
- `factionsUpdate` 和 `locationUpdate` 必须委托 `WorldEngine.applyFactionUpdates()` / `applyLocationUpdates()`，同时有单条补丁上限与场景总量上限；势力最多 40 个，地点最多 80 个，新增/更新字段和列表必须截断、去重并写入事件日志。
- `WorldEngine.addSystemMessage()` 会自动把系统事件写入日志；检定结果、任务奖励、升级、移动、证据取得、HP 归零和通关会显式写入日志。HP 归零、剧本失败和主线通关的结局消息统一由规则层写入，不能由 UI 或聊天层直接改写 `scene.gameState`。
- 检定投入的消耗品扣除后必须写入 `【资源消耗】检定投入` 系统消息和 `eventLog.resource`，不能只静默减少背包次数。
- 检定结果后的 DM 续写同样必须清洗并处理 `[quest:]`、`[item_add:]`、`[damage:]` 等白名单标记；但其中的 `[check:]` 一律忽略并从正文移除，避免同一次行动结算后再次生成检定卡或暴露第二个 DC。
- 通关/失败时的 `scene.runRecord.phaseSummaries` 必须把 `storyPhases`、挑战、证据、主线目标和检定与完整 transcript 关联，生成可展开的关键原文摘录；完整对话仍保留为独立折叠列表。角色发言消息必须保存当时的 `characterName`，`runRecord.transcript` 应优先使用这份快照并保留 `characterId`，避免全局角色卡缺失时回顾退化成无名发言。
- 存档快照必须保存并恢复运行态规则字段，包括 `equipmentRefs`、`explorationRewardLog`、`pendingExplorationRewards`、`inputContext`、`dmPersona`、`background` 和 `userName`；读档后不能让装备精确引用、探索奖励防重日志或待领取探索物品丢失，避免同名装备误操作、重复刷经验、物资丢失或输入状态错乱。
- 读档后必须刷新聊天、左侧角色、右侧详情/局势/线索/世界书/地图/任务/背包/计策、行动条、pending action/check 预览和输入区状态，不能只恢复数据而让旧线索、旧地图、旧世界书、旧输入提示或旧 pending 控件留在 UI 上。
- `Storage.importAll()` 导入场景前、`Storage.exportAll()` 导出备份前都必须归一化旧存档字段；新建场景的 `State.createScene()` 也必须直接初始化 `equipmentRefs`，不能依赖下一次加载才补齐运行态装备引用。
- 旧存档没有 `eventLog` 时，右侧局势面板可从已有 `check/system/event/victory/gameover` 消息临时派生最近事件。
- 右侧“局势”面板展示最近事件，帮助玩家回流时快速知道刚发生了什么。

### 4.17 防卡住提示

玩家问“我该做什么”“然后呢”“什么情况”时，系统必须给出 soft move，而不是把问题送进 AI 叙事继续推进剧情。

当前规则：

- `IntentRouter.buildHelpText()` 在 idle 状态优先调用 `WorldEngine.formatSoftMove()`，展示当前挑战、关键未知、主线目标或紧急时钟，并列出 2-4 条可直接输入的行动。
- “怎么掷骰”“什么是检定”“怎么设置”“API key”等规则/操作问题仍返回本地帮助，不混入剧情提示。
- `WorldEngine.tickAfterPlayerTurn()` 会在普通玩家回合后检查进展。如果连续 2 个回合没有任务、探索、挑战、检定、移动或剧情进展，会插入一次 `【下一步提示】` 系统消息并刷新局势面板。
- soft move 只提供方向和输入示例，不自动完成任务、不创建检定、不消耗资源、不替玩家选择路线。
- `flowGuide.lastProgressTurn` 和 `flowGuide.lastSoftMoveTurn` 用于防重复提示；旧存档没有这两个字段时归一化为 0。

### 4.18 后果账本

失败、部分成功和资源代价必须能持续影响后续玩法，而不是只在一句叙事里消失。

当前规则：

- `scene.consequenceLedger` 记录未解决后果，字段包括 `title/cause/effect/severity/status/category/tags/turn`。
- 部分成功、失败推进、大失败、同伴协助代价、挑战受挫、挑战尚未坐实都会写入后果账本。
- 活跃后果会在行动预览中作为“未解决后果”提高风险；严重后果会额外提高 DC。
- 后续相关行动检定成功或大成功时，可按行动类型、属性、挑战和意图匹配并解除 1-2 条活跃后果；解除后不再影响风险预览。
- 检定解除后果时，检定结果卡、DM 续写上下文、`eventLog` 和右侧“局势”最近变化都必须显示被解除的后果。
- 右侧“局势”面板展示未解决后果，帮助玩家理解哪些代价还在生效。
- `eventLog` 记录“发生过什么”，`consequenceLedger` 记录“仍在影响什么”；两者不能混用。
- 结构化副本中，`[quest_update]`、`questsUpdate` 和任务面板手动点击不能绕过任务推进闸门；任务面板手动回退必须走 `WorldEngine.reopenQuestObjective()` 留痕；只有普通叙事自动识别可在 `maxAutoQuestAdvances` 内有限 fallback。
- `questsUpdate` 定位任务时优先用 `questId`，也可用当前场景唯一 `questName/name/title`；定位目标时优先用 `objectiveIdx/objectiveNumber`，也可用唯一 `objectiveId/objectiveText/targetText`。名称或目标文本不唯一时必须跳过；名称解析只定位，不得绕过 `completeQuestObjective()` 的挑战、证据和结论闸门。
- 同一批 `questsUpdate` 必须逐条结算任务失败和通关；如果某条任务更新触发 `defeated/victorious`，后续任务更新必须停止，不能在结局后继续完成、失败、回退或发放任务奖励。
- `[quest:]` 标记必须先经过 `PromptGuard._sanitizeQuest()`，再由 `WorldEngine.addQuest()` 新增；单次最多保留 8 个目标，任务名、描述和奖励会截断，重复活跃任务不会新增。
- 所有 AI 协议标记都必须先经过 `PromptGuard.sanitizeMarker()` 再执行；`[event:]`、`[move:]`、`[quest_update:]`、`[item_remove:]`、`[item_equip:]`、`[item_unequip:]`、`[damage:]`、`[heal:]` 等非新增类标记也必须截断文本、清除协议字符、限幅数量/数值，清洗后缺少目标的标记直接丢弃。玩家输入中出现任一协议标记，包括 `[event:]`，必须被提示词保护层拦截。
- `[new_char:]` 和 `[char_exit:]` 标记必须先经过 `PromptGuard` 清洗，再由 `WorldEngine.addExistingCharacterToScene()` / `removeCharacterFromScene()` 修改在场角色；不能直接 push/filter `scene.characters`，结局后不能改变在场角色。`[char_exit:]` 按角色名退场时必须由 `WorldEngine.resolveCharacterReference()` 在当前场景内唯一解析，重名或模糊不唯一时跳过，不能默认移除第一个同名角色。`[new_char:]` 的完整格式为 `角色名|emoji|公开外貌|公开性格|开场白|信条|价值排序|底线|动机|恐惧|秘密|筹码`，后 7 项可选；私密项只能进入角色扮演和 `profile.hiddenFacts`，不能直接作为玩家已知信息展示。
- 角色编辑器、PNG 导入和角色删除如果会修改当前场景的在场角色列表，也必须通过 `State.addCharacterToScene()` / `removeCharacterFromScene()` 进入同一规则层；不能在结局后通过管理入口改变回顾场景。新增或导入角色若被规则层拒绝加入当前场景，必须回滚刚创建的全局角色并恢复原选中角色，不能留下“已创建但不在场”的悬空状态。
- 当前场景已结束时，若角色仍被 `scene.characters`、历史消息、`transcriptLog` 或 `runRecord.transcript` 引用，删除全局角色卡必须被拦截，不能破坏通关/失败回顾中的角色署名和头像。

## 5. Prompt 规格

Prompt 必须区分以下块：

```text
【玩家已知】
只包含玩家知识账本中已解锁内容。

【当前 NPC 个人认知】
只包含该 NPC 合理知道的信息。

【NPC 私密设定，仅用于扮演，禁止直接透露】
动机、恐惧、秘密、隐藏筹码、反制计划。

【裁决规则】
行动意图、检定、物品、关系、场合、时钟如何影响结果。

【输出协议】
正文 + 可选状态补丁，隐藏补丁必须合法 JSON。
```

禁止：

- 直接把 `secrets` 作为对话告诉玩家。
- 让不在场 NPC 知道私密对话。
- 把隐藏时钟具体名称暴露给玩家。
- 用系统私密事实替代玩家调查。

## 6. 状态补丁协议扩展

目标 `<state_update>` 白名单增加：

```json
{
  "knowledgeAdd": [],
  "discoveryUpdate": [],
  "clockUpdate": [],
  "characterUpdates": [],
  "storyArcUpdate": [],
  "counterStrategyUpdate": [],
  "npcAgendaUpdate": []
}
```

`relationshipUpdate` 是旧字段名，运行时只作为 `characterUpdates` 的兼容别名；新 prompt 和文档均应使用 `characterUpdates`。
`discoveryUpdate` 每条状态补丁最多处理 10 条 NPC 隐藏档案解锁；目标角色优先用 `characterId`，也可用当前场景内唯一 `characterName/name/actorName/targetName` 匹配；档案槽优先用 `factId`，也可用该 NPC 下唯一 `factTitle/title/factType/type/hint/truth` 匹配。角色或档案槽重名、不唯一、离场或无法匹配时必须跳过，不能猜测解锁。
`characterUpdates` 每条状态补丁最多处理 30 个角色；目标角色优先使用 `characterId`，也可用当前场景内唯一的 `characterName/name/actorName/targetName` 匹配，重名或不唯一时必须跳过。每个角色单次最多追加 8 条筹码、8 条共同记忆和 1 条 NPC 私密秘密。筹码、记忆、心情、秘密都会截断文本并去重，列表只保留最近的上限条目；`secret` 不会因为状态补丁自动公开给玩家。
`clueUpdate` 和 `revelationUpdate` 优先用内部 id；模型不知道 id 时可用唯一线索标题、subjectName 或唯一关键结论文本定位。名称不唯一时必须跳过；找不到且提供明确 id/title/conclusion 时仍可由规则层创建新线索链或新结论。`revelationUpdate.conclusion` 可作为定位/创建文本，更新既有结论正文应使用精确 id 或 `newConclusion`，避免短匹配词覆盖原结论。
`npcAgendaUpdate` 使用同一角色引用规则；模型不知道内部 id 时可以写唯一角色名，但重名或离场角色名不能猜测更新。

每类补丁必须：

- 限制单次数量。
- 字段白名单。
- 字符串长度限制。
- 进入白名单前先递归清洗，移除原型污染键、敏感键和非白名单顶层字段。
- 不允许写入 settings/apiKey。
- 不允许直接覆盖完整 scene/character。

## 7. UI 规格

前端体验、信息架构、响应式和可访问性细节见 [UIUX_SPEC.md](UIUX_SPEC.md)。本节只记录叙事 RPG 规则对 UI 的最低要求。

### 7.1 角色档案

替换“查看角色卡（剧透）”为玩家档案：

- 基础身份。
- 当前关系维度。
- 已观察特征。
- 已知传闻。
- 已确认情报。
- 欠债/把柄。
- 未解锁槽位。

作者调试入口可保留，但应明显标记为“编辑/剧透”，并默认隐藏。运行时通过 `State.canShowDebugSpoilers()` 判断是否显示。

作者/调试剧透开关开启方式：

- URL 查询参数：`?debug=1` 或 `?spoilers=1`。
- 本地开关：`localStorage.setItem('tavern_show_character_spoilers', '1')` 或 `localStorage.setItem('tavern_debug', '1')`。
- 运行时设置：`State.settings.debugMode === true` 或 `State.settings.showCharacterSpoilers === true`。

发布给普通玩家时默认不设置上述开关。

### 7.2 玩家知识账本

新增右侧 tab 或并入世界书。当前基础实现采用右侧“线索”tab：

- 线索。
- 证据。
- 推论。
- 已确认真相。
- 未解决问题。

当前实现展示总览、来源、主体、可信度、标签，以及已解锁角色档案槽；支持按观察/传闻/证据/推论/确认过滤，也支持按角色、地点、势力、计策、物品、证据、事件等主体类型过滤。

### 7.3 当前局势

玩家回到游戏时应看到：

- 当前地点。
- 当前主目标。
- 最近风险。
- 活跃时钟。
- 可用线索。
- 推荐行动。

当前实现采用右侧“局势”tab，展示当前位置、主线目标、公开时钟、模糊隐藏压力、可见反制、最近风险、可用线索和可选行动。

### 7.4 检定卡

检定卡显示：

- 行动意图。
- 属性和 DC。
- 加成/惩罚来源。
- 成功收益。
- 失败风险。
- 可用物品。
- 掷骰按钮。

## 8. 实施阶段

### Phase 1: 信息边界基础

- 新增 `scene.knowledge`。
- 新增角色档案可见层。
- 将角色详情页从剧透卡改为玩家档案。
- 新增右侧“线索”知识账本基础 UI。
- Prompt 区分玩家已知和 NPC 私密设定。
- `intelAdd` 迁移/兼容到 `knowledgeAdd`。

验收：

- 新玩家无法直接看到 NPC 秘密。
- 解锁后知识条目出现在档案或知识账本。
- AI 不把私密设定直接说出。

### Phase 2: 行动与检定

- 增加行动意图识别。
- 增加 pending action / risk card。
- 检定改为玩家点击或输入“掷骰”后结算。
- 支持 partial success 和 fail-forward。

当前实现已完成行动意图识别、pending action / risk card、pending check / 点击或输入“掷骰”、partial success、fail-forward 后果提示、非消耗物品自动加成展示，以及可用消耗品的展示。

本轮自然输入实现已按 `docs/INPUT_FLOW_SPEC.md` 将输入入口改为自然语言路由：

- 默认单输入框识别行动、计策、帮助和 OOC。
- 模式按钮默认隐藏，仅保留代码兼容。
- pending action/check 可通过输入框处理执行、取消、改写和掷骰。
- 同一次行动只允许一个有效 DC。

验收：

- 高风险行动先展示风险。
- 检定结果能解释 DC、加成和后果。
- 失败能产生新剧情或新状态。
- 玩家不切换输入模式也能完成高风险行动和检定。

### Phase 3: 时钟与剧情弧

- 新增 `scene.clocks`。
- 新增 `storyArcUpdate`。
- 时钟触发具体事件。
- 当前局势面板展示时钟和下一步。
- `WorldEngine.tickAfterPlayerTurn()` 根据成功完成的玩家回合、休息、部分成功/失败推进时钟；AI 回复失败/中断不推进，等待检定时延后到检定结算后推进。

验收：

- 拖延或失败会推进时钟。
- story arc beat 能自动推进并持久化。
- 玩家隔天回来能理解当前局势。

当前实现状态：已完成基础版。

### Phase 4: NPC 主动性

- 新增 NPC agenda。
- 新增 NPC 离屏行动。
- 新增 counter strategies。
- 消息可见性初步生效。
- `PromptBuilder` 会按当前 NPC 可见性过滤历史。

验收：

- NPC 会在玩家不互动时推进自己的目标。
- 不在场 NPC 不会无故知道私聊内容。
- 玩家能发现并反制 NPC 的反制。

当前实现状态：已完成基础版。

### Phase 5: 物品、关系、计策闭环

- 物品 effects/uses/tags。
- 多维关系进入计策风险。
- 情报作为计策资源。
- 装备和非消耗任务物品进入检定修正；消耗品和已解锁同伴协助先在检定卡展示为可选资源，玩家点选后随掷骰消耗。同伴协助可用 `trustAtLeast`、`evidenceTags`、`knowledgeTags` 或 `revelationIds` 控制逐步公开。
- 计策支持 `requiredIntel`、`usedIntel`、`exposure`、`counterplay`。

验收：

- 同一行动在不同情报/物品/关系下风险不同。
- 计策成功或失败会具体改变知识、关系、时钟或资源。
- 装备不只是展示，而能改变判定。

当前实现状态：已完成基础版。

## 9. 迁移策略

旧存档兼容：

- `scene.intel` 保留读取，视为已知情报。
- 没有 `scene.knowledge` 时自动创建。
- 没有角色 `profile` 时只允许使用显式 `firstImpression`、`tags` 或非剧透占位生成 public 档案；不能从完整 `description/personality/secrets` 摘取公开信息。
- 现有 `secrets/leverage/fears/motives` 暂时继续作为 NPC 私密设定。
- 没有 `clocks`、`discoveries`、`counterStrategies`、`agenda` 时默认空数组/空对象。

## 10. 验收清单

- [x] 新建预设世界后，玩家不能看到 NPC 的 `secrets`。
- [x] 通过观察或调查可解锁一条 NPC hint。
- [x] 通过证据可把 rumor 升级为 confirmed。
- [x] 私聊内容不会自动进入其他 NPC prompt。
- [x] 检定前能看到风险和加成。
- [x] 检定失败至少产生一个推进型后果。
- [x] 时钟推进到阈值会触发事件。
- [x] story arc beat 可持久化推进。
- [x] 计策风险受情报、关系、物品和场合影响。
- [x] 装备或工具能改变检定。
- [x] 删除/读取存档后知识账本、时钟、档案解锁状态一致。

## 11. 待决问题

- 玩家是否允许手动编辑知识账本，还是只能由系统/AI 写入？
- 高风险行动是否必须二次确认，还是只在特定 DC 以上确认？
- 隐藏时钟是否应完全不可见，还是以模糊提示显示？
- AI 关系分析是否继续每轮调用，还是改为事件触发？
- 发布版是否替换第三方 IP 风格预设为原创世界？
