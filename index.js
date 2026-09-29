const { Client, GatewayIntentBits, EmbedBuilder, PermissionFlagsBits, ChannelType, AttachmentBuilder } = require('discord.js');
const Canvas = require('canvas');
const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
const express = require('express');

// --- 1. WEB SERVER CHO RENDER ---
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => res.send('Bot Discord đang hoạt động Online 24/7!'));
app.get('/ping', (req, res) => res.status(200).send('PONG'));
app.listen(PORT, () => console.log(`Server Web lắng nghe tại port ${PORT}`));

// --- 2. CẤU HÌNH BOT DISCORD ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildInvites
    ]
});

const TOKEN = process.env.TOKEN || 'THAY_TOKEN_BOT_CUA_BAN_VAO_DAY';
const PREFIX = '.';
const MY_DISCORD_ID = '1298727049451540541';
const DATA_FILE = path.join(__dirname, 'level_data.json');
const COOLDOWN_TIME = 60000;

const cooldowns = new Map();
const voiceStates = new Map();
const guildInvites = new Map();

// --- DANH HIỆU TIẾN HÓA THEO CẤP ĐỘ ---
const LEVEL_TITLES = [
    { level: 1, title: '[Em Bé Tập Lẫy]' },
    { level: 5, title: '[Bé Ngoan Điểm Mười]' },
    { level: 15, title: '[Cử Nhân Nợ Môn]' },
    { level: 30, title: '[Người Lớn Tập Sự]' }
];

function checkLevelTitles(userData) {
    if (!userData.unlockedTitles) userData.unlockedTitles = ['[Em Bé Tập Lẫy]'];
    let newlyUnlocked = [];
    LEVEL_TITLES.forEach(item => {
        if (userData.level >= item.level && !userData.unlockedTitles.includes(item.title)) {
            userData.unlockedTitles.push(item.title);
            newlyUnlocked.push(item.title);
        }
    });
    return newlyUnlocked;
}

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
        console.error('Lỗi đọc file data:', err);
        return {};
    }
}

function queueSave() {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(async () => {
        try {
            await fsPromises.writeFile(DATA_FILE, JSON.stringify(memoryDb, null, 2));
        } catch (err) {
            console.error('Lỗi lưu dữ liệu:', err);
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
                admins: [MY_DISCORD_ID], 
                staffs: [],
                shopItems: [
                    { id: 1, name: 'Thẻ X2 EXP (1 giờ)', price: 400, stock: 30, type: 'boost' },
                    { id: 2, name: 'Đội Trưởng VIP', price: 800, stock: 30, type: 'title', title: 'Đội Trưởng VIP' },
                    { id: 3, name: 'Đại Gia Ngầm', price: 1500, stock: 30, type: 'title', title: 'Đại Gia Ngầm' },
                    { id: 4, name: 'Mèo Ú Mê Ngủ', price: 2000, stock: 30, type: 'title', title: 'Mèo Ú Mê Ngủ' },
                    { id: 5, name: 'Chúa Tể Bóp Team', price: 1500, stock: 30, type: 'title', title: 'Chúa Tể Bóp Team' }
                ],
                marketplace: [] 
            },
            users: {}
        };
    }
    if (!memoryDb[guildId].config.admins) memoryDb[guildId].config.admins = [MY_DISCORD_ID];
    if (!memoryDb[guildId].config.staffs) memoryDb[guildId].config.staffs = [];
    if (!memoryDb[guildId].config.marketplace) memoryDb[guildId].config.marketplace = [];
    
    memoryDb[guildId].config.shopItems.forEach(item => {
        if (item.stock === undefined) item.stock = 30;
    });
}

function initUser(guildId, userId) {
    initGuild(guildId);
    if (!memoryDb[guildId].users[userId]) {
        memoryDb[guildId].users[userId] = {
            xp: 0, level: 0, messages: 0, coins: 0, lastDaily: 0,
            title: '[Em Bé Tập Lẫy]', unlockedTitles: ['[Em Bé Tập Lẫy]'], personalBoostUntil: 0,
            prestige: 0, giftboxes: 0, inventory: [], invites: { regular: 0 }
        };
    }
    let u = memoryDb[guildId].users[userId];
    if (u.prestige === undefined) u.prestige = 0;
    if (u.giftboxes === undefined) {
        u.giftboxes = u.lootboxes || 0;
        delete u.lootboxes;
    }
    if (!u.inventory) u.inventory = [];
    if (!u.invites) u.invites = { regular: 0 };
    if (!u.unlockedTitles) u.unlockedTitles = ['[Em Bé Tập Lẫy]'];
    if (!u.title) u.title = '[Em Bé Tập Lẫy]';
}

