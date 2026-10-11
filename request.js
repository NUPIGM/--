const fs = require("fs");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const START_TOPIC_ID = 16869510; //【16869511-16934130】;
const END_TOPIC_ID = 16934130; // 你自己设置范围，包含这个值
const OUTPUT_DIR = "./out";
const DB_PATH = path.join(OUTPUT_DIR, "topics.db");
const REQUEST_DELAY_MS = 200;
const MAX_RETRIES = 3;
const CONCURRENCY = 5; // 并发数，控制同时发起的请求数量

function logProgress(current, total) {
  const percent =
    total === 0 ? 100 : Math.min(100, Math.round((current / total) * 100));
  console.log(`进度: ${current}/${total} (${percent}%)`);
}

function safeParseJson(str) {
  if (typeof str !== "string") return str;

  try {
    return JSON.parse(str);
  } catch {
    return str;
  }
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ensureOutputDir() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

async function initDatabase() {
  ensureOutputDir();

  const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
      throw err;
    }
  });

  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run(
        `CREATE TABLE IF NOT EXISTS topic_records (
          topic_id INTEGER PRIMARY KEY,
          result INTEGER,
          is_error INTEGER DEFAULT 0,
          status INTEGER,
          payload TEXT,
          error_msg TEXT,
          created_at TEXT
        )`,
        (err) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(db);
        },
      );
    });
  });
}

function saveRecord({
  topicId,
  result,
  isError = false,
  status = null,
  payload = null,
  errorMsg = null,
}) {
  const createdAt = new Date().toISOString();
  const db = global.__TOPIC_DB__;

  return new Promise((resolve, reject) => {
    db.run(
      `INSERT OR REPLACE INTO topic_records (topic_id, result, is_error, status, payload, error_msg, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        topicId,
        result === undefined || result === null
          ? null
          : Number(Boolean(result)),
        isError ? 1 : 0,
        status,
        payload === undefined || payload === null
          ? null
          : JSON.stringify(payload),
        errorMsg,
        createdAt,
      ],
      function (err) {
        if (err) {
          reject(err);
          return;
        }
        resolve(this.lastID ?? topicId);
      },
    );
  });
}

async function requestTopic(topicId) {
  const myHeaders = new Headers();

  myHeaders.set("Cookie", "companyId=171466; schoolId=175459");
  myHeaders.set(
    "Content-Type",
    "application/x-www-form-urlencoded; charset=UTF-8",
  );
  myHeaders.set("Pragma", "no-cache");
  myHeaders.set("Sec-Fetch-Site", "same-origin");
  myHeaders.set("Accept-Language", "zh-CN,zh-Hans;q=0.9");
  myHeaders.set("Sec-Fetch-Mode", "cors");
  myHeaders.set("Origin", "https://www.fjsdaxh.com");
  myHeaders.set("Referer", "https://www.fjsdaxh.com/usersCenter");
  myHeaders.set("Sec-Fetch-Dest", "empty");
  myHeaders.set("X-Requested-With", "XMLHttpRequest");
  myHeaders.set("Priority", "u=3, i");
  myHeaders.set(
    "User-Agent",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0 Safari/605.1.15",
  );

  const body = new URLSearchParams({
    topicId: String(topicId),
    exerciseId: "0",
  }).toString();

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch("https://www.fjsdaxh.com/resolve/selTopic", {
        method: "POST",
        headers: myHeaders,
        body,
        redirect: "follow",
        credentials: "include",
      });

      const text = await response.text();

      if (!response.ok) {
        console.log(
          `topicId=${topicId} 第 ${attempt}/${MAX_RETRIES} 次请求失败，HTTP状态=${response.status}:`,
          text,
        );

        if (attempt < MAX_RETRIES) {
          await sleep(REQUEST_DELAY_MS);
          continue;
        }

        await saveRecord({
          topicId,
          result: null,
          isError: true,
          status: response.status,
          payload: { body: text },
          errorMsg: "HTTP not ok",
        });
        console.log(`topicId=${topicId} 请求最终失败，已写入 SQLite`);
        return null;
      }

      const parsed = safeParseJson(text);
      await saveRecord({
        topicId,
        result: parsed && typeof parsed === "object" ? parsed.result : null,
        isError: false,
        status: response.status,
        payload: parsed,
      });
      await sleep(REQUEST_DELAY_MS);
      return parsed;
    } catch (error) {
      console.log(
        `topicId=${topicId} 第 ${attempt}/${MAX_RETRIES} 次请求异常:`,
        error,
      );

      if (attempt < MAX_RETRIES) {
        await sleep(REQUEST_DELAY_MS);
        continue;
      }

      await saveRecord({
        topicId,
        result: null,
        isError: true,
        errorMsg: error && error.message ? error.message : String(error),
      });
      console.log(`topicId=${topicId} 请求最终失败，已写入 SQLite`);
      return null;
    }
  }

  return null;
}

(async () => {
  try {
    global.__TOPIC_DB__ = await initDatabase();

    if (START_TOPIC_ID > END_TOPIC_ID) {
      console.log("开始 topicId 大于结束 topicId，跳过执行");
      return;
    }

    const total = END_TOPIC_ID - START_TOPIC_ID + 1;
    let completed = 0;
    let nextTopicId = START_TOPIC_ID;
    const workers = Array.from(
      { length: Math.min(CONCURRENCY, total) },
      async () => {
        while (nextTopicId <= END_TOPIC_ID) {
          const topicId = nextTopicId;
          nextTopicId += 1;
          await requestTopic(topicId);
          completed += 1;
          if (completed % 200 === 0 || completed === total) {
            logProgress(completed, total);
          }
        }
      },
    );

    await Promise.all(workers);
    console.log("全部请求完成");
  } catch (error) {
    console.error("初始化数据库或执行任务失败:", error);
    process.exitCode = 1;
  } finally {
    if (global.__TOPIC_DB__) {
      global.__TOPIC_DB__.close();
    }
  }
})();
