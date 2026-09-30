# dsh-turn-usage-toast

每一轮（Turn）完成后，在页面右下角弹出一个全局 toast，显示本轮使用的模型名和消耗的 token 数，6 秒后自动消失。

## 技术选型

| 维度 | 选型 | 说明 |
| --- | --- | --- |
| 宿主侧 | 空实现插件（index.js） | `apply()` 不做任何事，只为让包解析成真实 Host 插件 |
| 浏览器侧 | DSH 浏览器插件（client.js） | 经 `window.__ModuleLoader__` 加载 |
| 挂载机制 | 槽位 `conversation.composer.dock` | 会话级座位，向 occupant 提供 `useChat` |
| 渲染 | React + react-dom `createPortal` | 卡片画到 `document.body`，相对视口定位 |
| 数据来源 | Chat 快照里 `turn-tail` 节点的 `tokenUsage` | provider 精确计量，非估算 |

## 核心流程

### 阶段一：注册与挂载

1. 宿主侧执行空 `apply()`，不做任何事（仅为包结构占位）
2. 浏览器侧向 `window.__ModuleLoader__` 加载本模块（id = `@local/dsh-turn-usage-toast`）
3. 注册 locale 命名空间 `turn-usage-toast`（中文 close=关闭、英文 close=Close）
4. 往槽位 `conversation.composer.dock` 注入一个 occupant（order=10，渲染组件 TurnUsageToast）

### 阶段二：取数（拿到本轮结算）

5. occupant 用 `useChat` 订阅活跃会话的 Chat 快照
6. 从快照取 `timeline.turnOrder`（全部轮次顺序）
7. 从最后一轮开始往前（倒序）逐轮遍历
8. 每轮用 `locations` 取出该轮全部节点 key
9. 从最后一个 key 往前找，命中 `kind === 'turn-tail'` 的节点即取其 `data`（含路由 model + tokenUsage 精确计量）
10. 找到则返回该轮结算数据；全部没找到返回 undefined

### 阶段三：判定是否该弹

11. 首次挂载先「认领」当前已结算轮次——有 token 就记为已见，没 token 留空（避免页面刷新被当成「新完成一轮」）
12. 该轮 token 还没结算（usage 为空）→ 不弹，等结算数据到
13. 该轮 turn 等于已见过的 turn → 不重复弹
14. 否则：把该 turn 记为已见，重置 hover 状态，把 usage 存进 shown 状态

### 阶段四：渲染卡片

15. 从 `usage.routes` 逐个取 model，用 `", "` 拼成模型名（无路由则隐藏模型行）
16. token 数按量级选单位：< 1 万用精确值 + 单位 tok；≥ 1 万除 10000 + 单位万
17. ≥ 1 万时：保留两位小数并去掉尾零（1.00→1、1.20→1.2）
18. 用 `createPortal` 把卡片画到 `document.body`（fixed 右下角、z-index=2147483000、role=status）

### 阶段五：自动消失

19. 卡片显示后启动 6 秒定时器（VISIBLE_MS=6000）
20. 鼠标悬停卡片时暂停倒计时，移出后恢复
21. 到点或点 × 关闭按钮 → shown 置空，卡片消失

## 配置项（内置常量，非用户可配）

| 常量 | 值 | 作用 |
| --- | --- | --- |
| SLOT | `conversation.composer.dock` | 挂载槽位 |
| order | 10 | 槽位内排序 |
| VISIBLE_MS | 6000 | 卡片自动消失时长（毫秒） |
| Z_INDEX | 2147483000 | 卡片层级，高于 shell.overlay |
| WAN | 10000 | 万单位阈值 |
| locale NS | `turn-usage-toast` | 文案命名空间 |

## 关键设计点

- **宿主侧空实现**：toast 要显示的模型名和 token 数本就在浏览器快照里，宿主插件无需额外贡献，纯为包结构占位。
- **倒序查找 turn-tail**：从最新轮往前、每轮从最后节点往前，找到第一个 `kind === 'turn-tail'` 节点即结算数据，自动跳过未完成节点。
- **首次挂载认领**：已结算轮次不弹（页面加载 ≠ 完成一轮）；但在途/未结算轮次不认领，避免吞掉安装后的第一轮。
- **token 来源是 provider 精确计量**（`tokenUsage`），非本地估算。
- **万单位格式化去尾零**：10000 显示「1万」而非「1.00万」。
- **portal 到 document.body + 主题变量**（`var(--dsw-alias-*)`）：相对视口定位，明暗主题自适应。
