import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  startDiscordBot,
  isDiscordBotReady,
  postTestDistortionResult,
  postDistortionResult,
} from "./discordBot.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "1mb" }));

/**
 * Basic Railway health check.
 */
app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    service: "distortion-grid",
    discordBotReady: isDiscordBotReady(),
    nodeEnv: process.env.NODE_ENV || "development",
  });
});

/**
 * Check that the expected Discord IDs are configured.
 * No secrets are returned.
 */
app.get("/api/discord/status", (req, res) => {
  res.json({
    botReady: isDiscordBotReady(),
    clientIdConfigured: Boolean(process.env.DISCORD_CLIENT_ID),
    guildIdConfigured: Boolean(process.env.DISCORD_GUILD_ID),
    resultsChannelConfigured: Boolean(process.env.DISCORD_RESULTS_CHANNEL_ID),
    adminUserConfigured: Boolean(process.env.ADMIN_DISCORD_USER_ID),
  });
});

/**
 * SAFE BOT-POST TEST ENDPOINT
 *
 * This is intentionally protected with ADMIN_TEST_KEY.
 *
 * Call it with:
 * POST /api/admin/test-discord-post
 * Header:
 * x-admin-test-key: YOUR_ADMIN_TEST_KEY
 *
 * Set ADMIN_TEST_KEY in Railway to a long random value.
 */
app.post("/api/admin/test-discord-post", async (req, res) => {
  const expectedKey = process.env.ADMIN_TEST_KEY;
  const providedKey = req.get("x-admin-test-key");

  if (!expectedKey) {
    return res.status(503).json({
      ok: false,
      error: "ADMIN_TEST_KEY is not configured in Railway.",
    });
  }

  if (!providedKey || providedKey !== expectedKey) {
    return res.status(401).json({
      ok: false,
      error: "Unauthorized.",
    });
  }

  try {
    const result = await postTestDistortionResult();

    return res.json({
      ok: true,
      message: "Test Distortion Grid result posted to Discord.",
      ...result,
    });
  } catch (error) {
    console.error("Discord test post failed:", error);

    return res.status(500).json({
      ok: false,
      error: error.message,
    });
  }
});

/**
 * Placeholder: shared leaderboard endpoint.
 * We will connect this to PostgreSQL next.
 */
app.get("/api/leaderboard/today", (req, res) => {
  res.json([]);
});


/**
 * ACTIVITY RESULT POST
 *
 * Temporary bridge used while Distortion Grid is in testing.
 * The browser sends the completed result and the bot posts a Wordle-style
 * result card to DISCORD_RESULTS_CHANNEL_ID.
 *
 * IMPORTANT: before public launch, replace this with authenticated,
 * server-authoritative Discord user + PostgreSQL verification.
 */
const recentResultPosts = new Map();

app.post("/api/activity-result", async (req, res) => {
  if (!isDiscordBotReady()) {
    return res.status(503).json({
      ok: false,
      error: "Discord bot is not connected yet.",
    });
  }

  const body = req.body ?? {};

  const username = String(body.username || "Player").trim().slice(0, 32);
  const avatarUrl =
    typeof body.avatarUrl === "string" && /^https?:\/\//i.test(body.avatarUrl)
      ? body.avatarUrl.slice(0, 500)
      : null;

  const result = {
    username: username || "Player",
    avatarUrl,
    gridNumber: Math.max(0, Math.floor(Number(body.gridNumber) || 0)),
    difficulty: ["Stable", "Unstable", "Fractured", "Cataclysm"].includes(body.difficulty)
      ? body.difficulty
      : "Unknown",
    moves: Math.max(0, Math.floor(Number(body.moves) || 0)),
    par: Math.max(0, Math.floor(Number(body.par) || 0)),
    seconds: Math.max(0, Math.floor(Number(body.seconds) || 0)),
    streak: Math.max(0, Math.floor(Number(body.streak) || 0)),
    rank: body.rank == null ? null : Math.max(1, Math.floor(Number(body.rank) || 1)),
    isChampion: Boolean(body.isChampion),
    isPerfect: Boolean(body.isPerfect),
    isTest: Boolean(body.isTest),
  };

  // Prevent accidental duplicate posts from double-clicks/re-renders.
  const dedupeKey = [
    result.username,
    result.gridNumber,
    result.moves,
    result.seconds,
    result.isTest ? "test" : "official",
  ].join(":");

  const now = Date.now();
  const previous = recentResultPosts.get(dedupeKey);

  if (previous && now - previous < 60_000) {
    return res.json({
      ok: true,
      duplicate: true,
      message: "Result was already posted.",
    });
  }

  recentResultPosts.set(dedupeKey, now);

  // Small cleanup so the in-memory map never grows forever.
  for (const [key, timestamp] of recentResultPosts) {
    if (now - timestamp > 10 * 60_000) {
      recentResultPosts.delete(key);
    }
  }

  try {
    const posted = await postDistortionResult(result);

    return res.json({
      ok: true,
      message: "Distortion Grid result posted to Discord.",
      ...posted,
    });
  } catch (error) {
    console.error("Activity result post failed:", error);

    return res.status(500).json({
      ok: false,
      error: error.message,
    });
  }
});

/**
 * Placeholder: official attempt start endpoint.
 * This will become server-authoritative when PostgreSQL/auth are wired.
 */
app.post("/api/attempts/start", (req, res) => {
  res.json({
    ok: true,
    studySeconds: 15,
    message: "Attempt persistence will be added with PostgreSQL.",
  });
});

/**
 * IMPORTANT:
 * Do NOT let the browser directly choose username, moves, time, rank, or champion
 * status and immediately post that information to Discord.
 *
 * The final /api/attempts/complete route will:
 * 1. identify the authenticated Discord user,
 * 2. verify today's puzzle,
 * 3. verify the official attempt,
 * 4. calculate rank server-side,
 * 5. store the result in PostgreSQL,
 * 6. then call postDistortionResult().
 *
 * That prevents players from faking champion results.
 */
app.post("/api/attempts/complete", (req, res) => {
  res.status(501).json({
    ok: false,
    error:
      "Official completion endpoint is waiting for Discord authentication + PostgreSQL.",
  });
});

/**
 * Serve the built Vite frontend.
 */
const distPath = path.resolve(__dirname, "../dist");
app.use(express.static(distPath));

/**
 * SPA fallback for the Discord Activity frontend.
 */
app.use((req, res, next) => {
  if (req.method !== "GET") {
    return next();
  }

  res.sendFile(path.join(distPath, "index.html"));
});

/**
 * Start the web server first so Railway can become healthy quickly.
 */
app.listen(port, () => {
  console.log(`✅ Distortion Grid web server listening on port ${port}`);
});

/**
 * Start Discord bot in the same Railway service.
 */
startDiscordBot().catch((error) => {
  console.error("❌ Failed to start Discord bot:", error);
});
