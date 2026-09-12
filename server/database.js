import pg from "pg";

const { Pool } = pg;

let pool = null;
let ready = false;

function getPool() {
  if (pool) return pool;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not configured.");

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
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Denver",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const values = Object.fromEntries(
    parts.filter((p) => p.type !== "literal").map((p) => [p.type, p.value])
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
      status TEXT NOT NULL,
      grid_number INTEGER,
      difficulty TEXT,
      moves INTEGER,
      par INTEGER,
      perfect_min INTEGER,
      time_seconds INTEGER,
      rating TEXT,
      daily_rank INTEGER,
      completed_at TIMESTAMPTZ,
      started_at TIMESTAMPTZ,
      gameplay_started_at TIMESTAMPTZ,
      state_json JSONB,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (discord_user_id, attempt_date)
    )
  `);

  await db.query(`
    ALTER TABLE daily_attempts
      ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS gameplay_started_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS state_json JSONB,
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  `);

  await db.query(`ALTER TABLE daily_attempts ALTER COLUMN completed_at DROP NOT NULL`);
  await db.query(`ALTER TABLE daily_attempts DROP CONSTRAINT IF EXISTS daily_attempts_status_check`);
  await db.query(`
    ALTER TABLE daily_attempts
      ADD CONSTRAINT daily_attempts_status_check
      CHECK (status IN ('active', 'complete', 'incomplete'))
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS daily_attempts_date_idx
    ON daily_attempts (attempt_date)
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS player_profiles (
      discord_user_id TEXT PRIMARY KEY,
      tutorial_completed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  ready = true;
  console.log("✅ PostgreSQL connected; resumable daily_attempts table ready.");
}

export function isDatabaseReady() {
  return ready;
}

function normalizeAttempt(row, serverNow = new Date()) {
  if (!row) return null;

  const gameplayStart = row.gameplay_started_at ? new Date(row.gameplay_started_at) : null;
  const elapsedSeconds =
    gameplayStart && serverNow >= gameplayStart
      ? Math.max(0, Math.floor((serverNow - gameplayStart) / 1000))
      : 0;

  const studyRemainingSeconds =
    gameplayStart && serverNow < gameplayStart
      ? Math.max(0, Math.ceil((gameplayStart - serverNow) / 1000))
      : 0;

  return {
    status: row.status,
    date:
      row.attempt_date instanceof Date
        ? row.attempt_date.toISOString().slice(0, 10)
        : String(row.attempt_date).slice(0, 10),
    gridNumber: row.grid_number,
    difficulty: row.difficulty,
    moves: row.moves ?? 0,
    par: row.par,
    perfectMin: row.perfect_min,
    seconds: row.status === "active" ? elapsedSeconds : row.time_seconds,
    scoreLabel: row.rating,
    rank: row.daily_rank,
    startedAt: row.started_at ? new Date(row.started_at).toISOString() : null,
    gameplayStartedAt: gameplayStart ? gameplayStart.toISOString() : null,
    completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
    state: row.state_json || null,
    studyRemainingSeconds,
    serverNow: serverNow.toISOString(),
  };
}

export async function getDailyAttempt(discordUserId, attemptDate = todayMountainDate()) {
  const db = getPool();
  const result = await db.query(
    `SELECT * FROM daily_attempts
     WHERE discord_user_id = $1 AND attempt_date = $2::date
     LIMIT 1`,
    [String(discordUserId), attemptDate]
  );
  return normalizeAttempt(result.rows[0], new Date());
}

export async function startDailyAttempt({
  discordUserId,
  gridNumber,
  difficulty,
  par,
  perfectMin,
  moves = 0,
  state = null,
  studySeconds = 15,
  attemptDate = todayMountainDate(),
}) {
  const db = getPool();
  const study = Math.max(0, Math.min(120, Number(studySeconds) || 0));

  await db.query(
    `
      INSERT INTO daily_attempts (
        discord_user_id, attempt_date, status, grid_number, difficulty,
        moves, par, perfect_min, started_at, gameplay_started_at,
        state_json, updated_at
      )
      VALUES (
        $1,$2::date,'active',$3,$4,$5,$6,$7,
        NOW(), NOW() + ($8 * INTERVAL '1 second'), $9::jsonb, NOW()
      )
      ON CONFLICT (discord_user_id, attempt_date) DO NOTHING
    `,
    [
      String(discordUserId),
      attemptDate,
      gridNumber,
      difficulty,
      moves,
      par,
      perfectMin,
      study,
      state ? JSON.stringify(state) : null,
    ]
  );

  return getDailyAttempt(discordUserId, attemptDate);
}

export async function updateActiveAttemptState({
  discordUserId,
  moves,
  state,
  attemptDate = todayMountainDate(),
}) {
  const db = getPool();
  const result = await db.query(
    `
      UPDATE daily_attempts
      SET moves=$3, state_json=$4::jsonb, updated_at=NOW()
      WHERE discord_user_id=$1
        AND attempt_date=$2::date
        AND status='active'
      RETURNING *
    `,
    [
      String(discordUserId),
      attemptDate,
      Math.max(0, Math.floor(Number(moves) || 0)),
      state ? JSON.stringify(state) : null,
    ]
  );

  return normalizeAttempt(result.rows[0], new Date());
}

