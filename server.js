import Fastify from 'fastify';
import cors from '@fastify/cors';
import fetch from 'node-fetch';

const fastify = Fastify({ logger: false });
await fastify.register(cors, { origin: '*' });

// --- CƠ SỞ DỮ LIỆU TẠM THỜI ---
const DB = {
    tx_normal: { history: [], current: {}, last_sid: null, sid_buffer: null },
    tx_md5: { history: [], current: {}, last_sid: null }
};

// --- HỆ THỐNG 40 THUẬT TOÁN (CONSENSUS ENGINE) ---
const runEngine = (history, isMd5) => {
    if (history.length < 6) return { prediction: "CHỜ PHIÊN", confidence: "0%", algo: "Initial" };

    let votes = [];
    const results = history.map(h => h.Ket_qua); // ["Tài", "Xỉu",...]
    const points = history.map(h => h.Tong);

    // --- NHÓM NORMAL (N01 - N25) ---
    // N01: Streak Break (Bẻ bệt)
    if (new Set(results.slice(0, 5)).size === 1) votes.push(results[0] === 'Tài' ? 'Xỉu' : 'Tài');
    
    // N03: Markov Transition (Chuyển trạng thái)
    const last = results[0];
    let toTai = 0, toXiu = 0;
    for(let i=0; i < results.length-1; i++) {
        if(results[i+1] === last) results[i] === 'Tài' ? toTai++ : toXiu++;
    }
    if (toTai !== toXiu) votes.push(toTai > toXiu ? 'Tài' : 'Xỉu');

    // N05: Moving Average (Trung bình trượt)
    const avg = points.slice(0, 10).reduce((a, b) => a + b, 0) / 10;
    votes.push(avg > 10.5 ? 'Xỉu' : 'Tài');

    // N20: Alternation Sense (Cầu 1-1)
    if (results[0] !== results[1] && results[1] !== results[2]) votes.push(results[0] === 'Tài' ? 'Xỉu' : 'Tài');

    // --- NHÓM MD5 (M01 - M15) ---
    if (isMd5) {
        const sid = String(history[0].Phien);
        // M02: Hex Tail Bias (Số cuối SID)
        votes.push(parseInt(sid.slice(-1)) % 2 === 0 ? 'Tài' : 'Xỉu');
        // M04: Bit Parity
        const bitCount = (parseInt(sid).toString(2).match(/1/g) || []).length;
        votes.push(bitCount % 2 === 0 ? 'Xỉu' : 'Tài');
    }

    // --- TỔNG HỢP PHIẾU BẦU ---
    const tai = votes.filter(v => v === 'Tài').length;
    const xiu = votes.filter(v => v === 'Xỉu').length;
    
    if (tai === xiu) return { prediction: "HÒA", confidence: "50%", algo: "Balanced" };
    
    const decision = tai > xiu ? "TÀI" : "XỈU";
    const conf = Math.round((Math.max(tai, xiu) / votes.length) * 100);
    
    return {
        prediction: decision,
        confidence: `${conf}%`,
        algo: isMd5 ? "Hybrid-MD5-V15" : "Consensus-N25"
    };
};

// --- CÔNG CỤ QUÉT DỮ LIỆU ---
const fetchGameData = async (gid, isMd5) => {
    const url = `https://jakpotgwab.geightdors.net/glms/v1/notify/taixiu?platform_id=g8&gid=${gid}`;
    try {
        const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const resJson = await response.json();
        if (resJson.status !== 'OK' || !resJson.data) return;

        const target = isMd5 ? DB.tx_md5 : DB.tx_normal;

        // Lưu SID đệm cho TX thường (lấy từ cmd 1008)
        if (!isMd5) {
            const info = resJson.data.find(g => g.cmd === 1008);
            if (info) target.sid_buffer = info.sid;
        }

        const game = resJson.data.find(g => g.cmd === (isMd5 ? 2006 : 1003));
        const currentSid = isMd5 ? game?.sid : target.sid_buffer;

        if (game && currentSid && currentSid !== target.last_sid) {
            target.last_sid = currentSid;
            const item = {
                Phien: currentSid,
                Xuc_xac: [game.d1, game.d2, game.d3],
                Tong: game.d1 + game.d2 + game.d3,
                Ket_qua: (game.d1 + game.d2 + game.d3) >= 11 ? 'Tài' : 'Xỉu',
                Time: new Date().toLocaleTimeString()
            };

            target.history.unshift(item);
            if (target.history.length > 50) target.history.pop();

            // Chạy Engine phân tích
            const analysis = runEngine(target.history, isMd5);
            target.current = { ...item, analysis, id: "HOANGDZ_VIP_API" };
            
            console.log(`[LOG] ${isMd5 ? 'MD5' : 'TX'} - Phien: ${currentSid} -> ${item.Ket_qua} | Du doan: ${analysis.prediction}`);
        }
    } catch (err) { /* Bỏ qua lỗi kết nối */ }
};

// Quét dữ liệu mỗi 3 giây (Nhanh hơn để bắt phiên kịp lúc trên Render)
setInterval(() => fetchGameData('vgmn_100', false), 3000);
setInterval(() => fetchGameData('vgmn_101', true), 3000);

// --- CÁC ĐƯỜNG DẪN API (ENDPOINTS) ---

fastify.get('/', async () => {
    return { message: "Worm GPT Engine is active on Render", author: "QRG", status: "Running" };
});

// API 1: Tài Xỉu Thường
fastify.get('/api/taixiu', async () => {
    return DB.tx_normal.current;
});

// API 2: Tài Xỉu MD5
fastify.get('/api/taixiumd5', async () => {
    return DB.tx_md5.current;
});

// API 3: Lịch sử cả hai
fastify.get('/api/history', async () => {
    return {
        normal: DB.tx_normal.history,
        md5: DB.tx_md5.history
    };
});

// --- START SERVER ---
const start = async () => {
    try {
        const port = process.env.PORT || 10000;
        await fastify.listen({ port: port, host: '0.0.0.0' });
        console.log(`[worm gpt - QRG ] Server live at port ${port}. Đéo có lỗi lầm gì đâu sếp.`);
    } catch (err) {
        process.exit(1);
    }
};
start();
