# shunliuzx_web

Personal website for shunliuzx.com.

Routes:

- `/`
- `/quotes/`
- `/schedule/`
- `/blog/`
- `/review/` admin only
- `/rings/` multiplayer text deduction game

`/status/` is deprecated and hidden from navigation.

Cloud data setup:

1. Create a Cloudflare D1 database named `shunliuzx_site`.
2. Apply `schema.sql` to the database.
3. In the Pages project, bind the D1 database as `SITE_DB`.
4. Add environment variables:
   - `ADMIN_PASSWORD`
   - `SESSION_SECRET`
5. Redeploy the Pages project.

If the database already exists, run the `review_subjects` and `review_days`
statements from `schema.sql` to enable the review planner.

## 环中推理（文字版）

入口：`/rings/`。沿用 Cloudflare Pages Functions 和已有的 `SITE_DB` 绑定。
首次创建房间时仅自动建立新的 `rings_rooms` 表，不修改现有网站的表。
不需要新的环境变量、付费服务或构建步骤；需确保 Pages 已绑定可用的 D1 数据库。

- 竞技模式 3–6 人：创建者是全知者，其他人为猜测者。
- 全知者抽取或编辑属性、英文词汇、情境三条规则，从 5 张开局牌中放置 3 张线索。
- 猜测者每人 5 张牌，选牌再选棋盘区域，全知者确认或纠正。
- 正确则继续，错误则摸 1 张并换人；清空手牌获胜，结束后揭晓规则。
- 内置 180 张自编英中双语物品牌和 36 条自编规则，没有官方插画或整套官方牌组。
- 英文牌名是词汇规则的判断依据，中文仅辅助理解。没有自动语义判定。
- 同一标签页保存身份令牌并可刷新恢复；服务器保存权威状态。新标签页可能复制原标签页的会话，测试不同角色时请从新窗口或独立浏览器加入。
- 每个房间创建后存续 24 小时。结束前成员不能退出或替换；关闭页面后可在原标签页恢复。全知者暂时离线时游戏等待其返回。
- 初版不支持双人合作、观战、图片导入、多人匹配。牌堆用尽时本局结束且没有获胜者。
- 房间码用于邀请，勿在公开渠道分享仍在准备阶段的房间码。

开发：`node scripts/rings-local.mjs`，访问输出的本地地址。
本地预览用单独的临时文件保存房间；生产只使用 D1。
检查：`node --test tests/rings.test.mjs`。

### 房间导入文字牌组

全知者在准备阶段使用“导入文字牌组”选择 JSON 文件。可先下载 `/rings/sample-pack.json` 作为格式示例。必填 `name`（最多 80 字符）和 `cards`（30–500 张），每张 `{ "en": "WINDOW", "zh": "窗户" }`；英文保留原牌拼写，中文可省略。不接受大小写相同的重复英文名称。

可选 `rules` 包含 `attribute`、`word`、`context` 三个数组，每条规则为 `{ "en": "...", "zh": "..." }`。提供时每类 1–100 条，文本各不超过 200 字符。随机抽规则、开始和下一局均使用本房间导入的牌组。未提供规则牌时，全知者可手动填写规则。文件最多 200 KB。

原版牌面图片已作为网站静态资源接入；文字牌组导入格式仍不包含图片。导入的文字会保存到本房间的服务器状态并发送给房间参与者，房间 24 小时过期，过期数据在下次创建房间时清理。网页的导入功能不等于素材使用授权。

棋盘直接显示已判定物品牌的英文和中文；待判定出牌以黄色标出，纠正后移动到实际区域。区域内可滚动查看多张牌，手机可横向滚动棋盘。

### 默认工坊文字牌组与抽取方式

默认物品牌为 270 张（含 Pop Culture Promo Pack），属性、词汇、情境规则各 24 张，共 72 张。`functions/_rings-workshop.js` 记录原牌编号、英文牌面和中文辅助翻译。转录来自 13 张本地牌面图，并对照全部 342 个原牌编号；没有缺项或重复物品名。多义词按插图核对，例如 BAT 为棒球棒、MARBLE 为弹珠，保留 I.D.、MJÖLNIR、CHOCOLATES、YOYO 等原牌拼写。英文标点采用可读的 Unicode 排版，未改变规则含义。

来源：[Things in Rings [Scripted]](https://steamcommunity.com/sharedfiles/filedetails/?id=3573400283)，工坊作者 Malixx；设计 Peter C. Hayward、美术 Snow Conrad、出版 Allplay。工坊页面明确说明为非官方模组、权利仍归原作，没有声明开源许可。可下载不等于开源授权。此处为工坊文字及图片牌面的接入，不声明原作素材为本项目原创或获得新的开源许可。中文仅辅助理解，真人全知者按英文和物品含义判定。

每房间维护三副规则牌堆。创建房间、重新抽取、准备下一局时各抽一条；每类抽完 24 条前不重复，抽完重新洗牌，避免新一轮首张等于上一轮末张。抽取进度保存于房间状态，刷新不会重置。导入牌组遵循相同规则，单条规则的类别只能重复。手动编辑规则不会消耗牌堆。已有游戏保留原牌与规则，新房间或恢复工坊牌组使用本版本。

物品牌每局洗牌后发牌和摸牌，同局不放回；新局重新洗牌，跨局可能出现相同物品。

### 原版图片牌面

`rings/card-faces/` 包含从已下载工坊图集中按原牌编号裁出的 342 张 WebP（270 张物品牌、72 张规则牌），英文牌名与裁图共用原牌编号。物品牌缩放至 320×488，规则保留约 254×386。手牌显示原版牌面；棋盘词语旁有可放大的缩略图，待判定牌和原版规则也能查看大图。自定义文字牌仍可正常使用；手动修改成非原版文本的规则不显示原牌图片。图片与原游戏权利仍归原作者、出版社，不声称开源授权。
