# 题库抓取与查询工具

从 [fjsdaxh.com](https://www.fjsdaxh.com) 批量抓取题目作答结果，存入本地 SQLite 数据库，并提供命令行查询与统计。

## 目录结构

```
.
├── request.js      # 抓取脚本：按 topicId 区间请求接口，结果写入 out/topics.db
├── query_db.js     # 查询脚本：按条件查询/统计 out/topics.db
├── backup.sql      # 另一个无关库的结构与数据（auth 相关，供参考）
├── out/topics.db   # 抓取产物（SQLite，已被 .gitignore 排除，不纳入版本管理）
├── package.json
└── node_modules/
```

## 环境要求

- Node.js（>= 18，脚本使用了内置 `fetch`）
- 依赖：`sqlite3`

## 安装

```bash
npm install
```

## 使用方法

### 1. 抓取数据

```bash
node request.js
```

运行后会按 `topicId` 区间循环请求 `POST https://www.fjsdaxh.com/resolve/selTopic`，并把每条结果写入 `out/topics.db` 的 `topic_records` 表。

可在 `request.js` 顶部调整以下常量：

| 常量 | 默认值 | 说明 |
| --- | --- | --- |
| `START_TOPIC_ID` | `16869510` | 起始 topicId（含） |
| `END_TOPIC_ID` | `16934130` | 结束 topicId（含） |
| `CONCURRENCY` | `5` | 并发请求数 |
| `REQUEST_DELAY_MS` | `200` | 每次请求后的间隔（毫秒） |
| `MAX_RETRIES` | `3` | 单条请求最大重试次数 |
| `OUTPUT_DIR` | `./out` | 输出目录（自动创建） |

> 默认区间共约 6.4 万条，以并发 5、间隔 200ms 计，预计需要数小时，请保持网络通畅。

**关于登录态**：脚本通过请求头携带 `Cookie: companyId=171466; schoolId=175459`。如果接口开始返回未登录/失败结果，请用浏览器登录后把最新的 Cookie 填到 `request.js` 的 `myHeaders.set("Cookie", ...)` 处。

### 2. 查询数据

```bash
node query_db.js [选项]
```

所有结果字段说明：

- `result`：作答结果（`1` 正确，`0` 错误）
- `is_error`：是否为请求异常（`1` 是，`0` 否）

可用选项：

| 选项 | 默认值 | 说明 |
| --- | --- | --- |
| `--result <0\|1>` | 不限 | 只看作答结果为指定值的记录 |
| `--is-error <0\|1>` | 不限 | 只看请求成功/失败的记录 |
| `--limit <数量>` | `20` | 返回条数 |
| `--order <字段>` | `topic_id` | 排序字段（升序） |

示例：

```bash
# 查看全部统计与前 20 条
node query_db.js

# 只看作答错误的题目
node query_db.js --result 0

# 只看请求失败的记录，看 50 条
node query_db.js --is-error 1 --limit 50

# 按创建时间排序
node query_db.js --order created_at
```

每条记录包含字段：`topic_id`、`result`、`is_error`、`status`、`payload`（接口原始响应 JSON）、`error_msg`、`created_at`。

### 3. 导出 SQL 备份

```bash
sqlite3 out/topics.db .dump > dump.sql
```

## 说明

- `out/topics.db`、`dump.sql` 等生成物已在 `.gitignore` 中排除（体积超过 GitHub 100MB 限制），不会提交到仓库，本地妥善保管即可。
- `backup.sql` 与题库无关，是另一个 auth 相关库（users / refresh_tokens / rate_limits）的导出，仅作备份参考。