// --- CÁC SỰ KIỆN CLIENT ---
client.once('ready', async () => {
    memoryDb = loadData();
    console.log(`Bot đã sẵn sàng: ${client.user.tag}`);

    for (const guild of client.guilds.cache.values()) {
        try {
            const invites = await guild.invites.fetch();
            guildInvites.set(guild.id, invites);
        } catch (e) {}
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
                
                let xpNeeded = getXpForNextLevel(userData.level);
                while (userData.xp >= xpNeeded) {
                    userData.xp -= xpNeeded;
                    userData.level += 1;
                    if (userData.level % 5 === 0) userData.giftboxes = (userData.giftboxes || 0) + 1;
                    checkLevelTitles(userData);
                    xpNeeded = getXpForNextLevel(userData.level);
                }
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
            let xpGained = 15;
            if (now < userData.personalBoostUntil) xpGained *= 2;

            userData.xp += xpGained;
            cooldowns.set(cooldownKey, now);

            let xpNeeded = getXpForNextLevel(userData.level);
            if (userData.xp >= xpNeeded) {
                userData.xp -= xpNeeded;
                userData.level += 1;
                const newLevel = userData.level;

                if (newLevel % 5 === 0) {
                    userData.giftboxes = (userData.giftboxes || 0) + 1;
                }

                let newlyUnlocked = checkLevelTitles(userData);
                let titleMsg = newlyUnlocked.length > 0 ? `\n- Mở khóa danh hiệu mới: ${newlyUnlocked.join(', ')}` : '';

                const levelEmbed = new EmbedBuilder()
                    .setColor('#5865F2')
                    .setAuthor({ name: message.author.tag, iconURL: message.author.displayAvatarURL() })
                    .setTitle('LÊN CẤP MỚI!')
                    .setDescription(`Chúc mừng ${message.author} đã đạt **Cấp ${newLevel}**!${newLevel % 5 === 0 ? '\nNhận được **1 Hộp Quà** (`.mohopqua`)!' : ''}${titleMsg}`)
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

    // --- 1. LỆNH HELP ---
    if (command === 'hlp' || command === 'help') {
        const helpEmbed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('HỆ THỐNG TRỢ GIÚP & HƯỚNG DẪN LỆNH')
            .setDescription('Dưới đây là toàn bộ danh sách lệnh của bot:')
            .addFields(
                { 
                    name: 'Nhóm Thành Viên', 
                    value: '• `.cap` — Xem thẻ hồ sơ ảnh.\n' +
                           '• `.bxh` — Xem bảng xếp hạng cấp độ dạng ảnh Canvas.\n' +
                           '• `.danhhieu` — Quản lý/chọn danh hiệu.\n' +
                           '• `.chuyensinh` (hoặc `.cs`) — Chuyển sinh khi đạt cấp 100.\n' +
                           '• `.mohopqua` — Mở hộp quà khi lên cấp 5.\n' +
                           '• `.daily` — Điểm danh nhận SWC & EXP.\n' +
                           '• `.tien` (hoặc `.vi`) — Kiểm tra số dư ví.\n' +
                           '• `.pay @User <số tiền>` — Chuyển SWC cho người khác.\n' +
                           '• `.shop` — Mở cửa hàng chính hãng dạng ảnh.\n' +
                           '• `.mua <ID>` — Mua vật phẩm shop chính.\n' +
                           '• `.market` — Xem chợ P2P.\n' +
                           '• `.market-rao <số> <giá>` — Đăng bán đồ lên chợ.\n' +
                           '• `.market-mua <ID>` — Mua đồ trên chợ.\n' +
                           '• `.tui` — Xem túi đồ cá nhân.\n' +
                           '• `.sd <số>` — Sử dụng vật phẩm.' 
                },
                { 
                    name: 'Nhóm Kiểm Duyệt & Quản Trị', 
                    value: '• `.kick @User [lý do]` — Đuổi thành viên khỏi server.\n' +
                           '• `.ban @User [lý do]` — Cấm thành viên khỏi server.\n' +
                           '• `.timeout @User <phút>` — Khóa chat thành viên.\n' +
                           '• `.untimeout @User` — Mở khóa chat thành viên.\n' +
                           '• `.clear <1-100>` — Xóa hàng loạt tin nhắn.\n' +
                           '• `.setlog #kenh` — Cài đặt kênh thông báo khi lên cấp.\n' +
                           '• `.staff-add @User` — Thêm staff mới.\n' +
                           '• `.staff-del @User` — Xóa quyền staff.\n' +
                           '• `.shop-add Tên | Giá | Kho | Type` — Thêm đồ vào shop.\n' +
                           '• `.shop-del <ID>` — Xóa món hàng khỏi shop.\n' +
                           '• `.shop-setstock <ID> <số>` — Đổi số lượng kho.\n' +
                           '• `.shop-setprice <ID> <giá>` — Đổi giá tiền món hàng.\n' +
                           '• `.givecoin / .removecoin` — Tặng/trừ tiền thành viên.\n' +
                           '• `.givexp / .removexp / .setlevel` — Quản lý cấp độ.\n' +
                           '• `.danhhieu-tao <Tên danh hiệu>` — Tạo danh hiệu mới cho server.\n' +
                           '• `.danhhieu-set @User <Tên danh hiệu>` — Cấp trực tiếp danh hiệu.' 
                }
            )
            .setFooter({ text: 'Bot System' })
            .setTimestamp();
        return message.channel.send({ embeds: [helpEmbed] });
    }

    // --- 2. CÁC LỆNH KIỂM DUYỆT (MODERATION) ---
    if (['kick', 'ban', 'timeout', 'untimeout', 'clear'].includes(command) && !isBotStaff) {
        return message.reply('Bạn không có quyền dùng nhóm lệnh kiểm duyệt này!');
    }

    if (command === 'kick') {
        const targetMember = message.mentions.members.first();
        const reason = args.slice(1).join(' ') || 'Không có lý do';
        if (!targetMember) return message.reply('Cú pháp: `.kick @User [lý do]`');
        await targetMember.kick(reason).catch(err => message.reply('Lỗi: ' + err.message));
        return message.reply(`Đã kick thành công ${targetMember.user.tag}.`);
    }

    if (command === 'ban') {
        const targetMember = message.mentions.members.first();
        const reason = args.slice(1).join(' ') || 'Không có lý do';
        if (!targetMember) return message.reply('Cú pháp: `.ban @User [lý do]`');
        await targetMember.ban({ reason }).catch(err => message.reply('Lỗi: ' + err.message));
        return message.reply(`Đã ban thành công ${targetMember.user.tag}.`);
    }

    if (command === 'timeout') {
        const targetMember = message.mentions.members.first();
        const minutes = parseInt(args[1]);
        if (!targetMember || isNaN(minutes)) return message.reply('Cú pháp: `.timeout @User <phút>`');
        await targetMember.timeout(minutes * 60 * 1000).catch(err => message.reply('Lỗi thực hiện timeout'));
        return message.reply(`Đã timeout ${targetMember} trong${minutes} phút.`);
    }

    if (command === 'untimeout') {
        const targetMember = message.mentions.members.first();
        if (!targetMember) return message.reply('Cú pháp: `.untimeout @User`');
        await targetMember.timeout(null).catch(() => {});
        return message.reply(`Đã gỡ timeout cho ${targetMember}.`);
    }

    if (command === 'clear') {
        const amount = parseInt(args[0]);
        if (isNaN(amount) || amount < 1 || amount > 100) return message.reply('Cú pháp: `.clear <1-100>`');
        const fetched = await message.channel.bulkDelete(amount + 1, true).catch(() => {});
        const msg = await message.channel.send(`Đã xóa ${fetched ? fetched.size - 1 : 0} tin nhắn.`);
        setTimeout(() => msg.delete().catch(() => {}), 3000);
        return;
    }

    // --- LỆNH SET KÊNH THÔNG BÁO LEVEL ---
    if (command === 'setlog' || command === 'setlevelchannel') {
        if (!isBotAdmin) return message.reply('Chỉ Admin bot mới có quyền cài đặt kênh thông báo level!');
        const targetChannel = message.mentions.channels.first() || message.channel;
        guildConfig.logChannel = targetChannel.id;
        queueSave();
        return message.reply(`Đã thiết lập kênh thông báo lên cấp thành công tại ${targetChannel}!`);
    }

    // --- QUẢN LÝ STAFF ---
    if (['staff-add', 'staff-del'].includes(command)) {
        if (!isBotAdmin) return message.reply('Chỉ Admin bot mới có quyền thêm/xóa Staff!');
        const targetMember = message.mentions.members.first();
        if (!targetMember) return message.reply(`Cú pháp: \`.${command} @User\``);

        if (command === 'staff-add') {
            if (guildConfig.staffs.includes(targetMember.id)) return message.reply('Người này đã là Staff rồi!');
            guildConfig.staffs.push(targetMember.id);
            queueSave();
            return message.reply(`Đã cấp quyền Staff cho ${targetMember.user.tag}!`);
        } else if (command === 'staff-del') {
            guildConfig.staffs = guildConfig.staffs.filter(id => id !== targetMember.id);
            queueSave();
            return message.reply(`Đã tước quyền Staff của ${targetMember.user.tag}.`);
        }
    }

    if (['shop-add', 'shop-del', 'shop-setstock', 'shop-setprice', 'setlevel', 'givexp', 'removexp', 'resetxp', 'givecoin', 'removecoin', 'danhhieu-tao', 'danhhieu-set'].includes(command) && !isBotAdmin) {
        return message.reply('Chỉ Admin bot mới dùng được lệnh này!');
    }

    // --- LỆNH ADMIN QUẢN LÝ TIỀN & LEVEL ---
    if (command === 'givecoin') {
        const targetUser = message.mentions.users.first();
        const amount = parseInt(args[1]);
        if (!targetUser || isNaN(amount) || amount <= 0) return message.reply('Cú pháp: `.givecoin @User <số tiền>`');
        initUser(guildId, targetUser.id);
        memoryDb[guildId].users[targetUser.id].coins = (memoryDb[guildId].users[targetUser.id].coins || 0) + amount;
        queueSave();
        return message.reply(`Đã cộng thêm **${amount} SWC** cho ${targetUser.tag}.`);
    }

    if (command === 'removecoin') {
        const targetUser = message.mentions.users.first();
        const amount = parseInt(args[1]);
        if (!targetUser || isNaN(amount) || amount <= 0) return message.reply('Cú pháp: `.removecoin @User <số tiền>`');
        initUser(guildId, targetUser.id);
        let u = memoryDb[guildId].users[targetUser.id];
        u.coins = Math.max(0, (u.coins || 0) - amount);
        queueSave();
        return message.reply(`Đã trừ **${amount} SWC** của ${targetUser.tag}.`);
    }

    if (command === 'givexp') {
        const targetUser = message.mentions.users.first();
        const amount = parseInt(args[1]);
        if (!targetUser || isNaN(amount) || amount <= 0) return message.reply('Cú pháp: `.givexp @User <số EXP>`');
        initUser(guildId, targetUser.id);
        let u = memoryDb[guildId].users[targetUser.id];
        u.xp += amount;
        
        let xpNeeded = getXpForNextLevel(u.level);
        while (u.xp >= xpNeeded) {
            u.xp -= xpNeeded;
            u.level += 1;
            if (u.level % 5 === 0) u.giftboxes = (u.giftboxes || 0) + 1;
            checkLevelTitles(u);
            xpNeeded = getXpForNextLevel(u.level);
        }
        queueSave();
        return message.reply(`Đã cộng **${amount} EXP** cho ${targetUser.tag}.`);
    }

    if (command === 'setlevel') {
        const targetUser = message.mentions.users.first();
        const newLvl = parseInt(args[1]);
        if (!targetUser || isNaN(newLvl) || newLvl < 0) return message.reply('Cú pháp: `.setlevel @User <cấp độ>`');
        initUser(guildId, targetUser.id);
        let u = memoryDb[guildId].users[targetUser.id];
        u.level = newLvl;
        checkLevelTitles(u);
        queueSave();
        return message.reply(`Đã đặt cấp độ của ${targetUser.tag} thành **Cấp ${newLvl}**.`);
    }

    // --- LỆNH ADMIN TẠO VÀ SET DANH HIỆU ---
    if (command === 'danhhieu-tao') {
        const newTitle = args.join(' ');
        if (!newTitle) return message.reply('Cú pháp: `.danhhieu-tao <Tên danh hiệu>` (Ví dụ: `.danhhieu-tao [Huyền Thoại]`)');
        
        const existsInShop = guildConfig.shopItems.some(i => i.type === 'title' && i.title?.toLowerCase() === newTitle.toLowerCase());
        if (!existsInShop) {
            const currentShop = guildConfig.shopItems;
            const newId = currentShop.length > 0 ? Math.max(...currentShop.map(i => i.id)) + 1 : 1;
            currentShop.push({
                id: newId,
                name: `Danh hiệu: ${newTitle}`,
                price: 1000,
                stock: 50,
                type: 'title',
                title: newTitle
            });
        }
        queueSave();
        return message.reply(`Đã tạo thành công danh hiệu **${newTitle}** và tự động thêm vào cửa hàng chính.`);
    }

    if (command === 'danhhieu-set') {
        const targetUser = message.mentions.users.first();
        const titleName = args.slice(1).join(' ');

        if (!targetUser || !titleName) {
            return message.reply('Cú pháp: `.danhhieu-set @User <Tên danh hiệu>`');
        }

        initUser(guildId, targetUser.id);
        const targetUserData = memoryDb[guildId].users[targetUser.id];

        if (!targetUserData.unlockedTitles.includes(titleName)) {
            targetUserData.unlockedTitles.push(titleName);
        }
        
        targetUserData.title = titleName;
        queueSave();

        return message.reply(`Đã cấp và trang bị thành công danh hiệu **${titleName}** cho ${targetUser.tag}!`);
    }

    if (command === 'shop-del') {
        const itemId = parseInt(args[0]);
        if (isNaN(itemId)) return message.reply('Cú pháp: `.shop-del <ID>`');
        const itemIndex = guildConfig.shopItems.findIndex(i => i.id === itemId);
        if (itemIndex === -1) return message.reply(`Không tìm thấy vật phẩm ID **#${itemId}** trong shop!`);
        const removedItem = guildConfig.shopItems.splice(itemIndex, 1)[0];
        queueSave();
        return message.reply(`Đã xóa **"${removedItem.name}"** khỏi cửa hàng.`);
    }

    if (command === 'shop-setstock') {
        const itemId = parseInt(args[0]);
        const newStock = parseInt(args[1]);
        if (isNaN(itemId) || isNaN(newStock) || newStock < 0) return message.reply('Cú pháp: `.shop-setstock <ID> <số lượng>`');
        const item = guildConfig.shopItems.find(i => i.id === itemId);
        if (!item) return message.reply(`Không tìm thấy vật phẩm ID **#${itemId}**!`);
        item.stock = newStock;
        queueSave();
        return message.reply(`Đã cập nhật kho vật phẩm **"${item.name}"** thành **${newStock}**.`);
    }

    if (command === 'shop-setprice') {
        const itemId = parseInt(args[0]);
        const newPrice = parseInt(args[1]);
        if (isNaN(itemId) || isNaN(newPrice) || newPrice < 0) {
            return message.reply('Cú pháp: `.shop-setprice <ID vật phẩm> <giá tiền mới SWC>`');
        }
        const item = guildConfig.shopItems.find(i => i.id === itemId);
        if (!item) return message.reply(`Không tìm thấy vật phẩm có ID **#${itemId}** trong shop chính!`);

        const oldPrice = item.price;
        item.price = newPrice;
        queueSave();

        return message.reply(`Đã đổi giá vật phẩm **"${item.name}"** (ID: #${itemId}) từ **${oldPrice} SWC** thành **${newPrice} SWC** thành công!`);
    }

    if (command === 'shop-add') {
        const content = args.join(' ');
        const parts = content.split('|').map(p => p.trim());
        if (parts.length < 3) return message.reply('Cú pháp: `.shop-add Tên | Giá SWC | boost/title | [Title]`');
        let name = parts[0], price = parseInt(parts[1]), stock = 30, type = '', subValue = '';
        if (!isNaN(parseInt(parts[2]))) {
            stock = parseInt(parts[2]);
            type = (parts[3] || '').toLowerCase();
            subValue = parts[4] || '';
        } else {
            type = (parts[2] || '').toLowerCase();
            subValue = parts[3] || '';
        }
        if (isNaN(price) || isNaN(stock)) return message.reply('Giá và số lượng phải hợp lệ!');
        const currentShop = guildConfig.shopItems;
        const newId = currentShop.length > 0 ? Math.max(...currentShop.map(i => i.id)) + 1 : 1;
        currentShop.push({ id: newId, name, price, stock, type, title: type === 'title' ? subValue : undefined });
        queueSave();
        return message.reply(`Đã thêm vật phẩm ID #${newId} vào shop chính.`);
    }

    // --- 3. HỆ THỐNG CHỢ ĐEN / KÝ GỬI (MARKETPLACE) ---
    if (command === 'market' || command === 'cho') {
        const marketList = guildConfig.marketplace || [];
        if (marketList.length === 0) {
            return message.channel.send('Sàn Giao Dịch P2P: Hiện tại không có vật phẩm nào đang được người chơi rao bán.\n*Mẹo: Dùng `.market-rao <số thứ tự túi> <giá>` để đăng bán!*');
        }

        let marketText = marketList.map(m => `**ID Chợ #${m.marketId}** : **${m.itemName}** (\`Loại: ${m.type}\`)\n   Giá: \`${m.price} SWC\` — Người bán: <@${m.sellerId}>`).join('\n\n');
        
        const marketEmbed = new EmbedBuilder()
            .setColor('#00FFAA')
            .setTitle(`SÀN KÝ GỬI VẬT PHẨM & DANH HIỆU (P2P)`)
            .setDescription(marketText)
            .setFooter({ text: 'Dùng .market-mua <ID chợ> để mua hoặc .market-huy <ID chợ> để thu hồi' })
            .setTimestamp();

        return message.channel.send({ embeds: [marketEmbed] });
    }

    if (command === 'market-rao' || command === 'rao') {
        const itemIndex = parseInt(args[0]) - 1;
        const sellPrice = parseInt(args[1]);

        if (isNaN(itemIndex) || isNaN(sellPrice) || sellPrice <= 0) {
            return message.reply('Cú pháp: `.market-rao <số thứ tự trong túi> <giá SWC>`');
        }

        if (!userData.inventory || !userData.inventory[itemIndex]) {
            return message.reply('Số thứ tự vật phẩm trong túi đồ không tồn tại! Gõ `.tui` để kiểm tra.');
        }

        const itemToSell = userData.inventory[itemIndex];
        userData.inventory.splice(itemIndex, 1);

        if (!guildConfig.marketIdCounter) guildConfig.marketIdCounter = 1;
        const marketId = guildConfig.marketIdCounter++;

        guildConfig.marketplace.push({
            marketId: marketId,
            sellerId: userId,
            itemName: itemToSell.name,
            price: sellPrice,
            type: itemToSell.type,
            title: itemToSell.title || null
        });

        queueSave();
        return message.reply(`Bạn đã ký gửi thành công **"${itemToSell.name}"** lên chợ với giá **${sellPrice} SWC** (Mã giao dịch chợ: **#${marketId}**)!`);
    }

    if (command === 'market-mua' || command === 'muacho') {
        const marketId = parseInt(args[0]);
        if (isNaN(marketId)) return message.reply('Cú pháp: `.market-mua <ID chợ>`');

        const marketIndex = guildConfig.marketplace.findIndex(m => m.marketId === marketId);
        if (marketIndex === -1) return message.reply(`Không tìm thấy mã chợ **#${marketId}** hoặc đã có người mua mất rồi!`);

        const listing = guildConfig.marketplace[marketIndex];
        if (listing.sellerId === userId) return message.reply('Bạn không thể tự mua vật phẩm do chính mình rao bán!');
        if ((userData.coins || 0) < listing.price) return message.reply(`Bạn không đủ SwanCoin! (Cần: ${listing.price} SWC, Bạn có: ${userData.coins || 0} SWC).`);

        userData.coins -= listing.price;
        initUser(guildId, listing.sellerId);
        memoryDb[guildId].users[listing.sellerId].coins = (memoryDb[guildId].users[listing.sellerId].coins || 0) + listing.price;

        userData.inventory.push({
            name: listing.itemName,
            price: listing.price,
            type: listing.type,
            title: listing.title || null
        });

        guildConfig.marketplace.splice(marketIndex, 1);
        queueSave();

        return message.reply(`Chúc mừng! Bạn đã mua thành công **"${listing.itemName}"** từ chợ với giá **${listing.price} SWC**.`);
    }

    if (command === 'market-huy' || command === 'huucho') {
        const marketId = parseInt(args[0]);
        if (isNaN(marketId)) return message.reply('Cú pháp: `.market-huy <ID chợ>`');

        const marketIndex = guildConfig.marketplace.findIndex(m => m.marketId === marketId);
        if (marketIndex === -1) return message.reply(`Không tìm thấy mã giao dịch chợ **#${marketId}**!`);

        const listing = guildConfig.marketplace[marketIndex];
        if (listing.sellerId !== userId && !isBotAdmin) return message.reply('Đây không phải vật phẩm do bạn rao bán!');

        initUser(guildId, listing.sellerId);
        memoryDb[guildId].users[listing.sellerId].inventory.push({
            name: listing.itemName,
            price: listing.price,
            type: listing.type,
            title: listing.title || null
        });

        guildConfig.marketplace.splice(marketIndex, 1);
        queueSave();

        return message.reply(`Đã thu hồi thành công **"${listing.itemName}"** về lại túi đồ cá nhân.`);
    }

    // --- 4. CỬA HÀNG CHÍNH HÃNG DẠNG ẢNH CANVAS ---
    if (command === 'shop' || command === 'cuahang') {
        try {
            const currentShop = guildConfig.shopItems || [];
            const canvas = Canvas.createCanvas(900, 600);
            const ctx = canvas.getContext('2d');

            ctx.fillStyle = '#0f1012';
            ctx.beginPath();
            ctx.roundRect(0, 0, 900, 600, 24);
            ctx.fill();

            const borderGrad = ctx.createLinearGradient(0, 0, 900, 600);
            borderGrad.addColorStop(0, '#FFD700');
            borderGrad.addColorStop(0.5, '#FF4500');
            borderGrad.addColorStop(1, '#00ffcc');
            ctx.strokeStyle = borderGrad;
            ctx.lineWidth = 4;
            ctx.stroke();

            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 34px sans-serif';
            ctx.fillText(`Cửa Hàng Chính Hãng`, 40, 60);

            ctx.fillStyle = '#FFD700';
            ctx.font = 'bold 20px sans-serif';
            ctx.textAlign = 'right';
            ctx.fillText(`Số Dư: ${userData.coins || 0} SWC`, 860, 55);
            ctx.textAlign = 'left';

            ctx.strokeStyle = '#22252a';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(40, 85);
            ctx.lineTo(860, 85);
            ctx.stroke();

            if (currentShop.length === 0) {
                ctx.fillStyle = '#8a8f9d';
                ctx.font = '24px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText('Cửa hàng hiện đang trống!', 450, 320);
            } else {
                let startY = 110;
                const maxToShow = Math.min(currentShop.length, 6);

                for (let i = 0; i < maxToShow; i++) {
                    const item = currentShop[i];

                    ctx.fillStyle = '#1b1d22';
                    ctx.beginPath();
                    ctx.roundRect(40, startY, 820, 60, 12);
                    ctx.fill();

                    ctx.strokeStyle = item.type === 'title' ? '#ff007f' : '#FFD700';
                    ctx.lineWidth = 2;
                    ctx.stroke();

                    ctx.fillStyle = '#ffffff';
                    ctx.font = 'bold 20px sans-serif';
                    ctx.fillText(`${i + 1}.`, 65, startY + 38);

                    ctx.fillStyle = '#ffffff';
                    ctx.font = 'bold 20px sans-serif';
                    ctx.fillText(item.name, 115, startY + 38);
                    
                    ctx.fillStyle = '#8a8f9d';
                    ctx.font = '14px sans-serif';
                    ctx.fillText(`(ID: #${item.id})`, 115, startY + 54);

                    ctx.fillStyle = '#00ffcc';
                    ctx.font = '16px sans-serif';
                    ctx.fillText(`Kho: ${item.stock}`, 520, startY + 38);

                    ctx.fillStyle = '#FFD700';
                    ctx.font = 'bold 22px sans-serif';
                    ctx.textAlign = 'right';
                    ctx.fillText(`${item.price} SWC`, 830, startY + 38);
                    ctx.textAlign = 'left';

                    startY += 72;
                }
            }

            ctx.fillStyle = '#8a8f9d';
            ctx.font = '15px sans-serif';
            ctx.fillText('Dùng .mua <ID> để mua vật phẩm hoặc .market để xem chợ người chơi.', 40, 575);

            const attachment = new AttachmentBuilder(canvas.toBuffer(), { name: 'shop_market.png' });
            return message.channel.send({ files: [attachment] });

        } catch (error) {
            console.error('Lỗi tạo ảnh shop:', error);
            const currentShop = guildConfig.shopItems;
            let shopText = currentShop.map((i, index) => `**${index + 1}.** [ID: #${i.id}] **${i.name}** — Giá: \`${i.price} SWC\` — Kho: \`${i.stock}\``).join('\n');
            const embed = new EmbedBuilder().setColor('#FFD700').setTitle('Cửa Hàng Chính Hãng Server').setDescription(shopText || 'Trống');
            return message.channel.send({ embeds: [embed] });
        }
    }

    if (command === 'mua') {
        const itemId = parseInt(args[0]);
        const item = guildConfig.shopItems.find(i => i.id === itemId);
        if (!item) return message.reply('Vật phẩm không tồn tại trong shop chính!');
        if (item.stock <= 0) return message.reply('Sản phẩm này đã tạm hết hàng!');
        if ((userData.coins || 0) < item.price) return message.reply('Không đủ SwanCoin (SWC)!');

        if (item.type === 'title' && userData.unlockedTitles.includes(item.title)) {
            return message.reply('Bạn đã sở hữu danh hiệu này rồi!');
        }

        userData.coins -= item.price;
        item.stock = Math.max(0, item.stock - 1);

        userData.inventory.push({
            name: item.name,
            price: item.price,
            type: item.type,
            title: item.title || null
        });
        queueSave();

        return message.reply(`Đã mua thành công **${item.name}**! Đã chuyển vào túi đồ (\`.tui\`).`);
    }

    // --- 5. CÁC LỆNH KHÁC (DAILY, PAY, CHUYỂN SINH ĐÃ ĐỔI LÊN 100, TÚI, PROFILE, BXH) ---
    if (command === 'daily') {
        const now = Date.now();
        if (now - userData.lastDaily < 86400000) return message.reply('Bạn đã điểm danh hôm nay rồi!');
        userData.lastDaily = now;
        userData.coins = (userData.coins || 0) + 100;
        userData.xp += 50;
        
        let xpNeeded = getXpForNextLevel(userData.level);
        while (userData.xp >= xpNeeded) {
            userData.xp -= xpNeeded;
            userData.level += 1;
            if (userData.level % 5 === 0) userData.giftboxes = (userData.giftboxes || 0) + 1;
            checkLevelTitles(userData);
            xpNeeded = getXpForNextLevel(userData.level);
        }
        queueSave();
        return message.reply('Điểm danh thành công: **+100 SWC** & **+50 EXP**.');
    }

    if (command === 'tien' || command === 'vi') {
        return message.reply(`Số dư ví: **${userData.coins || 0} SwanCoin (SWC)** | Hộp Quà: **${userData.giftboxes || 0}**.`);
    }

    if (command === 'pay' || command === 'chuyen') {
        const targetUser = message.mentions.users.first();
        const amount = parseInt(args[1]);

        if (!targetUser || isNaN(amount) || amount <= 0) {
            return message.reply('Cú pháp: `.pay @User <số tiền>` hoặc `.chuyen @User <số tiền>`');
        }

        if (targetUser.bot) {
            return message.reply('Bạn không thể chuyển SwanCoin cho bot được!');
        }

        if (targetUser.id === userId) {
            return message.reply('Bạn không thể tự chuyển SwanCoin cho chính mình!');
        }

        if ((userData.coins || 0) < amount) {
            return message.reply(`Bạn không đủ số dư để chuyển! Bạn đang có **${userData.coins || 0} SWC**.`);
        }

        userData.coins -= amount;
        initUser(guildId, targetUser.id);
        memoryDb[guildId].users[targetUser.id].coins = (memoryDb[guildId].users[targetUser.id].coins || 0) + amount;
        queueSave();

        return message.reply(`Đã chuyển thành công **${amount} SWC** cho ${targetUser} (${targetUser.tag})!`);
    }

    if (command === 'chuyensinh' || command === 'cs') {
        const REQUIRED_LEVEL = 100; // Đã đổi thành cấp 100 theo yêu cầu của bạn!
        const REQUIRED_COINS = 5000;

        if (userData.level < REQUIRED_LEVEL) {
            return message.reply(`Bạn chưa đủ điều kiện chuyển sinh! Cần đạt **Cấp ${REQUIRED_LEVEL}** (Bạn đang cấp ${userData.level}).`);
        }

        if ((userData.coins || 0) < REQUIRED_COINS) {
            return message.reply(`Bạn không đủ phí chuyển sinh! Cần **${REQUIRED_COINS} SWC** (Bạn đang có ${userData.coins || 0} SWC).`);
        }

        userData.coins -= REQUIRED_COINS;
        userData.level = 0;
        userData.xp = 0;
        userData.prestige = (userData.prestige || 0) + 1;

        const prestigeTitle = `[Chuyển Sinh Cấp ${userData.prestige}]`;
        if (!userData.unlockedTitles.includes(prestigeTitle)) {
            userData.unlockedTitles.push(prestigeTitle);
        }
        userData.title = prestigeTitle;

        queueSave();

        const csEmbed = new EmbedBuilder()
            .setColor('#FF4500')
            .setTitle('CHUYỂN SINH THÀNH CÔNG!')
            .setDescription(`🎉 Chúc mừng ${message.author} đã vượt qua giới hạn cấp 100 và **Chuyển Sinh thành công lần thứ [${userData.prestige}]**!\n\n` +
                            `• **Trạng thái:** Đã reset về Cấp 0.\n` +
                            `• **Nhận được:** Danh hiệu độc quyền \`${prestigeTitle}\`.\n` +
                            `• **Ưu đãi:** Tên bạn giờ đây sẽ đứng đầu bảng xếp hạng Prestige!`)
            .setTimestamp();

        return message.channel.send({ embeds: [csEmbed] });
    }

    if (command === 'mohopqua') {
        if ((userData.giftboxes || 0) <= 0) return message.reply('Bạn không có Hộp Quà nào!');
        userData.giftboxes -= 1;

        const rewardTypes = ['coins', 'xp', 'title'];
        const picked = rewardTypes[Math.floor(Math.random() * rewardTypes.length)];
        let rewardText = '';

        if (picked === 'coins') {
            const rewardCoins = Math.floor(Math.random() * 500) + 200;
            userData.coins += rewardCoins;
            rewardText = `**+${rewardCoins} SWC**`;
        } else if (picked === 'xp') {
            const rewardXp = Math.floor(Math.random() * 300) + 100;
            userData.xp += rewardXp;
            
            let xpNeeded = getXpForNextLevel(userData.level);
            while (userData.xp >= xpNeeded) {
                userData.xp -= xpNeeded;
                userData.level += 1;
                if (userData.level % 5 === 0) userData.giftboxes = (userData.giftboxes || 0) + 1;
                checkLevelTitles(userData);
                xpNeeded = getXpForNextLevel(userData.level);
            }
            rewardText = `**+${rewardXp} EXP**`;
        } else {
            const specialTitle = 'Thần Thánh Chat';
            if (!userData.unlockedTitles.includes(specialTitle)) userData.unlockedTitles.push(specialTitle);
            userData.title = specialTitle;
            rewardText = `Danh hiệu: \`${specialTitle}\``;
        }

        queueSave();
        return message.reply(`Mở Hộp Quà nhận được: ${rewardText}! (Còn lại: ${userData.giftboxes} hộp quà)`);
    }

    if (command === 'danhhieu' || command === 'title') {
        checkLevelTitles(userData);
        const action = args[0]?.toLowerCase();
        const titleChoice = args.slice(1).join(' ');

        if (action === 'chon' || action === 'set') {
            if (!titleChoice) return message.reply('Cú pháp: `.danhhieu chon <tên danh hiệu>`');
            const matchedTitle = userData.unlockedTitles.find(t => t.toLowerCase() === titleChoice.toLowerCase());
            if (!matchedTitle) return message.reply(`Bạn chưa sở hữu danh hiệu **"${titleChoice}"** này!`);
            userData.title = matchedTitle;
            queueSave();
            return message.reply(`Đã trang bị danh hiệu: **${matchedTitle}**!`);
        }

        let listText = userData.unlockedTitles.map(t => `${t === userData.title ? '**[Đang đeo]** ' : '• '}${t}`).join('\n');
        const titleEmbed = new EmbedBuilder()
            .setColor('#FFC0CB')
            .setTitle(`Kho Danh Hiệu Của ${message.author.username}`)
            .setDescription(`Danh hiệu hiện tại: **${userData.title || 'Chưa chọn'}**\n\n${listText}\n\n*Gõ \`.danhhieu chon <tên>\` để thay đổi!*`);
        return message.channel.send({ embeds: [titleEmbed] });
    }

    // --- 6. TÚI ĐỒ DẠNG ẢNH CANVAS ---
    if (command === 'tui' || command === 'inventory') {
        try {
            const canvas = Canvas.createCanvas(900, 500);
            const ctx = canvas.getContext('2d');

            ctx.fillStyle = '#0f1012';
            ctx.beginPath();
            ctx.roundRect(0, 0, 900, 500, 24);
            ctx.fill();

            const borderGrad = ctx.createLinearGradient(0, 0, 900, 500);
            borderGrad.addColorStop(0, '#f12711');
            borderGrad.addColorStop(0.5, '#f5af19');
            borderGrad.addColorStop(1, '#00ffcc');
            ctx.strokeStyle = borderGrad;
            ctx.lineWidth = 4;
            ctx.stroke();

            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 32px sans-serif';
            ctx.fillText(`Túi Đồ Của ${message.author.username}`, 40, 55);

            ctx.fillStyle = '#FFD700';
            ctx.font = 'bold 20px sans-serif';
            ctx.textAlign = 'right';
            ctx.fillText(`Số Dư: ${userData.coins || 0} SWC`, 860, 55);
            ctx.textAlign = 'left';

            ctx.strokeStyle = '#22252a';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(40, 80);
            ctx.lineTo(860, 80);
            ctx.stroke();

            const items = userData.inventory || [];
            if (items.length === 0) {
                ctx.fillStyle = '#8a8f9d';
                ctx.font = '24px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText('Túi đồ của bạn đang trống!', 450, 280);
            } else {
                let startY = 110;
                const maxItemsToShow = Math.min(items.length, 6);

                for (let i = 0; i < maxItemsToShow; i++) {
                    const item = items[i];

                    ctx.fillStyle = '#1b1d22';
                    ctx.beginPath();
                    ctx.roundRect(40, startY, 820, 50, 12);
                    ctx.fill();

                    ctx.strokeStyle = item.type === 'title' ? '#ff007f' : '#00ffcc';
                    ctx.lineWidth = 2;
                    ctx.stroke();

                    ctx.fillStyle = '#ffffff';
                    ctx.font = 'bold 20px sans-serif';
                    ctx.fillText(`#${i + 1}`, 65, startY + 32);
                    ctx.fillText(item.name, 130, startY + 32);

                    ctx.fillStyle = '#a1a6b0';
                    ctx.font = '16px sans-serif';
                    ctx.textAlign = 'right';
                    ctx.fillText(`[Loại: ${item.type}]`, 830, startY + 32);
                    ctx.textAlign = 'left';

                    startY += 62;
                }
            }

            ctx.fillStyle = '#6c757d';
            ctx.font = '14px sans-serif';
            ctx.fillText('Dùng .market-rao <số> <giá> để đăng bán lên chợ, hoặc .sd <số> để sử dụng.', 40, 475);

            const attachment = new AttachmentBuilder(canvas.toBuffer(), { name: 'inventory.png' });
            return message.channel.send({ files: [attachment] });

        } catch (error) {
            console.error('Lỗi tạo ảnh túi đồ:', error);
            let invText = (userData.inventory || []).map((item, index) => `**[${index + 1}]** ${item.name}`).join('\n');
            return message.reply(`Túi Đồ:\n${invText || 'Trống'}`);
        }
    }

    if (command === 'sd' || command === 'sudung') {
        const index = parseInt(args[0]) - 1;
        if (isNaN(index) || !userData.inventory || !userData.inventory[index]) {
            return message.reply('Cú pháp: `.sd <số thứ tự trong túi>`');
        }

        const item = userData.inventory[index];
        if (item.type === 'boost') {
            userData.personalBoostUntil = Date.now() + 3600000;
            userData.inventory.splice(index, 1);
            message.reply(`Đã sử dụng **${item.name}** thành công! X2 EXP trong 1 giờ.`);
        } else if (item.type === 'title') {
            if (!userData.unlockedTitles.includes(item.title)) userData.unlockedTitles.push(item.title);
            userData.title = item.title;
            userData.inventory.splice(index, 1);
            message.reply(`Đã trang bị danh hiệu: **${item.title}**!`);
        } else {
            message.reply('Vật phẩm này không thể sử dụng trực tiếp.');
        }
        queueSave();
        return;
    }

    // --- 7. PROFILE CANVAS (LỆNH .RANK / .CAP) ---
    if (command === 'cap' || command === 'rank' || command === 'profile' || command === 'thongtin') {
        const targetMember = message.mentions.members.first() || message.member;
        const targetUser = targetMember.user;
        initUser(guildId, targetUser.id);
        const uData = memoryDb[guildId].users[targetUser.id];
        checkLevelTitles(uData);

        const allUsers = Object.entries(memoryDb[guildId].users || {})
            .map(([id, data]) => ({ id, level: data.level, xp: data.xp, prestige: data.prestige || 0 }))
            .sort((a, b) => b.prestige === a.prestige ? (b.level === a.level ? b.xp - a.xp : b.level - a.level) : b.prestige - a.prestige);
        
        const rankIndex = allUsers.findIndex(u => u.id === targetUser.id);
        const rank = rankIndex !== -1 ? rankIndex + 1 : allUsers.length + 1;
        const requiredXp = getXpForNextLevel(uData.level);

        try {
            const canvas = Canvas.createCanvas(930, 320);
            const ctx = canvas.getContext('2d');

            ctx.fillStyle = '#0f1012';
            ctx.beginPath();
            ctx.roundRect(0, 0, 930, 320, 24);
            ctx.fill();

            const borderGrad = ctx.createLinearGradient(0, 0, 930, 320);
            borderGrad.addColorStop(0, '#00ffcc');
            borderGrad.addColorStop(0.5, '#7b2cbf');
            borderGrad.addColorStop(1, '#ff007f');
            ctx.strokeStyle = borderGrad;
            ctx.lineWidth = 4;
            ctx.stroke();

            const avatarURL = targetUser.displayAvatarURL({ extension: 'png', size: 256 });
            const avatar = await Canvas.loadImage(avatarURL);
            
            ctx.save();
            ctx.beginPath();
            ctx.arc(130, 160, 80, 0, Math.PI * 2, true);
            ctx.closePath();
            ctx.clip();
            ctx.drawImage(avatar, 50, 80, 160, 160);
            ctx.restore();

            ctx.strokeStyle = '#00ffcc';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.arc(130, 160, 82, 0, Math.PI * 2, true);
            ctx.stroke();

            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 38px sans-serif';
            ctx.fillText(targetUser.username, 245, 75);

            ctx.fillStyle = '#ffaa00';
            ctx.font = 'bold 20px sans-serif';
            ctx.fillText(`Chuyển Sinh: [${uData.prestige || 0}]`, 245, 115);

            ctx.fillStyle = '#a1a6b0';
            ctx.font = '20px sans-serif';
            ctx.fillText(`Danh hiệu: ${uData.title || '[Em Bé Tập Lẫy]'}`, 245, 150);

            ctx.fillStyle = '#00ffcc';
            ctx.font = 'bold 30px sans-serif';
            ctx.textAlign = 'right';
            ctx.fillText(`LVL ${uData.level}`, 880, 75);

            ctx.fillStyle = '#8a8f9d';
            ctx.font = 'bold 22px sans-serif';
            ctx.fillText(`RANK #${rank}`, 880, 115);
            ctx.textAlign = 'left';

            const barX = 245, barY = 205, barW = 635, barH = 45;
            ctx.fillStyle = '#1b1d22';
            ctx.beginPath();
            ctx.roundRect(barX, barY, barW, barH, 22);
            ctx.fill();

            let progress = requiredXp > 0 ? (uData.xp / requiredXp) : 0;
            if (progress > 1) progress = 1;
            const progressW = Math.max(40, barW * progress);

            const barGradient = ctx.createLinearGradient(barX, 0, barX + barW, 0);
            barGradient.addColorStop(0, '#00ffcc');
            barGradient.addColorStop(1, '#ff007f');

            ctx.fillStyle = barGradient;
            ctx.beginPath();
            ctx.roundRect(barX, barY, progressW, barH, 22);
            ctx.fill();

            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 20px sans-serif';
            ctx.fillText(`EXP: ${uData.xp} / ${requiredXp}`, barX + 25, barY + 29);

            ctx.fillStyle = '#d0d3dc';
            ctx.font = '18px sans-serif';
            ctx.fillText(`SWC: ${uData.coins || 0}   |   Hộp Quà: ${uData.giftboxes || 0}   |   Túi đồ: ${uData.inventory.length} món`, 245, 285);

            const attachment = new AttachmentBuilder(canvas.toBuffer(), { name: 'profile_card.png' });
            return message.channel.send({ files: [attachment] });

        } catch (error) {
            console.error('Lỗi tạo profile card:', error);
            return message.reply(`**${targetUser.username}** | Cấp: **${uData.level}** | Rank: **#${rank}**`);
        }
    }

    // --- 8. LỆNH BẢNG XẾP HẠNG CANVAS (.bxh) ---
    if (command === 'bxh' || command === 'leaderboard') {
        try {
            const users = memoryDb[guildId]?.users;
            if (!users || !Object.keys(users).length) {
                return message.channel.send('Chưa có dữ liệu bảng xếp hạng trong server này!');
            }

            const sorted = Object.entries(users)
                .map(([id, data]) => ({ id, level: data.level, xp: data.xp, prestige: data.prestige || 0 }))
                .sort((a, b) => b.prestige === a.prestige ? (b.level === a.level ? b.xp - a.xp : b.level - a.level) : b.prestige - a.prestige)
                .slice(0, 10);

            const canvas = Canvas.createCanvas(900, 750);
            const ctx = canvas.getContext('2d');

            ctx.fillStyle = '#0f1012';
            ctx.beginPath();
            ctx.roundRect(0, 0, 900, 750, 24);
            ctx.fill();

            const borderGrad = ctx.createLinearGradient(0, 0, 900, 750);
            borderGrad.addColorStop(0, '#FFD700');
            borderGrad.addColorStop(0.5, '#FF4500');
            borderGrad.addColorStop(1, '#00ffcc');
            ctx.strokeStyle = borderGrad;
            ctx.lineWidth = 4;
            ctx.stroke();

            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 34px sans-serif';
            ctx.fillText(`Bảng Xếp Hạng Cấp Độ`, 40, 60);

            ctx.fillStyle = '#FFD700';
            ctx.font = 'bold 18px sans-serif';
            ctx.textAlign = 'right';
            ctx.fillText(`Server: ${message.guild.name}`, 860, 55);
            ctx.textAlign = 'left';

            ctx.strokeStyle = '#22252a';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(40, 85);
            ctx.lineTo(860, 85);
            ctx.stroke();

            let startY = 105;
            const maxShow = Math.min(sorted.length, 8);

            for (let i = 0; i < maxShow; i++) {
                const u = sorted[i];
                let member;
                try {
                    member = await message.guild.members.fetch(u.id);
                } catch (e) {
                    member = null;
                }

                const username = member ? member.user.username : `User ${u.id.slice(0, 5)}`;
                const avatarURL = member ? member.user.displayAvatarURL({ extension: 'png', size: 128 }) : 'https://cdn.discordapp.com/embed/avatars/0.png';

                ctx.fillStyle = '#1b1d22';
                ctx.beginPath();
                ctx.roundRect(40, startY, 820, 65, 12);
                ctx.fill();

                if (i === 0) ctx.strokeStyle = '#FFD700';
                else if (i === 1) ctx.strokeStyle = '#C0C0C0';
                else if (i === 2) ctx.strokeStyle = '#CD7F32';
                else ctx.strokeStyle = '#2d323b';
                ctx.lineWidth = 2;
                ctx.stroke();

                try {
                    const avatar = await Canvas.loadImage(avatarURL);
                    ctx.save();
                    ctx.beginPath();
                    ctx.arc(77, startY + 32, 24, 0, Math.PI * 2, true);
                    ctx.closePath();
                    ctx.clip();
                    ctx.drawImage(avatar, 53, startY + 8, 48, 48);
                    ctx.restore();
                } catch (err) {}

                ctx.fillStyle = i === 0 ? '#FFD700' : (i === 1 ? '#C0C0C0' : (i === 2 ? '#CD7F32' : '#ffffff'));
                ctx.font = 'bold 22px sans-serif';
                ctx.fillText(`#${i + 1}`, 120, startY + 41);

                ctx.fillStyle = '#ffffff';
                ctx.font = 'bold 20px sans-serif';
                ctx.fillText(username, 185, startY + 41);

                ctx.fillStyle = '#a1a6b0';
                ctx.font = '15px sans-serif';
                ctx.fillText(`Chuyển Sinh: [${u.prestige}] | EXP: ${u.xp}`, 480, startY + 41);

                ctx.fillStyle = '#00ffcc';
                ctx.font = 'bold 22px sans-serif';
                ctx.textAlign = 'right';
                ctx.fillText(`LVL ${u.level}`, 835, startY + 41);
                ctx.textAlign = 'left';

                startY += 75;
            }

            ctx.fillStyle = '#8a8f9d';
            ctx.font = '14px sans-serif';
            ctx.fillText('Hệ thống tự động cập nhật liên tục theo hoạt động chat và voice của thành viên.', 40, 725);

            const attachment = new AttachmentBuilder(canvas.toBuffer(), { name: 'leaderboard.png' });
            return message.channel.send({ files: [attachment] });

        } catch (error) {
            console.error('Lỗi tạo ảnh bxh:', error);
            const users = memoryDb[guildId]?.users;
            const sorted = Object.entries(users)
                .map(([id, data]) => ({ id, level: data.level, xp: data.xp, prestige: data.prestige || 0 }))
                .sort((a, b) => b.prestige === a.prestige ? (b.level === a.level ? b.xp - a.xp : b.level - a.level) : b.prestige - a.prestige)
                .slice(0, 10);
            let text = sorted.map((u, i) => `**#${i + 1}** <@${u.id}> — Cấp ${u.level} (${u.xp} EXP) [CS: ${u.prestige}]`).join('\n');
            const embed = new EmbedBuilder().setColor('#FFD700').setTitle(`Bảng Xếp Hạng - ${message.guild.name}`).setDescription(text);
            return message.channel.send({ embeds: [embed] });
        }
    }
});

client.login(TOKEN);
