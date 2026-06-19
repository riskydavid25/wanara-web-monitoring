// server.js fix terintegrasi Heartbeat Checker + Trigger Status Kritis + Stats Ringkasan + API Log & Mapping QoS
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

// ─── 1. KONEKSI MONGOOSE ──────────────────────────────────────────────────
const MONGO_URI = process.env.MONGODB_URI;

mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ Berhasil terhubung ke MongoDB Atlas'))
    .catch(err => console.error('❌ Gagal terhubung ke MongoDB Atlas:', err));

const sensorSchema = new mongoose.Schema({}, { strict: false });
const SensorData   = mongoose.model('SensorData', sensorSchema);

const activeNodesTracking = new Map();

// ─── FIX 1: Naikkan TIMEOUT dari 30s → 60s ────────────────────────────────
// Simulator kirim tiap 10 detik untuk 25 node.
// Dengan 30s, node yang baru pertama kali kirim bisa di-timeout sebelum data
// ke-2 tiba. 60s memberi ruang 6 siklus penuh — jauh lebih aman.
const TIMEOUT_TOLERANCE = 60000; // 60 detik

// ─── FIX 2: Mapping lengkap semua 25 node ────────────────────────────────
const formatNodeIdentification = (nodeId) => {
    const nodeMapping = {
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
    return nodeMapping[nodeId] || nodeId.toUpperCase();
};

const getDashboardSummary = () => {
    let total = activeNodesTracking.size;
    let online = 0, offline = 0, warning = 0, fire = 0;

    for (let nodeInfo of activeNodesTracking.values()) {
        if (nodeInfo.status === 'OFFLINE') {
            offline++;
        } else {
            online++;
            if (nodeInfo.status === 'WARNING')    warning++;
            if (nodeInfo.status === 'FIRE_ALERT') fire++;
        }
    }

    return { total_node: total, online_node: online, offline_node: offline, warning_node: warning, fire_node: fire };
};

// ─── 2. KONEKSI MQTT ──────────────────────────────────────────────────────
const mqttClient = mqtt.connect('mqtt://broker.emqx.io');

mqttClient.on('connect', () => {
    console.log('✅ Terhubung ke Broker MQTT (emqx.io)');
    // Subscribe wildcard — tangkap SEMUA 25 node sekaligus
    mqttClient.subscribe('wanara/#', (err) => {
        if (err) console.error('❌ Gagal subscribe MQTT:', err);
        else     console.log('📡 Subscribe ke topic: wanara/#');
    });
});

mqttClient.on('message', async (topic, message) => {
    try {
        let payload = JSON.parse(message.toString());
        if (!payload.node_id) return;

        // Simulator Python menggunakan FIRE_ALERT (bukan CRITICAL).
        // Tangani juga CRITICAL untuk kompatibilitas ke depan.
        if (payload.status === 'CRITICAL') {
            payload.status = 'OFFLINE';
        }

        payload.display_identification = formatNodeIdentification(payload.node_id);

        activeNodesTracking.set(payload.node_id, {
            ...payload,
            last_seen: Date.now(),
            wasOfflineBroadcasted: payload.status === 'OFFLINE'
        });

        const entry = new SensorData(payload);
        await entry.save();

        io.emit('new-data', payload);
        io.emit('summary-update', getDashboardSummary());

        console.log(`💾 ${payload.node_id} | ${payload.status} | suhu: ${payload.temperature}°C | asap: ${payload.smoke_level} ppm`);
    } catch (err) {
        console.error('⚠️ Gagal memproses MQTT:', err.message);
    }
});

// ─── 3. HEARTBEAT CHECKER ─────────────────────────────────────────────────
// Interval 15 detik — lebih responsif dari sebelumnya (10s),
// tapi tidak agresif karena timeout sudah dinaikkan ke 60s.
setInterval(async () => {
    const now = Date.now();
    let changed = false;

    for (let [nodeId, nodeInfo] of activeNodesTracking.entries()) {
        const elapsed = now - nodeInfo.last_seen;

        if (elapsed > TIMEOUT_TOLERANCE && !nodeInfo.wasOfflineBroadcasted && nodeInfo.status !== 'OFFLINE') {
            console.log(`🔌 [TIMEOUT] ${nodeId} tidak aktif selama ${Math.round(elapsed / 1000)}s → OFFLINE`);

            nodeInfo.status              = 'OFFLINE';
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
            } catch (dbErr) {
                console.error(`❌ Gagal simpan log offline ${nodeId}:`, dbErr.message);
            }
        }
    }

    if (changed) io.emit('summary-update', getDashboardSummary());
}, 15000);

// ─── 4. API ENDPOINTS ─────────────────────────────────────────────────────

app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', db: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected' });
});

app.get('/api/logs', async (req, res) => {
    try {
        const logs = await SensorData.find({}).sort({ timestamp: -1, _id: -1 }).limit(100);
        res.json(logs);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/nodes', async (req, res) => {
    try {
        const allData = await SensorData.find({}).sort({ timestamp: -1 }).limit(50);
        res.json(allData);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── FIX 3: Aggregate latest per node_id — tidak ada limit() ──────────────
// Sebelumnya tidak ada limit yang eksplisit, tapi $sort + $group
// sudah benar. Pastikan tidak ada filter tambahan yang memangkas hasil.
app.get('/api/sensor-data/latest', async (req, res) => {
    try {
        const results = await SensorData.aggregate([
            { $sort: { _id: -1 } },   // sort by _id lebih reliable dari timestamp string
            {
                $group: {
                    _id: '$node_id',
                    data: { $first: '$$ROOT' }
                }
            }
        ]);

        const formatted = results.map(item => {
            if (item.data) {
                item.data.display_identification = formatNodeIdentification(item._id);
            }
            return item;
        });

        console.log(`📊 /api/sensor-data/latest → ${formatted.length} node ditemukan`);
        res.json(formatted);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/summary', (req, res) => {
    res.json(getDashboardSummary());
});

io.on('connection', (socket) => {
    console.log(`🔌 Dashboard terhubung: ${socket.id}`);
    socket.emit('summary-update', getDashboardSummary());
    socket.on('disconnect', () => {
        console.log(`❌ Dashboard terputus: ${socket.id}`);
    });
});

// ─── START SERVER ──────────────────────────────────────────────────────────
server.listen(PORT, () => {
    console.log(`🚀 Server berjalan di http://localhost:${PORT}`);
    console.log('📡 Menunggu data dari MQTT & Siap melayani WebSocket...');
});