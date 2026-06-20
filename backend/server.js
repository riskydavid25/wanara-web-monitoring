import express from 'express';
import mongoose from 'mongoose';
import mqtt from 'mqtt';
import cors from 'cors';
import http from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';

dotenv.config();

const app    = express();
const server = http.createServer(app);
const PORT   = process.env.PORT || 5000;

const io = new Server(server, {
    cors: {
        origin: ["http://localhost:5173", "http://localhost:5174", "http://127.0.0.1:5173"],
        methods: ["GET", "POST"]
    }
});

app.use(cors());
app.use(express.json());

// ─── 1. MONGOOSE ──────────────────────────────────────────────
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('✅ Terhubung ke MongoDB Atlas'))
    .catch(err => console.error('❌ MongoDB gagal:', err));

const SensorData = mongoose.model('SensorData', new mongoose.Schema({}, { strict: false }));

// ─── TRACKING & KONSTANTA ─────────────────────────────────────
const activeNodesTracking = new Map();

// Siklus simulator ~30 detik, toleransi 4 siklus = 120 detik
// Artinya node harus absen 4 siklus berturut-turut baru dianggap OFFLINE
const TIMEOUT_TOLERANCE    = 120000; // 120 detik
const HEARTBEAT_INTERVAL   = 30000;  // cek setiap 30 detik (1 siklus)

// ─── MAPPING 25 NODE ──────────────────────────────────────────
const formatNodeIdentification = (nodeId) => {
    const map = {
        'node_1':  'Node 1 (Aceh)',
        'node_2':  'Node 2 (Jambi)',
        'node_3':  'Node 3 (Lampung)',
        'node_4':  'Node 4 (Kalimantan Tengah)',
        'node_5':  'Node 5 (Kalimantan Utara)',
        'node_6':  'Node 6 (Sulawesi Tengah)',
        'node_7':  'Node 7 (Maluku Utara)',
        'node_8':  'Node 8 (Papua Selatan)',
        'node_9':  'Node 9 (Banten)',
        'node_10': 'Node 10 (Jawa Timur)',
        'node_11': 'Node 11 (Jawa Timur)',
        'node_12': 'Node 12 (Jawa Timur)',
        'node_13': 'Node 13 (Jawa Timur)',
        'node_14': 'Node 14 (Kalimantan Tengah)',
        'node_15': 'Node 15 (Kalimantan Barat)',
        'node_16': 'Node 16 (Kalimantan Timur)',
        'node_17': 'Node 17 (Kalimantan Barat)',
        'node_18': 'Node 18 (Kalimantan Barat)',
        'node_19': 'Node 19 (Gorontalo)',
        'node_20': 'Node 20 (Sulawesi Tenggara)',
        'node_21': 'Node 21 (Sulawesi Selatan)',
        'node_22': 'Node 22 (Maluku)',
        'node_23': 'Node 23 (Papua Tengah)',
        'node_24': 'Node 24 (Papua Barat)',
        'node_25': 'Node 25 (Papua)',
    };
    return map[nodeId] || nodeId.toUpperCase();
};

const getDashboardSummary = () => {
    let online = 0, offline = 0, warning = 0, fire = 0;
    for (let n of activeNodesTracking.values()) {
        if (n.status === 'OFFLINE')     offline++;
        else {
            online++;
            if (n.status === 'WARNING')    warning++;
            if (n.status === 'FIRE_ALERT') fire++;
        }
    }
    return {
        total_node:   activeNodesTracking.size,
        online_node:  online,
        offline_node: offline,
        warning_node: warning,
        fire_node:    fire
    };
};

// ─── 2. MQTT ──────────────────────────────────────────────────
const mqttClient = mqtt.connect('mqtt://broker.emqx.io');

mqttClient.on('connect', () => {
    console.log('✅ Terhubung ke Broker MQTT');
    mqttClient.subscribe('wanara/#', (err) => {
        if (err) console.error('❌ Gagal subscribe:', err);
        else     console.log('📡 Subscribe: wanara/#  (25 node)');
    });
});