export async function finalizeDailyAttempt({
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
  state = null,
  attemptDate = todayMountainDate(),
}) {
  if (!["complete", "incomplete"].includes(status)) {
    throw new Error("Final attempt status must be complete or incomplete.");
  }

  const db = getPool();

  const updated = await db.query(
    `
      UPDATE daily_attempts
      SET
        status=$3,
        grid_number=COALESCE($4,grid_number),
        difficulty=COALESCE($5,difficulty),
        moves=COALESCE($6,moves),
        par=COALESCE($7,par),
        perfect_min=COALESCE($8,perfect_min),
        time_seconds=COALESCE($9,time_seconds),
        rating=COALESCE($10,rating),
        daily_rank=COALESCE($11,daily_rank),
        state_json=COALESCE($12::jsonb,state_json),
        completed_at=NOW(),
        updated_at=NOW()
      WHERE discord_user_id=$1
        AND attempt_date=$2::date
        AND status='active'
      RETURNING *
    `,
    [
      String(discordUserId), attemptDate, status, gridNumber, difficulty,
      moves, par, perfectMin, seconds, rating, rank,
      state ? JSON.stringify(state) : null
    ]
  );

  if (updated.rows[0]) {
    return { finalized: true, attempt: normalizeAttempt(updated.rows[0], new Date()) };
  }

  const inserted = await db.query(
    `
      INSERT INTO daily_attempts (
        discord_user_id, attempt_date, status, grid_number, difficulty,
        moves, par, perfect_min, time_seconds, rating, daily_rank,
        state_json, completed_at, started_at, updated_at
      )
      VALUES (
        $1,$2::date,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,NOW(),NOW(),NOW()
      )
      ON CONFLICT (discord_user_id, attempt_date) DO NOTHING
      RETURNING *
    `,
    [
      String(discordUserId), attemptDate, status, gridNumber, difficulty,
      moves, par, perfectMin, seconds, rating, rank,
      state ? JSON.stringify(state) : null
    ]
  );

  if (inserted.rows[0]) {
    return { finalized: true, attempt: normalizeAttempt(inserted.rows[0], new Date()) };
  }

  return {
    finalized: false,
    attempt: await getDailyAttempt(discordUserId, attemptDate),
  };
}


export async function getPlayerProfile(discordUserId) {
  const db = getPool();

  const result = await db.query(
    `
      SELECT discord_user_id, tutorial_completed_at, created_at, updated_at
      FROM player_profiles
      WHERE discord_user_id = $1
      LIMIT 1
    `,
    [String(discordUserId)]
  );

  const row = result.rows[0];

  if (!row) {
    return {
      discordUserId: String(discordUserId),
      tutorialComplete: false,
      tutorialCompletedAt: null,
    };
  }

  return {
    discordUserId: row.discord_user_id,
    tutorialComplete: Boolean(row.tutorial_completed_at),
    tutorialCompletedAt: row.tutorial_completed_at
      ? new Date(row.tutorial_completed_at).toISOString()
      : null,
  };
}

export async function markTutorialComplete(discordUserId) {
  const db = getPool();

  const result = await db.query(
    `
      INSERT INTO player_profiles (
        discord_user_id,
        tutorial_completed_at,
        created_at,
        updated_at
      )
      VALUES ($1, NOW(), NOW(), NOW())
      ON CONFLICT (discord_user_id)
      DO UPDATE SET
        tutorial_completed_at = NOW(),
        updated_at = NOW()
      RETURNING discord_user_id, tutorial_completed_at
    `,
    [String(discordUserId)]
  );

  const row = result.rows[0];

  return {
    discordUserId: row.discord_user_id,
    tutorialComplete: true,
    tutorialCompletedAt: new Date(row.tutorial_completed_at).toISOString(),
  };
}

export async function resetTutorialComplete(discordUserId) {
  const db = getPool();

  await db.query(
    `
      INSERT INTO player_profiles (
        discord_user_id,
        tutorial_completed_at,
        created_at,
        updated_at
      )
      VALUES ($1, NULL, NOW(), NOW())
      ON CONFLICT (discord_user_id)
      DO UPDATE SET
        tutorial_completed_at = NULL,
        updated_at = NOW()
    `,
    [String(discordUserId)]
  );

  return {
    discordUserId: String(discordUserId),
    tutorialComplete: false,
    tutorialCompletedAt: null,
  };
}

export async function deleteDailyAttempt(discordUserId, attemptDate = todayMountainDate()) {
  const db = getPool();
  const result = await db.query(
    `DELETE FROM daily_attempts
     WHERE discord_user_id=$1 AND attempt_date=$2::date`,
    [String(discordUserId), attemptDate]
  );
  return result.rowCount;
}
