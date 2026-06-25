const sqlite3 = require("sqlite3");
const { open } = require("sqlite");
const fs = require("fs");
const path = require("path");

let db;

async function initDatabase() {
  db = await open({
    filename: path.join(__dirname, "..", "hilfarm.db"),
    driver: sqlite3.Database
  });

  await db.exec("PRAGMA foreign_keys = ON;");
  await db.exec("PRAGMA journal_mode = WAL;");

  const initSqlPath = path.join(__dirname, "..", "sql", "init.sql");
  const initSql = fs.readFileSync(initSqlPath, "utf8");

  await db.exec(initSql);

  console.log("SQLite database ready");

  return db;
}

function getDatabase() {
  if (!db) {
    throw new Error("Database not initialized");
  }

  return db;
}

module.exports = {
  initDatabase,
  getDatabase
};