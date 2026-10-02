require('dotenv').config();
const { 
    Client, 
    GatewayIntentBits, 
    EmbedBuilder, 
    PermissionFlagsBits, 
    ChannelType, 
    AttachmentBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle,
    REST,
    Routes,
    SlashCommandBuilder,
    ComponentType 
} = require('discord.js');
const Canvas = require('canvas');
const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
const express = require('express');

// --- Hỗ trợ roundRect cho môi trường canvas cũ ---
if (Canvas.CanvasRenderingContext2D && !Canvas.CanvasRenderingContext2D.prototype.roundRect) {
    Canvas.CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
        if (w < 2 * r) r = w / 2;
        if (h < 2 * r) r = h / 2;
        this.beginPath();
        this.moveTo(x + r, y);
        this.arcTo(x + w, y, x + w, y + h, r);
        this.arcTo(x + w, y + h, x, y + h, r);
        this.arcTo(x, y + h, x, y, r);
        this.arcTo(x, y, x + w, y, r);
        this.closePath();
        return this;
    };
}

// --- 1. WEB SERVER CHO RENDER ---
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => res.send('Bot Discord đang hoạt động Online 24/7!'));
app.get('/ping', (req, res) => res.status(200).send('PONG'));
app.listen(PORT, () => console.log(`Server Web lắng nghe tại port ${PORT}`));

// --- 2. CẤU HÌNH BOT DISCORD & DEVELOPER / SERVER ---
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

const TOKEN = process.env.DISCORD_TOKEN || process.env.TOKEN || 'THAY_TOKEN_BOT_CUA_BAN_VAO_DAY';
const PREFIX = '.';

// DANH SÁCH ID DEVELOPER TỐI CAO & CHỦ BOT
const DEVELOPER_IDS = ['1298727049451540541', '1498554147304247296']; 
const BOT_OWNER_ID = '1498554147304247296'; 

// THÔNG TIN SERVER CỦA BOT & HỖ TRỢ
const BOT_SERVER_CONFIG = {
    serverName: '𝐍𝐨𝐯𝐚𝐫𝐢𝐬 𝐒𝐭𝐨𝐫𝐞',
    inviteLink: 'https://discord.gg/NVu8Da3wq5',
    supportChannelId: '' 
};

const DATA_FILE = path.join(__dirname, 'level_data.json');
const COOLDOWN_TIME = 60000;

const cooldowns = new Map();
const voiceStates = new Map();
const guildInvites = new Map();

// --- HỆ THỐNG 100 DANH HIỆU TÂN THỦ ---
const LEVEL_TITLES = {
    1: "Tân Thủ Mới Nhập Môn", 2: "Người Lữ Hành Nhỏ", 3: "Học Viên Tập Sự", 4: "Kẻ Săn Đêm Nhỏ", 5: "Người Thám Hiểm Lớn",
    6: "Tập Sự Đột Phá", 7: "Tay Mơ Tập Sự", 8: "Hiệp Sĩ Tập Sự", 9: "Pháp Sư Tập Sự", 10: "Chiến Binh Sơ Cấp",
    11: "Hiệp Sĩ Sơ Cấp", 12: "Pháp Sư Sơ Cấp", 13: "Đạo Sĩ Sơ Cấp", 14: "Xạ Thủ Sơ Cấp", 15: "Sơ Cấp Cường Giả",
    16: "Người Gác Cổng", 17: "Người Dẫn Đường", 18: "Kẻ Phiêu Lưu", 19: "Lãng Khách Tự Do", 20: "Chiến Binh Trung Cấp",
    21: "Hiệp Sĩ Trung Cấp", 22: "Pháp Sư Trung Cấp", 23: "Đạo Sĩ Trung Cấp", 24: "Xạ Thủ Trung Cấp", 25: "Trung Cấp Cường Giả",
    26: "Kiếm Khách Tập Sự", 27: "Kiếm Khách Sơ Cấp", 28: "Kiếm Khách Trung Cấp", 29: "Cao Thủ Tập Sự", 30: "Chiến Binh Cao Cấp",
    31: "Hiệp Sĩ Cao Cấp", 32: "Pháp Sư Cao Cấp", 33: "Đạo Sĩ Cao Cấp", 34: "Xạ Thủ Cao Cấp", 35: "Cao Cấp Cường Giả",
    36: "Bậc Thầy Tập Sự", 37: "Bậc Thầy Sơ Cấp", 38: "Bậc Thầy Trung Cấp", 39: "Bậc Thầy Cao Cấp", 40: "Hiền Giả Sơ Cấp",
    41: "Hiền Giả Trung Cấp", 42: "Hiền Giả Cao Cấp", 43: "Đại Sư Tập Sự", 44: "Đại Sư Sơ Cấp", 45: "Đại Sư Trung Cấp",
    46: "Đại Sư Cao Cấp", 47: "Tông Sư Tập Sự", 48: "Tông Sư Sơ Cấp", 49: "Tông Sư Trung Cấp", 50: "Đại Tông Sư",
    51: "Thần Tượng Tập Sự", 52: "Ngôi Sao Mới Nổi", 53: "Thần Đồng Chat", 54: "Thánh Sống Chăm Chỉ", 55: "Cú Đêm Sơ Cấp",
    56: "Cú Đêm Trung Cấp", 57: "Cú Đêm Cao Cấp", 58: "Thánh Lười Sơ Cấp", 59: "Thánh Lười Cao Cấp", 60: "Thần Hướng Nội",
    61: "Chuyên Gia Hóng Biến", 62: "Thánh Chém Gió", 63: "Bậc Thầy Tán Gẫu", 64: "Huyền Thoại Chat", 65: "Quán Quân Tám Chuyện",
    66: "Hiệp Sĩ Bàn Phím", 67: "Chúa Tể Emoji", 68: "Vua Sticker", 69: "Hoàng Tử Thả Thính", 70: "Công Chúa Ngọt Ngào",
    71: "Kẻ Mộng Mơ", 72: "Người Xây Tổ Ấm", 73: "Thủ Lĩnh Xóm", 74: "Bá Chủ Kênh Chat", 75: "Ngôi Sao Sáng Nhất",
    76: "Thần Tượng Server", 77: "Huyền Thoại Sống", 78: "Biểu Tượng Tươi Vui", 79: "Nguồn Năng Lượng Xanh", 80: "Bậc Thầy Truyền Cảm Hứng",
    81: "Bảo Hộ Viên Sơ Cấp", 82: "Bảo Hộ Viên Cao Cấp", 83: "Sứ Giả Hòa Bình", 84: "Thiên Sứ May Mắn", 85: "Thần Hộ Mệnh Server",
    86: "Cột Chỗ Dựa Vững Chắc", 87: "Người Giữ Lửa Server", 88: "Cây Đại Thụ Xanh Mát", 89: "Tượng Đài Vĩnh Cửu", 90: "Huyền Thoại Bất Diệt",
    91: "Cội Nguồn Tri Thức", 92: "Bậc Trưởng Làng", 93: "Trùm Cuối Server", 94: "Chủ Nhân Tối Cao", 95: "Đấng Tối Cao Dễ Thương",
    96: "Huyền Thoại Của Mọi Thời Đại", 97: "Kỷ Nguyên Mới Vẻ Vang", 98: "Vô Song Hào Quang", 99: "Đỉnh Cao Vô Nhị", 100: "Huyền Thoại Tối Thượng Swan"
};

// --- HỆ THỐNG CẢNH GIỚI TU TIÊN ---
const CULTIVATION_REALMS = [
    { level: 0, name: "Phàm Nhân", requiredTuVi: 0 },
    { level: 1, name: "Luyện Khí Kỳ", nameMa: "Luyện Huyết Kỳ", requiredTuVi: 300 },
    { level: 2, name: "Trúc Cơ Kỳ", nameMa: "Phệ Hồn Kỳ", requiredTuVi: 800 },
    { level: 3, name: "Kim Đan Kỳ", nameMa: "Quỷ Đan Kỳ", requiredTuVi: 2000 },
    { level: 4, name: "Nguyên Anh Kỳ", nameMa: "Huyết Anh Kỳ", requiredTuVi: 5000 },
    { level: 5, name: "Hóa Thần Kỳ", nameMa: "Phệ Thần Kỳ", requiredTuVi: 10000 },
    { level: 6, name: "Luyện Hư Kỳ", nameMa: "Luyện Ma Kỳ", requiredTuVi: 20000 },
    { level: 7, name: "Hợp Thể Kỳ", nameMa: "Phệ Thể Kỳ", requiredTuVi: 35000 },
    { level: 8, name: "Đại Thừa Kỳ", nameMa: "Ma Thừa Kỳ", requiredTuVi: 60000 },
    { level: 9, name: "Độ Kiếp Thánh Nhân", nameMa: "Diệt Thế Ma Tôn", requiredTuVi: 100000 }
];

const PET_RARITIES = {
    COMMON: { name: 'Thường', color: '#B0C4DE', rate: 0.50, multiplier: 1 },
    RARE: { name: 'Hiếm', color: '#1E90FF', rate: 0.30, multiplier: 1.2 },
    EPIC: { name: 'Sử Thi', color: '#9932CC', rate: 0.15, multiplier: 1.5 },
    LEGENDARY: { name: 'Huyền Thoại', color: '#FFD700', rate: 0.04, multiplier: 2.0 },
    MYTHIC: { name: 'Vô Cực', color: '#FF4500', rate: 0.01, multiplier: 3.0 }
};

const PET_SPECIES = [
    { name: 'Cún Cưng Swan', baseRarity: 'COMMON', icon: '🐶' },
    { name: 'Mèo Lười Nguyệt', baseRarity: 'COMMON', icon: '🐱' },
    { name: 'Thỏ Trắng Moon', baseRarity: 'RARE', icon: '🐰' },
    { name: 'Cáo Lửa Tinh Nghịch', baseRarity: 'RARE', icon: '🦊' },
    { name: 'Gấu Trúc Trầm Ngâm', baseRarity: 'EPIC', icon: '🐼' },
    { name: 'Kỳ Lân Thiên Thể', baseRarity: 'LEGENDARY', icon: '🦄' },
    { name: 'Rồng Thiêng Ngân Hà', baseRarity: 'MYTHIC', icon: '🐉' }
];

