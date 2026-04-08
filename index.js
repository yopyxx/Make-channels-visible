// @ts-nocheck
const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
} = require("discord.js");

/* =========================
   환경변수
========================= */
const RAW_TOKEN = process.env.TOKEN ?? "";
const TOKEN = RAW_TOKEN.replace(/^Bot\s+/i, "").trim();
const CLIENT_ID = (process.env.CLIENT_ID || "").trim();
const GUILD_ID = (process.env.GUILD_ID || "").trim();

if (!TOKEN) throw new Error("TOKEN 환경변수가 비어 있습니다.");
if (!CLIENT_ID) throw new Error("CLIENT_ID 환경변수가 비어 있습니다.");
if (!GUILD_ID) throw new Error("GUILD_ID 환경변수가 비어 있습니다.");

/* =========================
   클라이언트 생성
========================= */
const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

/* =========================
   슬래시 명령어 등록
========================= */
const commands = [
  new SlashCommandBuilder()
    .setName("채널권한추가")
    .setDescription("입력한 역할이 여러 채널에서 보기/메시지 전송이 가능하도록 설정합니다.")
    .addStringOption((option) =>
      option
        .setName("역할id")
        .setDescription("권한을 부여할 역할 ID")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("채널ids")
        .setDescription("채널 ID 여러 개 입력 가능 (쉼표 또는 공백으로 구분)")
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName("채널권한제거")
    .setDescription("입력한 역할의 여러 채널 보기/메시지 전송 권한을 제거합니다.")
    .addStringOption((option) =>
      option
        .setName("역할id")
        .setDescription("권한을 제거할 역할 ID")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("채널ids")
        .setDescription("채널 ID 여러 개 입력 가능 (쉼표 또는 공백으로 구분)")
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
].map((cmd) => cmd.toJSON());

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(TOKEN);

  console.log("슬래시 명령어 등록 중...");
  await rest.put(
    Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
    { body: commands }
  );
  console.log("슬래시 명령어 등록 완료");
}

/* =========================
   유틸
========================= */
function parseIds(input) {
  return [...new Set(
    String(input)
      .split(/[,\s]+/)
      .map((v) => v.trim())
      .filter((v) => /^\d{17,20}$/.test(v))
  )];
}

function getChannelTypeName(channel) {
  const map = {
    [ChannelType.GuildText]: "텍스트채널",
    [ChannelType.GuildAnnouncement]: "공지채널",
    [ChannelType.GuildForum]: "포럼채널",
    [ChannelType.GuildVoice]: "음성채널",
    [ChannelType.GuildStageVoice]: "스테이지채널",
    [ChannelType.GuildCategory]: "카테고리",
    [ChannelType.PublicThread]: "공개스레드",
    [ChannelType.PrivateThread]: "비공개스레드",
    [ChannelType.AnnouncementThread]: "공지스레드",
  };
  return map[channel.type] || `알 수 없음(${channel.type})`;
}

function buildAllowPermissions(channel) {
  // 채널 타입별로 허용할 권한 구성
  if (
    channel.type === ChannelType.GuildText ||
    channel.type === ChannelType.GuildAnnouncement
  ) {
    return [
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.ReadMessageHistory,
      PermissionFlagsBits.AttachFiles,
      PermissionFlagsBits.EmbedLinks,
      PermissionFlagsBits.AddReactions,
    ];
  }

  if (channel.type === ChannelType.GuildForum) {
    return [
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.CreatePublicThreads,
      PermissionFlagsBits.ReadMessageHistory,
      PermissionFlagsBits.AttachFiles,
      PermissionFlagsBits.EmbedLinks,
      PermissionFlagsBits.AddReactions,
    ];
  }

  if (
    channel.type === ChannelType.PublicThread ||
    channel.type === ChannelType.PrivateThread ||
    channel.type === ChannelType.AnnouncementThread
  ) {
    return [
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessagesInThreads,
      PermissionFlagsBits.ReadMessageHistory,
      PermissionFlagsBits.AttachFiles,
      PermissionFlagsBits.EmbedLinks,
      PermissionFlagsBits.AddReactions,
    ];
  }

  // 그 외는 최소 권한만
  return [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.ReadMessageHistory,
  ];
}

function buildDenyPermissions(channel) {
  if (
    channel.type === ChannelType.GuildText ||
    channel.type === ChannelType.GuildAnnouncement
  ) {
    return [
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
    ];
  }

  if (channel.type === ChannelType.GuildForum) {
    return [
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.CreatePublicThreads,
    ];
  }

  if (
    channel.type === ChannelType.PublicThread ||
    channel.type === ChannelType.PrivateThread ||
    channel.type === ChannelType.AnnouncementThread
  ) {
    return [
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessagesInThreads,
    ];
  }

  return [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
  ];
}

/* =========================
   이벤트
========================= */
client.once("ready", () => {
  console.log(`로그인 완료: ${client.user.tag}`);
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (
    interaction.commandName !== "채널권한추가" &&
    interaction.commandName !== "채널권한제거"
  ) {
    return;
  }

  try {
    await interaction.deferReply({ ephemeral: true });

    const roleId = interaction.options.getString("역할id", true).trim();
    const channelIdsRaw = interaction.options.getString("채널ids", true);
    const channelIds = parseIds(channelIdsRaw);

    if (!/^\d{17,20}$/.test(roleId)) {
      return interaction.editReply("역할 ID 형식이 올바르지 않습니다.");
    }

    if (!channelIds.length) {
      return interaction.editReply(
        "유효한 채널 ID가 없습니다. 쉼표(,) 또는 공백으로 구분해서 입력해주세요."
      );
    }

    const guild = interaction.guild;
    if (!guild) {
      return interaction.editReply("서버에서만 사용할 수 있는 명령어입니다.");
    }

    const role = await guild.roles.fetch(roleId).catch(() => null);
    if (!role) {
      return interaction.editReply("해당 역할을 찾을 수 없습니다.");
    }

    const success = [];
    const failed = [];

    for (const channelId of channelIds) {
      try {
        const channel = await guild.channels.fetch(channelId).catch(() => null);

        if (!channel) {
          failed.push(`❌ ${channelId} : 채널을 찾을 수 없음`);
          continue;
        }

        if (channel.guild.id !== guild.id) {
          failed.push(`❌ ${channelId} : 현재 서버 채널이 아님`);
          continue;
        }

        if (interaction.commandName === "채널권한추가") {
          const allowPerms = buildAllowPermissions(channel);

          await channel.permissionOverwrites.edit(role.id, {
            ViewChannel: allowPerms.includes(PermissionFlagsBits.ViewChannel),
            SendMessages: allowPerms.includes(PermissionFlagsBits.SendMessages),
            SendMessagesInThreads: allowPerms.includes(PermissionFlagsBits.SendMessagesInThreads),
            CreatePublicThreads: allowPerms.includes(PermissionFlagsBits.CreatePublicThreads),
            ReadMessageHistory: allowPerms.includes(PermissionFlagsBits.ReadMessageHistory),
            AttachFiles: allowPerms.includes(PermissionFlagsBits.AttachFiles),
            EmbedLinks: allowPerms.includes(PermissionFlagsBits.EmbedLinks),
            AddReactions: allowPerms.includes(PermissionFlagsBits.AddReactions),
          });

          success.push(
            `✅ <#${channel.id}> (${getChannelTypeName(channel)})`
          );
        } else {
          const denyPerms = buildDenyPermissions(channel);

          const overwrite = {};
          for (const perm of denyPerms) {
            if (perm === PermissionFlagsBits.ViewChannel) overwrite.ViewChannel = null;
            if (perm === PermissionFlagsBits.SendMessages) overwrite.SendMessages = null;
            if (perm === PermissionFlagsBits.SendMessagesInThreads) overwrite.SendMessagesInThreads = null;
            if (perm === PermissionFlagsBits.CreatePublicThreads) overwrite.CreatePublicThreads = null;
          }

          await channel.permissionOverwrites.edit(role.id, overwrite);

          success.push(
            `✅ <#${channel.id}> (${getChannelTypeName(channel)})`
          );
        }
      } catch (err) {
        console.error(`채널 처리 실패: ${channelId}`, err);
        failed.push(`❌ ${channelId} : 처리 중 오류`);
      }
    }

    const title =
      interaction.commandName === "채널권한추가"
        ? `역할 <@&${role.id}> 권한 추가 완료`
        : `역할 <@&${role.id}> 권한 제거 완료`;

    let result = `**${title}**\n\n`;

    result += `**성공 (${success.length}개)**\n`;
    result += success.length ? `${success.join("\n")}\n\n` : "없음\n\n";

    result += `**실패 (${failed.length}개)**\n`;
    result += failed.length ? failed.join("\n") : "없음";

    if (result.length > 1900) {
      result =
        `**${title}**\n\n` +
        `성공: ${success.length}개\n` +
        `실패: ${failed.length}개\n\n` +
        `결과가 너무 길어서 일부 생략되었습니다.`;
    }

    await interaction.editReply({ content: result });
  } catch (error) {
    console.error("명령어 처리 중 오류:", error);

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply("명령어 처리 중 오류가 발생했습니다.");
    } else {
      await interaction.reply({
        content: "명령어 처리 중 오류가 발생했습니다.",
        ephemeral: true,
      });
    }
  }
});

/* =========================
   실행
========================= */
(async () => {
  await registerCommands();
  await client.login(TOKEN);
})();