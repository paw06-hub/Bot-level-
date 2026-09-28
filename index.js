const { Client, GatewayIntentBits, EmbedBuilder, PermissionFlagsBits, ChannelType, AttachmentBuilder } = require('discord.js');
const Canvas = require('canvas');
const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
const express = require('express');

// --- 1. WEB SERVER CHO RENDER ---
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => res.send('🤖 Bot Discord đang hoạt động Online 24/7!'));
app.get('/ping', (req, res) => res.status(200).send('PONG'));
app.listen(PORT, () => console.log(`🌐 Server Web lắng nghe tại port ${PORT}`));

// --- 2. CẤU HÌNH BOT DISCORD ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildInvites
    ]
});

const TOKEN = process.env.TOKEN || 'THAY_TOKEN_BOT_CUA_BAN_VAO_DAY';
const PREFIX = '.';
const MY_DISCORD_ID = '1498554147304247296';
const DATA_FILE = path.join(__dirname, 'level_data.json');
const COOLDOWN_TIME = 60000;

const cooldowns = new Map();
const voiceStates = new Map();
const guildInvites = new Map();

// --- 3. CƠ CHẾ QUẢN LÝ DỮ LIỆU ---
let memoryDb = {};
let saveTimeout = null;

function loadData() {
    if (!fs.existsSync(DATA_FILE)) {
        fs.writeFileSync(DATA_FILE, JSON.stringify({}, null, 2));
        return {};
    }
    try {
        return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch (err) {
        console.error('⚠️ Lỗi đọc file data:', err);
        return {};
    }
}

function queueSave() {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(async () => {
        try {
            await fsPromises.writeFile(DATA_FILE, JSON.stringify(memoryDb, null, 2));
        } catch (err) {
            console.error('❌ Lỗi lưu dữ liệu:', err);
        }
    }, 3000);
}

function getXpForNextLevel(level) {
    return 150 * (level + 1);
}

function initGuild(guildId) {
    if (!memoryDb[guildId]) {
        memoryDb[guildId] = {
            config: { 
                logChannel: null, 
                noXpChannels: [], 
                isDoubleXp: false, 
                bannedWords: [], 
                statsChannels: {},
                admins: [MY_DISCORD_ID], 
                staffs: [],
                roleRewards: {}, 
                prestigeRewards: {}, 
                channelMultipliers: {},
                shopItems: [
                    { id: 1, name: 'Thẻ X2 EXP (1 giờ)', price: 500, type: 'boost' },
                    { id: 2, name: 'Danh hiệu: 🐉 Chiến Thần Chat', price: 1000, type: 'title', title: '🐉 Chiến Thần Chat' }
                ]
            },
            users: {}
        };
    }
    if (!memoryDb[guildId].config.admins) memoryDb[guildId].config.admins = [MY_DISCORD_ID];
    if (!memoryDb[guildId].config.staffs) memoryDb[guildId].config.staffs = [];
    if (!memoryDb[guildId].config.roleRewards) memoryDb[guildId].config.roleRewards = {};
    if (!memoryDb[guildId].config.prestigeRewards) memoryDb[guildId].config.prestigeRewards = {};
    if (!memoryDb[guildId].config.channelMultipliers) memoryDb[guildId].config.channelMultipliers = {};
}

function initUser(guildId, userId) {
    initGuild(guildId);
    if (!memoryDb[guildId].users[userId]) {
        memoryDb[guildId].users[userId] = {
            xp: 0, level: 0, messages: 0, coins: 0, lastDaily: 0,
            title: 'Chưa có', unlockedTitles: ['Chưa có'], personalBoostUntil: 0, warns: [],
            quests: { msgCount: 0, claimed: false, date: '' }, dmNotification: false,
            prestige: 0, lootboxes: 0, invites: { regular: 0, left: 0, fake: 0 }
        };
    }
    let u = memoryDb[guildId].users[userId];
    if (u.prestige === undefined) u.prestige = 0;
    if (u.lootboxes === undefined) u.lootboxes = 0;
    if (!u.invites) u.invites = { regular: 0, left: 0, fake: 0 };
    if (!u.unlockedTitles) u.unlockedTitles = ['Chưa có', u.title || 'Chưa có'];
}

async function checkAndAwardRoles(member, guildId, newLevel, newPrestige) {
    const config = memoryDb[guildId].config;
    const guild = member.guild;

    if (config.roleRewards) {
        for (const [lvlStr, roleId] of Object.entries(config.roleRewards)) {
            const reqLvl = parseInt(lvlStr);
            if (newLevel >= reqLvl) {
                const role = guild.roles.cache.get(roleId);
                if (role && !member.roles.cache.has(roleId)) {
                    await member.roles.add(role).catch(() => {});
                }
            }
        }
    }

    if (config.prestigeRewards) {
        for (const [presStr, roleId] of Object.entries(config.prestigeRewards)) {
            const reqPres = parseInt(presStr);
            if (newPrestige >= reqPres) {
                const role = guild.roles.cache.get(roleId);
                if (role && !member.roles.cache.has(roleId)) {
                    await member.roles.add(role).catch(() => {});
                }
            }
        }
    }
}

// --- CÁC SỰ KIỆN CLIENT ---
client.once('ready', async () => {
    memoryDb = loadData();
    console.log(`🤖 Bot đã sẵn sàng: ${client.user.tag}`);

    for (const guild of client.guilds.cache.values()) {
        try {
            const invites = await guild.invites.fetch();
            guildInvites.set(guild.id, invites);
        } catch (e) {
            console.log(`Không thể fetch invites cho server ${guild.name}`);
        }
    }
});

client.on('inviteCreate', async (invite) => {
    const invites = await invite.guild.invites.fetch().catch(() => {});
    if (invites) guildInvites.set(invite.guild.id, invites);
});

client.on('guildMemberAdd', async (member) => {
    const guildId = member.guild.id;
    initGuild(guildId);
    
    const cachedInvites = guildInvites.get(guildId);
    const newInvites = await member.guild.invites.fetch().catch(() => {});
    if (!cachedInvites || !newInvites) return;

    const usedInvite = newInvites.find(inv => {
        const cached = cachedInvites.get(inv.code);
        return cached && inv.uses > cached.uses;
    });

    guildInvites.set(guildId, newInvites);

    if (usedInvite && usedInvite.inviter) {
        const inviterId = usedInvite.inviter.id;
        initUser(guildId, inviterId);
        
        memoryDb[guildId].users[inviterId].invites.regular += 1;
        queueSave();

        const guildConfig = memoryDb[guildId].config;
        const targetChannel = member.guild.channels.cache.get(guildConfig.logChannel) || member.guild.systemChannel;
        
        if (targetChannel) {
            const welcomeEmbed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('👋 Thành Viên Mới Gia Nhập!')
                .setDescription(`Chào mừng ${member} đến với **${member.guild.name}**!\n🎯 Người mời: **${usedInvite.inviter.tag}** (Đã mời: ${memoryDb[guildId].users[inviterId].invites.regular} người)`)
                .setTimestamp();
            targetChannel.send({ embeds: [welcomeEmbed] }).catch(() => {});
        }
    }
});

client.on('voiceStateUpdate', async (oldState, newState) => {
    const userId = newState.id;
    const guildId = newState.guild.id;

    if (!oldState.channelId && newState.channelId) {
        voiceStates.set(`${guildId}_${userId}`, Date.now());
    } else if (oldState.channelId && !newState.channelId) {
        const joinTime = voiceStates.get(`${guildId}_${userId}`);
        if (joinTime) {
            const minutes = Math.floor((Date.now() - joinTime) / 60000);
            voiceStates.delete(`${guildId}_${userId}`);

            if (minutes > 0) {
                initUser(guildId, userId);
                let userData = memoryDb[guildId].users[userId];
                userData.xp += minutes * 15;
                queueSave();
            }
        }
    }
});

client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    const guildId = message.guild.id;
    const userId = message.author.id;

    initUser(guildId, userId);
    const guildConfig = memoryDb[guildId].config;
    const userData = memoryDb[guildId].users[userId];

    if (!message.content.startsWith(PREFIX)) {
        userData.messages = (userData.messages || 0) + 1;
        queueSave();
    }

    if (message.content.trim().length < 3 && !message.content.startsWith(PREFIX)) return;

    if (!guildConfig.noXpChannels.includes(message.channel.id) && !message.content.startsWith(PREFIX)) {
        const cooldownKey = `${guildId}_${userId}`;
        const lastMsgTime = cooldowns.get(cooldownKey) || 0;
        const now = Date.now();

        if (now - lastMsgTime > COOLDOWN_TIME) {
            const channelMultiplier = guildConfig.channelMultipliers[message.channel.id] || 1;
            let xpGained = (guildConfig.isDoubleXp ? 30 : 15) * channelMultiplier;
            if (now < userData.personalBoostUntil) xpGained *= 2;

            userData.xp += xpGained;
            cooldowns.set(cooldownKey, now);

            let xpNeeded = getXpForNextLevel(userData.level);
            if (userData.xp >= xpNeeded) {
                userData.level += 1;
                const newLevel = userData.level;

                if (newLevel % 5 === 0) {
                    userData.lootboxes = (userData.lootboxes || 0) + 1;
                }

                await checkAndAwardRoles(message.member, guildId, newLevel, userData.prestige);

                const levelEmbed = new EmbedBuilder()
                    .setColor('#5865F2')
                    .setAuthor({ name: message.author.tag, iconURL: message.author.displayAvatarURL() })
                    .setTitle('🎉 LÊN CẤP MỚI!')
                    .setDescription(`Chúc mừng ${message.author} đã đạt **Cấp ${newLevel}**!${newLevel % 5 === 0 ? '\n🎁 Bạn nhận được **1 Rương Báu** (`.moruong`)!' : ''}`)
                    .setTimestamp();

                const targetChannel = message.guild.channels.cache.get(guildConfig.logChannel) || message.channel;
                targetChannel.send({ embeds: [levelEmbed] }).catch(() => {});
            }
            queueSave();
        }
    }

    if (!message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();
    
    const isBotAdmin = guildConfig.admins.includes(userId);
    const isBotStaff = guildConfig.staffs.includes(userId) || isBotAdmin || message.member.permissions.has(PermissionFlagsBits.ModerateMembers);

    // --- 1. LỆNH TRỢ GIÚP / HELP (.hlp) ---
    if (command === 'hlp' || command === 'help') {
        const helpEmbed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('📖 Bảng Trợ Giúp & Danh Sách Lệnh Bot')
            .setDescription('Dưới đây là toàn bộ danh sách lệnh thành viên, kiểm duyệt và quản trị hệ thống:')
            .addFields(
                { 
                    name: '📊 Cấp Độ & Hồ Sơ', 
                    value: '• `.cap` (hoặc `.rank`, `.profile`) — Xem thẻ ảnh cấp độ, rank, EXP và danh hiệu\n• `.bxh` — Xem bảng xếp hạng top 10 thành viên' 
                },
                { 
                    name: '🎁 Tương Tác & Kinh Tế', 
                    value: '• `.daily` — Điểm danh nhận Xu & EXP mỗi ngày\n• `.moruong` — Mở rương báu nhận thưởng ngẫu nhiên\n• `.chuyensinh` (hoặc `.prestige`) — Chuyển sinh khi đạt Cấp 50\n• `.shop` & `.mua <ID>` — Cửa hàng vật phẩm\n• `.tien` — Kiểm tra số dư ví & rương\n• `.loimoi` (hoặc `.invites`) — Xem thống kê số lượng mời bạn bè' 
                },
                { 
                    name: '🛡️ Lệnh Kiểm Duyệt (Staff/Admin)', 
                    value: '• `.kick @User [lý do]` — Đuổi thành viên\n• `.ban @User [lý do]` — Cấm thành viên\n• `.timeout @User <phút> [lý do]` — Đình chỉ chat tạm thời\n• `.untimeout @User` — Gỡ timeout\n• `.clear <1-100>` — Xóa tin nhắn nhanh' 
                },
                { 
                    name: '⚙️ Lệnh Quản Trị & Cấu Hình (Admin)', 
                    value: '• `.addadmin` / `.removeadmin` — Quản lý Admin bot\n• `.addstaff` / `.removestaff` — Quản lý Staff bot\n• `.set-kenhthongbao #kenh` — Cài kênh thông báo lên cấp\n• `.set-kenhexp #kenh <số>` — Cài hệ số nhân EXP kênh\n• `.set-rolelevel` / `.set-roleprestige` — Thưởng Role tự động\n• `.shop-add` / `.shop-remove` — Quản lý cửa hàng\n• `.settitle`, `.givexp`, `.removexp`, `.resetxp`, `.givecoin`, `.removecoin`' 
                }
            )
            .setFooter({ text: `Yêu cầu bởi ${message.author.tag}` })
            .setTimestamp();

        return message.channel.send({ embeds: [helpEmbed] });
    }

    // --- 2. LỆNH KIỂM DUYỆT (MODERATION) ---
    const modCommands = ['kick', 'ban', 'timeout', 'untimeout', 'clear'];
    if (modCommands.includes(command)) {
        if (!isBotStaff) return message.reply('🚫 Bạn không có quyền sử dụng lệnh kiểm duyệt này!');
    }

    if (command === 'kick') {
        const targetMember = message.mentions.members.first();
        const reason = args.slice(1).join(' ') || 'Không có lý do';
        if (!targetMember) return message.reply('⚠️ Cú pháp: `.kick @User [lý do]`');
        if (!targetMember.kickable) return message.reply('🚫 Bot không đủ quyền để kick thành viên này.');
        await targetMember.kick(reason).catch(err => message.reply('❌ Lỗi: ' + err.message));
        return message.reply(`✅ Đã kick ${targetMember.user.tag}. Lý do: \`${reason}\``);
    }

    if (command === 'ban') {
        const targetMember = message.mentions.members.first();
        const reason = args.slice(1).join(' ') || 'Không có lý do';
        if (!targetMember) return message.reply('⚠️ Cú pháp: `.ban @User [lý do]`');
        if (!targetMember.bannable) return message.reply('🚫 Bot không đủ quyền để ban thành viên này.');
        await targetMember.ban({ reason }).catch(err => message.reply('❌ Lỗi: ' + err.message));
        return message.reply(`✅ Đã ban ${targetMember.user.tag}. Lý do: \`${reason}\``);
    }

    if (command === 'timeout' || command === 'mute') {
        const targetMember = message.mentions.members.first();
        const minutes = parseInt(args[1]);
        const reason = args.slice(2).join(' ') || 'Không có lý do';
        if (!targetMember || isNaN(minutes)) return message.reply('⚠️ Cú pháp: `.timeout @User <số_phút> [lý do]`');
        await targetMember.timeout(minutes * 60 * 1000, reason).catch(err => message.reply('❌ Lỗi: ' + err.message));
        return message.reply(`🔇 Đã timeout ${targetMember} trong **${minutes} phút**. Lý do: \`${reason}\``);
    }

    if (command === 'untimeout' || command === 'unmute') {
        const targetMember = message.mentions.members.first();
        if (!targetMember) return message.reply('⚠️ Cú pháp: `.untimeout @User`');
        await targetMember.timeout(null).catch(err => message.reply('❌ Lỗi: ' + err.message));
        return message.reply(`🔊 Đã gỡ timeout cho ${targetMember}.`);
    }

    if (command === 'clear' || command === 'purge') {
        const amount = parseInt(args[0]);
        if (isNaN(amount) || amount < 1 || amount > 100) return message.reply('⚠️ Cú pháp: `.clear <1-100>`');
        try {
            const fetched = await message.channel.bulkDelete(amount + 1, true);
            const msg = await message.channel.send(`🧹 Đã xóa thành công **${fetched.size - 1}** tin nhắn.`);
            setTimeout(() => msg.delete().catch(() => {}), 3000);
        } catch (err) {
            return message.reply('❌ Chỉ có thể xóa tin nhắn gửi trong vòng 14 ngày trở lại đây.');
        }
        return;
    }

    // --- 3. LỆNH QUẢN LÝ QUYỀN (ADMIN) ---
    const adminCommands = [
        'set-kenhexp', 'set-rolelevel', 'set-roleprestige', 
        'shop-add', 'shop-remove', 'set-kenhthongbao',
        'settitle', 'givexp', 'removexp', 'resetxp', 'givecoin', 'removecoin',
        'addadmin', 'removeadmin', 'addstaff', 'removestaff'
    ];
    if (adminCommands.includes(command) && !isBotAdmin) {
        return message.reply('🚫 Quyền truy cập bị từ chối! Chỉ **Admin của Bot** mới dùng được lệnh này.');
    }

    if (command === 'addadmin') {
        const targetMember = message.mentions.members.first();
        if (!targetMember) return message.reply('⚠️ Cú pháp: `.addadmin @User`');
        if (guildConfig.admins.includes(targetMember.id)) return message.reply('⚠️ Người này đã là Admin từ trước!');
        guildConfig.admins.push(targetMember.id);
        queueSave();
        return message.reply(`✅ Đã thêm ${targetMember} vào danh sách **Admin**.`);
    }

    if (command === 'removeadmin') {
        const targetMember = message.mentions.members.first();
        if (!targetMember) return message.reply('⚠️ Cú pháp: `.removeadmin @User`');
        if (targetMember.id === MY_DISCORD_ID) return message.reply('🚫 Không thể gỡ quyền Admin gốc của chủ sở hữu bot!');
        const index = guildConfig.admins.indexOf(targetMember.id);
        if (index === -1) return message.reply('⚠️ Người này không có trong danh sách Admin!');
        guildConfig.admins.splice(index, 1);
        queueSave();
        return message.reply(`✅ Đã gỡ quyền Admin của ${targetMember}.`);
    }

    if (command === 'addstaff') {
        const targetMember = message.mentions.members.first();
        if (!targetMember) return message.reply('⚠️ Cú pháp: `.addstaff @User`');
        if (guildConfig.staffs.includes(targetMember.id)) return message.reply('⚠️ Người này đã là Staff từ trước!');
        guildConfig.staffs.push(targetMember.id);
        queueSave();
        return message.reply(`✅ Đã thêm ${targetMember} vào danh sách **Staff**.`);
    }

    if (command === 'removestaff') {
        const targetMember = message.mentions.members.first();
        if (!targetMember) return message.reply('⚠️ Cú pháp: `.removestaff @User`');
        const index = guildConfig.staffs.indexOf(targetMember.id);
        if (index === -1) return message.reply('⚠️ Người này không có trong danh sách Staff!');
        guildConfig.staffs.splice(index, 1);
        queueSave();
        return message.reply(`✅ Đã gỡ quyền Staff của ${targetMember}.`);
    }

    // --- 4. LỆNH CẤU HÌNH & USER QUẢN LÝ ---
    if (command === 'settitle') {
        const targetMember = message.mentions.members.first();
        const newTitle = args.slice(1).join(' ');
        if (!targetMember || !newTitle) return message.reply('⚠️ Cú pháp: `.settitle @User <Danh hiệu>`');
        initUser(guildId, targetMember.id);
        memoryDb[guildId].users[targetMember.id].title = newTitle;
        if (!memoryDb[guildId].users[targetMember.id].unlockedTitles.includes(newTitle)) {
            memoryDb[guildId].users[targetMember.id].unlockedTitles.push(newTitle);
        }
        queueSave();
        return message.reply(`✅ Đã đặt danh hiệu \`${newTitle}\` cho ${targetMember}.`);
    }

    if (command === 'givexp') {
        const targetMember = message.mentions.members.first();
        const amount = parseInt(args[1]);
        if (!targetMember || isNaN(amount)) return message.reply('⚠️ Cú pháp: `.givexp @User <số_exp>`');
        initUser(guildId, targetMember.id);
        memoryDb[guildId].users[targetMember.id].xp += amount;
        queueSave();
        return message.reply(`✅ Đã cộng **${amount} EXP** cho ${targetMember}.`);
    }

    if (command === 'removexp') {
        const targetMember = message.mentions.members.first();
        const amount = parseInt(args[1]);
        if (!targetMember || isNaN(amount)) return message.reply('⚠️ Cú pháp: `.removexp @User <số_exp>`');
        initUser(guildId, targetMember.id);
        memoryDb[guildId].users[targetMember.id].xp = Math.max(0, memoryDb[guildId].users[targetMember.id].xp - amount);
        queueSave();
        return message.reply(`✅ Đã trừ **${amount} EXP** của ${targetMember}.`);
    }

    if (command === 'resetxp') {
        const targetMember = message.mentions.members.first();
        if (!targetMember) return message.reply('⚠️ Cú pháp: `.resetxp @User`');
        initUser(guildId, targetMember.id);
        memoryDb[guildId].users[targetMember.id].xp = 0;
        memoryDb[guildId].users[targetMember.id].level = 0;
        queueSave();
        return message.reply(`🔄 Đã reset EXP và Level của ${targetMember}.`);
    }

    if (command === 'givecoin') {
        const targetMember = message.mentions.members.first();
        const amount = parseInt(args[1]);
        if (!targetMember || isNaN(amount)) return message.reply('⚠️ Cú pháp: `.givecoin @User <số_xu>`');
        initUser(guildId, targetMember.id);
        memoryDb[guildId].users[targetMember.id].coins = (memoryDb[guildId].users[targetMember.id].coins || 0) + amount;
        queueSave();
        return message.reply(`✅ Đã cộng **${amount} Xu** cho ${targetMember}.`);
    }

    if (command === 'removecoin') {
        const targetMember = message.mentions.members.first();
        const amount = parseInt(args[1]);
        if (!targetMember || isNaN(amount)) return message.reply('⚠️ Cú pháp: `.removecoin @User <số_xu>`');
        initUser(guildId, targetMember.id);
        memoryDb[guildId].users[targetMember.id].coins = Math.max(0, (memoryDb[guildId].users[targetMember.id].coins || 0) - amount);
        queueSave();
        return message.reply(`✅ Đã trừ **${amount} Xu** của ${targetMember}.`);
    }

    if (command === 'set-kenhexp') {
        const channel = message.mentions.channels.first() || message.channel;
        const multiplier = parseInt(args[0] || args[1]);
        if (isNaN(multiplier) || multiplier < 1 || multiplier > 10) return message.reply('⚠️ Cú pháp: `.set-kenhexp #kenh <1-10>`');
        guildConfig.channelMultipliers[channel.id] = multiplier;
        queueSave();
        return message.reply(`✅ Đã đặt hệ số EXP kênh ${channel} là **x${multiplier}**.`);
    }

    if (command === 'set-kenhthongbao') {
        const channel = message.mentions.channels.first();
        if (!channel) return message.reply('⚠️ Cú pháp: `.set-kenhthongbao #kenh`');
        guildConfig.logChannel = channel.id;
        queueSave();
        return message.reply(`✅ Đã đặt kênh ${channel} làm nơi gửi thông báo lên cấp!`);
    }

    if (command === 'set-rolelevel') {
        const levelReq = parseInt(args[0]);
        const role = message.mentions.roles.first();
        if (isNaN(levelReq) || !role) return message.reply('⚠️ Cú pháp: `.set-rolelevel <level> @Role`');
        guildConfig.roleRewards[levelReq] = role.id;
        queueSave();
        return message.reply(`✅ Đã thiết lập role thưởng cho Cấp ${levelReq}.`);
    }

    if (command === 'set-roleprestige') {
        const presReq = parseInt(args[0]);
        const role = message.mentions.roles.first();
        if (isNaN(presReq) || !role) return message.reply('⚠️ Cú pháp: `.set-roleprestige <chuyển_sinh> @Role`');
        guildConfig.prestigeRewards[presReq] = role.id;
        queueSave();
        return message.reply(`✅ Đã thiết lập role thưởng cho cấp chuyển sinh ${presReq}.`);
    }

    if (command === 'shop-add') {
        const content = args.join(' ');
        const parts = content.split('|').map(p => p.trim());
        if (parts.length < 3) return message.reply('⚠️ Cú pháp: `.shop-add Tên | Giá | boost/title | [Title]`');
        const name = parts[0];
        const price = parseInt(parts[1]);
        const type = parts[2].toLowerCase();
        const subValue = parts[3] || '';

        const currentShop = guildConfig.shopItems;
        const newId = currentShop.length > 0 ? Math.max(...currentShop.map(i => i.id)) + 1 : 1;
        currentShop.push({ id: newId, name, price, type, title: type === 'title' ? subValue : undefined });
        queueSave();
        return message.reply(`✅ Đã thêm vật phẩm ID ${newId} vào shop!`);
    }

    if (command === 'shop-remove') {
        const itemId = parseInt(args[0]);
        if (isNaN(itemId)) return message.reply('⚠️ Cú pháp: `.shop-remove <ID>`');
        const index = guildConfig.shopItems.findIndex(i => i.id === itemId);
        if (index === -1) return message.reply('⚠️ Không tìm thấy vật phẩm ID này!');
        guildConfig.shopItems.splice(index, 1);
        queueSave();
        return message.reply(`✅ Đã xóa vật phẩm ID ${itemId} khỏi shop.`);
    }

    // --- 5. LỆNH CHỨC NĂNG CÁ NHÂN & KINH TẾ ---
    if (command === 'chuyensinh' || command === 'prestige') {
        const currentLevel = userData.level;
        const currentPrestige = userData.prestige || 0;
        const REQUIRED_LEVEL = 50; 

        if (currentLevel < REQUIRED_LEVEL) {
            return message.reply(`🚫 Bạn cần đạt **Cấp ${REQUIRED_LEVEL}** để chuyển sinh (Hiện tại: Cấp ${currentLevel}).`);
        }

        userData.level = 0;
        userData.xp = 0;
        userData.prestige = currentPrestige + 1;
        userData.coins = (userData.coins || 0) + 5000;

        await checkAndAwardRoles(message.member, guildId, userData.level, userData.prestige);
        queueSave();

        const prestigeEmbed = new EmbedBuilder()
            .setColor('#FF4500')
            .setAuthor({ name: message.author.tag, iconURL: message.author.displayAvatarURL() })
            .setTitle('🌟 CHUYỂN SINH THÀNH CÔNG!')
            .setDescription(`Chúc mừng ${message.author} đã **Chuyển Sinh bậc ${userData.prestige}** thành công!\n\n🔄 Reset cấp độ về 0.\n🎁 Nhận ngay **+5000 Xu**!`)
            .setTimestamp();

        return message.channel.send({ embeds: [prestigeEmbed] });
    }

    if (command === 'moruong') {
        if ((userData.lootboxes || 0) <= 0) return message.reply('📦 Bạn không có Rương Báu nào! Hãy cày cấp để nhận rương.');
        userData.lootboxes -= 1;

        const rewardTypes = ['coins', 'xp', 'title'];
        const picked = rewardTypes[Math.floor(Math.random() * rewardTypes.length)];
        let rewardText = '';

        if (picked === 'coins') {
            const rewardCoins = Math.floor(Math.random() * 1000) + 500;
            userData.coins += rewardCoins;
            rewardText = `💰 **+${rewardCoins} Xu**`;
        } else if (picked === 'xp') {
            const rewardXp = Math.floor(Math.random() * 500) + 200;
            userData.xp += rewardXp;
            rewardText = `⚡ **+${rewardXp} EXP**`;
        } else {
            const specialTitle = '🌟 Thần Thánh Chat';
            userData.title = specialTitle;
            if (!userData.unlockedTitles.includes(specialTitle)) userData.unlockedTitles.push(specialTitle);
            rewardText = `🏷️ Danh hiệu độc quyền: \`${specialTitle}\``;
        }

        queueSave();
        return message.reply(`🎁 Mở Rương Báu nhận được: ${rewardText}! (Còn lại: ${userData.lootboxes} rương)`);
    }

    if (command === 'shop') {
        const currentShop = guildConfig.shopItems;
        let shopText = currentShop.map(i => `**ID ${i.id}**:${i.name} — Giá: \`${i.price} Xu\``).join('\n');
        const embed = new EmbedBuilder().setColor('#FFD700').setTitle('🛒 Cửa Hàng Server').setDescription(shopText || 'Trống').setFooter({ text: 'Dùng .mua <ID> để mua' });
        return message.channel.send({ embeds: [embed] });
    }

    if (command === 'mua') {
        const itemId = parseInt(args[0]);
        const item = guildConfig.shopItems.find(i => i.id === itemId);
        if (!item) return message.reply('⚠️ Vật phẩm không tồn tại!');
        if ((userData.coins || 0) < item.price) return message.reply('🚫 Không đủ Xu!');

        userData.coins -= item.price;
        if (item.type === 'boost') {
            userData.personalBoostUntil = Date.now() + 3600000;
            message.reply(`✅ Đã mua **${item.name}**! X2 EXP cá nhân trong 1 giờ.`);
        } else if (item.type === 'title') {
            userData.title = item.title;
            if (!userData.unlockedTitles.includes(item.title)) userData.unlockedTitles.push(item.title);
            message.reply(`✅ Đã mua và kích hoạt danh hiệu **${item.title}**!`);
        }
        queueSave();
        return;
    }

    if (command === 'daily') {
        const now = Date.now();
        if (now - userData.lastDaily < 86400000) return message.reply('⏳ Điểm danh rồi! Quay lại vào ngày mai nhé.');
        userData.lastDaily = now;
        userData.coins = (userData.coins || 0) + 200;
        userData.xp += 100;
        queueSave();
        return message.reply('🎁 Điểm danh thành công: **+200 Xu** & **+100 EXP**.');
    }

    if (command === 'tien' || command === 'vi') return message.reply(`💰 Số dư ví: **${userData.coins || 0} Xu** | 📦 Rương báu: **${userData.lootboxes || 0}**.`);

    if (command === 'loimoi' || command === 'invites') {
        const targetMember = message.mentions.members.first() || message.member;
        initUser(guildId, targetMember.id);
        const invData = memoryDb[guildId].users[targetMember.id].invites || { regular: 0, left: 0, fake: 0 };
        return message.reply(`📊 Thống kê lời mời của **${targetMember.user.tag}**:\n• Đã mời thành công: **${invData.regular}** người`);
    }

    // --- 6. LỆNH RANK CARD (CANVAS) & BXH ---
    if (command === 'cap' || command === 'rank' || command === 'profile' || command === 'thongtin') {
        const targetMember = message.mentions.members.first() || message.member;
        const targetUser = targetMember.user;
        initUser(guildId, targetUser.id);
        const uData = memoryDb[guildId].users[targetUser.id];

        const allUsers = Object.entries(memoryDb[guildId].users || {})
            .map(([id, data]) => ({ id, level: data.level, xp: data.xp, prestige: data.prestige || 0 }))
            .sort((a, b) => b.prestige === a.prestige ? (b.level === a.level ? b.xp - a.xp : b.level - a.level) : b.prestige - a.prestige);
        
        const rankIndex = allUsers.findIndex(u => u.id === targetUser.id);
        const rank = rankIndex !== -1 ? rankIndex + 1 : allUsers.length + 1;
        const requiredXp = getXpForNextLevel(uData.level);

        try {
            const canvas = Canvas.createCanvas(930, 282);
            const ctx = canvas.getContext('2d');

            ctx.fillStyle = '#2b2d31';
            ctx.beginPath();
            ctx.roundRect(0, 0, 930, 282, 20);
            ctx.fill();
            ctx.strokeStyle = '#5865F2';
            ctx.lineWidth = 3;
            ctx.stroke();

            const avatarURL = targetUser.displayAvatarURL({ extension: 'png', size: 256 });
            const avatar = await Canvas.loadImage(avatarURL);
            
            ctx.save();
            ctx.beginPath();
            ctx.arc(125, 141, 75, 0, Math.PI * 2, true);
            ctx.closePath();
            ctx.clip();
            ctx.drawImage(avatar, 50, 66, 150, 150);
            ctx.restore();

            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.arc(125, 141, 77, 0, Math.PI * 2, true);
            ctx.stroke();

            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 36px sans-serif';
            ctx.fillText(targetUser.username, 230, 85);

            ctx.fillStyle = '#b5bac1';
            ctx.font = '20px sans-serif';
            ctx.fillText(`Danh hiệu: ${uData.title || 'Chưa có'}`, 230, 120);

            ctx.fillStyle = '#80848e';
            ctx.font = 'bold 26px sans-serif';
            ctx.textAlign = 'right';
            ctx.fillText(`RANK #${rank}`, 870, 75);

            ctx.fillStyle = '#5865F2';
            ctx.font = 'bold 36px sans-serif';
            ctx.fillText(`LVL ${uData.level}`, 870, 115);
            ctx.textAlign = 'left';

            const barX = 230, barY = 175, barW = 640, barH = 35;
            ctx.fillStyle = '#1e1f22';
            ctx.beginPath();
            ctx.roundRect(barX, barY, barW, barH, 10);
            ctx.fill();

            let progress = requiredXp > 0 ? (uData.xp / requiredXp) : 0;
            if (progress > 1) progress = 1;
            const progressW = Math.max(20, barW * progress);

            ctx.fillStyle = '#5865F2';
            ctx.beginPath();
            ctx.roundRect(barX, barY, progressW, barH, 10);
            ctx.fill();

            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 18px sans-serif';
            ctx.fillText(`${uData.xp} / ${requiredXp} XP`, barX + 20, barY + 23);

            const attachment = new AttachmentBuilder(canvas.toBuffer(), { name: 'rank_card.png' });
            return message.channel.send({ files: [attachment] });

        } catch (error) {
            console.error('Lỗi tạo ảnh rank card:', error);
            return message.reply(`📊 **${targetUser.username}** | Cấp: **${uData.level}** | EXP: **${uData.xp}/${requiredXp}** | Rank: **#${rank}**`);
        }
    }

    if (command === 'bxh') {
        const users = memoryDb[guildId]?.users;
        if (!users || !Object.keys(users).length) return message.channel.send('Chưa có dữ liệu bảng xếp hạng!');
        const sorted = Object.entries(users)
            .map(([id, data]) => ({ id, level: data.level, xp: data.xp, prestige: data.prestige || 0 }))
            .sort((a, b) => b.prestige === a.prestige ? (b.level === a.level ? b.xp - a.xp : b.level - a.level) : b.prestige - a.prestige)
            .slice(0, 10);

        let text = sorted.map((u, i) => `**#${i + 1}** <@${u.id}> — Cấp ${u.level} (${u.xp} EXP)`).join('\n');
        const embed = new EmbedBuilder().setColor('#FFD700').setTitle(`🏆 Bảng Xếp Hạng - ${message.guild.name}`).setDescription(text);
        return message.channel.send({ embeds: [embed] });
    }
});

client.login(TOKEN);