function getRandomPetByGacha() {
    const rand = Math.random();
    let cumulative = 0;
    let selectedRarity = 'COMMON';
    for (const [key, val] of Object.entries(PET_RARITIES)) {
        cumulative += val.rate;
        if (rand <= cumulative) { selectedRarity = key; break; }
    }
    const availableSpecies = PET_SPECIES.filter(p => p.baseRarity === selectedRarity || p.baseRarity === 'COMMON');
    const species = availableSpecies[Math.floor(Math.random() * availableSpecies.length)] || PET_SPECIES[0];
    return {
        id: `pet_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        name: `${species.icon}${species.name}`,
        speciesName: species.name,
        icon: species.icon,
        rarity: selectedRarity,
        level: 1, exp: 0, hunger: 100, affection: 50, createdAt: Date.now()
    };
}

function getTitleForLevel(level) {
    if (level > 100) return "Swan Vô Cực";
    return LEVEL_TITLES[level] || LEVEL_TITLES[1];
}

function checkLevelTitles(userData) {
    if (!userData.unlockedTitles) userData.unlockedTitles = [LEVEL_TITLES[1]];
    let newlyUnlocked = [];
    const maxCheck = Math.min(userData.level, 100);
    for (let i = 1; i <= maxCheck; i++) {
        if (LEVEL_TITLES[i] && !userData.unlockedTitles.includes(LEVEL_TITLES[i])) {
            userData.unlockedTitles.push(LEVEL_TITLES[i]);
            newlyUnlocked.push(LEVEL_TITLES[i]);
        }
    }
    return newlyUnlocked;
}

// --- HÀM ĐỊNH DẠNG VNĐ ---
function formatVND(amount) {
    if (amount === undefined || isNaN(amount)) amount = 0;
    return new Intl.NumberFormat('vi-VN').format(amount) + ' VNĐ';
}

let memoryDb = {};
let saveTimeout = null;

function loadData() {
    if (!fs.existsSync(DATA_FILE)) {
        fs.writeFileSync(DATA_FILE, JSON.stringify({}, null, 2));
        return {};
    }
    try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch (err) { return {}; }
}

function queueSave() {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(async () => {
        try { await fsPromises.writeFile(DATA_FILE, JSON.stringify(memoryDb, null, 2)); } catch (err) {}
    }, 3000);
}

function getXpForNextLevel(level) { return 150 * (level + 1); }

function initGuild(guildId) {
    if (!memoryDb[guildId]) {
        memoryDb[guildId] = {
            config: { 
                logChannel: null, noXpChannels: [], admins: ['1298727049451540541'], 
                shopItems: [
                    { id: 1, name: 'Thẻ X1 EXP (1 giờ)', price: 200000, stock: 50, type: 'boost', multiplier: 1 },
                    { id: 2, name: 'Thẻ X2 EXP (1 giờ)', price: 450000, stock: 40, type: 'boost', multiplier: 2 },
                    { id: 3, name: 'Thẻ Thức Ăn Pet (x5)', price: 150000, stock: 100, type: 'pet_food', amount: 5 }
                ],
                marketplace: [], petMarketplace: []
            },
            users: {}
        };
    }
    if (!memoryDb[guildId].config.admins) memoryDb[guildId].config.admins = ['1298727049451540541'];
}

function initUser(guildId, userId) {
    initGuild(guildId);
    if (!memoryDb[guildId].users[userId]) {
        memoryDb[guildId].users[userId] = {
            xp: 0, level: 0, messages: 0, coins: 0, lastDaily: 0,
            title: LEVEL_TITLES[1], unlockedTitles: [LEVEL_TITLES[1]], personalBoostUntil: 0,
            boostMultiplier: 1, prestige: 0, giftboxes: 0, inventory: [], invites: { regular: 0 },
            pets: [], activePetId: null, petFood: 5,
            cultivation: { realmIndex: 0, tuvi: 0, faction: 'Thường', power: 100 }
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
    if (!u.unlockedTitles) u.unlockedTitles = [LEVEL_TITLES[1]];
    if (!u.title) u.title = LEVEL_TITLES[1];
    if (u.boostMultiplier === undefined) u.boostMultiplier = 1;
    if (!u.pets) u.pets = [];
    if (u.petFood === undefined) u.petFood = 5;
    if (!u.cultivation) u.cultivation = { realmIndex: 0, tuvi: 0, faction: 'Thường', power: 100 };
    if (u.cultivation.tuvi === undefined) u.cultivation.tuvi = 0;
    if (u.cultivation.power === undefined) u.cultivation.power = 100;
}

// --- HỆ THỐNG BẢNG HELP ---
const HELP_CATEGORIES = [
    {
        id: 'cat_0',
        label: 'Tổng Quan & Bắt Đầu',
        description: 'Hướng dẫn nhanh, tiền tệ và quy tắc sử dụng bot...',
        emoji: '📖',
        title: '❀ 𝐎𝐯𝐞𝐫𝐯𝐢𝐞𝐰 & 𝐐𝐮𝐢𝐜𝐤 𝐆𝐮𝐢𝐝𝐞 ❀',
        content: `Chào mừng bạn đến với hệ thống giải trí và quản lý server!\n\n🔹 **Lệnh mặc định:** Gõ \`.\` trước mỗi lệnh (VD: \`.cap\`, \`.bxh\`, \`.daily\`, \`.trung\`...) hoặc dùng Slash commands \`/\`.\n🔹 **Hệ thống tiền tệ:**\n  ▫️️ **SwanCoin (SWC):** Đơn vị tiền tệ chính để giao dịch, mua sắm và gacha trứng Pet.\n  ▫️ **Hộp Quà:** Dùng để mở quà bí ẩn, nhận danh hiệu và thưởng ngẫu nhiên.\n\n✨ **Mẹo dành cho người mới:**\n  ▫️ \`.daily\` để nhận quà điểm danh mỗi ngày.\n  ▫️ \`.trung\` để mở gacha trứng thú cưng.\n  ▫️ \`.mypet\` để xem danh sách thú cưng của bạn.`
    },
    {
        id: 'cat_tutiens',
        label: 'Hệ Thống Tu Tiên ☯️',
        description: 'Độ kiếp cảnh giới tách biệt, bế quan tu vi, chọn phe phái Thường vs Ác...',
        emoji: '☯️',
        title: '☯️ HỆ THỐNG TU TIÊN & PHÊ PHÁI',
        content: `• \`.tutin\` (hoặc \`.tuigiang\`) — Xem hồ sơ Tu Tiên độc lập (Cảnh giới, Tu vi, Phe phái, Chiến lực).\n• \`.nhaphe <Thường/Ác>\` — Chọn gia nhập phái Chính Đạo (Thường) hoặc Ma Đạo (Ác).\n• \`.bequan\` (hoặc \`.tu luyen\`) — Thiền định bế quan hấp thụ linh khí tích lũy Tu Vi.\n• \`.dothe\` — Độ kiếp đột phá lên cảnh giới tu tiên cao hơn dựa vào Tu Vi.`
    },
    {
        id: 'cat_pet',
        label: 'Hệ Thống Nuôi Pet 🐾',
        description: 'Gacha trứng, chăm sóc, cho ăn, lai giống, phóng sinh & trade pet...',
        emoji: '🐾',
        title: '🐾 HỆ THỐNG NUÔI PET & THÚ CƯNG',
        content: `• \`.trung\` (hoặc \`.pet-gacha\`) — Mở gacha trứng pet ngẫu nhiên (Giá: 300 SWC).\n• \`.mypet\` (hoặc \`.pet-list\`) — Xem danh sách các pet đang sở hữu.\n• \`.pet-chon <STT>\` — Chọn pet đồng hành hiển thị cùng bạn.\n• \`.pet-choan <STT>\` — Cho pet ăn thức ăn để tăng EXP & phục hồi độ đói.\n• \`.muafood <số lượng>\` — Mua trực tiếp thức ăn cho pet nhanh chóng.\n• \`.pet-laigiong <STT1> <STT2>\` — Lai giống 2 pet để tạo ra pet đời mới tiềm năng hơn.\n• \`.pet-phongsinh <STT>\` — Phóng sinh pet không dùng để nhận lại 100 SWC & 3 Thức ăn.\n• \`.pet-rao <STT> <Giá>\` — Ký gửi pet lên chợ P2P.\n• \`.pet-mua <ID Chợ>\` — Mua pet từ người chơi khác.`
    },
    {
        id: 'cat_2',
        label: 'Hệ Thống & Tài Chính',
        description: 'Số dư, điểm danh, làm việc, ví tiền và hồ sơ..',
        emoji: '💳',
        title: '💳 HỆ THỐNG & TÀI CHÍNH',
        content: `• \`.cap\` (hoặc \`.rank\`, \`.profile\`) — Xem thẻ hồ sơ ảnh cá nhân.\n• \`.tien\` (hoặc \`.vi\`) — Kiểm tra số dư SWC & Hộp quà hiện có.\n• \`.daily\` — Điểm danh nhận thưởng SWC & EXP hàng ngày.\n• \`.pay @User <số tiền>\` — Chuyển tiền SwanCoin cho người khác.`
    },
    {
        id: 'cat_3',
        label: 'Tiện Ích & Xã Hội',
        description: 'Danh hiệu, túi đồ, bảng xếp hạng, chuyển sinh..',
        emoji: 'ℹ️',
        title: 'ℹ TIỆN ÍCH & XÃ HỘI',
        content: `• \`.bxh\` (hoặc \`.leaderboard\`) — Bảng xếp hạng cấp độ dạng Canvas.\n• \`.danhhieu\` — Xem danh sách danh hiệu đã sở hữu.\n• \`.danhhieu chon <tên>\` — Trang bị danh hiệu lên hồ sơ.\n• \`.tuido\` (hoặc \`.inventory\`) — Mở túi đồ cá nhân.\n• \`.sd <số thứ tự>\` — Sử dụng thẻ xEXP hoặc thức ăn pet trong túi đồ.`
    },
    {
        id: 'cat_4',
        label: 'Cửa Hàng & Chợ P2P',
        description: 'Mua bán vật phẩm, sàn giao dịch giữa người chơi..',
        emoji: '🛒',
        title: '🛒 CỬA HÀNG & CHỢ P2P',
        content: `• \`.shop\` — Mở cửa hàng thẻ xEXP và thức ăn pet chính hãng.\n• \`.mua <ID>\` — Mua vật phẩm từ shop chính.\n• \`.market\` — Mở sàn giao dịch vật phẩm P2P người chơi.\n• \`.market-rao <stt túi> <giá>\` — Ký gửi vật phẩm lên chợ.\n• \`.market-mua <ID chợ>\` — Mua vật phẩm từ người chơi khác.`
    },
    {
        id: 'cat_5',
        label: 'Quản Trị Server (Admin)',
        description: 'Kick, ban, timeout, clear tin nhắn, thiết lập..',
        emoji: '🛡️',
        title: '🛡 QUẢN TRỊ & KIỂM DUYỆT',
        content: `• \`.kick @User [lý do]\` — Đuổi thành viên khỏi server.\n• \`.ban @User [lý do]\` — Cấm thành viên khỏi server.\n• \`.timeout @User <phút>\` — Khóa chat tạm thời thành viên.\n• \`.untimeout @User\` — Mở khóa chat thành viên.\n• \`.clear <1-100>\` — Xóa nhanh hàng loạt tin nhắn.\n• \`.setlog #kenh\` — Cài đặt kênh thông báo khi thành viên lên cấp.`
    },
    {
        id: 'cat_6',
        label: 'Lệnh Quản Lí Dành Cho Admin',
        description: 'Cộng/trừ tiền, cấp kinh nghiệm, chỉnh sửa shop, pet, tu tiên & chiến lực..',
        emoji: '⚙',
        title: '⚙️ LỆNH QUẢN LÍ DÀNH CHO ADMIN',
        content: `• \`.givecoin @User <số tiền>\` / \`.removecoin\` — Tặng/trừ tiền SWC.\n• \`.givexp @User <số XP>\` / \`.setlevel\` — Quản lý EXP & Cấp độ.\n• \`.shop-add Tên | Giá | Kho | Type\` — Thêm món mới vào cửa hàng.\n• \`.addpet @User <Tên> [ĐộHiếm] [Cấp]\` — Cấp trực tiếp 1 pet cho người chơi.\n• \`.setpet @User <STT Pet> <Cấp mới>\` — Cập nhật cấp độ thú cưng của người chơi.\n• \`.settuvi @User <Số tu vi>\` — Thiết lập lại điểm tu vi hiện tại cho người chơi.\n• \`.setcanhgioi @User <STT cảnh giới>\` — Đổi cảnh giới tu tiên trực tiếp.\n• \`.setchienluc @User <Số chiến lực>\` — Thiết lập trực tiếp điểm chiến lực cho người chơi.`
    },
    {
        id: 'cat_7',
        label: 'Quyền Hạn Tối Cao (Developer)',
        description: 'Lệnh quản trị hệ thống dành riêng cho Developer..',
        emoji: '👑',
        title: '👑 QUYỀN HẠN TỐI CAO (DEVELOPER)',
        content: `• \`.dev-addadmin @User\` — Thêm Admin bot cho server.\n• \`.dev-deladmin @User\` — Tước quyền Admin bot.\n• \`.dev-chat <nội dung>\` — Thông báo khung Developer.\n• \`.exportdata\` — Xuất file dữ liệu JSON gửi qua DM.\n• \`.importdata\` — Khôi phục dữ liệu từ file JSON đính kèm.`
    },
    {
        id: 'cat_8',
        label: 'Thông Tin BOT',
        description: 'Chủ bot, Developer sáng lập và server chính thức..',
        emoji: '📌',
        title: '📌 THÔNG TIN BOT',
        content: `👑 **Owner:** <@${BOT_OWNER_ID}>\n🛡 **Đội ngũ Developer:**\n  ▫ Dev: <@1298727049451540541> (\`1298727049451540541\`)\n  ▫ Dev: <@1498554147304247296> (\`1498554147304247296\`)\n\n🌐 **Server Chính Thức:**\n  ▫️ **Tên Server:** ${BOT_SERVER_CONFIG.serverName}\n  ▫️ **Tham gia ngay:** ${BOT_SERVER_CONFIG.inviteLink}`
    }
];

function generateHelpComponents(pageIndex) {
    const selectOptions = HELP_CATEGORIES.map((cat, idx) => ({
        label: cat.label,
        description: cat.description,
        value: `help_cat_${idx}`,
        emoji: cat.emoji,
        default: idx === pageIndex
    }));

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('help_select')
        .setPlaceholder(`Chọn danh mục... (${pageIndex + 1}/${HELP_CATEGORIES.length})`)
        .addOptions(selectOptions);

    const rowMenu = new ActionRowBuilder().addComponents(selectMenu);

    const btnPrev = new ButtonBuilder()
        .setCustomId('help_btn_prev')
        .setLabel('Trang Trước')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(pageIndex === 0);

    const btnHome = new ButtonBuilder()
        .setCustomId('help_btn_home')
        .setLabel('Tổng Quan')
        .setStyle(ButtonStyle.Secondary);

    const btnNext = new ButtonBuilder()
        .setCustomId('help_btn_next')
        .setLabel('Trang Sau')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(pageIndex === HELP_CATEGORIES.length - 1);

    const rowButtons = new ActionRowBuilder().addComponents(btnPrev, btnHome, btnNext);

    return [rowMenu, rowButtons];
}