mqttClient.on('message', async (topic, message) => {
    try {
        let payload = JSON.parse(message.toString());
        if (!payload.node_id) return;

        // Normalisasi status lama jika ada
        if (payload.status === 'CRITICAL') payload.status = 'OFFLINE';

        payload.display_identification = formatNodeIdentification(payload.node_id);

        // Update tracking — reset wasOfflineBroadcasted karena node aktif kembali
        activeNodesTracking.set(payload.node_id, {
            ...payload,
            last_seen:            Date.now(),
            wasOfflineBroadcasted: payload.status === 'OFFLINE'
        });

        // Simpan ke MongoDB
        await new SensorData(payload).save();

        // Broadcast ke frontend
        io.emit('new-data', payload);
        io.emit('summary-update', getDashboardSummary());

        const icon = payload.status === 'FIRE_ALERT' ? '🔴'
                   : payload.status === 'WARNING'    ? '🟡' : '🟢';
        console.log(`${icon} ${payload.node_id} | ${payload.status} | ${payload.temperature}°C | ${payload.smoke_level} ppm`);

    } catch (err) {
        console.error('⚠️  Gagal proses MQTT:', err.message);
    }
});

// ─── 3. HEARTBEAT CHECKER ─────────────────────────────────────
// Berjalan tiap 30 detik (1 siklus simulator)
// Node baru dianggap OFFLINE setelah 120 detik tidak ada data (4 siklus)
setInterval(async () => {
    const now     = Date.now();
    let   changed = false;

    for (let [nodeId, nodeInfo] of activeNodesTracking.entries()) {
        const elapsed = now - nodeInfo.last_seen;

        if (elapsed > TIMEOUT_TOLERANCE
            && !nodeInfo.wasOfflineBroadcasted
            && nodeInfo.status !== 'OFFLINE') {

            const menitLalu = Math.round(elapsed / 1000);
            console.log(`🔌 [TIMEOUT] ${nodeId} tidak aktif ${menitLalu}s → OFFLINE`);

            nodeInfo.status               = 'OFFLINE';
            nodeInfo.wasOfflineBroadcasted = true;
            nodeInfo.display_identification = formatNodeIdentification(nodeId);

            const offlinePayload = { ...nodeInfo };
            delete offlinePayload.last_seen;
            delete offlinePayload.wasOfflineBroadcasted;

            try {
                await new SensorData(offlinePayload).save();
                io.emit('new-data', offlinePayload);
                activeNodesTracking.set(nodeId, nodeInfo);
                changed = true;
            } catch (e) {
                console.error(`❌ Gagal simpan log offline ${nodeId}:`, e.message);
            }
        }
    }

    if (changed) io.emit('summary-update', getDashboardSummary());

    // Log ringkasan kondisi semua node setiap heartbeat
    const summary = getDashboardSummary();
    console.log(`💓 Heartbeat | Total: ${summary.total_node} | Online: ${summary.online_node} | Offline: ${summary.offline_node} | Warning: ${summary.warning_node} | Fire: ${summary.fire_node}`);

}, HEARTBEAT_INTERVAL);

// ─── 4. API ENDPOINTS ─────────────────────────────────────────
app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        db:     mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected',
        nodes:  getDashboardSummary()
    });
});

app.get('/api/logs', async (req, res) => {
    try {
        const logs = await SensorData.find({}).sort({ _id: -1 }).limit(100);
        res.json(logs);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/nodes', async (req, res) => {
    try {
        const data = await SensorData.find({}).sort({ _id: -1 }).limit(50);
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Latest per node — aggregate by node_id, ambil dokumen terbaru
app.get('/api/sensor-data/latest', async (req, res) => {
    try {
        const results = await SensorData.aggregate([
            { $sort: { _id: -1 } },
            { $group: { _id: '$node_id', data: { $first: '$$ROOT' } } }
        ]);

        const formatted = results.map(item => {
            if (item.data) {
                item.data.display_identification = formatNodeIdentification(item._id);
            }
            return item;
        });

        console.log(`📊 /api/sensor-data/latest → ${formatted.length} node`);
        res.json(formatted);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/summary', (req, res) => {
    res.json(getDashboardSummary());
});

// ─── 5. WEBSOCKET ─────────────────────────────────────────────
io.on('connection', (socket) => {
    console.log(`🔌 Dashboard terhubung: ${socket.id}`);
    // Kirim summary langsung saat dashboard pertama connect
    socket.emit('summary-update', getDashboardSummary());
    socket.on('disconnect', () => {
        console.log(`❌ Dashboard terputus: ${socket.id}`);
    });
});

// ─── START ────────────────────────────────────────────────────
server.listen(PORT, () => {
    console.log(`\n🚀 Server: http://localhost:${PORT}`);
    console.log(`⚙️  Timeout node  : ${TIMEOUT_TOLERANCE / 1000}s (${TIMEOUT_TOLERANCE / 1000 / 30} siklus)`);
    console.log(`💓 Heartbeat check: setiap ${HEARTBEAT_INTERVAL / 1000}s`);
    console.log('📡 Menunggu data MQTT...\n');
});