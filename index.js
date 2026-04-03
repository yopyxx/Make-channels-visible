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
    .setDescription('입력한 역할이 서버의 모든 카테고리/채널을 볼 수 있게 설정합니다.')
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
  return input
    .split(',')
    .map(v => v.trim())
    .filter(Boolean);
}

function isTextLikeChannel(channel) {
  return [
    ChannelType.GuildText,
    ChannelType.GuildAnnouncement,
    ChannelType.GuildForum,
    ChannelType.GuildMedia
  ].includes(channel.type);
}

function isVoiceLikeChannel(channel) {
  return [
    ChannelType.GuildVoice,
    ChannelType.GuildStageVoice
  ].includes(channel.type);
}

function isSupportedChannel(channel) {
  return [
    ChannelType.GuildCategory,
    ChannelType.GuildText,
    ChannelType.GuildAnnouncement,
    ChannelType.GuildVoice,
    ChannelType.GuildStageVoice,
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

    const validRoles = [];
    const invalidRoleIds = [];

    for (const roleId of roleIds) {
      const role = await guild.roles.fetch(roleId).catch(() => null);
      if (!role) {
        invalidRoleIds.push(roleId);
      } else {
        validRoles.push(role);
      }
    }

    if (!validRoles.length) {
      return interaction.editReply(
        `유효한 역할이 없습니다.\n잘못된 역할 ID: ${invalidRoleIds.join(', ')}`
      );
    }

    const channels = guild.channels.cache.filter(isSupportedChannel);

    if (!channels.size) {
      return interaction.editReply('처리할 카테고리/채널이 없습니다.');
    }

    let successCount = 0;
    const failed = [];

    for (const channel of channels.values()) {
      try {
        for (const role of validRoles) {
          const perms = {
            ViewChannel: true
          };

          if (isTextLikeChannel(channel)) {
            perms.ReadMessageHistory = true;
            perms.SendMessages = true;
          }

          if (isVoiceLikeChannel(channel)) {
            perms.Connect = true;
            perms.Speak = true;
          }

          await channel.permissionOverwrites.edit(role.id, perms);
        }

        successCount++;
      } catch (err) {
        console.error(`권한 수정 실패: ${channel.name} (${channel.id})`, err);
        failed.push(`${channel.name} (${channel.id})`);
      }
    }

    let msg = `완료되었습니다.\n처리된 전체 카테고리/채널 수: ${successCount}개`;

    if (invalidRoleIds.length) {
      msg += `\n잘못된 역할 ID: ${invalidRoleIds.join(', ')}`;
    }

    if (failed.length) {
      msg += `\n처리 실패 채널:\n${failed.join('\n')}`;
    }

    msg += `\n\n적용 내용:
- 모든 카테고리/채널에 대해 지정 역할의 보기 권한 허용
- 텍스트형 채널은 메시지 기록 보기/메시지 보내기 허용
- 음성형 채널은 입장/발언 허용

주의:
- 관리자 권한보다 위에 있는 역할 구조 문제나
- 봇 역할이 대상 채널 권한보다 아래에 있는 경우
일부 채널은 적용 실패할 수 있습니다.`;

    await interaction.editReply(msg);
  } catch (err) {
    console.error(err);
    await interaction.editReply('오류가 발생했습니다.');
  }
});

registerCommands();
client.login(TOKEN);
