# 游戏状态结构

> 本文档描述 `State.scene`、角色对象和消息对象的实际字段。字段来源以 `js/core/state.js`、`js/features/world-generator.js`、`js/features/group-chat.js`、`js/features/strategy-manager.js` 为准。

## 一、运行时 State

`State` 是全局单例，缓存 IndexedDB 中的角色、场景和设置，并提供当前场景/角色的派生访问器。

```js
{
  currentSceneId: "scene_xxx",
  currentCharacterId: "char_xxx",
  selectedCharacterIds: [],
  isStreaming: false,
  isOOC: false,
  inputMode: "talk",         // talk | action | strategy | ask | ooc
  messageQueue: [],
  editingCharacterId: null,
  characters: [],
  scenes: [],
  settings: {
    apiKey: "",
    model: "deepseek-v4-flash",
    thinkingEnabled: true,
    backgroundUrl: "",
    userName: "旅人"
  }
}
```

派生访问器：

- `State.scene`：当前 `currentSceneId` 对应的场景。
- `State.character`：当前 `currentCharacterId` 对应的角色。
- `State.activeCharacters`：当前场景中 `scene.characters` 引用到的角色对象。

`settings.apiKey` 是敏感字段，只存储在 IndexedDB `settings` 中。任何 agent 不得通过 `<state_update>` 或 UI 文档建议修改它。

## 二、scene 全字段

`State.createScene()` 创建的标准场景：

```js
{
  id: "scene_...",
  name: "新场景",
  background: "",
  characters: ["char_..."],
  userName: "旅人",
  playerPersona: null,
  dmPersona: null,
  messages: [],
  lorebookEntries: [],

  playerStats: {
    strength: 10,
    dexterity: 10,
    constitution: 10,
    intelligence: 10,
    wisdom: 10,
    charisma: 10
  },
  quests: [],
  locations: [],
  currentLocation: "",
  inventory: [],
  equipment: {
    weapon: null,
    armor: null,
    accessory: null
  },

  gold: 0,
  exp: 0,
  level: 1,
  attrPoints: 0,
  playerHp: 10,
  playerMaxHp: 10,
  gameState: "playing",
  storyArcs: [],
  summary: "",
  transcriptLog: [],
  eventLog: [],

  strategies: [],
  intel: [],
  knowledge: {
    discoveries: [],
    suspicions: [],
    evidence: [],
    debts: [],
    leverage: [],
    unresolvedQuestions: []
  },
  discoveries: {
    characters: {}
  },
  factions: [],
  conflictSeeds: [],
  worldTension: 0,
  activeStrategyId: null,
  pendingAction: null,
  pendingCheck: null,
  inputContext: {
    state: "idle",
    prompt: "",
    suggestions: [],
    lastIntentId: ""
  },

  createdAt: 1710000000000,
  updatedAt: 1710000000000,
  snapshots: []
}
```

### 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 场景主键，IndexedDB `scenes` object store 的 keyPath |
| `name` | string | 世界/场景名称 |
| `background` | string | 场景背景 CSS，例如渐变字符串 |
| `characters` | string[] | 参与场景的角色 id 列表 |
| `userName` | string | 玩家在该场景中的称呼 |
| `playerPersona` | object/null | 玩家人设，群聊 prompt 会注入 |
| `dmPersona` | object/null | DM 旁白人格，用于地点、检定、事件叙事 |
| `messages` | Message[] | 对话与系统事件历史 |
| `lorebookEntries` | LorebookEntry[] | 当前场景世界书 |
| `playerStats` | object | 六项 D&D 属性，检定时转为调整值 |
| `quests` | Quest[] | 任务列表 |
| `locations` | Location[] | 地图节点列表 |
| `currentLocation` | string | 当前地点 id |
| `inventory` | Item[] | 背包物品 |
| `equipment` | object | 当前装备槽 |
| `gold` | number | 金币，最小为 0 |
| `exp` | number | 当前等级内经验 |
| `level` | number | 玩家等级 |
| `attrPoints` | number | 可分配属性点 |
| `playerHp` / `playerMaxHp` | number | 当前/最大生命值 |
| `gameState` | string | `playing` / `defeated` / `victorious` |
| `storyArcs` | StoryArc[] | 剧情弧 prompt 上下文 |
| `eventLog` | EventLogEntry[] | 冒险过程日志，记录检定、任务、探索、资源、购买、升级等关键变化 |
| `consequenceLedger` | Consequence[] | 未解决后果账本，记录失败、部分成功、同伴代价和挑战受挫产生的持续影响 |
| `clocks` | Clock[] | 局势时钟，支持 hidden/hinted/known 可见性 |
| `failureStates` | FailureState[] | 剧本级失败结局条件，支持时钟/任务/反制/世界紧张度触发 |
| `gameplayProfile` | object | 副本玩法密度、核心线索和 NPC 边界策略 |
| `flowGraph` | object | 剧本节点图和关键结论 revelations |
| `sceneChallenges` | SceneChallenge[] | 当前阶段可玩的挑战、进度、压力和检定方向 |
| `evidenceLedger` | Evidence[] | 玩家已取得的证据，用于任务/结论推进闸门 |
| `companionResources` | CompanionResource[] | NPC 有限协助资源，可影响 DC、证据质量或时钟 |
| `explorationRewardLog` | string[] | 已发放探索奖励的证据 id 记录，防止重复刷经验/物资 |
| `questProgressGuards` | object | 连续自动任务推进保护，防止无挑战/无证据跳目标 |
| `runRecord` | RunRecord/null | 当前冒险的结局回顾，胜利或失败时自动生成 |
| `runHistory` | RunRecord[] | 最近通关/失败记录，便于玩家回看多次尝试 |
| `transcriptLog` | TranscriptEntry[] | 自动摘要压缩前归档的原始对话条目，用于结局后重建完整对话记录 |
| `counterStrategies` | CounterStrategy[] | NPC/敌方反制计划 |
| `flowGuide` | object | 剧本流程指南：openingMoves/sessionGoals/stalledPrompts/failForward/completedMoves |
| `currentSituation` | object | 当前局势摘要：recentRisks/recommendedActions |
| `turnCount` | number | 玩家回合计数，用于时钟和离屏行动 |
| `summary` | string | 自动摘要后的先前剧情，prompt 注入上限约 1200 字 |
| `strategies` | Strategy[] | 计策卡列表 |
| `intel` | Intel[] | 旧版已知情报，仍兼容；新逻辑会迁移到 `knowledge.discoveries` |
| `knowledge` | object | 玩家知识账本，记录玩家已观察、听闻、推理或确认的信息 |
| `discoveries` | object | 角色档案解锁状态，例如 `discoveries.characters[charId][factId]` |
| `factions` | Faction[] | 势力态势 |
| `conflictSeeds` | string[] | 世界矛盾种子 |
| `worldTension` | number | 世界紧张度，prompt 以 `/100` 展示 |
| `activeStrategyId` | string/null | 当前激活计策 |
| `pendingAction` | PendingAction/null | 玩家已生成但尚未确认的行动风险预览 |
| `pendingCheck` | PendingCheck/null | AI 或规则已要求、等待玩家点击或输入“掷骰”的检定卡 |
| `inputContext` | object | 输入框当前状态与建议，默认 idle；pending action/check 时由 UI 同步 |
| `createdAt` / `updatedAt` | number | 毫秒时间戳 |
| `snapshots` | array | 存档快照预留字段 |

