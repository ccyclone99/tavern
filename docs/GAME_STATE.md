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
  inputMode: "action",       // action | strategy | ask | ooc
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

  strategies: [],
  intel: [],
  factions: [],
  conflictSeeds: [],
  worldTension: 0,
  activeStrategyId: null,

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
| `summary` | string | 自动摘要后的先前剧情，prompt 注入上限约 1200 字 |
| `strategies` | Strategy[] | 计策卡列表 |
| `intel` | Intel[] | 已知情报 |
| `factions` | Faction[] | 势力态势 |
| `conflictSeeds` | string[] | 世界矛盾种子 |
| `worldTension` | number | 世界紧张度，prompt 以 `/100` 展示 |
| `activeStrategyId` | string/null | 当前激活计策 |
| `createdAt` / `updatedAt` | number | 毫秒时间戳 |
| `snapshots` | array | 存档快照预留字段 |

`State.normalizeScene(scene)` 会为旧存档补齐以上字段。新增字段必须在 `normalizeScene()` 中提供兼容默认值。

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
  reward: "金币x100,经验x50,短剑x1"
}
```

主线任务全部 `completed` 后，`GroupChat._checkVictory()` 会把 `scene.gameState` 设为 `victorious` 并插入胜利消息。

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

`MapView.moveTo()` 只允许移动到当前地点 `connections` 中的相邻节点。`locationUpdate` 补丁可以新增地点或更新 `name`、`description`、`alertLevel`。

### Item

```js
{
  id: "item_...",
  name: "假账本",
  description: "可用于栽赃的账本",
  type: "quest",             // weapon | armor | consumable | quest | misc
  quantity: 1,
  equipped: false
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

`weapon`、`armor` 进入对应槽，其它类型默认进入 `accessory` 槽。

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
  stakes: "失败会暴露玩家身份",
  latestOutcome: "商会开始怀疑城卫",
  createdAt: 1710000000000,
  updatedAt: 1710000000000
}
```

`StrategyManager.normalizeStrategy()` 会修正非法 `status`、`phase`，并夹紧 `risk`/`progress` 到 0-100。

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

当前实现只把剧情弧注入 prompt，引导 AI 按节拍推进；`currentBeat` 尚未由系统自动更新。agent 如果要严格推进剧情弧，需要在外部模拟层维护 beat 进度。

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
  values: "职责 > 帝国的存亡 > 正义 > 仁慈"
}
```

关键规则：

- `creed`、`redLines`、`values` 是人格锚点，`PromptBuilder.buildCreedBlock()` 会以高优先级注入。
- `motives`、`fears`、`secrets`、`leverage` 用于计策和谈判，不应全部对玩家明示。
- `_relations[userName]` 由 `Relationship` 和 `characterUpdates` 补丁维护。
- 动态新角色由 `[new_char:...]` 创建，默认字段较少，不会自动生成信条和谋略素材。

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
| `check` | `[check:]` 自动投骰 | 检定结果消息，带 `checkData` |
| `system` | 关系/奖励/伤害等系统反馈 | UI 系统消息 |
| `divider` | 世界初始化 | “故事开始”等分割线 |
| `gameover` | HP 归零 | 失败结局 |
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
  crit: null                 // success | fail | null
}
```

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
3. 计策、情报、势力、关系、地点、物品轻量更新：使用 `<state_update>` 白名单补丁。
4. 玩家核心状态（HP、金币、经验、任务完成）优先使用已有标记，而不是 state_update。

禁止通过 agent 修改：

- `settings`、`apiKey`
- 任意 DOM/HTML 字符串绕过 `Renderer`
- 玩家属性、HP、等级等核心数值的任意覆盖
- 不在白名单内的嵌套字段
