// 手动执行迁移脚本
import { config } from "dotenv"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import * as fs from "fs"
import * as path from "path"
import { fileURLToPath } from "url"
import { dirname } from "path"

// 加载环境变量
config()

// ESM __dirname替代
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const DATABASE_URL = process.env.DATABASE_URL

if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set")
  process.exit(1)
}

async function runMigration() {
  const sql = postgres(DATABASE_URL!, { max: 1 })
  const db = drizzle(sql)

  // 读取最新的迁移文件
  const migrationFile = path.join(
    __dirname,
    "migrations",
    "0008_bitter_imperial_guard.sql"
  )
  const migrationSQL = fs.readFileSync(migrationFile, "utf-8")

  // 分割SQL语句
  const statements = migrationSQL
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)

  console.log(`Running ${statements.length} SQL statements...`)

  for (const statement of statements) {
    try {
      await sql.unsafe(statement)
      console.log("✓", statement.substring(0, 60) + "...")
    } catch (error: any) {
      console.error("✗", statement.substring(0, 60) + "...")
      console.error("Error:", error.message)
      // 继续执行其他语句,允许部分失败(如字段已存在)
    }
  }

  await sql.end()
  console.log("\nMigration completed!")
}

runMigration().catch(console.error)
