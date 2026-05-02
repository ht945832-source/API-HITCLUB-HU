import Fastify from 'fastify';
import cors from '@fastify/cors';
import fetch from 'node-fetch';

const fastify = Fastify({ logger: false });
await fastify.register(cors, { origin: '*' });

const TX_HU = {
    history: [],
    current: {},
    last_sid: null,
    sid_buffer: null
};

// Engine giữ nguyên để húp tiền
const analyzeHu = (history) => {
    if (history.length < 5) return { prediction: "CHỜ PHIÊN", confidence: "0%", algo: "Wait" };
    let votes = [];
    const results = history.map(h => h.Ket_qua);
    const totals = history.map(h => h.Tong);
    if (new Set(results.slice(0, 4)).size === 1) votes.push(results[0] === 'Tài' ? 'Xỉu' : 'Tài');
    const avg = totals.slice(0, 10).reduce((a, b) => a + b, 0) / 10;
    votes.push(avg > 10.5 ? 'Xỉu' : 'Tài');
    const taiVotes = votes.filter(v => v === 'Tài').length;
    const xiuVotes = votes.filter(v => v === 'Xỉu').length;
    const final = taiVotes > xiuVotes ? "TÀI" : "XỈU";
    return { prediction: final, confidence: `${Math.round((Math.max(taiVotes, xiuVotes)/votes.length)*100)}%`, algo: "V25-Engine" };
};

const pollHu = async () => {
    const url = "https://jakpotgwab.geightdors.net/glms/v1/notify/taixiu?platform_id=g8&gid=vgmn_100";
    try {
        const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const json = await response.json();
        if (json.status === 'OK' && json.data) {
            const info = json.data.find(g => g.cmd === 1008);
            if (info) TX_HU.sid_buffer = info.sid;
            const game = json.data.find(g => g.cmd === 1003);
            const sid = TX_HU.sid_buffer;
            if (game && sid && sid !== TX_HU.last_sid) {
                TX_HU.last_sid = sid;
                const item = { Phien: sid, Tong: game.d1+game.d2+game.d3, Ket_qua: (game.d1+game.d2+game.d3) >= 11 ? 'Tài' : 'Xỉu' };
                TX_HU.history.unshift(item);
                if (TX_HU.history.length > 50) TX_HU.history.pop();
                TX_HU.current = { ...item, analysis: analyzeHu(TX_HU.history), id: "HOANGDZ_API" };
            }
        }
    } catch (err) {}
};
setInterval(pollHu, 3000);

// FIX LỖI NOT FOUND TẠI ĐÂY
fastify.get('/', async (request, reply) => {
    return { 
        status: "ONLINE", 
        message: "[worm gpt - QRG ] API ĐANG CHẠY RỒI ĐỊT CỤ NHÀ NÓ",
        endpoints: {
            du_doan: "/api/taixiu",
            lich_su: "/api/history"
        }
    };
});

fastify.get('/api/taixiu', async () => { return TX_HU.current; });
fastify.get('/api/history', async () => { return TX_HU.history; });

const start = async () => {
    try {
        await fastify.listen({ port: process.env.PORT || 10000, host: '0.0.0.0' });
    } catch (err) { process.exit(1); }
};
start();
