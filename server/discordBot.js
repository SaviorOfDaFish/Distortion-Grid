import {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
} from "discord.js";

let client = null;

/**
 * Start the Discord bot.
 * The bot token stays in Railway as DISCORD_BOT_TOKEN.
 */
export async function startDiscordBot() {
  const token = process.env.DISCORD_BOT_TOKEN;

  if (!token) {
    console.warn("⚠️ DISCORD_BOT_TOKEN is missing. Discord bot will not start.");
    return null;
  }

  if (client?.isReady()) {
    return client;
  }

  client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
    ],
  });

  client.once("ready", async () => {
    console.log(`✅ Discord bot logged in as ${client.user.tag}`);

    const guildId = process.env.DISCORD_GUILD_ID;
    const resultsChannelId = process.env.DISCORD_RESULTS_CHANNEL_ID;

    if (guildId) {
      try {
        const guild = await client.guilds.fetch(guildId);
        console.log(`✅ Connected to Discord server: ${guild.name}`);
      } catch (error) {
        console.error(
          `❌ Could not access guild ${guildId}. Is the bot installed in that server?`,
          error.message
        );
      }
    }

    if (resultsChannelId) {
      try {
        const channel = await client.channels.fetch(resultsChannelId);

        if (!channel?.isTextBased()) {
          console.warn(
            `⚠️ Results channel ${resultsChannelId} exists but is not a text-based channel.`
          );
        } else {
          console.log(`✅ Results channel ready: #${channel.name ?? resultsChannelId}`);
        }
      } catch (error) {
        console.error(
          `❌ Could not access results channel ${resultsChannelId}. Check the channel ID and bot permissions.`,
          error.message
        );
      }
    }
  });

  client.on("error", (error) => {
    console.error("Discord client error:", error);
  });

  await client.login(token);
  return client;
}

/**
 * Return whether the Discord bot is currently connected.
 */
export function isDiscordBotReady() {
  return Boolean(client?.isReady());
}

/**
 * Format seconds as M:SS.
 */
function formatTime(totalSeconds = 0) {
  const safeSeconds = Math.max(0, Number(totalSeconds) || 0);
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = String(Math.floor(safeSeconds % 60)).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

/**
 * Build the result embed used when a player finishes Distortion Grid.
 */
export function buildDistortionResultEmbed({
  username = "Unknown Player",
  avatarUrl = null,
  gridNumber = null,
  difficulty = null,
  moves = 0,
  par = 0,
  seconds = 0,
  streak = 0,
  rank = null,
  isChampion = false,
  isPerfect = false,
}) {
  const title = isChampion
    ? "👑 NEW DAILY CHAMPION"
    : "🌌 DISTORTION STABILIZED";

  const descriptionLines = [];

  if (gridNumber !== null && gridNumber !== undefined) {
    descriptionLines.push(`**Distortion Grid #${gridNumber}**`);
  }

  if (difficulty) {
    descriptionLines.push(`Difficulty: **${difficulty}**`);
  }

  if (isPerfect) {
    descriptionLines.push("✨ **Perfect Stabilization!**");
  }

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(descriptionLines.join("\n") || null)
    .setColor(isChampion ? 0xffc857 : 0x8b5cf6)
    .addFields(
      {
        name: "Moves",
        value: `**${moves}** / Par ${par}`,
        inline: true,
      },
      {
        name: "Time",
        value: `**${formatTime(seconds)}**`,
        inline: true,
      },
      {
        name: "Streak",
        value: `🔥 **${streak}**`,
        inline: true,
      }
    )
    .setTimestamp();

  if (rank !== null && rank !== undefined) {
    embed.addFields({
      name: "Daily Rank",
      value: `**#${rank}**`,
      inline: true,
    });
  }

  if (username) {
    embed.setAuthor({
      name: username,
      ...(avatarUrl ? { iconURL: avatarUrl } : {}),
    });
  }

  embed.setFooter({
    text: isChampion
      ? "Can anyone take the crown?"
      : "Think you can beat it? Play today’s Distortion Grid!",
  });

  return embed;
}

/**
 * Post a finished Distortion Grid result into the configured Discord channel.
 */
export async function postDistortionResult(result) {
  if (!client?.isReady()) {
    throw new Error("Discord bot is not ready.");
  }

  const channelId = process.env.DISCORD_RESULTS_CHANNEL_ID;

  if (!channelId) {
    throw new Error("DISCORD_RESULTS_CHANNEL_ID is not configured.");
  }

  const channel = await client.channels.fetch(channelId);

  if (!channel?.isTextBased()) {
    throw new Error("Configured results channel is not text-based.");
  }

  const embed = buildDistortionResultEmbed(result);

  const message = await channel.send({
    embeds: [embed],
  });

  return {
    messageId: message.id,
    channelId: message.channelId,
  };
}

/**
 * Development/test helper.
 * Posts a fake result using the configured channel so you can verify permissions.
 */
export async function postTestDistortionResult() {
  return postDistortionResult({
    username: "Distortion Grid Test",
    gridNumber: 583,
    difficulty: "Unstable",
    moves: 11,
    par: 11,
    seconds: 21,
    streak: 6,
    rank: 1,
    isChampion: true,
    isPerfect: true,
  });
}