`State.normalizeScene(scene)` 会为旧存档补齐以上字段。新增字段必须在 `normalizeScene()` 中提供兼容默认值。

如果旧存档或简化自定义世界已有任务、冲突种子、剧情弧或线索，但缺少 `storyPhases`、`sceneChallenges` 或 `flowGuide`，`WorldEngine.normalizeScene()` 会补一个轻量可玩骨架：至少一个 active phase、一个 active challenge 和基础卡住提示。完全空白的新场景不会被强行补成副本；`completed/failed/bypassed` 等终态阶段不会被重新激活，也不会再补活新的挑战。

`SceneManager` 的存档快照必须覆盖同一批运行态规则字段。尤其是 `explorationRewardLog`、`inputContext`、`dmPersona`、`background` 和 `userName`，读档后应恢复原值；否则可能导致探索奖励重复发放、输入状态错乱或 DM 叙事人格丢失。

## 三、子结构

### PlayerPersona

```js
{
  name: "旅人",
  appearance: "外貌",
  background: "背景",
  personality: "性格",
  goal: "目标",
  creed: "信条"
}
```

### DMPersona

```js
{
  name: "黑船纪事",
  emoji: "📜",
  description: "旁白风格说明"
}
```

### LorebookEntry

```js
{
  keys: ["帝皇", "黄金王座"],
  secondary_keys: [],
  content: "世界书正文",
  comment: "注释",
  enabled: true,
  selective: false,
  constant: false,
  insertion_order: 0,
  priority: 0,
  position: "before_char"
}
```

世界书由 `PromptBuilder.buildLorebookPrompt()` 触发：

- `constant: true` 总是注入。
- 非 constant 条目需要最近 50 条消息命中 `keys`。
- `selective: true` 时还需命中 `secondary_keys`。
- 总预算约 `1500 token * 4` 字符。

### Quest

```js
{
  id: "q_main",
  name: "揭露混沌渗透",
  type: "main",              // main | side
  description: "任务说明",
  objectives: [
    { text: "获得审判官的初步信任", completed: false }
  ],
  status: "active",          // active | completed | failed | abandoned
  giver: "审判官塞拉斯",
  reward: "金币x100,经验x50,短剑x1",
  rewardGranted: false       // 防止同一任务通过多条完成路径重复发奖
}
```

主线任务全部 `completed` 后，`WorldEngine.checkVictory()` 会先结算已完成主线任务的未发奖励；如果奖励被背包容量阻塞，`scene.gameState` 仍保持 `playing`，提示玩家清理背包。待补领奖励成功后才把 `scene.gameState` 设为 `victorious` 并插入胜利消息。`GroupChat._checkVictory()` 只保留为旧调用包装器，不能直接改写结局状态。`gameState` 不是 `playing` 时，输入框、地图、背包、交易、休息、属性点、任务手动操作和计策创建/更新/放弃都不能继续改变世界状态；只允许 OOC、帮助和回顾类操作。回顾类输入（如“回顾”“通关记录”“失败记录”“冒险记录”）由 `IntentRouter` 本地处理，打开右侧“局势”面板；如果冒险已结束，会确保 `RunRecorder.complete()` 生成当前版本的 `runRecord`，不会进入 AI 回复流程。

结局后的右侧面板仍可查看任务、背包、属性和计策，但应隐藏或置为只读：任务目标不再绑定勾选事件，背包不显示使用/装备/卸下按钮，属性点不显示加号，计策不显示放弃/重新规划入口。规则层仍必须保留最终防线，不能只依赖 UI 隐藏按钮。

同一条 AI 回复中，如果状态补丁或标记已经触发胜利/失败，后续标记、自动检定、自动任务推断和自动关系分析都应停止，避免结局消息之后继续改变 NPC 关系或世界状态。

