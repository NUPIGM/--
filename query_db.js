const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const DB_PATH = path.join(__dirname, "out", "topics.db");

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    result: null,
    isError: null,
    limit: 20,
    order: "topic_id",
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    const next = args[i + 1];

    if (arg === "--result") {
      options.result = next;
      i += 1;
    } else if (arg === "--is-error") {
      options.isError = next;
      i += 1;
    } else if (arg === "--limit") {
      options.limit = Number(next) || 20;
      i += 1;
    } else if (arg === "--order") {
      options.order = next || "topic_id";
      i += 1;
    }
  }

  return options;
}

function openDb() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(db);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    openDb()
      .then((db) => {
        db.all(sql, params, (err, rows) => {
          db.close();
          if (err) {
            reject(err);
            return;
          }
          resolve(rows);
        });
      })
      .catch(reject);
  });
}

async function main() {
  try {
    const options = parseArgs();
    const conditions = [];
    const params = [];

    if (options.result !== null) {
      conditions.push("result = ?");
      params.push(Number(options.result));
    }

    if (options.isError !== null) {
      conditions.push("is_error = ?");
      params.push(Number(options.isError));
    }

    const whereClause = conditions.length
      ? `WHERE ${conditions.join(" AND ")}`
      : "";
    const total = await all(
      `SELECT COUNT(*) AS count FROM topic_records ${whereClause}`,
      params,
    );

    const rows = await all(
      `SELECT topic_id, result, is_error, status, payload, error_msg, created_at
       FROM topic_records ${whereClause}
       ORDER BY ${options.order} ASC
       LIMIT ?`,
      [...params, Number(options.limit)],
    );

    console.log("数据库文件:", DB_PATH);
    console.log("筛选条件:", {
      result: options.result,
      isError: options.isError,
      limit: options.limit,
    });
    console.log("符合条件总数:", total[0].count);
    console.log("查询结果:", JSON.stringify(rows, null, 2));

    const summary = await all(
      `SELECT
        SUM(CASE WHEN result = 1 THEN 1 ELSE 0 END) AS success_count,
        SUM(CASE WHEN is_error = 1 THEN 1 ELSE 0 END) AS error_count,
        SUM(CASE WHEN result = 0 THEN 1 ELSE 0 END) AS false_count
      FROM topic_records ${whereClause}`,
      params,
    );
    console.log("汇总:", JSON.stringify(summary[0], null, 2));
  } catch (error) {
    console.error("读取数据库失败:", error);
    process.exitCode = 1;
  }
}

main();