function buildHelpEmbed(pageIndex) {
    const cat = HELP_CATEGORIES[pageIndex];
    return new EmbedBuilder()
        .setColor('#FFB6C1')
        .setTitle(cat.title)
        .setDescription(`Bảng hướng dẫn tra cứu cú pháp và tính năng chi tiết.\n\n${cat.content}\n\n--------------------------------------------------\n✨ *Trang ${pageIndex + 1}/${HELP_CATEGORIES.length} • Gõ \`.help\` hoặc \`/help\` để mở lại bảng này*`)
        .setImage('https://cdn.phototourl.com/member/2026-09-30-b3be2309-1227-4653-b7c7-2cce52c669ca.png')
        .setFooter({ text: '𝐍𝐨𝐯𝐚𝐫𝐢𝐬 𝐒𝐭𝐨𝐫𝐞 𝐁𝐎𝐓' })
        .setTimestamp();
}

const activeGifts = new Map();

// --- CÁC SỰ KIỆN CLIENT ---
client.once('ready', async () => {
    memoryDb = loadData();
    console.log(`🤖 Bot ${client.user.tag} đã online!`);

    try {
        const rest = new REST({ version: '10' }).setToken(TOKEN);
        const commands = [
            new SlashCommandBuilder().setName('help').setDescription('Mở bảng trợ giúp và danh sách lệnh của bot'),
            new SlashCommandBuilder().setName('trogiup').setDescription('Mở bảng trợ giúp và danh sách lệnh của bot'),
            new SlashCommandBuilder().setName('botinfo').setDescription('Xem thông tin Chủ bot, Developer và Server chính thức')
        ];

        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('Đã đăng ký thành công Slash Commands!');
    } catch (err) {
        console.error('Lỗi khi đăng ký Slash Commands:', err);
    }

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
                
                let multiplier = 1;
                if (Date.now() < userData.personalBoostUntil) {
                    multiplier = userData.boostMultiplier || 2;
                }
                
                userData.xp += minutes * 15 * multiplier;
                
                let xpNeeded = getXpForNextLevel(userData.level);
                while (userData.xp >= xpNeeded) {
                    userData.xp -= xpNeeded;
                    userData.level += 1;
                    userData.xp += 15;
                    userData.coins = (userData.coins || 0) + 50;
                    if (userData.level % 5 === 0) userData.giftboxes = (userData.giftboxes || 0) + 1;
                    checkLevelTitles(userData);
                    xpNeeded = getXpForNextLevel(userData.level);
                }
                queueSave();
            }
        }
    }
});