剧本级失败由 `scene.failureStates` 描述。状态为 `armed` 的失败条件会被 `WorldEngine.checkFailureStates()` 自动判定；触发后会把 `scene.gameState` 设为 `defeated` 并插入 `gameover` 消息。HP 归零由 `WorldEngine.triggerHpGameOver()` 处理，旧的 `GroupChat._triggerGameOver()` 只保留为包装器。剧本失败、HP 归零和主线通关都会写入 `eventLog`，并触发 `RunRecorder.complete()` 生成回顾。

结局出现后，`RunRecorder.complete()` 会生成 `scene.runRecord`，整理玩家、回合数、结局消息、关键事件、任务完成度、已知线索、挑战、证据、检定、公开时钟和完整对话 transcript。长对话自动摘要前会先把被压缩的原始消息写入 `scene.transcriptLog`，因此结局回顾不会只剩最近 300 条或摘要文本。右侧“局势”面板会展示这份冒险回顾，完整对话默认折叠，供玩家需要时展开复盘。

### SceneChallenge / Evidence

```js
scene.sceneChallenges = [
  {
    id: "challenge_shelter_committee_trust",
    phaseId: "phase_shelter_permission",
    title: "委员会最低信任",
    status: "active",       // locked | active | completed | failed | bypassed
    progress: 0,
    targetProgress: 3,
    strain: 0,
    maxStrain: 3,
    approaches: [
      { id: "present_route_data", label: "提交路线和辐射读数", stat: "intelligence", dc: 13, effect: 1 }
    ],
    supports: ["q_main:1"],
    evidenceIds: ["ev_route_reading"],
    coreRevelations: ["rev_player_is_not_contagious"]
  }
];

scene.evidenceLedger = [
  {
    id: "ev_no_contagion",
    title: "无传染性体检结论",
    tags: ["medical", "no_contagion"],
    reliability: "confirmed", // rumor | partial | confirmed | contested
    supports: ["q_side2:1", "rev_player_is_not_contagious"]
  }
];
```

`ActionPlanner` 会优先匹配 active challenge 的 `approaches`。掷骰后 `WorldEngine.resolveChallengeCheck()` 推进 `progress/strain`，并可通过 `evidenceAdd`、`challengeUpdate`、`revelationUpdate` 状态补丁同步 AI 叙事结果。结构化副本中，支线任务目标必须有证据、挑战或结论支持，避免仅凭叙事关键词自动完成。`[quest:]` 必须先经过 `PromptGuard` 清洗，再由 `WorldEngine.addQuest()` 新增、去重、限制数量和写系统留痕。`[quest_update]`、`questsUpdate` 和任务面板手动点击完成都会调用 `WorldEngine.completeQuestObjective()` / `WorldEngine.applyQuestUpdates()` 同一闸门，任务面板手动回退调用 `WorldEngine.reopenQuestObjective()`，并由规则层写任务进展、发放任务奖励和防重复；主线只有普通叙事自动识别允许在 `maxAutoQuestAdvances` 内做有限 fallback，显式协议不能靠相似叙事直接完成目标。

`storyPhaseUpdate` 不能直接跳阶段。`WorldEngine.applyStoryPhaseUpdate()` 会在激活下一阶段或完成当前 active 阶段时检查闸门：

- 当前阶段至少有一个 `sceneChallenge.status === "completed"`。
- 或存在失败推进/替代路线：阶段挑战 `failed`，或补丁写明 `failForward` / `alternative` / `outcome: "failed"`，且带 `reason`。
- 或玩家绕过阶段但付出明确代价：补丁写明 `cost`、`bypassCost`、`resourceCost`、`relationCost`、`clockCost`、`consequence`、`costs`、`worldTensionDelta`、`clockDelta` 或 `goldCost`，且带 `reason`。

绕过代价不只是文字依据。`goldCost` 会先校验金币是否足够并扣除；`worldTensionDelta` 会调用 `WorldEngine.addWorldTension()`；`clockDelta` 搭配 `clockId` / `clockTag` / `clockName` 会调用 `applyClockUpdate()`；`costs` 可写 `{ type: "item", itemName, quantity }`、`{ type: "gold", amount }`、`{ type: "worldTension", delta }`、`{ type: "clock", id, delta }` 或 `{ type: "consequence", text }`，分别进入背包、经济、时钟和后果账本。

不满足闸门时，阶段状态保持不变，系统写入 `eventLog` 的 `progress` 事件“剧情阶段待确认”，并在当前局势最近风险里提示阶段待确认。

### CompanionResource

```js
{
  id: "ally_susan_medical_scan",
  characterId: "susan",
  characterName: "苏珊", // 生成/导入时可用；应用模板后会回填为真实 characterId
  name: "苏珊的体检背书",
  unlock: { trustAtLeast: 15, evidenceTags: ["medical"] },
  uses: 1,
  cost: { trust: 2, time: 10 },
  effect: { dcDelta: -2, actionType: "investigate", evidenceReliability: "confirmed", clockDelta: -1, clockTag: "panic" },
  tags: ["medical", "trust"],
  risk: "保守派会更关注苏珊的医疗记录。"
}
```

