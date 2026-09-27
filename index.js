const { Client, GatewayIntentBits, EmbedBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
const express = require('express');

// --- 1. WEB SERVER CHO RENDER ---
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => res.send('🤖 Bot Online 24/7!'));
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
const ADMIN_IDS = ['ID_DISCORD_CUA_BAN_VAO_DAY'];
const DATA_FILE = path.join(__dirname, 'level_data.json');
const COOLDOWN_TIME = 60000;

const cooldowns = new Map();
const voiceStates = new Map();

// --- 3. CƠ CHẾ QUẢN LÝ DỮ LIỆU TỐI ƯU (DEBOUNCE SAVE) ---
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
        console.error('⚠️ Lỗi đọc file data, khởi tạo lại:', err);
        return {};
    }
}

// Ghi file bất đồng bộ sau 3 giây dừng thao tác (giảm tải đĩa)
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
            config: { logChannel: null, noXpChannels: [], isDoubleXp: false, bannedWords: [], statsChannels: {} },
            users: {}
        };
    }
}

function initUser(guildId, userId) {
    initGuild(guildId);
    if (!memoryDb[guildId].users[userId]) {
        memoryDb[guildId].users[userId] = {
            xp: 0, level: 0, messages: 0, coins: 0, lastDaily: 0,
            title: 'Chưa có', personalBoostUntil: 0, warns: [],
            quests: { msgCount: 0, claimed: false, date: '' }, dmNotification: false
        };
    }
}

const SHOP_ITEMS = [
    { id: 1, name: 'Thẻ X2 EXP (1 giờ)', price: 500, type: 'boost' },
    { id: 2, name: 'Danh hiệu: 🐉 Chiến Thần Chat', price: 1000, type: 'title', title: '🐉 Chiến Thần Chat' },
    { id: 3, name: 'Danh hiệu: 👑 Đại Gia Server', price: 2000, type: 'title', title: '👑 Đại Gia Server' }
];

// --- 4. HÀM CẬP NHẬT THỐNG KÊ SERVER ---
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
    } catch (e) {
        console.error("Lỗi cập nhật kênh thống kê:", e.message);
    }
}

// --- 5. EVENT LISTENERS ---
client.once('ready', () => {
    memoryDb = loadData();
    console.log(`🤖 Bot JangJii sẵn sàng: ${client.user.tag}`);
    
    // Cập nhật thống kê 10p/lần
    setInterval(() => client.guilds.cache.forEach(g => updateServerStats(g)), 600000);

    // Dọn dẹp cache cooldown hết hạn mỗi giờ (Tránh ngốn RAM)
    setInterval(() => {
        const now = Date.now();
        for (const [key, time] of cooldowns.entries()) {
            if (now - time > COOLDOWN_TIME * 2) cooldowns.delete(key);
        }
    }, 3600000);
});

client.on('guildMemberAdd', member => updateServerStats(member.guild));
client.on('guildMemberRemove', member => updateServerStats(member.guild));

// TÍNH EXP VOICE
client.on('voiceStateUpdate', (oldState, newState) => {
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
                const guildConfig = memoryDb[guildId].config;
                let baseRate = guildConfig.isDoubleXp ? 30 : 15;
                if (Date.now() < memoryDb[guildId].users[userId].personalBoostUntil) baseRate *= 2;

                let userData = memoryDb[guildId].users[userId];
                userData.xp += minutes * baseRate;

                let xpNeeded = getXpForNextLevel(userData.level);
                while (userData.xp >= xpNeeded) {
                    userData.level += 1;
                    xpNeeded = getXpForNextLevel(userData.level);
                }
                queueSave();
            }
        }
    }
});

