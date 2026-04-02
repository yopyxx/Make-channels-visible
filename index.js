const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  PermissionFlagsBits,
  REST,
  Routes,
  ChannelType
} = require('discord.js');

const TOKEN = (process.env.TOKEN || '').trim();
const CLIENT_ID = (process.env.CLIENT_ID || '').trim();
const GUILD_ID = (process.env.GUILD_ID || '').trim();

if (!TOKEN) throw new Error('TOKEN 환경변수가 비어 있습니다.');
if (!CLIENT_ID) throw new Error('CLIENT_ID 환경변수가 비어 있습니다.');
if (!GUILD_ID) throw new Error('GUILD_ID 환경변수가 비어 있습니다.');

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const commands = [
  new SlashCommandBuilder()
    .setName('추가')
    .setDescription('입력한 역할이 모든 비공개 카테고리/채널을 볼 수 있게 설정합니다.')
    .addStringOption(option =>
      option
        .setName('역할id')
        .setDescription('쉼표(,)로 여러 역할 ID 입력 가능')
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .toJSON()
];

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(TOKEN);

  try {
    console.log('슬래시 명령어 등록 시작...');
    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: commands }
    );
    console.log('슬래시 명령어 등록 완료');
  } catch (err) {
    console.error('슬래시 명령어 등록 오류:', err);
  }
}

function parseRoleIds(input) {
  return input.split(',').map(v => v.trim()).filter(Boolean);
}

function isPrivateChannel(channel, everyoneRoleId) {
  const overwrite = channel.permissionOverwrites?.cache?.get(everyoneRoleId);
  if (!overwrite) return false;
  return overwrite.deny.has(PermissionFlagsBits.ViewChannel);
}

function isTextLikeChannel(channel) {
  return [
    ChannelType.GuildText,
    ChannelType.GuildAnnouncement,
    ChannelType.GuildForum,
    ChannelType.GuildMedia
  ].includes(channel.type);
}

client.once('ready', () => {
  console.log(`${client.user.tag} 로그인 완료`);
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== '추가') return;

  await interaction.deferReply({ ephemeral: true });

  try {
    const guild = interaction.guild;
    if (!guild) {
      return interaction.editReply('서버 안에서만 사용할 수 있습니다.');
    }

    const input = interaction.options.getString('역할id', true);
    const roleIds = parseRoleIds(input);

    if (!roleIds.length) {
      return interaction.editReply('역할 ID를 올바르게 입력해주세요.');
    }

    const everyoneRoleId = guild.roles.everyone.id;

    const validRoles = [];
    const invalidRoleIds = [];

    for (const roleId of roleIds) {
      const role = await guild.roles.fetch(roleId).catch(() => null);
      if (!role) invalidRoleIds.push(roleId);
      else validRoles.push(role);
    }

    if (!validRoles.length) {
      return interaction.editReply(
        `유효한 역할이 없습니다.\n잘못된 역할 ID: ${invalidRoleIds.join(', ')}`
      );
    }

    const channels = guild.channels.cache.filter(ch =>
      [
        ChannelType.GuildCategory,
        ChannelType.GuildText,
        ChannelType.GuildAnnouncement,
        ChannelType.GuildVoice,
        ChannelType.GuildStageVoice,
        ChannelType.GuildForum,
        ChannelType.GuildMedia
      ].includes(ch.type)
    );

    const privateChannels = channels.filter(ch => isPrivateChannel(ch, everyoneRoleId));

    if (!privateChannels.size) {
      return interaction.editReply('비공개 카테고리/채널을 찾지 못했습니다.');
    }

    let successCount = 0;
    const failed = [];

    for (const channel of privateChannels.values()) {
      try {
        for (const role of validRoles) {
          const perms = {
            ViewChannel: true
          };

          if (isTextLikeChannel(channel)) {
            perms.ReadMessageHistory = true;
          }

          await channel.permissionOverwrites.edit(role.id, perms);
        }
        successCount++;
      } catch (err) {
        console.error(`권한 수정 실패: ${channel.name} (${channel.id})`, err);
        failed.push(`${channel.name} (${channel.id})`);
      }
    }

    // 카테고리 아래 채널까지 한 번 더 직접 적용
    const categories = guild.channels.cache.filter(ch => ch.type === ChannelType.GuildCategory);

    for (const category of categories.values()) {
      if (!isPrivateChannel(category, everyoneRoleId)) continue;

      const children = guild.channels.cache.filter(ch => ch.parentId === category.id);

      for (const child of children.values()) {
        try {
          for (const role of validRoles) {
            const perms = {
              ViewChannel: true
            };

            if (isTextLikeChannel(child)) {
              perms.ReadMessageHistory = true;
            }

            await child.permissionOverwrites.edit(role.id, perms);
          }
        } catch (err) {
          console.error(`하위 채널 권한 수정 실패: ${child.name} (${child.id})`, err);
          if (!failed.includes(`${child.name} (${child.id})`)) {
            failed.push(`${child.name} (${child.id})`);
          }
        }
      }
    }

    let msg = `완료되었습니다.\n처리된 비공개 채널/카테고리 수: ${successCount}개`;

    if (invalidRoleIds.length) {
      msg += `\n잘못된 역할 ID: ${invalidRoleIds.join(', ')}`;
    }

    if (failed.length) {
      msg += `\n처리 실패 채널:\n${failed.join('\n')}`;
    }

    msg += `\n\n주의: 이미 개별 채널 권한이 따로 꼬여 있는 경우에는 디스코드에서 채널 권한 동기화를 직접 해줘야 할 수 있습니다.`;

    await interaction.editReply(msg);
  } catch (err) {
    console.error(err);
    await interaction.editReply('오류가 발생했습니다.');
  }
});

registerCommands();
client.login(TOKEN);
