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
  clearDistortionResultsChannel,
} from "./discordBot.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "1mb" }));

/**
 * Discord Activity OAuth2 code exchange.
 *
 * DISCORD_CLIENT_SECRET must stay in Railway and must never be exposed
 * through VITE_* variables or committed to GitHub.
 */
app.post("/api/token", async (req, res) => {
  console.log("[Discord OAuth] /api/token request received");
  const code = String(req.body?.code || "").trim();
  const clientId =
    process.env.DISCORD_CLIENT_ID ||
    process.env.VITE_DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;

  if (!code) {
    console.error("[Discord OAuth] Missing authorization code");
    return res.status(400).json({
      ok: false,
      error: "Discord authorization code is missing.",
    });
  }

  if (!clientId || !clientSecret) {
    console.error("[Discord OAuth] Missing client ID or client secret");
    return res.status(503).json({
      ok: false,
      error:
        "DISCORD_CLIENT_ID/VITE_DISCORD_CLIENT_ID or DISCORD_CLIENT_SECRET is not configured.",
    });
  }

  try {
    console.log("[Discord OAuth] Exchanging authorization code with Discord");
    const response = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "authorization_code",
        code,
      }),
    });

    const data = await response.json();

    if (!response.ok || !data.access_token) {
      console.error("Discord OAuth token exchange failed:", data);

      return res.status(502).json({
        ok: false,
        error: data.error_description || data.error || "Discord OAuth exchange failed.",
      });
    }

    console.log("[Discord OAuth] Token exchange succeeded");
    return res.json({
      access_token: data.access_token,
    });
  } catch (error) {
    console.error("Discord OAuth token exchange error:", error);

    return res.status(500).json({
      ok: false,
      error: "Discord OAuth exchange failed.",
    });
  }
});

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
  console.log("[Distortion Result] Completion post request received");
  if (!isDiscordBotReady()) {
    return res.status(503).json({
      ok: false,
      error: "Discord bot is not connected yet.",
    });
  }

  const authHeader = String(req.get("authorization") || "");
  const accessToken = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : "";

  if (!accessToken) {
    console.error("[Distortion Result] Missing bearer token");
    return res.status(401).json({
      ok: false,
      error: "Discord authentication is required.",
    });
  }

  let discordUser;

  try {
    const meResponse = await fetch("https://discord.com/api/v10/users/@me", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    discordUser = await meResponse.json();

    if (!meResponse.ok || !discordUser?.id) {
      console.error("[Distortion Result] Discord identity verification failed", {
        status: meResponse.status,
        response: discordUser,
      });
      return res.status(401).json({
        ok: false,
        error: "Discord authentication could not be verified.",
      });
    }
  } catch (error) {
    console.error("Discord identity lookup failed:", error);

    return res.status(502).json({
      ok: false,
      error: "Could not verify the Discord player.",
    });
  }

  const body = req.body ?? {};

  const username = String(
    discordUser.global_name ||
    discordUser.username ||
    "Discord Player"
  ).trim().slice(0, 64);

  let avatarUrl = null;

  if (discordUser.avatar) {
    const ext = String(discordUser.avatar).startsWith("a_") ? "gif" : "png";
    avatarUrl =
      `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.${ext}?size=256`;
  } else {
    try {
      const defaultIndex = Number((BigInt(discordUser.id) >> 22n) % 6n);
      avatarUrl = `https://cdn.discordapp.com/embed/avatars/${defaultIndex}.png`;
    } catch {
      avatarUrl = "https://cdn.discordapp.com/embed/avatars/0.png";
    }
  }

  console.log(
    "[Distortion Result] Verified Discord player:",
    discordUser.global_name || discordUser.username || discordUser.id
  );

  const result = {
    discordUserId: discordUser.id,
    username: username || "Discord Player",
    avatarUrl,
    gridNumber: Math.max(0, Math.floor(Number(body.gridNumber) || 0)),
    gridSize: Math.max(4, Math.min(7, Math.floor(Number(body.gridSize) || 5))),
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

  // Prevent accidental duplicate posts from the same authenticated Discord user.
  const dedupeKey = [
    result.discordUserId,
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

  for (const [key, timestamp] of recentResultPosts) {
    if (now - timestamp > 10 * 60_000) {
      recentResultPosts.delete(key);
    }
  }

  try {
    const posted = await postDistortionResult(result);
    console.log("[Distortion Result] Result posted successfully", posted);

    return res.json({
      ok: true,
      player: {
        id: discordUser.id,
        displayName: result.username,
        avatarUrl: result.avatarUrl,
      },
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

async function getDiscordUserFromBearer(req) {
  const authHeader = String(req.get("authorization") || "");
  const accessToken = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : "";

  if (!accessToken) {
    const error = new Error("Discord authentication is required.");
    error.status = 401;
    throw error;
  }

  const response = await fetch("https://discord.com/api/v10/users/@me", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const user = await response.json();

  if (!response.ok || !user?.id) {
    const error = new Error("Discord authentication could not be verified.");
    error.status = 401;
    throw error;
  }

  return user;
}

app.post("/api/admin/clear-discord-channel", async (req, res) => {
  try {
    const user = await getDiscordUserFromBearer(req);
    const adminId = String(process.env.ADMIN_DISCORD_USER_ID || "").trim();

    if (!adminId) {
      return res.status(503).json({
        ok: false,
        error: "ADMIN_DISCORD_USER_ID is not configured.",
      });
    }

    if (user.id !== adminId) {
      return res.status(403).json({
        ok: false,
        error: "Only the configured Distortion Grid admin can clear the channel.",
      });
    }

    const result = await clearDistortionResultsChannel();

    console.log(
      `[Admin] ${user.username} cleared Distortion Grid channel; deleted ${result.deleted} messages.`
    );

    return res.json({
      ok: true,
      deleted: result.deleted,
      channelId: result.channelId,
    });
  } catch (error) {
    console.error("Clear Discord channel failed:", error);

    return res.status(error.status || 500).json({
      ok: false,
      error: error.message || "Could not clear Discord channel.",
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