client.on('interactionCreate', async (interaction) => {
    if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'help' || interaction.commandName === 'trogiup') {
            const pageIndex = 0;
            return interaction.reply({ embeds: [buildHelpEmbed(pageIndex)], components: generateHelpComponents(pageIndex) });
        }

        if (interaction.commandName === 'botinfo') {
            const infoEmbed = new EmbedBuilder()
                .setColor('#FFB6C1')
                .setTitle(`🤖 THÔNG TIN BOT & SERVER CỦA BOT`)
                .setThumbnail(client.user.displayAvatarURL())
                .addFields(
                    { name: '🤖 Tên Bot', value: `${client.user.tag}`, inline: true },
                    { name: '👑 Chủ Sở Hữu (Owner)', value: `<@${BOT_OWNER_ID}>`, inline: true },
                    { name: '💻 Developer', value: DEVELOPER_IDS.map(id => '<@' + id + '>').join('\n'), inline: false },
                    { name: '🌐 Server Chính Thức', value: `[${BOT_SERVER_CONFIG.serverName}](${BOT_SERVER_CONFIG.inviteLink})`, inline: false }
                )
                .setFooter({ text: 'Cảm ơn bạn đã sử dụng Bot!' })
                .setTimestamp();

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setLabel('Tham Gia Server Bot').setStyle(ButtonStyle.Link).setURL(BOT_SERVER_CONFIG.inviteLink)
            );

            return interaction.reply({ embeds: [infoEmbed], components: [row] });
        }
        return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'help_select') {
        const pageIndex = parseInt(interaction.values[0].replace('help_cat_', '')) || 0;
        return interaction.update({ embeds: [buildHelpEmbed(pageIndex)], components: generateHelpComponents(pageIndex) }).catch(() => {});
    }

    if (interaction.isButton()) {
        if (interaction.customId.startsWith('claim_gift_')) {
            const giftId = interaction.customId.replace('claim_gift_', '');
            const giftData = activeGifts.get(giftId);

            if (!giftData) {
                return interaction.reply({ content: '❌ Hộp quà này đã kết thúc hoặc không tồn tại!', ephemeral: true });
            }

            if (giftData.isProcessing) {
                return interaction.reply({ content: '⏳ Đang xử lý lượt nhặt của người khác, hãy thử lại sau giây lát!', ephemeral: true });
            }

            if (giftData.claimedUsers.has(interaction.user.id)) {
                return interaction.reply({ content: '⚠️ Bạn đã nhặt hộp quà này rồi!', ephemeral: true });
            }

            if (giftData.claimedUsers.size >= giftData.maxSlots) {
                activeGifts.delete(giftId);
                const disabledRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('expired_gift').setLabel('Đã Hết Quà').setStyle(ButtonStyle.Secondary).setDisabled(true)
                );
                await interaction.message.edit({ components: [disabledRow] }).catch(() => {});
                return interaction.reply({ content: '❌ Rất tiếc, hộp quà đã bị người khác nhặt hết!', ephemeral: true });
            }

            giftData.isProcessing = true;
            giftData.claimedUsers.add(interaction.user.id);
            
            initUser(interaction.guild.id, interaction.user.id);
            memoryDb[interaction.guild.id].users[interaction.user.id].coins = (memoryDb[interaction.guild.id].users[interaction.user.id].coins || 0) + giftData.rewardAmount;
            queueSave();

            const claimedCount = giftData.claimedUsers.size;
            const remaining = giftData.maxSlots - claimedCount;

            const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
                .setDescription(`Admin **${giftData.authorName}** vừa phát một đợt hộp quà may mắn!\n\n🎁 Phần thưởng mỗi suất: **${giftData.rewardAmount} SWC**\n⚡ Trạng thái: Đã có **${claimedCount}/${giftData.maxSlots}** người nhặt (Còn lại: **${remaining}** suất)`);

            if (remaining <= 0) {
                activeGifts.delete(giftId);
                const disabledRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('expired_gift').setLabel('Đã Hết Quà').setStyle(ButtonStyle.Secondary).setDisabled(true)
                );
                await interaction.message.edit({ embeds: [updatedEmbed], components: [disabledRow] }).catch(() => {});
                return interaction.reply({ content: `🎁 Chúc mừng bạn đã nhanh tay nhặt suất **${giftData.rewardAmount} SWC** cuối cùng thành công!`, ephemeral: true });
            } else {
                giftData.isProcessing = false;
                await interaction.message.edit({ embeds: [updatedEmbed] }).catch(() => {});
                return interaction.reply({ content: `🎁 Chúc mừng bạn đã nhặt thành công **${giftData.rewardAmount} SWC**!`, ephemeral: true });
            }
        }

        const currentEmbed = interaction.message.embeds[0];
        if (!currentEmbed || !currentEmbed.description) return;

        const match = currentEmbed.description.match(/Trang (\d+)\/(\d+)/);
        let currentPage = match ? parseInt(match[1]) - 1 : 0;

        if (interaction.customId === 'help_btn_prev') currentPage = Math.max(0, currentPage - 1);
        else if (interaction.customId === 'help_btn_next') currentPage = Math.min(HELP_CATEGORIES.length - 1, currentPage + 1);
        else if (interaction.customId === 'help_btn_home') currentPage = 0;
        else return;

        return interaction.update({ embeds: [buildHelpEmbed(currentPage)], components: generateHelpComponents(currentPage) }).catch(() => {});
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

    const rawContent = message.content.trim();
    if (rawContent.length < 3 && !rawContent.startsWith(PREFIX)) return;

    if (!guildConfig.noXpChannels.includes(message.channel.id) && !rawContent.startsWith(PREFIX)) {
        const cooldownKey = `${guildId}_${userId}`;
        const lastMsgTime = cooldowns.get(cooldownKey) || 0;
        const now = Date.now();

        if (now - lastMsgTime > COOLDOWN_TIME) {
            let xpGained = 15;
            if (now < userData.personalBoostUntil) {
                let multiplier = userData.boostMultiplier || 2;
                xpGained *= multiplier;
            }

            userData.xp += xpGained;
            cooldowns.set(cooldownKey, now);

            let xpNeeded = getXpForNextLevel(userData.level);
            if (userData.xp >= xpNeeded) {
                userData.xp -= xpNeeded;
                userData.level += 1;
                userData.xp += 15;
                userData.coins = (userData.coins || 0) + 50;
                const newLevel = userData.level;

                if (newLevel % 5 === 0) userData.giftboxes = (userData.giftboxes || 0) + 1;

                let newlyUnlocked = checkLevelTitles(userData);
                let titleMsg = newlyUnlocked.length > 0 ? `\n- Mở khóa danh hiệu mới: ${newlyUnlocked.join(', ')}` : '';

                const levelEmbed = new EmbedBuilder()
                    .setColor('#FFB6C1')
                    .setDescription(`🎉 Chúc mừng ${message.author} đã đạt **Cấp ${newLevel}**! Nhận thêm **15 EXP** & **50 SWC**! ✨${newLevel % 5 === 0 ? '\n🎁 Nhận được **1 Hộp Quà** (\`.mohopqua\`)!' : ''}${titleMsg}`);

                const targetChannel = message.guild.channels.cache.get(guildConfig.logChannel) || message.channel;
                targetChannel.send({ embeds: [levelEmbed] }).catch(() => {});
            }
            queueSave();
        }
    }

    if (!rawContent.startsWith(PREFIX)) return;

    const args = rawContent.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();
    
    const isDeveloper = DEVELOPER_IDS.includes(userId);
    const isBotAdmin = guildConfig.admins.includes(userId) || isDeveloper;
    const isBotStaff = isBotAdmin || message.member.permissions.has(PermissionFlagsBits.ModerateMembers);

    // Xác định quyền miễn phí (Admin hoặc Developer)
    const isFreePrivileged = isBotAdmin || isDeveloper;

    function getUserRoleTitle(uId, targetUserData) {
        if (targetUserData.title && targetUserData.title !== LEVEL_TITLES[1]) {
            return targetUserData.title;
        }
        return getTitleForLevel(targetUserData.level);
    }

    // --- HỆ THỐNG TU TIÊN RIÊNG BIỆT (TÁCH BIỆT KHỎI LEVEL CHAT) ---

        // 1. Xem Hồ Sơ Tu Tiên (.tutin hoặc .tuigiang)
    if (command === 'tutin' || command === 'tuigiang') {
        const cult = userData.cultivation || { realmIndex: 0, tuvi: 0, faction: 'Thường', power: 100 };
        const currentRealmObj = CULTIVATION_REALMS[cult.realmIndex] || CULTIVATION_REALMS[0];
        const nextRealmObj = CULTIVATION_REALMS[cult.realmIndex + 1];

        const isEvil = cult.faction === 'Ác' || cult.faction === 'ác';
        const factionColor = isEvil ? '#8B0000' : '#4682B4';
        const factionTitle = isEvil ? '🔴 Ma Đạo (Ác Tăng)' : '🔵 Chính Đạo (Thường)';

        // Phân biệt rõ tên cảnh giới giữa Thường và Ác
        let realmName = isEvil ? (currentRealmObj.nameMa || currentRealmObj.name) : currentRealmObj.name;
        let nextRealmName = 'MAX';
        if (nextRealmObj) {
            nextRealmName = isEvil ? (nextRealmObj.nameMa || nextRealmObj.name) : nextRealmObj.name;
        }
        
        const embed = new EmbedBuilder()
            .setColor(factionColor)
            .setTitle(`☯ HỒ SƠ TU TIÊN: ${message.author.username.toUpperCase()}`)
            .setDescription(`Hệ thống tu tiên độc lập (Tách biệt hoàn toàn với cấp độ chat thường).\n\n` +
                `🔹 **Phe Phái:** ${factionTitle}\n` +
                `🏔️ **Cảnh Giới:** \`${realmName}\` (Cấp ${cult.realmIndex}/${CULTIVATION_REALMS.length - 1})\n` +
                `✨ **Tu Vi Tích Lũy:** **${cult.tuvi || 0}** / ${nextRealmObj ? nextRealmObj.requiredTuVi : 'MAX'}\n` +
                `⚡ **Chiến Lực:** **${cult.power}** điểm`)
            .setFooter({ text: 'Dùng .bequan để hấp thụ linh khí tăng tu vi, hoặc .dothe để đột phá cảnh giới!' });

        return message.channel.send({ embeds: [embed] });
    }

    // 2. Chọn Phe Phái Tu Tiên (.nhaphe Thường / Ác)
    if (command === 'nhaphe' || command === 'chonphe') {
        const choice = args[0] ? args[0].toLowerCase() : '';
        if (choice !== 'thuong' && choice !== 'thường' && choice !== 'ac' && choice !== 'ác') {
            return message.reply('Cú pháp: `.nhaphe Thường` (Gia nhập Chính Đạo) hoặc `.nhaphe Ác` (Gia nhập Ma Đạo).');
        }

        const factionName = (choice === 'ac' || choice === 'ác') ? 'Ác' : 'Thường';
        const oldFaction = userData.cultivation.faction;

        let resetNotice = '';
        // Kiểm tra nếu đang ở phe Ác mà đổi sang phe Thường
        if (oldFaction === 'Ác' && factionName === 'Thường') {
            userData.cultivation.realmIndex = 0;
            userData.cultivation.tuvi = 0;
            userData.cultivation.power = 100;
            resetNotice = '\n⚠️ **[HÌNH PHẠT]** Do phản bội Ma Đạo để quy y Chính Đạo, cảnh giới và tu vi của bạn đã bị phế bỏ, đưa toàn bộ về **Cấp 0 (Phàm Nhân)**!';
        }

        userData.cultivation.faction = factionName;
        queueSave();

        const factionDisplay = factionName === 'Ác' ? '🔴 Ma Đạo (Ác)' : '🔵 Chính Đạo (Thường)';
        return message.reply(`✨ Bạn đã gia nhập thành công phe **${factionDisplay}**!${resetNotice}`);
    }

    // 3. Bế Quan Tu Luyện hấp thụ Tu Vi riêng biệt (.bequan hoặc .tuluyen)
    if (command === 'bequan' || command === 'tuluyen') {
        const cult = userData.cultivation;
        const tuviGained = Math.floor(Math.random() * 101) + 50;
        cult.tuvi = (cult.tuvi || 0) + tuviGained;
        queueSave();

        return message.reply(`🧘 Bạn đã bế quan thiền định thành công và hấp thụ thiên địa linh khí:\n✨ **+${tuviGained} Tu Vi** (Tổng tu vi: **${cult.tuvi}**). Gõ \`.dothe\` để tiến hành độ kiếp khi đủ điều kiện!`);
    }

        // 4. Độ Kiếp Đột Phá Cảnh Giới Tu Tiên (.dothe)
    if (command === 'dothe' || command === 'dotap' || command === 'dotpha') {
        let cult = userData.cultivation;
        if (!cult) {
            cult = { realmIndex: 0, tuvi: 0, faction: 'Thường', power: 100 };
            userData.cultivation = cult;
        }

        const nextIndex = cult.realmIndex + 1;
        const nextRealm = CULTIVATION_REALMS[nextIndex];

        if (!nextRealm) {
            return message.reply('🌟 Bạn đã đạt đến cảnh giới cao nhất của Độ Kiếp Thánh Nhân / Diệt Thế Ma Tôn, không thể đột phá thêm!');
        }

        if ((cult.tuvi || 0) < nextRealm.requiredTuVi) {
            const isEvil = cult.faction === 'Ác' || cult.faction === 'ác';
            const targetRealmName = isEvil ? (nextRealm.nameMa || nextRealm.name) : nextRealm.name;
            return message.reply(`❌ Bạn chưa đủ Tu Vi để độ kiếp lên **${targetRealmName}**! (Cần: **${nextRealm.requiredTuVi}** Tu Vi, hiện có: **${cult.tuvi || 0}** Tu Vi). Hãy dùng lệnh \`.bequan\` để tích lũy thêm.`);
        }

        let successChance = (cult.faction === 'Ác' || cult.faction === 'ác') ? 0.65 : 0.75;
        if (isFreePrivileged) successChance = 1.0;

        const roll = Math.random();
        const isEvil = cult.faction === 'Ác' || cult.faction === 'ác';
        const targetRealmName = isEvil ? (nextRealm.nameMa || nextRealm.name) : nextRealm.name;

        if (roll <= successChance) {
            cult.realmIndex = nextIndex;
            cult.power += 300 * nextIndex;
            queueSave();

            const embed = new EmbedBuilder()
                .setColor(isEvil ? '#8B0000' : '#00FF7F')
                .setTitle(isEvil ? '⚡ MA ĐẠO ĐỘ KIẾP THÀNH CÔNG! ⚡' : '⚡ ĐỘ KIẾP ĐỘT PHÁ THÀNH CÔNG! ⚡')
                .setDescription(`Thiên lôi cuồn cuộn, tâm ma lui bước! **${message.author.username}** đã vượt qua kiếp nạn cảnh giới thành công!\n\n` +
                    `🏔️ Cảnh giới mới: **${targetRealmName}**\n` +
                    `⚡ Chiến lực tăng vọt lên: **${cult.power}**`);
            return message.channel.send({ embeds: [embed] });
        } else {
            cult.tuvi = Math.max(0, cult.tuvi - Math.floor(nextRealm.requiredTuVi * 0.2));
            queueSave();

            const embed = new EmbedBuilder()
                .setColor('#FF4500')
                .setTitle('💥 ĐỘ KIẾP THẤT BẠI!')
                .setDescription(`Thiên kiếp quá uy lực, cơ thể bị phản phệ! **${message.author.username}** độ kiếp thất bại và bị tổn hại kinh mạch (Mất 20% Tu Vi yêu cầu). Hãy bế quan tích lũy thêm rồi thử lại!`);
            return message.channel.send({ embeds: [embed] });
        }
    }


    // --- HỆ THỐNG NUÔI PET (THÚ CƯNG) ---

    // 1. Gacha Trứng Pet
    if (command === 'trung' || command === 'pet-gacha' || command === 'gacha') {
        const GACHA_PRICE = 300;
        if (!isFreePrivileged && (userData.coins || 0) < GACHA_PRICE) {
            return message.reply(`❌ Bạn cần ít nhất **${GACHA_PRICE} SWC** để mua và ấp 1 quả trứng pet gacha!`);
        }

        if (!isFreePrivileged) {
            userData.coins -= GACHA_PRICE;
        }

        const newPet = getRandomPetByGacha();
        userData.pets.push(newPet);
        
        if (!userData.activePetId && userData.pets.length === 1) {
            userData.activePetId = newPet.id;
        }
        queueSave();

        const rarityInfo = PET_RARITIES[newPet.rarity];
        const freeNotice = isFreePrivileged ? '\n✨ *(Đặc quyền Admin/Dev: Mở miễn phí)*' : '';
        const embed = new EmbedBuilder()
            .setColor(rarityInfo.color)
            .setTitle(`🥚 ẤP TRỨNG GACHA PET THÀNH CÔNG!`)
            .setDescription(`Chúc mừng **${message.author.username}** đã mở trứng và nhận được thú cưng mới!\n\n🐾 **Tên Pet:** ${newPet.name}\n✨ **Độ Hiếm:** \`${rarityInfo.name}\`\n📊 **Cấp Độ:** 1\n❤ **Độ Thân Thiết:** ${newPet.affection}/100${freeNotice}\n\n*Sử dụng lệnh \`.mypet\` để xem danh sách thú cưng của bạn.*`);

        return message.channel.send({ embeds: [embed] });
    }

    // 2. Danh Sách Pet
    if (command === 'mypet' || command === 'pet-list' || command === 'thu') {
        const pets = userData.pets || [];
        if (pets.length === 0) {
            return message.reply('🐾 Bạn chưa sở hữu chú thú cưng nào! Hãy dùng lệnh `.trung` để mở gacha trứng nhé.');
        }

        let petDescription = pets.map((p, idx) => {
            const rarityInfo = PET_RARITIES[p.rarity] || PET_RARITIES.COMMON;
            const isActive = p.id === userData.activePetId ? '👑 **[Đang chọn]** ' : '';
            return `${isActive}**[#${idx + 1}]**${p.name} — Độ hiếm: \`${rarityInfo.name}\` | Lvl: **${p.level}** | Đói: **${p.hunger}%**`;
        }).join('\n');

        const activePet = pets.find(p => p.id === userData.activePetId);
        const activeName = activePet ? activePet.name : 'Chưa chọn';

        const embed = new EmbedBuilder()
            .setColor('#FFB6C1')
            .setTitle(`🐾 KHO THÚ CƯNG CỦA ${message.author.username.toUpperCase()}`)
            .setDescription(`Pet đang đồng hành: **${activeName}**\nThức ăn pet trong túi: **${userData.petFood || 0}** cái\n\n--------------------------------------------\n${petDescription}`)
            .setFooter({ text: 'Dùng .pet-chon <STT> để chọn pet hoặc .pet-choan <STT> để cho ăn' });

        return message.channel.send({ embeds: [embed] });
    }

    // 3. Chọn Pet Đồng Hành
    if (command === 'pet-chon' || command === 'chonpet') {
        const index = parseInt(args[0]) - 1;
        const pets = userData.pets || [];
        if (isNaN(index) || !pets[index]) {
            return message.reply('Cú pháp: `.pet-chon <số thứ tự pet trong .mypet>`');
        }

        userData.activePetId = pets[index].id;
        queueSave();
        return message.reply(`✨ Đã chọn **${pets[index].name}** làm thú cưng đồng hành chính thức!`);
    }

    // 4. Cho Ăn / Chăm Sóc Pet
    if (command === 'pet-choan' || command === 'choan' || command === 'feed') {
        const index = parseInt(args[0]) - 1;
        const pets = userData.pets || [];
        if (isNaN(index) || !pets[index]) {
            return message.reply('Cú pháp: `.pet-choan <số thứ tự pet>`');
        }

        if ((userData.petFood || 0) <= 0) {
            return message.reply('❌ Bạn đã hết thức ăn cho pet! Hãy mua thêm thức ăn trong cửa hàng (`.shop`) hoặc dùng lệnh `.muafood <số lượng>`.');
        }

        userData.petFood -= 1;
        const pet = pets[index];
        pet.hunger = Math.min(100, pet.hunger + 30);
        pet.affection = Math.min(100, pet.affection + 10);
        
        pet.exp += 50;
        let expNeededForPet = pet.level * 100;
        let leveledUp = false;
        while (pet.exp >= expNeededForPet) {
            pet.exp -= expNeededForPet;
            pet.level += 1;
            leveledUp = true;
            expNeededForPet = pet.level * 100;
        }

        queueSave();
        return message.reply(`🍖 Bạn đã cho **${pet.name}** ăn thành công!\n- Độ đói: **${pet.hunger}%** | Thân thiết: **${pet.affection}\%**${leveledUp ? `\n🎉 Chúc mừng pet đã lên **Cấp ${pet.level}**!` : ''}`);
    }

    // 4.1 Mua nhanh thức ăn cho pet trực tiếp (.muafood)
    if (command === 'muafood' || command === 'pet-muafood') {
        const amount = parseInt(args[0]) || 1;
        if (amount <= 0) return message.reply('Số lượng mua phải lớn hơn 0!');
        
        const pricePerFood = 30; 
        const totalPrice = pricePerFood * amount;

        if (!isFreePrivileged && (userData.coins || 0) < totalPrice) {
            return message.reply(`❌ Bạn cần **${totalPrice} SWC** để mua ${amount} thức ăn cho pet (Giá: ${pricePerFood} SWC/cái)!`);
        }

        if (!isFreePrivileged) {
            userData.coins -= totalPrice;
        }

        userData.petFood = (userData.petFood || 0) + amount;
        queueSave();

        const freeNotice = isFreePrivileged ? ' *(Miễn phí cho Admin/Dev)*' : ` với giá **${totalPrice} SWC**`;
        return message.reply(`🍖 Bạn đã mua thành công **${amount}** thức ăn cho pet${freeNotice}! Tổng số lượng trong túi: **${userData.petFood}** cái.`);
    }

    // 5. Lai Giống Pet (Breed)
    if (command === 'pet-laigiong' || command === 'laigiong' || command === 'breed') {
        const idx1 = parseInt(args[0]) - 1;
        const idx2 = parseInt(args[1]) - 1;
        const pets = userData.pets || [];

        if (isNaN(idx1) || isNaN(idx2) || !pets[idx1] || !pets[idx2] || idx1 === idx2) {
            return message.reply('Cú pháp: `.pet-laigiong <STT pet 1> <STT pet 2>`\n*(Lưu ý: Hai pet phải khác nhau và đạt tối thiểu cấp 5)*');
        }

        const pet1 = pets[idx1];
        const pet2 = pets[idx2];

        if (pet1.level < 5 || pet2.level < 5) {
            return message.reply('❌ Cả hai thú cưng đều phải đạt tối thiểu **Cấp 5** mới có thể tiến hành lai giống!');
        }

        const BREED_COST = 500;
        if (!isFreePrivileged && (userData.coins || 0) < BREED_COST) {
            return message.reply(`❌ Phí lai giống là **${BREED_COST} SWC**! Bạn không đủ tiền.`);
        }

        if (!isFreePrivileged) {
            userData.coins -= BREED_COST;
        }

        let childPet = getRandomPetByGacha();
        if (pet1.rarity === 'LEGENDARY' || pet2.rarity === 'LEGENDARY') {
            childPet.rarity = Math.random() < 0.5 ? 'LEGENDARY' : 'EPIC';
        }

        userData.pets.push(childPet);
        queueSave();

        const rarityInfo = PET_RARITIES[childPet.rarity];
        const freeNotice = isFreePrivileged ? ' *(Miễn phí cho Admin/Dev)*' : '';
        const embed = new EmbedBuilder()
            .setColor(rarityInfo.color)
            .setTitle(`🧬 LAI GIỐNG THÚ CƯNG THÀNH CÔNG!${freeNotice}`)
            .setDescription(`Sự kết hợp hoàn hảo giữa **${pet1.name}** và **${pet2.name}** đã sinh ra một thế hệ pet mới!\n\n🐾 **Tên Pet Mới:** ${childPet.name}\n✨ **Độ Hiếm:** \`${rarityInfo.name}\`\n📊 **Cấp Độ:** 1`);

        return message.channel.send({ embeds: [embed] });
    }

    // 6. Rao Bán Pet Lên Chợ P2P
    if (command === 'pet-rao' || command === 'pet-sell') {
        const index = parseInt(args[0]) - 1;
        const price = parseInt(args[1]);
        const pets = userData.pets || [];

        if (isNaN(index) || isNaN(price) || price <= 0 || !pets[index]) {
            return message.reply('Cú pháp: `.pet-rao <STT pet> <giá SWC>`');
        }

        if (pets[index].id === userData.activePetId) {
            return message.reply('❌ Không thể rao bán pet đang được chọn đồng hành!');
        }

        const petToSell = pets.splice(index, 1)[0];
        if (!guildConfig.petMarketCounter) guildConfig.petMarketCounter = 1;
        const marketId = guildConfig.petMarketCounter++;

        guildConfig.petMarketplace.push({
            marketId,
            sellerId: userId,
            pet: petToSell,
            price
        });
        queueSave();

        return message.reply(`🛒 Đã ký gửi **${petToSell.name}** (Lvl${petToSell.level}) lên chợ thú cưng với giá **${price} SWC** (Mã chợ: **#${marketId}**)!`);
    }

    // 7. Xem Sàn Chợ Pet
    if (command === 'pet-market' || command === 'chotra') {
        const marketList = guildConfig.petMarketplace || [];
        if (marketList.length === 0) {
            return message.channel.send('🛒 Sàn giao dịch thú cưng P2P đang trống!');
        }

        let marketText = marketList.map(m => {
            const rInfo = PET_RARITIES[m.pet.rarity];
            return `**ID Chợ #${m.marketId}** : **${m.pet.name}** (\`${rInfo.name}\` - Lvl ${m.pet.level})\n   Giá: \`${m.price} SWC\` — Chủ sở hữu: <@${m.sellerId}>`;
        }).join('\n\n');

        const embed = new EmbedBuilder().setColor('#FFB6C1').setTitle('🛒 SÀN GIAO DỊCH THÚ CƯNG (P2P)').setDescription(marketText);
        return message.channel.send({ embeds: [embed] });
    }

    // 8. Mua Pet Từ Chợ P2P
    if (command === 'pet-mua' || command === 'muapet') {
        const marketId = parseInt(args[0]);
        const marketList = guildConfig.petMarketplace || [];
        const marketIndex = marketList.findIndex(m => m.marketId === marketId);

        if (marketIndex === -1) {
            return message.reply(`❌ Không tìm thấy mã chợ thú cưng **#${marketId}**!`);
        }

        const listing = marketList[marketIndex];
        if (listing.sellerId === userId) {
            return message.reply('❌ Không thể tự mua thú cưng của chính mình!');
        }

        if (!isFreePrivileged && (userData.coins || 0) < listing.price) {
            return message.reply('❌ Bạn không đủ SwanCoin để mua pet này!');
        }

        if (!isFreePrivileged) {
            userData.coins -= listing.price;
        }
        
        initUser(guildId, listing.sellerId);
        memoryDb[guildId].users[listing.sellerId].coins = (memoryDb[guildId].users[listing.sellerId].coins || 0) + listing.price;

        userData.pets.push(listing.pet);
        marketList.splice(marketIndex, 1);
        queueSave();

        const freeNotice = isFreePrivileged ? ' *(Miễn phí cho Admin/Dev)*' : '';
        return message.reply(`🎉 Bạn đã mua thành công **${listing.pet.name}** với giá **${listing.price} SWC**!${freeNotice}`);
    }

    if (command === 'botinfo' || command === 'thongtinbot') {
        const infoEmbed = new EmbedBuilder()
            .setColor('#FFB6C1')
            .setTitle(`🤖 THÔNG TIN BOT & SERVER CỦA BOT`)
            .setThumbnail(client.user.displayAvatarURL())
            .addFields(
                { name: '🤖 Tên Bot', value: `${client.user.tag}`, inline: true },
                { name: '👑 Chủ Sở Hữu (Owner)', value: `<@${BOT_OWNER_ID}>`, inline: true },
                { name: '💻 Developer', value: DEVELOPER_IDS.map(id => `<@${id}>`).join('\n'), inline: false },
                { name: '🌐 Server Chính Thức', value: `[${BOT_SERVER_CONFIG.serverName}](${BOT_SERVER_CONFIG.inviteLink})`, inline: false }
            )
            .setFooter({ text: 'Thanks' })
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setLabel('Tham Gia Server Bot').setStyle(ButtonStyle.Link).setURL(BOT_SERVER_CONFIG.inviteLink)
        );

        return message.channel.send({ embeds: [infoEmbed], components: [row] });
    }

    if (command === 'exportdata') {
        if (!isDeveloper) return message.reply('Lệnh này chỉ dành riêng cho Developer tối cao!');
        if (!fs.existsSync(DATA_FILE)) return message.reply('Hiện tại chưa có file dữ liệu nào trên hệ thống!');

        try {
            const attachment = new AttachmentBuilder(DATA_FILE, { name: 'level_data.json' });
            await message.author.send({ content: '📂 Đây là file dữ liệu hệ thống mới nhất của bot:', files: [attachment] });
            return message.reply('✅ Đã gửi file dữ liệu vào tin nhắn riêng (DM) của bạn thành công!');
        } catch (error) {
            return message.reply('❌ Không thể gửi tin nhắn riêng cho bạn. Hãy mở tính năng nhận tin nhắn từ thành viên trong server!');
        }
    }

    if (command === 'importdata') {
        if (!isDeveloper) return message.reply('Lệnh này chỉ dành riêng cho Developer tối cao!');
        const attachedFile = message.attachments.first();
        if (!attachedFile) return message.reply('Cú pháp: Hãy đính kèm file `level_data.json` và gõ `.importdata` kèm theo.');

        try {
            const response = await fetch(attachedFile.url);
            const jsonData = await response.json();
            if (typeof jsonData !== 'object' || jsonData === null) return message.reply('❌ File dữ liệu không hợp lệ.');

            memoryDb = jsonData;
            await fsPromises.writeFile(DATA_FILE, JSON.stringify(memoryDb, null, 2));
            return message.reply('✅ Đã cập nhật và khôi phục dữ liệu thành công từ file đính kèm!');
        } catch (error) {
            return message.reply('❌ Có lỗi xảy ra khi đọc file JSON: ' + error.message);
        }
    }

    if (command === 'dev-reset' || command === 'dev-resetall') {
        if (!isDeveloper) return message.reply('Lệnh này chỉ dành riêng cho **Developer** tối cao!');

        try {
            memoryDb = {};
            if (saveTimeout) clearTimeout(saveTimeout);
            await fsPromises.writeFile(DATA_FILE, JSON.stringify({}, null, 2));

            return message.reply('✅ **[CẢNH BÁO / THÀNH CÔNG]** Đã reset sạch toàn bộ dữ liệu hệ thống về mặc định!');
        } catch (error) {
            return message.reply('❌ Lỗi khi thực hiện reset toàn bộ: ' + error.message);
        }
    }

    if (command === 'help' || command === 'trogiup') {
        const pageIndex = 0;
        return message.channel.send({ embeds: [buildHelpEmbed(pageIndex)], components: generateHelpComponents(pageIndex) });
    }

    if (command === 'dev-chat') {
        if (!isDeveloper) return message.reply('Lệnh này chỉ dành riêng cho **Developer** tối cao!');
        const chatContent = args.join(' ');
        if (!chatContent) return message.reply('Cú pháp: `.dev-chat <nội dung>`');

        await message.delete().catch(() => {});
        const now = new Date();
        const vnTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
        const timeOnly = `${String(vnTime.getHours()).padStart(2, '0')}:${String(vnTime.getMinutes()).padStart(2, '0')}`;

        const devEmbed = new EmbedBuilder()
            .setColor('#FFB6C1')
            .setTitle('📢 Thông Báo Từ DevBOT')
            .setDescription(chatContent)
            .setFooter({ text: `Bởi Dev ${message.author.username} -${timeOnly}` });

        return message.channel.send({ embeds: [devEmbed] });
    }

    if (command === 'admin-chat') {
        if (!isBotAdmin) return message.reply('Lệnh này chỉ dành riêng cho **Admin** của server!');
        const chatContent = args.join(' ');
        if (!chatContent) return message.reply('Cú pháp: `.admin-chat <nội dung>`');

        await message.delete().catch(() => {});
        const now = new Date();
        const vnTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
        const timeOnly = `${String(vnTime.getHours()).padStart(2, '0')}:${String(vnTime.getMinutes()).padStart(2, '0')}`;

        const adminEmbed = new EmbedBuilder()
            .setColor('#FFB6C1')
            .setTitle('📢 THÔNG BÁO BQT')
            .setDescription(chatContent)
            .setFooter({ text: `Bởi Admin ${message.author.username} -${timeOnly}` });

        return message.channel.send({ embeds: [adminEmbed] });
    }

    if (command === 'dev-addadmin') {
        if (!isDeveloper) return message.reply('Lệnh này chỉ dành riêng cho **Developer**!');
        const targetMember = message.mentions.members.first();
        if (!targetMember) return message.reply('Cú pháp: `.dev-addadmin @User`');
        
        if (!guildConfig.admins.includes(targetMember.id)) {
            guildConfig.admins.push(targetMember.id);
            queueSave();
        }
        return message.reply(`Đã chỉ định ${targetMember.user.tag} làm Admin của server này! ✨`);
    }

    if (command === 'dev-deladmin') {
        if (!isDeveloper) return message.reply('Lệnh này chỉ dành riêng cho **Developer**!');
        const targetMember = message.mentions.members.first();
        if (!targetMember) return message.reply('Cú pháp: `.dev-deladmin @User`');
        
        guildConfig.admins = guildConfig.admins.filter(id => id !== targetMember.id);
        queueSave();
        return message.reply(`Đã tước quyền Admin server của ${targetMember.user.tag}.`);
    }

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
        await targetMember.timeout(minutes * 60 * 1000).catch(() => message.reply('Lỗi thực hiện timeout'));
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

    if (command === 'setlog' || command === 'setlevelchannel') {
        if (!isBotAdmin) return message.reply('Chỉ Admin bot mới có quyền cài đặt kênh thông báo level!');
        const targetChannel = message.mentions.channels.first() || message.channel;
        guildConfig.logChannel = targetChannel.id;
        queueSave();
        return message.reply(`Đã thiết lập kênh thông báo lên cấp thành công tại ${targetChannel}! 💕`);
    }

    if (command === 'phatqua') {
        if (!isBotAdmin) return message.reply('Chỉ Admin bot mới có quyền phát hộp quà!');
        const maxSlots = parseInt(args[0]);
        const rewardAmount = parseInt(args[1]);

        if (isNaN(maxSlots) || isNaN(rewardAmount) || maxSlots <= 0 || rewardAmount <= 0) {
            return message.reply('Cú pháp: `.phatqua <số lượng suất> <số SWC mỗi suất>`\nVí dụ: `.phatqua 5 200`');
        }

        const giftId = `gift_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        activeGifts.set(giftId, {
            maxSlots: maxSlots,
            rewardAmount: rewardAmount,
            claimedUsers: new Set(),
            authorName: message.author.username,
            isProcessing: false
        });

        const giftEmbed = new EmbedBuilder()
            .setColor('#FFB6C1')
            .setTitle('🎁 HỘP QUÀ BÍ MẬT XUẤT HIỆN! 🎁')
            .setDescription(`Admin **${message.author.username}** vừa phát một đợt hộp quà may mắn!\n\n🎁 Phần thưởng mỗi suất: **${rewardAmount} SWC**\n⚡ Trạng thái: Đã có **0/${maxSlots}** người nhặt (Còn lại: **${maxSlots}** suất)`)
            .setFooter({ text: 'Nhanh tay kẻo hết!' })
            .setTimestamp();

        const claimButton = new ButtonBuilder()
            .setCustomId(`claim_gift_${giftId}`)
            .setLabel('🎁 Nhặt Quà Ngay')
            .setStyle(ButtonStyle.Success);

        const row = new ActionRowBuilder().addComponents(claimButton);

        await message.delete().catch(() => {});
        return message.channel.send({ embeds: [giftEmbed], components: [row] });
    }

    // --- BỔ SUNG CÁC LỆNH ADMIN QUẢN TRỊ PET, TU TIÊN & CHIẾN LỰC ---
    if (['addpet', 'setpet', 'settuvi', 'setcanhgioi', 'setchienluc', 'pet-phongsinh'].includes(command) && !isBotAdmin) {
        return message.reply('Chỉ Admin bot hoặc Developer mới có quyền sử dụng nhóm lệnh này!');
    }

    // 1. .addpet @User <TênPet> [ĐộHiếm] [CấpĐộ]
    if (command === 'addpet') {
        const targetUser = message.mentions.users.first();
        if (!targetUser) return message.reply('Cú pháp: `.addpet @User <TênPet> [ĐộHiếm] [CấpĐộ]`\nVí dụ: `.addpet @TênNgườiDùng HắcLong LEGENDARY 15`');

        const remainingArgs = args.slice(1);
        const cleanArgs = remainingArgs.filter(arg => !arg.startsWith('<@'));
        
        const petNameInput = cleanArgs[0] || 'Pet Huyền Bí';
        const rarityInput = (cleanArgs[1] ? cleanArgs[1].toUpperCase() : 'COMMON');
        const levelInput = parseInt(cleanArgs[2]) || 1;

        const validRarities = Object.keys(PET_RARITIES);
        const finalRarity = validRarities.includes(rarityInput) ? rarityInput : 'COMMON';
        const rarityInfo = PET_RARITIES[finalRarity];

        initUser(guildId, targetUser.id);
        const targetUserData = memoryDb[guildId].users[targetUser.id];

        const newAdminPet = {
            id: `pet_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            name: `${petNameInput}`,
            speciesName: petNameInput,
            icon: '',
            rarity: finalRarity,
            level: levelInput,
            exp: 0,
            hunger: 100,
            affection: 100,
            createdAt: Date.now()
        };

        targetUserData.pets.push(newAdminPet);
        if (!targetUserData.activePetId) {
            targetUserData.activePetId = newAdminPet.id;
        }
        queueSave();

        const embed = new EmbedBuilder()
            .setColor(rarityInfo.color)
            .setTitle('🛡️ ADMIN CẤP THÚ CƯNG MỚI')
            .setDescription(`Admin **${message.author.username}** đã cấp trực tiếp một thú cưng cho ${targetUser}!\n\n` +
                `🐾 **Tên Pet:** ${newAdminPet.name}\n` +
                `✨ **Độ Hiếm:** \`${rarityInfo.name}\`\n` +
                `📊 **Cấp Độ:** ${levelInput}`);

        return message.channel.send({ embeds: [embed] });
    }

    // 2. .setpet @User <STT Pet> <Cấp mới độ>
    if (command === 'setpet') {
        const targetUser = message.mentions.users.first();
        const petIndex = parseInt(args[1]) - 1;
        const newLevel = parseInt(args[2]);

        if (!targetUser || isNaN(petIndex) || isNaN(newLevel) || newLevel < 1) {
            return message.reply('Cú pháp: `.setpet @User <STT Pet> <Cấp mới độ>`\nVí dụ: `.setpet @TênNgườiDùng 1 20`');
        }

        initUser(guildId, targetUser.id);
        const targetUserData = memoryDb[guildId].users[targetUser.id];
        const pets = targetUserData.pets || [];

        if (!pets[petIndex]) {
            return message.reply(`❌ Không tìm thấy thú cưng ở số thứ tự #${petIndex + 1} trong lệnh \`.mypet\` của người chơi này!`);
        }

        pets[petIndex].level = newLevel;
        queueSave();

        return message.reply(`✅ Đã cập nhật cấp độ thú cưng **${pets[petIndex].name}** của ${targetUser} thành **Cấp ${newLevel}** thành công!`);
    }

    // 3. .settuvi @User <Số mới tu vi>
    if (command === 'settuvi') {
        const targetUser = message.mentions.users.first();
        const newTuVi = parseInt(args[1]);

        if (!targetUser || isNaN(newTuVi) || newTuVi < 0) {
            return message.reply('Cú pháp: `.settuvi @User <Số mới tu vi>`\nVí dụ: `.settuvi @TênNgườiDùng 12000`');
        }

        initUser(guildId, targetUser.id);
        const targetUserData = memoryDb[guildId].users[targetUser.id];
        if (!targetUserData.cultivation) {
            targetUserData.cultivation = { realmIndex: 0, tuvi: 0, faction: 'Thường', power: 100 };
        }

        targetUserData.cultivation.tuvi = newTuVi;
        queueSave();

        return message.reply(`☯ Đã thiết lập lại điểm tu vi hiện tại của ${targetUser} thành **${newTuVi}** điểm tu vi.`);
    }

        // 4. .setcanhgioi @User <Số cảnh giới thứ tự>
    if (command === 'setcanhgioi') {
        const targetUser = message.mentions.users.first();
        const realmIndex = parseInt(args[1]);

        if (!targetUser || isNaN(realmIndex) || realmIndex < 0 || realmIndex >= CULTIVATION_REALMS.length) {
            let realmListText = CULTIVATION_REALMS.map(r => `\`${r.level}: ${r.name} / ${r.nameMa}\``).join(', ');
            return message.reply(`Cú pháp: \`.setcanhgioi @User <Số cảnh giới thứ tự>\`\nDanh sách thứ tự hợp lệ:\n${realmListText}`);
        }

        initUser(guildId, targetUser.id);
        const targetUserData = memoryDb[guildId].users[targetUser.id];
        if (!targetUserData.cultivation) {
            targetUserData.cultivation = { realmIndex: 0, tuvi: 0, faction: 'Thường', power: 100 };
        }

        const selectedRealm = CULTIVATION_REALMS[realmIndex];
        targetUserData.cultivation.realmIndex = realmIndex;
        targetUserData.cultivation.power = 100 + (realmIndex * 350);
        queueSave();

        const isEvil = targetUserData.cultivation.faction === 'Ác' || targetUserData.cultivation.faction === 'ác';
        const displayRealmName = isEvil ? (selectedRealm.nameMa || selectedRealm.name) : selectedRealm.name;

        const embed = new EmbedBuilder()
            .setColor(isEvil ? '#8B0000' : '#00FF7F')
            .setTitle('☯️ THAY ĐỔI CẢNH GIỚI TU TIÊN')
            .setDescription(`Admin **${message.author.username}** đã trực tiếp điều chỉnh cảnh giới tu tiên cho ${targetUser}!\n\n` +
                `🏔️ Cảnh giới mới: **${displayRealmName}** (Cấp ${realmIndex} -${isEvil ? 'Ma Đạo' : 'Chính Đạo'})\n` +
                `⚡ Chiến lực điều chỉnh: **${targetUserData.cultivation.power}**`);

        return message.channel.send({ embeds: [embed] });
    }

    // 4.1 .setchienluc @User <Số chiến lực>
    if (command === 'setchienluc') {
        const targetUser = message.mentions.users.first();
        const newPower = parseInt(args[1]);

        if (!targetUser || isNaN(newPower) || newPower < 0) {
            return message.reply('Cú pháp: `.setchienluc @User <Số chiến lực>`\nVí dụ: `.setchienluc @TênNgườiDùng 50000`');
        }

        initUser(guildId, targetUser.id);
        const targetUserData = memoryDb[guildId].users[targetUser.id];
        if (!targetUserData.cultivation) {
            targetUserData.cultivation = { realmIndex: 0, tuvi: 0, faction: 'Thường', power: 100 };
        }

        targetUserData.cultivation.power = newPower;
        queueSave();

        const embed = new EmbedBuilder()
            .setColor('#FFD700')
            .setTitle('⚡ ĐIỀU CHỈNH CHIẾN LỰC TU TIÊN')
            .setDescription(`Admin **${message.author.username}** đã thiết lập lại điểm chiến lực tu tiên cho ${targetUser} thành **${newPower}** điểm!`);

        return message.channel.send({ embeds: [embed] });
    }

    // 5. .pet-phongsinh <STT Pet>
    if (command === 'pet-phongsinh') {
        const petIndex = parseInt(args[0]) - 1;
        const pets = userData.pets || [];

        if (isNaN(petIndex) || !pets[petIndex]) {
            return message.reply('Cú pháp: `.pet-phongsinh <STT Pet>`\nVí dụ: `.pet-phongsinh 2`');
        }

        const petToRelease = pets[petIndex];
        if (petToRelease.id === userData.activePetId) {
            return message.reply('❌ Không thể phóng sinh chú thú cưng đang được chọn đồng hành! Hãy đổi pet đồng hành khác trước.');
        }

        pets.splice(petIndex, 1);
        
        userData.coins = (userData.coins || 0) + 100;
        userData.petFood = (userData.petFood || 0) + 3;
        queueSave();

        const embed = new EmbedBuilder()
            .setColor('#98FB98')
            .setTitle('🕊️ PHÓNG SINH THÚ CƯNG THÀNH CÔNG')
            .setDescription(`Bạn đã phóng sinh **${petToRelease.name}** về với thiên nhiên.\n\n` +
                `🎁 Nhận lại phần thưởng:\n` +
                `▫️ **+100 SwanCoin (SWC)**\n` +
                `▫️ **+3 Thức Ăn Pet**`);

        return message.channel.send({ embeds: [embed] });
    }
    // --- KẾT THÚC BỔ SUNG LỆNH ADMIN PET & TU TIÊN ---

    if (['shop-add', 'shop-del', 'shop-setstock', 'shop-setprice', 'setlevel', 'givexp', 'removexp', 'resetxp', 'givecoin', 'removecoin', 'xoatuido', 'danhhieu-set'].includes(command) && !isBotAdmin) {
        return message.reply('Chỉ Admin bot mới dùng được lệnh này!');
    }

    if (command === 'givecoin') {
        const targetUser = message.mentions.users.first();
        const amount = parseInt(args[1]);
        if (!targetUser || isNaN(amount) || amount <= 0) return message.reply('Cú pháp: `.givecoin @User <số tiền>`');
        initUser(guildId, targetUser.id);
        memoryDb[guildId].users[targetUser.id].coins = (memoryDb[guildId].users[targetUser.id].coins || 0) + amount;
        queueSave();
        return message.reply(`Đã cộng thêm **${amount} SWC** cho ${targetUser.tag}. 🪙`);
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
            u.xp += 15;
            u.coins = (u.coins || 0) + 50;
            if (u.level % 5 === 0) u.giftboxes = (u.giftboxes || 0) + 1;
            checkLevelTitles(u);
            xpNeeded = getXpForNextLevel(u.level);
        }
        queueSave();
        return message.reply(`Đã cộng **${amount} EXP** cho ${targetUser.tag}. ⭐`);
    }

    if (command === 'setlevel') {
        const targetUser = message.mentions.users.first();
        const newLvl = parseInt(args[1]);
        if (!targetUser || isNaN(newLvl) || newLvl < 0) return message.reply('Cú pháp: `.setlevel @User <cấp độ>`');
        initUser(guildId, targetUser.id);
        let u = memoryDb[guildId].users[targetUser.id];
        u.level = newLvl;
        checkLevelTitles(u);
        u.title = getTitleForLevel(newLvl);
        queueSave();
        return message.reply(`Đã đặt cấp độ của ${targetUser.tag} thành **Cấp ${newLvl}** (Danh hiệu: **${u.title}**).`);
    }

    if (command === 'xoatuido') {
        const itemIndex = parseInt(args[0]) - 1;
        const targetUser = message.mentions.users.first();
        if (isNaN(itemIndex) || !targetUser) return message.reply('Cú pháp: `.xoatuido <số thứ tự> @User`');

        initUser(guildId, targetUser.id);
        const targetInventory = memoryDb[guildId].users[targetUser.id].inventory;
        if (!targetInventory || !targetInventory[itemIndex]) return message.reply(`Không tìm thấy vật phẩm ở số thứ tự **#${itemIndex + 1}**!`);

        const removedItem = targetInventory.splice(itemIndex, 1)[0];
        queueSave();
        return message.reply(`Đã xóa vật phẩm **"${removedItem.name}"** khỏi túi đồ của ${targetUser.tag}!`);
    }

    if (command === 'danhhieu-set') {
        const targetUser = message.mentions.users.first();
        const titleName = args.slice(1).join(' ');
        if (!targetUser || !titleName) return message.reply('Cú pháp: `.danhhieu-set @User <Tên danh hiệu>`');

        initUser(guildId, targetUser.id);
        const targetUserData = memoryDb[guildId].users[targetUser.id];
        if (!targetUserData.unlockedTitles.includes(titleName)) targetUserData.unlockedTitles.push(titleName);
        
        targetUserData.title = titleName;
        queueSave();
        return message.reply(`Đã cấp và trang bị danh hiệu **${titleName}** cho ${targetUser.tag}! 💕`);
    }

    if (command === 'shop-del') {
        const itemId = parseInt(args[0]);
        if (isNaN(itemId)) return message.reply('Cú pháp: `.shop-del <ID>`');
        const itemIndex = guildConfig.shopItems.findIndex(i => i.id === itemId);
        if (itemIndex === -1) return message.reply(`Không tìm thấy vật phẩm ID **#${itemId}**!`);
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
        if (isNaN(itemId) || isNaN(newPrice) || newPrice < 0) return message.reply('Cú pháp: `.shop-setprice <ID> <giá mới>`');
        const item = guildConfig.shopItems.find(i => i.id === itemId);
        if (!item) return message.reply(`Không tìm thấy vật phẩm ID **#${itemId}**!`);

        item.price = newPrice;
        queueSave();
        return message.reply(`Đã cập nhật giá vật phẩm **"${item.name}"** thành **${newPrice} SWC**.`);
    }

    if (command === 'shop-add') {
        const parts = args.join(' ').split('|').map(p => p.trim());
        if (parts.length < 3) return message.reply('Cú pháp: `.shop-add Tên | Giá SWC | boost/title/pet_food | [Multiplier/Amount]`');
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
        currentShop.push({ 
            id: newId, 
            name, 
            price, 
            stock, 
            type, 
            multiplier: type === 'boost' ? (parseInt(subValue) || 1) : undefined,
            amount: type === 'pet_food' ? (parseInt(subValue) || 5) : undefined,
            title: type === 'title' ? subValue : undefined 
        });
        queueSave();
        return message.reply(`Đã thêm vật phẩm ID #${newId} vào shop chính.`);
    }

    if (command === 'market' || command === 'cho') {
        const marketList = guildConfig.marketplace || [];
        if (marketList.length === 0) return message.channel.send('🛒 Sàn Giao Dịch P2P hiện đang trống!');

        let marketText = marketList.map(m => `**ID Chợ #${m.marketId}** : **${m.itemName}** (\`Loại: ${m.type}\`)\n   Giá: \`${m.price} SWC\` — Người bán: <@${m.sellerId}>`).join('\n\n');
        const marketEmbed = new EmbedBuilder().setColor('#FFB6C1').setTitle(`🛒 SÀN KÝ GỬI (P2P)`).setDescription(marketText);
        return message.channel.send({ embeds: [marketEmbed] });
    }

    if (command === 'market-rao' || command === 'rao') {
        const itemIndex = parseInt(args[0]) - 1;
        const sellPrice = parseInt(args[1]);
        if (isNaN(itemIndex) || isNaN(sellPrice) || sellPrice <= 0) return message.reply('Cú pháp: `.market-rao <stt túi> <giá>`');

        if (!userData.inventory || !userData.inventory[itemIndex]) return message.reply('Vật phẩm không tồn tại trong túi đồ!');
        const itemToSell = userData.inventory.splice(itemIndex, 1)[0];

        if (!guildConfig.marketIdCounter) guildConfig.marketIdCounter = 1;
        const marketId = guildConfig.marketIdCounter++;

        guildConfig.marketplace.push({ marketId, sellerId: userId, itemName: itemToSell.name, price: sellPrice, type: itemToSell.type, multiplier: itemToSell.multiplier || 1, amount: itemToSell.amount || 1, title: itemToSell.title || null });
        queueSave();
        return message.reply(`Đã ký gửi **"${itemToSell.name}"** lên chợ với giá **${sellPrice} SWC** (ID chợ: **#${marketId}**)!`);
    }

    if (command === 'market-mua' || command === 'muacho') {
        const marketId = parseInt(args[0]);
        if (isNaN(marketId)) return message.reply('Cú pháp: `.market-mua <ID chợ>`');

        const marketIndex = guildConfig.marketplace.findIndex(m => m.marketId === marketId);
        if (marketIndex === -1) return message.reply(`Không tìm thấy mã chợ **#${marketId}**!`);

        const listing = guildConfig.marketplace[marketIndex];
        if (listing.sellerId === userId) return message.reply('Không thể tự mua vật phẩm của chính mình!');
        
        if (!isFreePrivileged && (userData.coins || 0) < listing.price) {
            return message.reply('Bạn không đủ SwanCoin!');
        }

        if (!isFreePrivileged) {
            userData.coins -= listing.price;
        }

        initUser(guildId, listing.sellerId);
        memoryDb[guildId].users[listing.sellerId].coins = (memoryDb[guildId].users[listing.sellerId].coins || 0) + listing.price;

        userData.inventory.push({ name: listing.itemName, price: listing.price, type: listing.type, multiplier: listing.multiplier || 1, amount: listing.amount || 1, title: listing.title || null });
        guildConfig.marketplace.splice(marketIndex, 1);
        queueSave();

        const freeNotice = isFreePrivileged ? ' *(Miễn phí cho Admin/Dev)*' : '';
        return message.reply(`Bạn đã mua thành công **"${listing.itemName}"** với giá **${listing.price} SWC**.${freeNotice}`);
    }

    // --- LỆNH .bxh (ĐÃ SỬA LỖI & TÍCH HỢP) ---
        if (command === 'bxh' || command === 'leaderboard') {
        try {
            initGuild(guildId);
            const usersObj = memoryDb[guildId].users || {};
            
            // Sắp xếp người chơi theo Cấp độ (level) giảm dần, sau đó đến EXP
            const sortedUsers = Object.entries(usersObj)
                .map(([id, data]) => ({ id, ...data }))
                .sort((a, b) => (b.level - a.level) || (b.xp - a.xp))
                .slice(0, 10); // Lấy top 10

            const canvas = Canvas.createCanvas(900, 700);
            const ctx = canvas.getContext('2d');

            // Nền gradient bắt mắt
            const bgGrad = ctx.createLinearGradient(0, 0, 900, 700);
            bgGrad.addColorStop(0, '#1E1B2E'); 
            bgGrad.addColorStop(1, '#0F0E17');
            ctx.fillStyle = bgGrad;
            ctx.beginPath(); 
            ctx.roundRect(0, 0, 900, 700, 28); 
            ctx.fill();

            // Tiêu đề bảng xếp hạng
            ctx.fillStyle = '#FFFFFF'; 
            ctx.font = 'bold 32px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(`🏆 BẢNG XẾP HẠNG CẤP ĐỘ SERVER`, 450, 65);

            let startY = 110;
            for (let i = 0; i < sortedUsers.length; i++) {
                const u = sortedUsers[i];
                let memberTag = `User ID: ${u.id}`;
                try {
                    const fetchedMember = await message.guild.members.fetch(u.id);
                    memberTag = fetchedMember.user.username;
                } catch (e) {}

                // Khung nền từng hàng
                ctx.fillStyle = i === 0 ? 'rgba(255, 215, 0, 0.2)' : 'rgba(255, 255, 255, 0.08)';
                ctx.beginPath(); 
                ctx.roundRect(50, startY, 800, 50, 14); 
                ctx.fill();

                // Thứ hạng
                ctx.fillStyle = i === 0 ? '#FFD700' : (i === 1 ? '#C0C0C0' : (i === 2 ? '#CD7F32' : '#E2E8F0'));
                ctx.font = 'bold 20px sans-serif';
                ctx.textAlign = 'left';
                ctx.fillText(`#${i + 1}`, 75, startY + 32);

                // Tên người chơi
                ctx.fillStyle = '#FFFFFF';
                ctx.font = 'bold 18px sans-serif';
                ctx.fillText(memberTag.length > 20 ? memberTag.substring(0, 20) + '...' : memberTag, 135, startY + 32);

                // Cấp độ & Tiền tệ
                ctx.fillStyle = '#C084FC';
                ctx.textAlign = 'right';
                ctx.fillText(`Cấp ${u.level || 0} | ${u.coins || 0} SWC`, 820, startY + 32);

                startY += 58;
            }

            const attachment = new AttachmentBuilder(canvas.toBuffer(), { name: 'leaderboard.png' });
            return message.channel.send({ files: [attachment] });
        } catch (error) {
            console.error(error);
            return message.reply('❌ Có lỗi khi tạo bảng xếp hạng Canvas!');
        }
    }

    // --- LỆNH .shop (ĐÃ CẢI THIỆN MÀU SẮC RÕ RÀNG) ---
    if (command === 'shop' || command === 'cuahang') {
        try {
            const currentShop = guildConfig.shopItems || [];
            const canvasHeight = Math.max(600, 150 + (currentShop.length * 75));
            const canvas = Canvas.createCanvas(900, canvasHeight);
            const ctx = canvas.getContext('2d');

            const bgGrad = ctx.createLinearGradient(0, 0, 900, canvasHeight);
            bgGrad.addColorStop(0, '#1E1B2E'); 
            bgGrad.addColorStop(1, '#0F0E17');
            ctx.fillStyle = bgGrad;
            ctx.beginPath(); 
            ctx.roundRect(0, 0, 900, canvasHeight, 28); 
            ctx.fill();

            // Tiêu đề shop - Trắng sáng
            ctx.fillStyle = '#FFFFFF'; 
            ctx.font = 'bold 32px sans-serif';
            ctx.fillText(`CỬA HÀNG VẬT PHẨM & THỨC ĂN PET`, 65, 55);

            // Số dư ví - Màu vàng sáng dễ thấy
            ctx.fillStyle = '#FACC15'; 
            ctx.font = 'bold 20px sans-serif'; 
            ctx.textAlign = 'right';
            ctx.fillText(`Ví: ${userData.coins || 0} SWC`, 830, 55); 
            ctx.textAlign = 'left';

            let startY = 110;
            for (let i = 0; i < currentShop.length; i++) {
                const item = currentShop[i];
                
                ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
                ctx.beginPath(); 
                ctx.roundRect(40, startY, 820, 60, 18); 
                ctx.fill();

                // ID vật phẩm (Màu tím sáng)
                ctx.fillStyle = '#C084FC'; 
                ctx.font = 'bold 20px sans-serif';
                ctx.fillText(`#${item.id}`, 60, startY + 38);

                // Tên vật phẩm (Màu trắng tinh, rõ tuyệt đối)
                ctx.fillStyle = '#FFFFFF'; 
                ctx.font = 'bold 18px sans-serif';
                ctx.fillText(item.name, 150, startY + 38);

                // Số lượng tồn kho (Màu xanh ngọc sáng)
                ctx.fillStyle = '#34D399'; 
                ctx.font = 'bold 16px sans-serif';
                ctx.fillText(`Còn: ${item.stock}`, 520, startY + 38);

                // Giá tiền (Màu vàng sáng nổi bật)
                ctx.fillStyle = '#FDE047'; 
                ctx.font = 'bold 20px sans-serif'; 
                ctx.textAlign = 'right';
                ctx.fillText(`${item.price} SWC`, 830, startY + 38); 
                ctx.textAlign = 'left';

                startY += 75;
            }

            const attachment = new AttachmentBuilder(canvas.toBuffer(), { name: 'cute_shop.png' });
            return message.channel.send({ files: [attachment] });
        } catch (error) {
            let shopText = guildConfig.shopItems.map(i => `[ID: #${i.id}] **${i.name}** — \`${i.price} SWC\``).join('\n');
            const embed = new EmbedBuilder().setColor('#FFB6C1').setTitle('🛒 Cửa Hàng').setDescription(shopText || 'Trống');
            return message.channel.send({ embeds: [embed] });
        }
    }

    if (command === 'mua') {
        const itemId = parseInt(args[0]);
        const item = guildConfig.shopItems.find(i => i.id === itemId);
        if (!item) return message.reply('Vật phẩm không tồn tại trong shop!');
        if (item.stock <= 0) return message.reply('Sản phẩm đã hết hàng!');
        
        if (!isFreePrivileged && (userData.coins || 0) < item.price) {
            return message.reply('Không đủ SwanCoin!');
        }

        if (item.type === 'title' && userData.unlockedTitles.includes(item.title)) {
            return message.reply('Bạn đã sở hữu danh hiệu này!');
        }

        if (!isFreePrivileged) {
            userData.coins -= item.price;
        }

        item.stock = Math.max(0, item.stock - 1);

        if (item.type === 'pet_food') {
            userData.petFood = (userData.petFood || 0) + (item.amount || 5);
        } else {
            userData.inventory.push({ 
                name: item.name, 
                price: item.price, 
                type: item.type, 
                multiplier: item.multiplier || 1, 
                amount: item.amount || 1,
                title: item.title || null 
            });
        }
        queueSave();

        const freeNotice = isFreePrivileged ? ' *(Đặc quyền Admin/Dev: Miễn phí)*' : '';
        return message.reply(`Đã mua thành công **${item.name}**! Đã chuyển vào túi đồ / kho.${freeNotice}`);
    }

    if (command === 'daily') {
        const now = Date.now();
        if (now - userData.lastDaily < 86400000) return message.reply('Bạn đã điểm danh hôm nay rồi!');
        userData.lastDaily = now;
        userData.coins = (userData.coins || 0) + 100;
        userData.xp += 50;
        userData.petFood = (userData.petFood || 0) + 2;
        
        let xpNeeded = getXpForNextLevel(userData.level);
        while (userData.xp >= xpNeeded) {
            userData.xp -= xpNeeded;
            userData.level += 1;
            userData.xp += 15;
            userData.coins = (userData.coins || 0) + 50;
            if (userData.level % 5 === 0) userData.giftboxes = (userData.giftboxes || 0) + 1;
            checkLevelTitles(userData);
            xpNeeded = getXpForNextLevel(userData.level);
        }
        queueSave();
        return message.reply('🌸 Điểm danh thành công: **+100 SWC**, **+50 EXP** & **+2 Thức ăn Pet**.');
    }

    if (command === 'tien' || command === 'vi') {
        return message.reply(`Số dư ví: **${userData.coins || 0} SwanCoin (SWC)** | Hộp Quà: **${userData.giftboxes || 0}** | Thức Ăn Pet: **${userData.petFood || 0}**.`);
    }

    if (command === 'pay' || command === 'chuyen') {
        const targetUser = message.mentions.users.first();
        const amount = parseInt(args[1]);
        if (!targetUser || isNaN(amount) || amount <= 0) return message.reply('Cú pháp: `.pay @User <số tiền>`');
        if (targetUser.bot || targetUser.id === userId) return message.reply('Không thể chuyển tiền cho bot hoặc chính mình!');
        if ((userData.coins || 0) < amount) return message.reply('Bạn không đủ số dư để chuyển!');

        userData.coins -= amount;
        initUser(guildId, targetUser.id);
        memoryDb[guildId].users[targetUser.id].coins = (memoryDb[guildId].users[targetUser.id].coins || 0) + amount;
        queueSave();

        return message.reply(`Đã chuyển thành công **${amount} SWC** cho ${targetUser}!`);
    }

    if (command === 'chuyensinh' || command === 'cs') {
        if (userData.level < 100) return message.reply('Cần đạt **Cấp 100** để chuyển sinh!');
        if ((userData.coins || 0) < 5000) return message.reply('Cần **5000 SWC** phí chuyển sinh!');

        userData.coins -= 5000;
        userData.level = 0;
        userData.xp = 0;
        userData.prestige = (userData.prestige || 0) + 1;

        const prestigeTitle = `Chuyển Sinh Cấp ${userData.prestige}`;
        if (!userData.unlockedTitles.includes(prestigeTitle)) userData.unlockedTitles.push(prestigeTitle);
        userData.title = prestigeTitle;
        queueSave();

        const csEmbed = new EmbedBuilder()
            .setColor('#FFB6C1')
            .setTitle('CHUYỂN SINH THÀNH CÔNG!')
            .setDescription(`Chúc mừng bạn đã **Chuyển Sinh lần thứ ${userData.prestige}**!\nNhận danh hiệu: \`${prestigeTitle}\``);
        return message.channel.send({ embeds: [csEmbed] });
    }

    if (command === 'mohopqua') {
        if ((userData.giftboxes || 0) <= 0) return message.reply('Bạn không có Hộp Quà nào!');
        userData.giftboxes -= 1;

        const picked = ['coins', 'xp', 'title'][Math.floor(Math.random() * 3)];
        let rewardText = '';

        if (picked === 'coins') {
            const val = Math.floor(Math.random() * 500) + 200;
            userData.coins += val;
            rewardText = `**+${val} SWC**`;
        } else if (picked === 'xp') {
            const val = Math.floor(Math.random() * 300) + 100;
            userData.xp += val;
            rewardText = `**+${val} EXP**`;
        } else {
            const title = 'Thần Thánh Chat';
            if (!userData.unlockedTitles.includes(title)) userData.unlockedTitles.push(title);
            userData.title = title;
            rewardText = `Danh hiệu: \`${title}\``;
        }
        queueSave();
        return message.reply(`Mở hộp quà nhận được: ${rewardText}!`);
    }

    if (command === 'danhhieu' || command === 'title') {
        checkLevelTitles(userData);
        const action = args[0]?.toLowerCase();
        const titleChoice = args.slice(1).join(' ');

        if (action === 'chon' || action === 'set') {
            if (!titleChoice) return message.reply('Cú pháp: `.danhhieu chon <tên danh hiệu>`');
            const matched = userData.unlockedTitles.find(t => t.toLowerCase() === titleChoice.toLowerCase());
            if (!matched) return message.reply('Bạn chưa sở hữu danh hiệu này!');
            userData.title = matched;
            queueSave();
            return message.reply(`Đã trang bị danh hiệu: **${matched}**!`);
        }

        let listText = userData.unlockedTitles.map(t => `${t === userData.title ? '🌸 **[Đang đeo]** ' : '• '}${t}`).join('\n');
        const titleEmbed = new EmbedBuilder().setColor('#FFB6C1').setTitle(`🎀 Kho Danh Hiệu`).setDescription(listText);
        return message.channel.send({ embeds: [titleEmbed] });
    }

    if (command === 'tuido' || command === 'inventory') {
        let invText = (userData.inventory || []).map((item, index) => `**[${index + 1}]** ${item.name}`).join('\n');
        return message.reply(`🎒 Túi Đồ:\n${invText || 'Trống'}\n\n🍖 Thức Ăn Pet: **${userData.petFood || 0}** cái`);
    }

    if (command === 'sd' || command === 'sudung') {
        const index = parseInt(args[0]) - 1;
        if (isNaN(index) || !userData.inventory || !userData.inventory[index]) return message.reply('Cú pháp: `.sd <số thứ tự>`');

        const item = userData.inventory[index];
        if (item.type === 'boost') {
            userData.personalBoostUntil = Date.now() + 3600000;
            userData.boostMultiplier = item.multiplier || 2;
            userData.inventory.splice(index, 1);
            message.reply(`Đã dùng **${item.name}**! Kích hoạt nhân đôi EXP trong 1 giờ.`);
        } else {
            const titleName = item.title || item.name;
            if (!userData.unlockedTitles.includes(titleName)) userData.unlockedTitles.push(titleName);
            userData.title = titleName;
            userData.inventory.splice(index, 1);
            message.reply(`Đã trang bị danh hiệu: **${titleName}**!`);
        }
        queueSave();
        return;
    }

    if (command === 'cap' || command === 'rank' || command === 'profile' || command === 'thongtin') {
        const targetMember = message.mentions.members.first() || message.member;
        const targetUser = targetMember.user;
        initUser(guildId, targetUser.id);
        const uData = memoryDb[guildId].users[targetUser.id];
        checkLevelTitles(uData);

        const excludedIds = [...DEVELOPER_IDS, ...(guildConfig.admins || [])];
        const allUsers = Object.entries(memoryDb[guildId].users || {})
            .filter(([id]) => !excludedIds.includes(id))
            .map(([id, data]) => ({ id, level: data.level, xp: data.xp, prestige: data.prestige || 0 }))
            .sort((a, b) => b.prestige === a.prestige ? (b.level === a.level ? b.xp - a.xp : b.level - a.level) : b.prestige - a.prestige);
        
        const rank = allUsers.findIndex(u => u.id === targetUser.id) + 1 || allUsers.length + 1;
        const requiredXp = getXpForNextLevel(uData.level);

        const activePet = (uData.pets || []).find(p => p.id === uData.activePetId);
        const petInfoText = activePet ? `🐾 Pet: ${activePet.name} (Lvl ${activePet.level})` : '🐾 Pet: Không có';

        try {
            const canvas = Canvas.createCanvas(930, 360);
            const ctx = canvas.getContext('2d');
            const bgGrad = ctx.createLinearGradient(0, 0, 930, 360);
            bgGrad.addColorStop(0, '#2E1A47'); bgGrad.addColorStop(1, '#110C1D');
            ctx.fillStyle = bgGrad; ctx.beginPath(); ctx.roundRect(0, 0, 930, 360, 30); ctx.fill();

            try {
                const avatar = await Canvas.loadImage(targetUser.displayAvatarURL({ extension: 'png', size: 256 }));
                ctx.save(); ctx.beginPath(); ctx.arc(135, 165, 78, 0, Math.PI * 2, true); ctx.closePath(); ctx.clip();
                ctx.drawImage(avatar, 57, 87, 156, 156); ctx.restore();
            } catch (e) {}

            ctx.fillStyle = '#E2E8F0'; ctx.font = 'bold 36px sans-serif';
            ctx.fillText(targetUser.username, 250, 75);

            ctx.fillStyle = '#C084FC'; ctx.font = 'bold 20px sans-serif';
            ctx.fillText(`Chuyển Sinh: ${uData.prestige || 0}`, 250, 115);

            ctx.fillStyle = '#9370DB'; ctx.font = 'bold 20px sans-serif';
            ctx.fillText(`Danh hiệu: ${getUserRoleTitle(targetUser.id, uData)}`, 250, 150);

            ctx.fillStyle = '#FF8C00'; ctx.font = 'bold 18px sans-serif';
            ctx.fillText(petInfoText, 250, 185);

            ctx.fillStyle = '#A78BFA'; ctx.font = 'bold 30px sans-serif'; ctx.textAlign = 'right';
            ctx.fillText(`LVL ${uData.level}`, 870, 75);
            ctx.fillStyle = '#9370DB'; ctx.font = 'bold 20px sans-serif'; ctx.fillText(`Rank #${rank}`, 870, 110); ctx.textAlign = 'left';

            const barX = 250, barY = 220, barW = 620, barH = 32;
            ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
            ctx.beginPath(); ctx.roundRect(barX, barY, barW, barH, 16); ctx.fill();

            const progress = Math.min(Math.max(uData.xp / requiredXp, 0), 1);
            if (progress > 0) {
                const fillW = Math.max(barH, barW * progress);
                const progGrad = ctx.createLinearGradient(barX, barY, barX + barW, barY);
                progGrad.addColorStop(0, '#FF69B4'); progGrad.addColorStop(1, '#FFB6C1');
                ctx.fillStyle = progGrad;
                ctx.beginPath(); ctx.roundRect(barX, barY, fillW, barH, 16); ctx.fill();
            }

            ctx.fillStyle = '#E2E8F0'; ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'center';
            ctx.fillText(`EXP: ${uData.xp} / ${requiredXp}`, barX + barW / 2, barY + 21); 
            ctx.textAlign = 'left';

            const attachment = new AttachmentBuilder(canvas.toBuffer(), { name: 'profile.png' });
            return message.channel.send({ files: [attachment] });
        } catch (err) {
            return message.reply(`📊 **${targetUser.username}** — Cấp: **${uData.level}** | EXP: **${uData.xp}/${requiredXp}** | Ví: **${uData.coins || 0} SWC**\n${petInfoText}`);
        }
    }
});

client.login(TOKEN);
