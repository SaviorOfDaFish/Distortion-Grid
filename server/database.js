import pg from "pg";

const { Pool } = pg;

let pool = null;
let ready = false;

function getPool() {
  if (pool) return pool;

  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured.");
  }

  pool = new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });

  pool.on("error", (error) => {
    ready = false;
    console.error("❌ PostgreSQL pool error:", error);
  });

  return pool;
}

export function todayMountainDate() {
  // Distortion Grid's daily boundary follows Mountain Time.
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Denver",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );

  return `${values.year}-${values.month}-${values.day}`;
}

export async function initDatabase() {
  const db = getPool();

  await db.query(`
    CREATE TABLE IF NOT EXISTS daily_attempts (
      id BIGSERIAL PRIMARY KEY,
      discord_user_id TEXT NOT NULL,
      attempt_date DATE NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('complete', 'incomplete')),
      grid_number INTEGER,
      difficulty TEXT,
      moves INTEGER,
      par INTEGER,
      perfect_min INTEGER,
      time_seconds INTEGER,
      rating TEXT,
      daily_rank INTEGER,
      completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (discord_user_id, attempt_date)
    )
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS daily_attempts_date_idx
    ON daily_attempts (attempt_date)
  `);

  ready = true;
  console.log("✅ PostgreSQL connected; daily_attempts table ready.");
}

export function isDatabaseReady() {
  return ready;
}

function normalizeAttempt(row) {
  if (!row) return null;

  return {
    status: row.status,
    date:
      row.attempt_date instanceof Date
        ? row.attempt_date.toISOString().slice(0, 10)
        : String(row.attempt_date).slice(0, 10),
    gridNumber: row.grid_number,
    difficulty: row.difficulty,
    moves: row.moves,
    par: row.par,
    perfectMin: row.perfect_min,
    seconds: row.time_seconds,
    scoreLabel: row.rating,
    rank: row.daily_rank,
    completedAt:
      row.completed_at instanceof Date
        ? row.completed_at.toISOString()
        : row.completed_at,
  };
}

export async function getDailyAttempt(discordUserId, attemptDate = todayMountainDate()) {
  const db = getPool();

  const result = await db.query(
    `
      SELECT *
      FROM daily_attempts
      WHERE discord_user_id = $1
        AND attempt_date = $2::date
      LIMIT 1
    `,
    [String(discordUserId), attemptDate]
  );

  return normalizeAttempt(result.rows[0]);
}

export async function recordDailyAttempt({
  discordUserId,
  status,
  gridNumber = null,
  difficulty = null,
  moves = null,
  par = null,
  perfectMin = null,
  seconds = null,
  rating = null,
  rank = null,
  attemptDate = todayMountainDate(),
}) {
  const db = getPool();

  const inserted = await db.query(
    `
      INSERT INTO daily_attempts (
        discord_user_id,
        attempt_date,
        status,
        grid_number,
        difficulty,
        moves,
        par,
        perfect_min,
        time_seconds,
        rating,
        daily_rank
      )
      VALUES (
        $1,
        $2::date,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9,
        $10,
        $11
      )
      ON CONFLICT (discord_user_id, attempt_date)
      DO NOTHING
      RETURNING *
    `,
    [
      String(discordUserId),
      attemptDate,
      status,
      gridNumber,
      difficulty,
      moves,
      par,
      perfectMin,
      seconds,
      rating,
      rank,
    ]
  );

  if (inserted.rows[0]) {
    return {
      inserted: true,
      attempt: normalizeAttempt(inserted.rows[0]),
    };
  }

  return {
    inserted: false,
    attempt: await getDailyAttempt(discordUserId, attemptDate),
  };
}

export async function deleteDailyAttempt(
  discordUserId,
  attemptDate = todayMountainDate()
) {
  const db = getPool();

  const result = await db.query(
    `
      DELETE FROM daily_attempts
      WHERE discord_user_id = $1
        AND attempt_date = $2::date
    `,
    [String(discordUserId), attemptDate]
  );

  return result.rowCount;
}
