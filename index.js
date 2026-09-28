const { Client, GatewayIntentBits, EmbedBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
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
        GatewayIntentBits.GuildPresences
    ]
});

const TOKEN = process.env.TOKEN || 'THAY_TOKEN_BOT_CUA_BAN_VAO_DAY';
const PREFIX = '.';
const MY_DISCORD_ID = '1498554147304247296';
const DATA_FILE = path.join(__dirname, 'level_data.json');
const COOLDOWN_TIME = 60000;

const cooldowns = new Map();
const voiceStates = new Map();

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
            prestige: 0, lootboxes: 0
        };
    }
    let u = memoryDb[guildId].users[userId];
    if (u.prestige === undefined) u.prestige = 0;
    if (u.lootboxes === undefined) u.lootboxes = 0;
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

async function updateServerStats(guild) {
    initGuild(guild.id);
    const statsConfig = memoryDb[guild.id].config.statsChannels;
    if (!statsConfig || !statsConfig.total) return;

    try {
        await guild.members.fetch();
        const totalMembers = guild.memberCount;
        const botCount = guild.members.cache.filter(m => m.user.bot).size;
        const onlineMembers = guild.members.cache.filter(m => !m.user.bot && m.presence && m.presence.status !== 'offline').size;

        const totalCh = guild.channels.cache.get(statsConfig.total);
        const onlineCh = guild.channels.cache.get(statsConfig.online);
        const botCh = guild.channels.cache.get(statsConfig.bots);

        if (totalCh) await totalCh.setName(`👥 Tổng Member: ${totalMembers}`).catch(() => {});
        if (onlineCh) await onlineCh.setName(`🟢 Trực Tuyến: ${onlineMembers}`).catch(() => {});
        if (botCh) await botCh.setName(`🤖 Số Bot: ${botCount}`).catch(() => {});
    } catch (e) {}
}

client.once('ready', () => {
    memoryDb = loadData();
    console.log(`🤖 Bot đã sẵn sàng: ${client.user.tag}`);
    setInterval(() => client.guilds.cache.forEach(g => updateServerStats(g)), 600000);
});

client.on('guildMemberAdd', member => updateServerStats(member.guild));
client.on('guildMemberRemove', member => updateServerStats(member.guild));

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

    const adminCommands = ['set-kenhexp', 'set-rolelevel', 'set-roleprestige', 'shop-add', 'shop-remove', 'caidat-thongke'];
    if (adminCommands.includes(command) && !isBotAdmin) {
        return message.reply('🚫 Quyền truy cập bị từ chối!');
    }

    // --- LỆNH HƯỚNG DẪN / HELP ---
    if (command === 'hlp' || command === 'help') {
        const helpEmbed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('📖 Bảng Trợ Giúp & Danh Sách Lệnh Bot')
            .setDescription('Dưới đây là các lệnh bạn có thể sử dụng trong server:')
            .addFields(
                { name: '📊 Cấp độ & Hồ sơ', value: '`.cap` hoặc `.profile` — Xem thông số cấp độ, rank, xu của bạn\n`.bxh` — Xem bảng xếp hạng cấp độ của server' },
                { name: '🎁 Tương tác & Phần thưởng', value: '`.daily` — Điểm danh nhận Xu và EXP mỗi ngày\n`.moruong` — Mở rương báu nhận quà ngẫu nhiên (nhận được khi lên mốc cấp độ x5)' },
                { name: '🛒 Cửa hàng & Kinh tế', value: '`.shop` — Xem danh sách vật phẩm trong cửa hàng\n`.mua <ID>` — Mua vật phẩm (như thẻ X2 EXP, danh hiệu)\n`.tien` (hoặc `.vi`) — Kiểm tra số dư ví cá nhân' },
                { name: '🛠️ Lệnh Admin (Dành cho Quản trị viên)', value: '`.set-kenhexp #kenh <số>` — Chỉnh hệ số EXP cho kênh\n`.set-rolelevel <level> @Role` — Thưởng role tự động theo cấp độ\n`.shop-add Tên | Giá | boost/title | [Title]` — Thêm vật phẩm vào shop' }
            )
            .setFooter({ text: `Yêu cầu bởi ${message.author.tag}` })
            .setTimestamp();

        return message.channel.send({ embeds: [helpEmbed] });
    }

    if (command === 'set-kenhexp') {
        const channel = message.mentions.channels.first() || message.channel;
        const multiplier = parseInt(args[0] || args[1]);
        if (isNaN(multiplier) || multiplier < 1 || multiplier > 10) {
            return message.reply('⚠️ Cú pháp: `.set-kenhexp #kenh <hệ_số từ 1 đến 10>`');
        }
        guildConfig.channelMultipliers[channel.id] = multiplier;
        queueSave();
        return message.reply(`✅ Đã đặt hệ số EXP cho kênh ${channel} là **x${multiplier}**.`);
    }

    if (command === 'set-rolelevel') {
        const levelReq = parseInt(args[0]);
        const role = message.mentions.roles.first();
        if (isNaN(levelReq) || !role) return message.reply('⚠️ Cú pháp: `.set-rolelevel <level> @Role`');
        guildConfig.roleRewards[levelReq] = role.id;
        queueSave();
        return message.reply(`✅ Đã thiết lập role thưởng cho Cấp ${levelReq}.`);
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

    if (command === 'moruong') {
        if ((userData.lootboxes || 0) <= 0) return message.reply('📦 Bạn không có Rương Báu nào! Hãy cày cấp độ để nhận rương.');
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
        return message.reply(`🎁 Bạn đã mở Rương Báu và nhận được: ${rewardText}! (Còn lại: ${userData.lootboxes} rương)`);
    }

    if (command === 'shop') {
        const currentShop = guildConfig.shopItems;
        let shopText = currentShop.map(i => `**ID ${i.id}**:${i.name} — Giá: \`${i.price} Xu\``).join('\n');
        const embed = new EmbedBuilder().setColor('#FFD700').setTitle('🛒 Cửa Hàng Server').setDescription(shopText).setFooter({ text: 'Dùng .mua <ID> để mua' });
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
            message.reply(`✅ Đã sở hữu và bật danh hiệu **${item.title}**!`);
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

    // --- LỆNH PROFILE / CAP DẠNG EMBED ---
    if (command === 'cap' || command === 'profile' || command === 'thongtin') {
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

        const profileEmbed = new EmbedBuilder()
            .setColor('#5865F2')
            .setAuthor({ name: `Hồ Sơ Cấp Độ — ${targetUser.username}`, iconURL: targetUser.displayAvatarURL() })
            .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
            .addFields(
                { name: '📊 Xếp Hạng (Rank)', value: `\`#${rank}\``, inline: true },
                { name: '🎖️ Cấp Độ (Level)', value: `\`${uData.level}\``, inline: true },
                { name: '✨ Chuyển Sinh', value: `\`${uData.prestige || 0}\``, inline: true },
                { name: '⚡ Kinh Nghiệm (EXP)', value: `\`${uData.xp} / ${requiredXp}\``, inline: true },
                { name: '🏷️ Danh Hiệu', value: `\`${uData.title || 'Chưa có'}\``, inline: true },
                { name: '💰 Số Dư Ví', value: `\`${uData.coins || 0} Xu\``, inline: true }
            )
            .setFooter({ text: `Yêu cầu bởi ${message.author.tag}` })
            .setTimestamp();

        return message.channel.send({ embeds: [profileEmbed] });
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