同伴协助是逐步公开资源，不满足 `unlock` 时不会进入 prompt、右侧局势或检定卡。当前支持的解锁条件包括 `trustAtLeast`/`trust`、`trustBelow`、`evidenceTags`、`knowledgeTags` 和 `revelationIds`。运行态资源应绑定真实 `characterId`；AI 生成或导入模板可提供 `characterName`、原始角色 id 或在资源名中包含角色名，`WorldGenerator.applyTemplate()` 会在创建角色后回填真实 id。旧存档缺失 `characterId` 时，`WorldEngine.normalizeScene()` 会按当前场景角色名做一次兼容修复。玩家在检定卡显式点选后，掷骰时扣除 `uses`，并结算 `cost.trust`、`cost.time` 和 `risk`；信任成本写入对应 NPC 的 `_relations[userName].history`，时间成本会选择一个活动/公开时钟推进 1-3 格（每 30 分钟或不足 30 分钟计 1 格）。

`effect` 可影响检定和局势：`checkBonus`、`dcDelta`、`riskDelta` 会进入检定结果；`clockDelta` 配合 `clockId`/`clockTag` 或资源标签延缓/推进公开时钟；`evidenceReliability` 会把已取得且标签匹配的可见证据升级到指定可信度；`resolveConsequence`、`resolveConsequenceTags` 或 `consequenceTags` 可解除匹配的活跃后果。

### Location

```js
{
  id: "cargo",
  name: "下层货舱",
  description: "昏暗的货舱...",
  connections: ["interrogation", "engine"],
  alertLevel: 20
}
```

移动状态统一由 `WorldEngine.moveToLocation()` 结算：只允许移动到当前地点 `connections` 中的相邻节点，结局后禁止移动，并由规则层写入当前地点、移动消息和 `eventLog.movement`。`MapView.moveTo()`、输入“我去某地”和 `[move:]` 标记只能委托该规则入口，不能直接改写 `scene.currentLocation`。`locationUpdate` 补丁可以新增地点或更新 `name`、`description`、`connections`、`alertLevel`；单条补丁最多 20 条，场景最多 80 个地点，id/名称/描述/出口都会截断和去重；变化会写入事件日志并提示地图/局势。

### Item

```js
{
  id: "item_...",
  name: "假账本",
  description: "可用于栽赃的账本",
  type: "quest",             // weapon | armor | consumable | quest | misc
  quantity: 1,
  equipped: false,
  effects: [
    { type: "check_bonus", stat: "dexterity", value: 2, when: "lockpick" },
    { type: "heal", value: 4, consume: true }
  ],
  uses: 3,
  tags: ["工具", "开锁"]
}
```

装备槽：

```js
{
  weapon: "短剑",
  armor: "皮甲",
  accessory: "护符"
}
```

`weapon`、`armor` 进入对应槽，其它类型默认进入 `accessory` 槽。非消耗品可通过背包按钮或主输入框“装备物品名”“卸下物品名”切换装备状态；同槽位只保留一件装备。

物品效果约定：

- `check_bonus`：用于检定；装备和非消耗任务物品可自动生效，`consume: true` 的消耗品需要在检定卡显式点选。
- `heal/gold/exp/clock_delta/clock_resist/world_tension`：可作为背包直接使用效果，点击“使用”或输入“使用物品名”时立即结算。`heal`/`gold`/`world_tension` 复用生命、经济和世界紧张度规则入口，时钟效果优先按 `clockId`、`clockTag`、`clockName` 匹配，否则按物品标签匹配公开时钟。
- 直接使用效果必须绑定消耗语义：物品是 `consumable`、带 `uses`，或对应 effect 写 `consume:true`。非消耗装备/杂物不允许反复直接使用来刷资源。
- 直接使用消耗品只有在直接效果真实生效时才扣除；例如生命已满时使用治疗物品、或时钟物品找不到可影响的公开时钟，都应提示未消耗。
- 物品效果值会在 `WorldEngine.normalizeItemEffect()` 中按类型限幅；`<state_update>.itemAdd` 单次补丁同名物品最多增加 20 个单位或次数，显式 `effects` 会替换名称推断效果，防止 AI 生成超大加成或超大 `uses`。
- `dc_delta/risk_delta`：可作为检定卡可选消耗资源，玩家点选后才生效并扣除次数。
- `strategy_leverage`：可作为计策筹码；`tag`、物品标签、名称或描述与当前计策文本匹配时，右侧计策面板和计策 prompt 会展示该物品及风险修正。
- 带 `uses` 的同名物品合并时累加 uses，效果按语义去重，避免一次使用重复结算。
- 带 `uses` 的消耗品在次数降为 0 时从背包移除；直接使用和检定投入共享同一消耗逻辑。
- 出售、剧情移除和阶段绕过代价会把 `uses` 视为可扣次数；出售多次使用的消耗品按实际售出的次数计价，不能按剩余总次数估价却只扣 1 次。
- 检定投入的消耗品扣除后会生成 `【资源消耗】检定投入` 系统消息，并写入 `eventLog.resource`，方便右侧局势和通关回顾追溯。
- 任务奖励和 `[item_add:]` 可只提供名称；系统会根据名称/描述推断常见物品类型和效果，例如治疗药水、补给、零件包、短剑、护甲、地图、钥匙、证据。
- `[item_add:]` 和 `[item_remove:]` 由 `WorldEngine.grantInventoryItem()` / `WorldEngine.removeInventoryItem()` 处理；移除或直接消耗已装备物品时会同步清理装备槽。
- `grantQuestReward()` 会先预检物品奖励是否可放入背包；容量不足且无法合并时不会发放任何奖励，也不会设置 `rewardGranted`。
- 出售、移除、直接使用、检定投入和计策资源消耗如果真实腾出背包格子，会静默重试已完成但未领取的任务奖励；成功时写入正常任务奖励摘要。
- 主线奖励未领取时不会进入胜利结局；清理背包触发补领成功后会重新检查通关，避免结局锁死未发奖励。
- `sellInventoryItem()` 只允许出售非任务、未装备物品；出售会复用 `removeInventoryItem()` 和 `addGold()`，同时写入背包、经济和系统事件。
- `buyBasicSupply()` 会先确认背包可合并或仍有空位，成功扣金币后再走 `grantInventoryItem()`；金币不足或背包满时不会改变金币或背包。
- 探索奖励生成的一次性物品也走 `grantInventoryItem()`；背包满且无法合并时，探索收获消息会明确说明未获得该物品。