// XỬ LÝ CHAT & LỆNH
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    const guildId = message.guild.id;
    const userId = message.author.id;

    initUser(guildId, userId);
    const guildConfig = memoryDb[guildId].config;
    const userData = memoryDb[guildId].users[userId];

    // Lọc từ cấm
    const hasBannedWord = guildConfig.bannedWords.some(word => message.content.toLowerCase().includes(word));
    if (hasBannedWord && !ADMIN_IDS.includes(userId) && !message.member.permissions.has(PermissionFlagsBits.Administrator)) {
        await message.delete().catch(() => {});
        const warnMsg = await message.channel.send(`⚠️ ${message.author}, tin nhắn chứa từ bị cấm!`);
        setTimeout(() => warnMsg.delete().catch(() => {}), 4000);
        return;
    }

    // Đếm tin nhắn & Nhiệm vụ
    const today = new Date().toLocaleDateString('vi-VN');
    if (userData.quests.date !== today) {
        userData.quests = { msgCount: 0, claimed: false, date: today };
    }

    if (!message.content.startsWith(PREFIX)) {
        userData.messages = (userData.messages || 0) + 1;
        userData.quests.msgCount += 1;
        queueSave();
    }

    // Lọc spam tin ngắn
    if (message.content.trim().length < 3 && !message.content.startsWith(PREFIX)) return;

    // Cộng EXP Chat
    if (!guildConfig.noXpChannels.includes(message.channel.id) && !message.content.startsWith(PREFIX)) {
        const cooldownKey = `${guildId}_${userId}`;
        const lastMsgTime = cooldowns.get(cooldownKey) || 0;
        const now = Date.now();

        if (now - lastMsgTime > COOLDOWN_TIME) {
            let xpGained = guildConfig.isDoubleXp ? 30 : 15;
            if (now < userData.personalBoostUntil) xpGained *= 2;

            userData.xp += xpGained;
            cooldowns.set(cooldownKey, now);

            let xpNeeded = getXpForNextLevel(userData.level);
            if (userData.xp >= xpNeeded) {
                userData.level += 1;
                const newLevel = userData.level;

                const levelEmbed = new EmbedBuilder()
                    .setColor('#5865F2')
                    .setAuthor({ name: message.author.tag, iconURL: message.author.displayAvatarURL() })
                    .setTitle('🎉 LÊN CẤP MỚI!')
                    .setDescription(`Chúc mừng ${message.author} đã đạt **Cấp ${newLevel}**!`)
                    .addFields({ name: '🎯 EXP Cần', value: `\`${getXpForNextLevel(newLevel)} EXP\``, inline: true })
                    .setTimestamp();

                if (userData.dmNotification) {
                    message.author.send({ embeds: [levelEmbed] }).catch(() => {});
                } else {
                    const targetChannel = message.guild.channels.cache.get(guildConfig.logChannel) || message.channel;
                    targetChannel.send({ embeds: [levelEmbed] }).catch(() => {});
                }
            }
            queueSave();
        }
    }

    // LỆNH LÀM VIỆC
    if (!message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    const adminCommands = ['caidat-kenh', 'cam-exp', 'set-lv', 'cong-exp', 'tru-exp', 'reset-user', 'reset-all', 'x2-exp', 'warn', 'cam-tu', 'xoa-cam-tu', 'caidat-thongke', 'thongbao-dm'];
    const isAdmin = ADMIN_IDS.includes(message.author.id) || message.member.permissions.has(PermissionFlagsBits.Administrator);

    if (adminCommands.includes(command) && !isAdmin) {
        return message.reply('🚫 Quyền truy cập bị từ chối!');
    }

    // --- BỘ LỆNH ADMIN ---
    if (command === 'thongbao-dm') {
        const target = message.mentions.users.first();
        const subCommand = args[0]?.toLowerCase();

        if (subCommand === 'all') {
            const content = args.slice(1).join(' ');
            if (!content) return message.reply('⚠️ Cú pháp: `.thongbao-dm all <nội_dung>`');

            const statusMsg = await message.reply('⏳ Đang tiến hành gửi DM toàn máy chủ...');
            await message.guild.members.fetch();
            const members = message.guild.members.cache.filter(m => !m.user.bot);

            let success = 0, fail = 0;
            const embed = new EmbedBuilder()
                .setColor('#FF4500')
                .setTitle(`📢 THÔNG BÁO TỪ BQT ${message.guild.name.toUpperCase()}`)
                .setDescription(content)
                .setFooter({ text: `Gửi bởi: ${message.author.tag}` })
                .setTimestamp();

            for (const [id, member] of members) {
                try {
                    await member.send({ embeds: [embed] });
                    success++;
                    await new Promise(res => setTimeout(res, 1000)); // Delay 1s chống rate limit
                } catch {
                    fail++;
                }
            }
            return statusMsg.edit(`✅ Đã gửi xong! Thành công: **${success}** | Thất bại: **${fail}**`);
        }

        if (target) {
            const content = args.slice(1).join(' ');
            if (!content) return message.reply('⚠️ Cú pháp: `.thongbao-dm @User <nội_dung>`');

            const embed = new EmbedBuilder()
                .setColor('#5865F2')
                .setTitle(`📩 THÔNG BÁO TỪ ${message.guild.name}`)
                .setDescription(content)
                .setFooter({ text: `Gửi bởi: ${message.author.tag}` })
                .setTimestamp();

            try {
                await target.send({ embeds: [embed] });
                return message.reply(`✅ Đã gửi DM thành công tới ${target}!`);
            } catch {
                return message.reply(`❌ Gửi DM thất bại! Member này tắt nhận tin nhắn người lạ.`);
            }
        }
        return message.reply('⚠️ Cú pháp: `.thongbao-dm @User <nội_dung>` hoặc `.thongbao-dm all <nội_dung>`');
    }

    if (command === 'caidat-thongke') {
        try {
            message.reply('⏳ Đang khởi tạo kênh Thống kê...');
            const category = await message.guild.channels.create({ name: '📊 THỐNG KÊ SERVER 📊', type: ChannelType.GuildCategory });

            const totalCh = await message.guild.channels.create({
                name: `👥 Tổng Member: ...`, type: ChannelType.GuildVoice, parent: category.id,
                permissionOverwrites: [{ id: message.guild.roles.everyone.id, deny: [PermissionFlagsBits.Connect] }]
            });
            const onlineCh = await message.guild.channels.create({
                name: `🟢 Trực Tuyến: ...`, type: ChannelType.GuildVoice, parent: category.id,
                permissionOverwrites: [{ id: message.guild.roles.everyone.id, deny: [PermissionFlagsBits.Connect] }]
            });
            const botCh = await message.guild.channels.create({
                name: `🤖 Số Bot: ...`, type: ChannelType.GuildVoice, parent: category.id,
                permissionOverwrites: [{ id: message.guild.roles.everyone.id, deny: [PermissionFlagsBits.Connect] }]
            });

            guildConfig.statsChannels = { category: category.id, total: totalCh.id, online: onlineCh.id, bots: botCh.id };
            queueSave();
            await updateServerStats(message.guild);
            return message.channel.send('✅ Thiết lập thành công kênh Thống kê!');
        } catch {
            return message.reply('❌ Thất bại! Vui lòng cấp thêm quyền `Manage Channels` cho Bot.');
        }
    }

    if (command === 'caidat-kenh') {
        const channel = message.mentions.channels.first();
        if (!channel) return message.reply('⚠️ Tag kênh cần cài đặt!');
        guildConfig.logChannel = channel.id;
        queueSave();
        return message.reply(`✅ Kênh thông báo được đặt tại ${channel}`);
    }

    if (command === 'cam-exp') {
        const channel = message.mentions.channels.first() || message.channel;
        const index = guildConfig.noXpChannels.indexOf(channel.id);
        if (index > -1) {
            guildConfig.noXpChannels.splice(index, 1);
            message.reply(`✅ Đã mở lại EXP tại ${channel}.`);
        } else {
            guildConfig.noXpChannels.push(channel.id);
            message.reply(`🚫 Đã cấm nhận EXP tại ${channel}.`);
        }
        queueSave();
        return;
    }

    if (command === 'set-lv') {
        const target = message.mentions.users.first();
        const level = parseInt(args[1]);
        if (!target || isNaN(level)) return message.reply('⚠️ Cú pháp: `.set-lv @User <level>`');
        initUser(guildId, target.id);
        memoryDb[guildId].users[target.id].level = level;
        queueSave();
        return message.reply(`✅ Đã sửa level của ${target} thành Cấp ${level}.`);
    }

    if (command === 'cong-exp' || command === 'tru-exp') {
        const target = message.mentions.users.first();
        const amount = parseInt(args[1]);
        if (!target || isNaN(amount)) return message.reply(`⚠️ Cú pháp: \`.${command} @User <số_exp>\``);
        initUser(guildId, target.id);

        if (command === 'cong-exp') memoryDb[guildId].users[target.id].xp += amount;
        else memoryDb[guildId].users[target.id].xp = Math.max(0, memoryDb[guildId].users[target.id].xp - amount);

        queueSave();
        return message.reply(`✅ Đã cập nhật EXP cho ${target}!`);
    }

    if (command === 'reset-user') {
        const target = message.mentions.users.first();
        if (!target) return message.reply('⚠️ Tag người cần reset!');
        if (memoryDb[guildId].users[target.id]) {
            memoryDb[guildId].users[target.id].xp = 0;
            memoryDb[guildId].users[target.id].level = 0;
            queueSave();
        }
        return message.reply(`🔄 Đã reset Level & EXP của ${target} về 0.`);
    }

    if (command === 'reset-all') {
        memoryDb[guildId].users = {};
        queueSave();
        return message.reply('⚠️ Đã reset toàn bộ dữ liệu server!');
    }

    if (command === 'x2-exp') {
        guildConfig.isDoubleXp = !guildConfig.isDoubleXp;
        queueSave();
        return message.reply(guildConfig.isDoubleXp ? '🔥 Đã BẬT X2 EXP toàn server!' : '❄️ Đã TẮT X2 EXP.');
    }

    if (command === 'warn') {
        const target = message.mentions.users.first();
        const reason = args.slice(1).join(' ') || 'Không có lý do';
        if (!target) return message.reply('⚠️ Cú pháp: `.warn @User <lý_do>`');

        initUser(guildId, target.id);
        let uData = memoryDb[guildId].users[target.id];
        uData.warns.push({ reason, date: new Date().toLocaleDateString('vi-VN') });
        uData.xp = Math.max(0, uData.xp - 100);
        queueSave();

        return message.reply(`⚠️ Đã cảnh cáo ${target}! Lý do: **${reason}** (-100 EXP). Tổng cảnh cáo: **${uData.warns.length}**`);
    }

    if (command === 'cam-tu' || command === 'xoa-cam-tu') {
        const word = args.join(' ').toLowerCase();
        if (!word) return message.reply(`⚠️ Cú pháp: \`.${command} <từ>\``);

        if (command === 'cam-tu') {
            if (!guildConfig.bannedWords.includes(word)) guildConfig.bannedWords.push(word);
            message.reply(`✅ Đã thêm **"${word}"** vào danh sách cấm.`);
        } else {
            const index = guildConfig.bannedWords.indexOf(word);
            if (index > -1) guildConfig.bannedWords.splice(index, 1);
            message.reply(`✅ Đã xóa từ **"${word}"** khỏi danh sách cấm.`);
        }
        queueSave();
        return;
    }

    // --- BỘ LỆNH MEMBER & MINIGAMES ---
    if (command === 'thongbao') {
        if (args[0]?.toLowerCase() === 'dm') {
            userData.dmNotification = !userData.dmNotification;
            queueSave();
            return message.reply(userData.dmNotification ? '📩 Đã **BẬT** nhận tin nhắn riêng (DM).' : '📢 Đã **TẮT** DM.');
        }
        return message.reply('⚠️ Dùng: `.thongbao dm`');
    }

    if (command === 'hlp' || command === 'help') {
        const helpEmbed = new EmbedBuilder()
            .setColor('#5865F2')
            .setTitle('📌 Bảng Lệnh Bot JangJii')
            .addFields(
                { name: '👤 Hồ Sơ & Cài Đặt', value: '`.profile`, `.cap`, `.bxh`, `.thongbao dm`' },
                { name: '🎁 Phần Thưởng & Cửa Hàng', value: '`.daily`, `.quydoi <exp>`, `.tien`, `.shop`, `.mua <id>`' },
                { name: '🎮 Nhiệm Vụ & Minigames', value: '`.nhiemvu`, `.nhan-nv`, `.doanso <1-5> <tiền>`, `.oantuti <keo/bao/bua> <tiền>`' },
                { name: '🛡️ Cảnh Cáo', value: '`.warns`' },
                { name: '🛠️ Admin', value: '`.thongbao-dm`, `.caidat-thongke`, `.warn`, `.cam-tu`, `.xoa-cam-tu`, `.caidat-kenh`, `.cam-exp`, `.x2-exp`, `.set-lv`, `.cong-exp`, `.tru-exp`, `.reset-user`, `.reset-all` ' }
            )
            .setTimestamp();
        return message.channel.send({ embeds: [helpEmbed] });
    }

    if (command === 'daily') {
        const now = Date.now();
        if (now - userData.lastDaily < 86400000) {
            const hours = Math.ceil((86400000 - (now - userData.lastDaily)) / 3600000);
            return message.reply(`⏳ Đã điểm danh hôm nay! Vui lòng quay lại sau **${hours} giờ**.`);
        }
        userData.lastDaily = now;
        userData.coins = (userData.coins || 0) + 200;
        userData.xp += 100;
        queueSave();
        return message.reply('🎁 Điểm danh thành công! Nhận **+200 Xu** & **+100 EXP**.');
    }

    if (command === 'quydoi') {
        const expToConvert = parseInt(args[0]);
        if (isNaN(expToConvert) || expToConvert <= 0) return message.reply('⚠️ Cú pháp: `.quydoi <số_exp>`');
        if (userData.xp < expToConvert) return message.reply('🚫 Không đủ EXP!');

        userData.xp -= expToConvert;
        const coinsGained = Math.floor(expToConvert / 10);
        userData.coins = (userData.coins || 0) + coinsGained;
        queueSave();
        return message.reply(`✅ Quy đổi thành công **${expToConvert} EXP** thành **+${coinsGained} Xu**!`);
    }

    if (command === 'tien' || command === 'vi') return message.reply(`💰 Số dư ví: **${userData.coins || 0} Xu**.`);

    if (command === 'shop') {
        let shopText = SHOP_ITEMS.map(i => `**ID ${i.id}**:${i.name} — \`${i.price} Xu\``).join('\n');
        const embed = new EmbedBuilder().setColor('#FFD700').setTitle('🛒 Cửa Hàng').setDescription(shopText);
        return message.channel.send({ embeds: [embed] });
    }

    if (command === 'mua') {
        const item = SHOP_ITEMS.find(i => i.id === parseInt(args[0]));
        if (!item) return message.reply('⚠️ Vật phẩm không tồn tại!');
        if ((userData.coins || 0) < item.price) return message.reply('🚫 Không đủ Xu!');

        userData.coins -= item.price;
        if (item.type === 'boost') userData.personalBoostUntil = Date.now() + 3600000;
        else if (item.type === 'title') userData.title = item.title;

        queueSave();
        return message.reply(`✅ Đã mua thành công: **${item.name}**!`);
    }

    if (command === 'nhiemvu') {
        const embed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle('📜 Nhiệm Vụ Hàng Ngày')
            .setDescription(`**Nhiệm vụ:** Chat 15 tin nhắn.\n**Tiến độ:** \`${userData.quests.msgCount}/15\` tin.\n**Thưởng:** 300 EXP + 100 Xu.\n**Trạng thái:** ${userData.quests.claimed ? '✅ Đã nhận' : '⏳ Chưa nhận'}`);
        return message.channel.send({ embeds: [embed] });
    }

    if (command === 'nhan-nv') {
        if (userData.quests.claimed) return message.reply('⚠️ Đã nhận thưởng hôm nay!');
        if (userData.quests.msgCount < 15) return message.reply(`🚫 Chưa hoàn thành (${userData.quests.msgCount}/15 tin).`);

        userData.quests.claimed = true;
        userData.xp += 300;
        userData.coins = (userData.coins || 0) + 100;
        queueSave();
        return message.reply('🎉 Nhận thưởng thành công: **+300 EXP** & **+100 Xu**!');
    }

    if (command === 'doanso') {
        const guess = parseInt(args[0]);
        const bet = parseInt(args[1]);
        if (isNaN(guess) || isNaN(bet) || guess < 1 || guess > 5 || bet <= 0) return message.reply('⚠️ Cú pháp: `.doanso <1-5> <tiền_cược>`');
        if ((userData.coins || 0) < bet) return message.reply('🚫 Không đủ Xu!');

        const secretNum = Math.floor(Math.random() * 5) + 1;
        if (guess === secretNum) {
            userData.coins += bet * 3;
            message.reply(`🎉 Chính xác (**${secretNum}**)! Thắng **+${bet * 3} Xu**!`);
        } else {
            userData.coins -= bet;
            message.reply(`❌ Sai rồi! Kết quả là **${secretNum}**. Thua **-${bet} Xu**.`);
        }
        queueSave();
        return;
    }

    if (command === 'oantuti') {
        const choices = ['keo', 'bao', 'bua'];
        const userChoice = args[0]?.toLowerCase();
        const bet = parseInt(args[1]);

        if (!choices.includes(userChoice) || isNaN(bet) || bet <= 0) return message.reply('⚠️ Cú pháp: `.oantuti <keo/bao/bua> <tiền_cược>`');
        if ((userData.coins || 0) < bet) return message.reply('🚫 Không đủ Xu!');

        const botChoice = choices[Math.floor(Math.random() * choices.length)];
        if (userChoice === botChoice) {
            return message.reply(`🤝 Bot ra **${botChoice}**. Hòa nhau!`);
        }

        const isWin = (userChoice === 'keo' && botChoice === 'bao') || (userChoice === 'bao' && botChoice === 'bua') || (userChoice === 'bua' && botChoice === 'keo');
        if (isWin) {
            userData.coins += bet;
            message.reply(`🎉 Bot ra **${botChoice}**. Bạn THẮNG **+${bet} Xu**!`);
        } else {
            userData.coins -= bet;
            message.reply(`❌ Bot ra **${botChoice}**. Bạn THUA **-${bet} Xu**.`);
        }
        queueSave();
        return;
    }

    if (command === 'warns') {
        const target = message.mentions.users.first() || message.author;
        const uData = memoryDb[guildId]?.users[target.id] || { warns: [] };
        if (!uData.warns.length) return message.reply(`✅ ${target.username} chưa từng bị cảnh cáo.`);

        let text = uData.warns.map((w, i) => `**#${i + 1}** — Lý do: ${w.reason} (${w.date})`).join('\n');
        const embed = new EmbedBuilder().setColor('#FF0000').setTitle(`⚠️ Lịch Sử Cảnh Cáo - ${target.username}`).setDescription(text);
        return message.channel.send({ embeds: [embed] });
    }

    if (command === 'profile' || command === 'stats') {
        const targetMember = message.mentions.members.first() || message.member;
        const targetUser = targetMember.user;
        const uData = memoryDb[guildId]?.users[targetUser.id] || { xp: 0, level: 0, messages: 0, coins: 0, title: 'Chưa có', dmNotification: false };
        const xpNeeded = getXpForNextLevel(uData.level);

        const embed = new EmbedBuilder()
            .setColor('#2b2d31')
            .setTitle(`📊 Hồ Sơ - ${targetUser.username}`)
            .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
            .addFields(
                { name: '🏷️ Danh Hiệu', value: `\`${uData.title || 'Chưa có'}\``, inline: true },
                { name: '🎖️ Cấp Độ', value: `\`Cấp ${uData.level}\``, inline: true },
                { name: '⭐ Điểm EXP', value: `\`${uData.xp} / ${xpNeeded} EXP\``, inline: true },
                { name: '💰 Ví Xu', value: `\`${uData.coins || 0} Xu\``, inline: true },
                { name: '💬 Tin Nhắn', value: `\`${uData.messages || 0} tin\``, inline: true },
                { name: '📩 DM Lên Cấp', value: `\`${uData.dmNotification ? 'Bật' : 'Tắt'}\``, inline: true }
            )
            .setFooter({ text: 'Hệ Thống Hồ Sơ JangJii' })
            .setTimestamp();

        return message.channel.send({ embeds: [embed] });
    }

    if (command === 'cap' || command === 'thongtin') {
        const target = message.mentions.users.first() || message.author;
        const uData = memoryDb[guildId]?.users[target.id] || { xp: 0, level: 0 };
        const embed = new EmbedBuilder()
            .setColor('#5865F2')
            .setTitle(`📊 Cấp Độ - ${target.username}`)
            .addFields(
                { name: 'Cấp Hiện Tại', value: `\`Cấp ${uData.level}\``, inline: true },
                { name: 'Điểm EXP', value: `\`${uData.xp} / ${getXpForNextLevel(uData.level)} EXP\``, inline: true }
            );
        return message.channel.send({ embeds: [embed] });
    }

    if (command === 'bxh' || command === 'topserver') {
        const users = memoryDb[guildId]?.users;
        if (!users || !Object.keys(users).length) return message.channel.send('Chưa có dữ liệu!');

        const sorted = Object.entries(users)
            .map(([id, data]) => ({ id, level: data.level, xp: data.xp }))
            .sort((a, b) => b.level === a.level ? b.xp - a.xp : b.level - a.level)
            .slice(0, 10);

        let text = sorted.map((u, i) => `**#${i + 1}** <@${u.id}> — **Cấp ${u.level}** (${u.xp} EXP)`).join('\n');
        const embed = new EmbedBuilder().setColor('#FFD700').setTitle(`🏆 Bảng Xếp Hạng - ${message.guild.name}`).setDescription(text);
        return message.channel.send({ embeds: [embed] });
    }
});

client.login(TOKEN);