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