### 成长字段

`exp` 表示当前等级内经验，升级所需为 `level * 100`。升级后：

- `level += 1`
- `attrPoints += 2`
- `playerMaxHp` 按 `10 + 体质调整值 * 4 + (level - 1) * 4` 重算
- `playerHp = playerMaxHp`

经验增减统一通过 `WorldEngine.addExperience()` 结算。任务奖励、`[exp:N]`、探索/挑战里程碑和可直接使用的经验物品都应进入同一升级循环，不能只改写 `scene.exp`。

属性点通过玩家详情面板或单输入框命令分配（如“加一点敏捷”“体质+1”）。单项属性当前上限为 20；分配体质时会重算最大生命，最大生命提升会同步提高当前生命。

### 生命字段

`playerHp` 和 `playerMaxHp` 由规则层维护。AI 标记 `[damage:N|原因]`、`[heal:N|原因]` 会分别调用 `WorldEngine.applyPlayerDamage()` 和 `WorldEngine.applyPlayerHealing()`，写入 survival 事件并刷新顶部状态。生命降到 0 时由 `WorldEngine.triggerHpGameOver()` 触发 HP 归零失败结局和失败回顾记录。

`WorldEngine.normalizeScene()` 会按等级和体质把过低的旧版 `playerMaxHp` 迁移到公式值；旧档如果原本满血，会同步补到新的最大生命，受伤状态则保留当前生命值。

### EventLogEntry

```js
{
  id: "evlog_...",
  category: "check",      // system/check/quest/inventory/resource/exploration/challenge/progress/survival/economy/level/movement/failure/victory
  title: "感知检定：部分成功",
  text: "D20=12 +1 = 13 vs DC14",
  turn: 4,
  timestamp: 1710000000000,
  messageId: "msg_...",
  refId: "ev_..."
}
```

`eventLog` 不是聊天全文副本，只记录可回顾的状态变化。右侧“局势”面板展示最近事件；旧存档没有 `eventLog` 时，可从已有 `check/system/event/victory/gameover` 消息临时派生。

### Consequence

```js
{
  id: "cons_...",
  title: "审判庭怀疑上升",
  cause: "玩家拒绝配合血样检查",
  effect: "塞拉斯限制玩家前往货舱",
  severity: "medium",       // low | medium | high | critical
  status: "active",         // active | resolved | expired
  category: "sneak",
  tags: ["潜入", "货舱"],
  turn: 4,
  createdAt: 1710000000000,
  resolvedAt: 0,
  resolvedBy: "",
  resolution: ""
}
```

`consequenceLedger` 用于持续后果，不记录每条普通日志。部分成功、失败推进、同伴协助代价、挑战受挫和阶段性结果不足会写入此账本。活跃的高严重度后果会进入行动预览风险修正；后续相关行动检定成功或大成功可把匹配后果标记为 `resolved`，解除后不再显示在右侧“局势”面板，也不再影响风险预览。解除动作必须写入 `eventLog`，并在右侧“局势”的最近风险/变化中提示“后果解除”，检定结果卡和 DM 续写上下文也应携带 `resolvedConsequences`。

### Strategy

```js
{
  id: "st_...",
  title: "挑拨商会和城卫",
  goal: "让双方互相猜忌",
  status: "draft",           // draft | preparing | executing | exposed | resolved | failed
  phase: "intel",            // intel | setup | action | complication | resolution
  risk: 35,                  // 0-100
  progress: 20,              // 0-100
  participants: [],
  steps: [],
  resources: [],
  clues: [],
  requiredIntel: ["disc_xxx"],
  usedIntel: ["disc_xxx"],
  consumedItemResourceIds: ["item_xxx"],
  exposure: 20,
  counterplay: ["调查证人", "降低警觉"],
  stakes: "失败会暴露玩家身份",
  latestOutcome: "商会开始怀疑城卫",
  createdAt: 1710000000000,
  updatedAt: 1710000000000
}
```

`StrategyManager.normalizeStrategy()` 会修正非法 `status`、`phase`，夹紧 `risk`/`progress`/`exposure` 到 0-100，并截断标题、目标、赌注、最近结果、步骤、参与者、情报、资源和反制建议等数组字段。单条 `<state_update>` 最多创建 4 条计策、更新 12 条计策；场景最多保留 24 条计策，超过后不再新增。
`WorldEngine.getStrategyItemResources()` 会把匹配当前计策文本、`resources`、`requiredIntel` 或 `usedIntel` 的 `strategy_leverage` 物品展示为可用筹码。计策进入执行或结算阶段时，如果本次状态补丁的 `resources` / `usedIntel` 明确提到可消耗物品名或物品 ID，`WorldEngine.consumeStrategyItemResources()` 会扣除一次，并把物品 id/name 写入 `consumedItemResourceIds` 防止重复扣除。标签和效果标签只用于展示可用筹码，不能单独触发扣除。

计策创建、更新和放弃属于玩法状态变更，必须在 `scene.gameState` 为 `playing` 时才允许。结局后右侧计策面板只保留回顾和切换查看，不显示放弃或重新规划入口，也不能再通过 `<state_update>` 修改计策或消耗计策物品。

### Intel

```js
{
  id: "intel_...",
  text: "货舱遗物最近发出低语",
  source: "机械仆从日志",
  reliability: "confirmed",  // rumor | confirmed | false
  tags: ["货舱", "遗物"],
  discoveredAt: 1710000000000
}
```

旧模板和旧存档中的 `intel` 会被 `State.normalizeKnowledge()` 视为玩家已知内容，迁移为 `knowledge.discoveries` 条目；字段仍保留用于兼容。`<state_update>.intelAdd` 写入时会裁剪文本、来源和标签，按 `text + source` 去重，并把 `scene.intel` 控制在最近 120 条，同时同步到知识账本。

### KnowledgeDiscovery

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
  tags: ["审判官", "异常"],
  evidenceIds: [],
  discoveredAt: 1710000000000
}
```

右侧“线索”tab 展示 `knowledge.discoveries` 以及已解锁的角色档案槽，支持按观察/传闻/证据/推论/确认和角色/地点/势力/计策等主体类型过滤。未解锁的 `character.profile.hiddenFacts` 不会出现在账本中。

`State.addKnowledgeDiscovery()` 按 `id`、`legacyIntelId` 或重叠的 `evidenceIds` 合并已存在条目；同一证据升级可信度或补充标签时应更新原线索卡，而不是追加重复卡。

### PendingAction

```js
{
  id: "action_...",
  status: "preview",
  type: "persuade",              // talk | observe | ask | probe | lie | threaten | persuade | investigate | sneak | force | combat | trade | use_item | rest
  typeLabel: "说服",
  intent: "说服审判官允许我查看货舱日志",
  risk: 42,                      // 0-100，本地预估
  riskLevel: "中",
  suggestedCheck: {
    stat: "charisma",
    statName: "魅力",
    dc: 14
  },
  adjudication: {
    source: "local",
    stat: "charisma",
    statName: "魅力",
    dc: 14,
    risk: 42,
    reason: "说服存在可见失败代价，使用本地风险预览统一 DC。"
  },
  modifiers: [
    { source: "可用已确认线索", label: "风险 -6", riskDelta: -6, dcDelta: -1 }
  ],
  risks: ["对方提出条件", "需要交出筹码或人情"],
  stakes: "失败可能导致：对方提出条件",
  createdAt: 1710000000000
}
```

`pendingAction` 由本地 `ActionPlanner` 生成。玩家点击“执行行动”或在主输入框输入“执行”后，会被转写为一条 `type: "action_intent"` 的用户消息，并清空 `pendingAction`。输入“取消”会放弃预览；直接输入新动作会改写预览。

### PendingCheck

```js
{
  id: "check_...",
  status: "pending",
  statName: "魅力",
  key: "charisma",
  statValue: 14,
  statMod: 2,
  itemBonus: 1,
  mod: 3,
  dc: 15,
  source: "本地行动裁决",
  sourceMessageId: "msg_...",
  actionType: "persuade",
  intent: "说服审判官允许我查看货舱日志",
  adjudicationSource: "local",
  adjudicationReason: "说服存在可见失败代价，使用本地风险预览统一 DC。",
  itemModifiers: [
    { source: "审讯记录", label: "+1 检定", value: 1 }
  ],
  availableItemModifiers: [
    { id: "item:item_x", legacyIds: ["item:item_x:0"], source: "专注药剂", label: "+2 检定，可消耗使用", value: 2, consume: true }
  ],
  availableCompanionModifiers: [
    { id: "companion:ally_silas", source: "塞拉斯的专业背书", label: "DC -2，使用后消耗", dcDelta: -2, consume: true }
  ],
  selectedItemModifierIds: ["item:item_x"],
  selectedCompanionResourceIds: [],
  stakes: "失败可能导致：对方提出条件",
  risks: ["对方提出条件", "需要交出筹码或人情"],
  createdAt: 1710000000000
}
```

`pendingCheck` 由 AI 回复末尾的 `[check:属性|DC]` 创建，后续也可以由本地行动裁决创建。`itemModifiers` 是会自动进入检定修正的装备或非消耗任务物品；`availableItemModifiers` 和 `availableCompanionModifiers` 是可点选资源。玩家点选资源，或在主输入框输入“投入资源名 / 不用资源名 / 请某人帮忙”后，再点击“掷骰”或输入“掷骰”，系统会把所选加成/DC 调整写入 `type: "check"` 的结果消息，扣除消耗并清空 `pendingCheck`，然后 DM 根据结果继续叙事。消耗品资源 ID 必须基于物品 `id` 或名称保持稳定；旧存档中的 `item:xxx:序号` 形式可通过 `legacyIds` 或旧 ID 前缀兼容识别，但新选择应写入稳定 ID。

检定结算是一个有序事务：先写入检定结果和资源消耗，再结算挑战、反制与持续后果，最后才允许因背包腾位而静默重试已完成任务的待领奖励。任一步骤把 `scene.gameState` 改为 `defeated` 或 `victorious` 后，后续挑战奖励、反制解除、后果解除、补领奖励和回合推进都必须停止。

### Clock

```js
{
  id: "clock_main_pressure",
  name: "主线压力",
  tag: "main",
  value: 2,
  max: 6,
  visibility: "hinted",       // hidden | hinted | known
  description: "潜在危机正在酝酿",
  trigger: { at: 4, event: "敌方开始公开行动" },
  firedTriggers: [],
  updatedAt: 1710000000000
}
```

`WorldEngine.applyClockUpdate()` 支持 `value`、`delta`、`visibility`、`trigger`。跨过 `trigger.at` 时会插入公开或模糊系统事件。

### CounterStrategy

```js
{
  id: "counter_...",
  title: "有人在调查你",
  actorId: "char_xxx",
  actorName: "审判官塞拉斯",
  target: "追踪玩家接触过的证人",
  status: "active",           // active | revealed | resolved
  visibility: "hinted",       // hidden | hinted | known
  progress: 30,
  exposure: 20,
  counterplay: ["反跟踪", "直接对质"],
  hint: "你注意到证人变得紧张",
  lastAction: "派人盘问证人",
  resolvedAt: 0,
  resolution: ""
}
```

`active` 和 `revealed` 都表示反制仍会带来压力；`revealed` 代表玩家已经识别来源，可以更明确地采取反制行动。相关观察、调查、试探、谈判或潜入检定达到部分成功以上时，系统会按 `counterplay/title/target/hint` 匹配并揭示、削弱或解决反制。`resolved` 反制不会再进入行动风险、右侧局势压力或失败触发。

### MessageVisibility

```js
message.visibility = {
  locationId: "bridge",
  participants: ["char_a"],
  overheardBy: [],
  public: false
}
```

`PromptBuilder` 会通过 `WorldEngine.filterMessagesForCharacter()` 只把当前 NPC 可见的历史注入 prompt。旧消息没有 `visibility` 时按可见处理，保证旧存档兼容。

### CharacterDiscovery

```js
scene.discoveries.characters["char_xxx"]["secret_0_abcd"] = {
  state: "hinted",               // locked | hinted | suspected | confirmed
  evidence: ["观察到义眼延迟"],
  discoveredAt: 1710000000000
}
```

### Faction

```js
{
  name: "审判庭",
  attitude: -20,
  power: 90,
  description: "帝国秘密警察",
  leverage: ["处决权", "审讯记录"]
}
```

`factionsUpdate` 补丁可以新增或更新势力；单条补丁最多 20 条，场景最多 40 个势力，名称/描述/筹码会截断，筹码列表会去重，变化写入 `eventLog.progress` 并提示右侧局势。

### StoryArc

```js
{
  title: "混沌渗透之谜",
  phase: "intro",
  synopsis: "铁誓号上潜伏着混沌腐蚀的源头...",
  beats: [
    {
      condition: "玩家获得塞拉斯的初步信任",
      action: "reveal:货舱异形遗物最近发出低语"
    }
  ],
  currentBeat: 0
}
```

`currentBeat` 由 `WorldEngine.applyStoryArcUpdate()` 通过 `<state_update>.storyArcUpdate` 半自动推进。推进规则：

- `advance`、`advanceBy` 或提高 `currentBeat` 时必须提供 `reason`。
- 非结局阶段一次最多推进 1 个 beat；`advanceBy` 大于 1 或直接跳 `currentBeat` 会被本地规则夹到下一步。
- `phase: "resolution"` 代表明确结局阶段，可以一次收束到最终 beat。
- 成功推进会写入 `eventLog` 的 `progress` 事件，并把当前局势最近风险标记为“剧情推进”。

## 四、角色结构

角色存储在 IndexedDB `characters` object store 中，`scene.characters` 只保存 id 引用。

```js
{
  id: "char_...",
  name: "审判官塞拉斯",
  avatar: "",
  _emoji: "🔥",
  description: "角色背景",
  personality: "性格",
  first_mes: "开场白",
  mes_example: "<START>...",
  scenario: "场景设定",
  system_prompt: "额外设定",
  post_history_instructions: "回复要求",
  tags: ["审判官", "权威"],
  creator: "",
  character_version: "1.0",
  extensions: {},

  _relations: {
    "旅人": {
      affection: 0,
      trust: 0,
      suspicion: 0,
      mood: "平静",
      history: [
        {
          timestamp: 1710000000000,
          delta: 2,
          mood: "开心",
          reason: "玩家表达感谢"
        }
      ]
    }
  },
  _emotionTags: ["怀疑", "愤怒", "冷静"],
  _talkativeness: 0.6,
  _priority: 0,

  motives: ["根除混沌腐蚀"],
  fears: ["船上存在无法审判的力量"],
  secrets: ["机械义眼记录到异常影像"],
  leverage: ["处决权", "航行日志"],
  creed: "帝皇的意志高于一切。",
  redLines: ["绝不宽恕确认的异端"],
  values: "职责 > 帝国的存亡 > 正义 > 仁慈",
  profile: {
    public: {
      title: "审判官",
      firstImpression: "冷酷、权威、正在审视你"
    },
    hiddenFacts: [
      {
        id: "secret_0_abcd",
        type: "secret",
        title: "未公开秘密",
        hint: "这个角色似乎隐瞒了某件重要的事。",
        truth: "机械义眼记录到异常影像",
        unlock: { trust: 30, check: { stat: "感知", dc: 16 } }
      }
    ]
  }
}
```

关键规则：

- `creed`、`redLines`、`values` 是人格锚点，`PromptBuilder.buildCreedBlock()` 会以高优先级注入。
- `motives`、`fears`、`secrets`、`leverage` 属于 NPC 私密设定，用于扮演和计策裁决，不等于玩家已知。
- `profile.public` 是玩家初见可见档案；`profile.hiddenFacts` 需要通过 `knowledgeAdd` / `discoveryUpdate` 逐步解锁。
- 旧角色或生成角色缺少 `profile.public.firstImpression` 时，UI/生成器应显示非剧透占位或标签化印象，不应从完整 `description` 摘取公开印象。
- `_relations[userName]` 由 `Relationship` 和 `characterUpdates` 补丁维护；旧字段 `relationshipUpdate` 仅作为兼容别名。公开的关系/心情变化会进入事件日志，但 `secret` 仍属于 NPC 私密设定，不会因为关系补丁自动展示给玩家。关系补丁会对筹码、共同记忆、心情和秘密做截断去重：单角色单次最多追加 8 条筹码、8 条共同记忆和 1 条秘密，列表只保留最近上限。
- 普通玩家详情页不显示完整角色卡或编辑入口；只有 `State.canShowDebugSpoilers()` 为 true 时才显示作者/调试剧透入口。该开关支持 `?debug=1`、`?spoilers=1`、`localStorage.tavern_show_character_spoilers=1`、`localStorage.tavern_debug=1` 或运行时 settings 标记。
- 动态新角色由 `[new_char:...]` 创建，标记先经 `PromptGuard` 裁剪字段，再由 `WorldEngine.addExistingCharacterToScene()` 加入当前场景；结局后、重复姓名或场景角色过多时不会加入。`[char_exit:]` 由 `WorldEngine.removeCharacterFromScene()` 结算并写入事件日志。动态角色默认字段较少，不会自动生成信条和谋略素材，也不会绕过玩家知识解锁直接公开私密设定。
- 手动创建、导入或删除角色卡如果会影响当前场景的 `scene.characters`，必须通过 `State.addCharacterToScene()` / `State.removeCharacterFromScene()`，再由 `WorldEngine` 执行结局锁、去重、数量限制和事件留痕；已结束冒险中的在场角色不能被增删。
- PNG 角色卡内嵌世界书只有在角色成功加入当前场景后才会合并到 `scene.lorebookEntries`；如果结局锁或去重规则阻止入场，导入仍可保存为全局角色卡，但不会修改当前回顾场景。

## 五、消息类型

基础消息结构：

```js
{
  id: "msg_...",
  role: "user",              // user | assistant
  characterId: "char_...",   // assistant 角色发言时可有
  content: "消息正文",
  type: "talk",
  emotion: "happy",
  timestamp: 1710000000000,
  checkData: null
}
```

已使用的 `type`：

| type | 产生方式 | 说明 |
|------|----------|------|
| `talk` | 默认对话 | 普通角色发言 |
| `action` | 动作文本、移动/事件插入 | 玩家动作或系统动作事件 |
| `strategy` | `/strategy` 或 `（计策）` | 玩家计策意图，prompt 前缀为 `[玩家计策意图]` |
| `ooc` | `/ooc` / `(OOC)` / `（OOC）` | 出戏说明 |
| `narrate` | DM 旁白、地点描述、退场 | 第三人称叙事 |
| `check` | 玩家点击检定卡“掷骰”或输入“掷骰” | 检定结果消息，带 `checkData` |
| `system` | 关系/奖励/伤害等系统反馈 | UI 系统消息 |
| `divider` | 世界初始化 | “故事开始”等分割线 |
| `gameover` | HP 归零或 `failureStates` 触发 | 失败结局 |
| `victory` | 主线任务全完成 | 胜利结局 |

`checkData` 结构：

```js
{
  statName: "力量",
  key: "strength",
  roll: 18,
  mod: 3,
  total: 21,
  dc: 15,
  success: true,
  crit: null,                 // success | fail | null
  outcome: "success",         // critical_success | success | partial | fail | critical_fail
  resultLabel: "成功",
  consequenceHint: "目标按预期达成，后果与代价保持合理。",
  consequenceOptions: ["目标按预期推进"],
  selectedBonus: 2,
  dcDelta: -1,
  riskDelta: -4,
  resourceModifiers: [
    { source: "苏珊的体检背书", label: "DC -2，使用后消耗", kind: "companion" }
  ],
  stakes: "失败可能导致：对方提出条件",
  risks: ["对方提出条件"]
}
```

结果卡只展示实际生效的 `itemModifiers` / `resourceModifiers`；`availableItemModifiers` 和 `availableCompanionModifiers` 属于 pending check UI，不应用作通关记录或结果回放中的“已投入资源”。

## 六、持久化边界

IndexedDB：

- DB 名称：`tavern_db`
- 版本：`1`
- stores：`characters`、`scenes`、`settings`、`snapshots`

保存规则：

- 角色通过 `Storage.saveCharacter(char)` 独立保存。
- 场景通过 `Storage.saveScene(scene)` 保存，自动刷新 `updatedAt`。
- 高频消息写入使用 `State.saveCurrentSceneDebounced()`。
- 导入/导出走 `Storage.exportAll()` / `Storage.importAll()`，包含 `settings`，导出前应注意 API key 风险。

## 七、agent 写入建议

外部 agent 不应直接覆盖整个 `scene`。推荐写入路径：

1. 普通剧情推进：追加 `messages`。
2. UI 可识别事件：使用方括号标记（见 `API_PROTOCOL.md`）。
3. 计策、情报、势力、关系、地点、物品轻量更新：使用 `<state_update>` 白名单补丁。势力/公开关系变化会进入事件日志；隐藏秘密必须通过 `knowledgeAdd` / `discoveryUpdate` 解锁后才算玩家已知。
4. 玩家核心状态（HP、金币、经验、任务完成）优先使用已有标记，而不是 state_update。

禁止通过 agent 修改：

- `settings`、`apiKey`
- 任意 DOM/HTML 字符串绕过 `Renderer`
- 玩家属性、HP、等级等核心数值的任意覆盖
- 不在白名单内的嵌套字段
- `<state_update>` 清洗层会递归移除敏感键、原型污染键和非白名单顶层字段，并限制异常数组、对象和长字符串。
