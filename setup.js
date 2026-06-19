// setup.js
import fs from 'fs';
import path from 'path';

const projectStructure = {
  // BACKEND
  'backend/package.json': `{
  "name": "wanara-backend",
  "version": "1.0.0",
  "type": "module",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js"
  },
  "dependencies": {
    "cors": "^2.8.5",
    "dotenv": "^16.4.5",
    "express": "^4.19.2",
    "mqtt": "^5.5.5",
    "mongoose": "^8.3.1",
    "socket.io": "^4.7.5"
  },
  "devDependencies": {
    "nodemon": "^3.1.0"
  }
}`,
  'backend/.env': `PORT=5000
MONGODB_URI=mongodb+srv://riskydavidkasyanto25_db_user:ex8dfnGtYDGrlD8G@cluster0.wfhvmbq.mongodb.net/wanara?retryWrites=true&w=majority&appName=Cluster0
MQTT_BROKER=mqtt://broker.emqx.io:1883
MQTT_TOPIC=wanara/forest/nodes`,
  'backend/config/db.js': `import mongoose from 'mongoose';
export const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI);
    console.log(\`MongoDB Connected: \${conn.connection.host}\`);
  } catch (error) {
    console.error(\`Database Error: \${error.message}\`);
    process.exit(1);
  }
};`,
  'backend/models/Node.js': `import mongoose from 'mongoose';
const qosSchema = new mongoose.Schema({
  network_status: { type: String, default: 'UNKNOWN' },
  signal_strength_dbm: { type: Number, default: 0 },
  latency_ms: { type: Number, default: 0 },
  packet_loss_percent: { type: Number, default: 0 }
}, { _id: false });

const nodeSchema = new mongoose.Schema({
  node_id: { type: String, required: true, unique: true },
  node_name: { type: String, required: true },
  forest_name: { type: String, required: true },
  latitude: { type: Number, required: true },
  longitude: { type: Number, required: true },
  district: String,
  city: String,
  province: String,
  temperature: { type: Number, default: 0 },
  humidity: { type: Number, default: 0 },
  smoke_level: { type: Number, default: 0 },
  fire_detected: { type: Boolean, default: false },
  status: { type: String, enum: ['NORMAL', 'WARNING', 'FIRE', 'OFFLINE'], default: 'NORMAL' },
  qos: { type: qosSchema, default: {} },
  timestamp: { type: Date, default: Date.now }
});
export const Node = mongoose.model('Node', nodeSchema);`,
  'backend/controllers/nodeController.js': `import { Node } from '../models/Node.js';
export const getNodes = async (req, res) => {
  try { const nodes = await Node.find().sort({ node_id: 1 }); res.json(nodes); }
  catch (error) { res.status(500).json({ message: error.message }); }
};
export const getNodeById = async (req, res) => {
  try {
    const node = await Node.findOne({ node_id: req.params.id });
    if (!node) return res.status(404).json({ message: 'Node not found' });
    res.json(node);
  } catch (error) { res.status(500).json({ message: error.message }); }
};
export const getStats = async (req, res) => {
  try {
    const total = await Node.countDocuments();
    const active = await Node.countDocuments({ status: { $ne: 'OFFLINE' } });
    const offline = await Node.countDocuments({ status: 'OFFLINE' });
    const warningFire = await Node.countDocuments({ status: { $in: ['WARNING', 'FIRE'] } });
    res.json({ total, active, offline, warningFire });
  } catch (error) { res.status(500).json({ message: error.message }); }
};`,
  'backend/routes/nodeRoutes.js': `import express from 'express';
import { getNodes, getNodeById, getStats } from '../controllers/nodeController.js';
const router = express.Router();
router.get('/', getNodes);
router.get('/stats', getStats);
router.get('/:id', getNodeById);
export default router;`,
  'backend/services/mqttService.js': `import mqtt from 'mqtt';
import { Node } from '../models/Node.js';
export const initMqtt = () => {
  const client = mqtt.connect(process.env.MQTT_BROKER);
  client.on('connect', () => {
    console.log('Connected to MQTT Broker');
    client.subscribe(process.env.MQTT_TOPIC);
  });
  client.on('message', async (topic, message) => {
    try {
      const data = JSON.parse(message.toString());
      await Node.findOneAndUpdate(
        { node_id: data.node_id },
        { ...data, timestamp: new Date(data.timestamp) },
        { upsert: true, new: true }
      );
    } catch (error) { console.error('MQTT Error:', error.message); }
  });
};`,
  'backend/sockets/socketHandler.js': `import { Node } from '../models/Node.js';
export const handleSocketConnections = (io) => {
  io.on('connection', async (socket) => {
    try {
      const stats = await getAggregatedStats();
      socket.emit('dashboard_stats', stats);
    } catch (err) { console.error(err); }
  });
  Node.watch([], { fullDocument: 'updateLookup' }).on('change', async (change) => {
    if (change.operationType === 'insert' || change.operationType === 'update') {
      const fullDoc = change.fullDocument;
      io.emit('sensor_update', fullDoc);
      io.emit('node_status_update', { node_id: fullDoc.node_id, status: fullDoc.status });
      const stats = await getAggregatedStats();
      io.emit('dashboard_stats', stats);
    }
  });
};
const getAggregatedStats = async () => {
  const total = await Node.countDocuments();
  const active = await Node.countDocuments({ status: { $ne: 'OFFLINE' } });
  const offline = await Node.countDocuments({ status: 'OFFLINE' });
  const warningFire = await Node.countDocuments({ status: { $in: ['WARNING', 'FIRE'] } });
  return { total, active, offline, warningFire };
};`,
  'backend/server.js': `import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { connectDB } from './config/db.js';
import nodeRoutes from './routes/nodeRoutes.js';
import { initMqtt } from './services/mqttService.js';
import { handleSocketConnections } from './sockets/socketHandler.js';

dotenv.config();
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*', methods: ['GET', 'POST'] } });

app.use(cors()); app.use(express.json());
app.use('/api/nodes', nodeRoutes);

connectDB(); initMqtt(); handleSocketConnections(io);
server.listen(process.env.PORT || 5000, () => console.log('Backend server running...'));`,

  // FRONTEND
  'frontend/package.json': `{
  "name": "wanara-frontend",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": { "dev": "vite", "build": "vite build", "preview": "vite preview" },
  "dependencies": {
    "framer-motion": "^11.1.7",
    "leaflet": "^1.9.4",
    "lucide-react": "^0.368.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-leaflet": "^4.2.1",
    "recharts": "^2.12.5",
    "socket.io-client": "^4.7.5"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.2.1",
    "autoprefixer": "^10.4.19",
    "postcss": "^8.4.38",
    "tailwindcss": "^3.4.3",
    "vite": "^5.2.8"
  }
}`,
  'frontend/tailwind.config.js': `/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: { extend: { colors: { darkBg: '#0b111e', darkCard: '#111a2e', darkBorder: '#1e293b' } } },
  plugins: [],
}`,
  'frontend/postcss.config.js': `export default { plugins: { tailwindcss: {}, autoprefixer: {} } }`,
  'frontend/index.html': `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>WANARA - Forest IoT Monitor</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>`,
  'frontend/src/index.css': `@tailwind base; @tailwind components; @tailwind utilities;
body { background-color: #0b111e; color: #f8fafc; font-family: sans-serif; margin: 0; }
.leaflet-container { width: 100%; height: 100%; background: #111a2e !important; }`,
  'frontend/src/main.jsx': `import React from 'react'; import { createRoot } from 'react-dom/client'; import App from './App.jsx'; import './index.css';
createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>);`,
  'frontend/src/components/DashboardHeader.jsx': `import React from 'react'; import { Activity, Radio, SignalZero, Wifi, ShieldAlert } from 'lucide-react';
export default function DashboardHeader({ stats }) {
  return (
    <header className="bg-darkCard border-b border-darkBorder p-4 flex justify-between items-center">
      <div className="flex items-center gap-2">
        <Radio className="w-6 h-6 text-emerald-400 animate-pulse" />
        <div><h1 className="text-xl font-bold text-emerald-400">WANARA</h1><p className="text-xs text-slate-400">Forest IoT Monitor</p></div>
      </div>
      <div className="flex gap-4">
        <div className="bg-darkBg p-2 rounded border border-darkBorder text-center min-w-[80px]"><p className="text-[10px] text-slate-400">Total</p><p className="font-bold">{stats.total}</p></div>
        <div className="bg-darkBg p-2 rounded border border-darkBorder text-center min-w-[80px]"><p className="text-[10px] text-emerald-400">Active</p><p className="font-bold text-emerald-400">{stats.active}</p></div>
        <div className="bg-darkBg p-2 rounded border border-darkBorder text-center min-w-[80px]"><p className="text-[10px] text-slate-400">Offline</p><p className="font-bold text-slate-400">{stats.offline}</p></div>
        <div className="bg-darkBg p-2 rounded border border-darkBorder text-center min-w-[80px]"><p className="text-[10px] text-amber-500">Alerts</p><p className="font-bold text-amber-500">{stats.warningFire}</p></div>
      </div>
    </header>
  );
}`,
  'frontend/src/components/LiveMap.jsx': `import React from 'react'; import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'; import L from 'leaflet'; import 'leaflet/dist/leaflet.css';
function RecenterMap({ lat, lng }) { const map = useMap(); if (lat && lng) map.setView([lat, lng], 5); return null; }
export default function LiveMap({ nodes, selectedNode, onSelectNode }) {
  const getIcon = (s) => L.divIcon({ className: 'm', html: \`<span style="background:\${s==='NORMAL'?'#10b981':s==='WARNING'?'#f59e0b':'#ef4444'}; width:14px; height:14px; display:block; border-radius:50%; border:2px solid white;"></span>\` });
  return (
    <div className="bg-darkCard border border-darkBorder rounded-xl h-[400px] overflow-hidden relative">
      <MapContainer center={[-2.5, 118]} zoom={5}>
        <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
        {nodes.map(n => (
          <Marker key={n.node_id} position={[n.latitude, n.longitude]} icon={getIcon(n.status)} eventHandlers={{ click: () => onSelectNode(n) }}>
            <Popup><b className="text-slate-900">{n.node_name}</b><p className="text-xs text-slate-700">{n.forest_name}</p></Popup>
          </Marker>
        ))}
        {selectedNode && <RecenterMap lat={selectedNode.latitude} lng={selectedNode.longitude} />}
      </MapContainer>
    </div>
  );
}`,
  'frontend/src/components/DeviceList.jsx': `import React from 'react';
export default function DeviceList({ nodes, selectedNode, onSelectNode }) {
  return (
    <div className="bg-darkCard border border-darkBorder rounded-xl p-4 h-[400px] flex flex-col">
      <h2 className="text-xs font-semibold text-slate-400 uppercase mb-2">DAFTAR PERANGKAT</h2>
      <div className="overflow-y-auto flex-1 space-y-2">
        {nodes.map(n => (
          <div key={n.node_id} onClick={() => onSelectNode(n)} className={\`p-2.5 rounded border cursor-pointer flex justify-between items-center \${selectedNode?.node_id === n.node_id ? 'bg-emerald-950/40 border-emerald-500' : 'bg-darkBg border-darkBorder'}\`}>
            <div><p className="text-sm font-bold">{n.node_name}</p><p className="text-xs text-slate-400 truncate max-w-[150px]">{n.forest_name}</p></div>
            <span className="text-[10px] font-mono px-1.5 py-0.5 bg-slate-800 rounded">{n.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}`,
  'frontend/src/components/QosPanel.jsx': `import React from 'react';
export default function QosPanel({ selectedNode }) {
  if (!selectedNode) return null;
  return (
    <div className="bg-darkCard border border-darkBorder rounded-xl p-4 font-mono text-xs space-y-2">
      <h3 className="text-slate-400 font-sans font-bold">KUALITAS LAYANAN</h3>
      <div className="flex justify-between border-b border-slate-800 pb-1"><span>Signal</span><span className="text-emerald-400">{selectedNode.qos?.signal_strength_dbm} dBm</span></div>
      <div className="flex justify-between border-b border-slate-800 pb-1"><span>Latency</span><span>{selectedNode.qos?.latency_ms} ms</span></div>
      <div className="flex justify-between border-b border-slate-800 pb-1"><span>Loss</span><span>{selectedNode.qos?.packet_loss_percent} %</span></div>
      <div className="flex justify-between"><span>Status</span><span className="text-emerald-400">{selectedNode.qos?.network_status}</span></div>
    </div>
  );
}`,
  'frontend/src/components/SensorPanels.jsx': `import React from 'react'; import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
export default function SensorPanels({ selectedNode }) {
  if (!selectedNode) return null;
  const mockData = [
    { n: '-20s', t: selectedNode.temperature - 0.4, h: selectedNode.humidity + 1 },
    { n: '-10s', t: selectedNode.temperature + 0.2, h: selectedNode.humidity - 0.5 },
    { n: 'Now', t: selectedNode.temperature, h: selectedNode.humidity }
  ];
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full">
      <div className="bg-darkCard border border-darkBorder rounded-xl p-4 md:col-span-1">
        <h4 className="text-xs text-slate-400 mb-2">SUHU & KELEMBAPAN - {selectedNode.node_name}</h4>
        <div className="h-28"><ResponsiveContainer width="100%" height="100%"><LineChart data={mockData}><XAxis dataKey="n" hide/><YAxis hide/><Tooltip/><Line type="monotone" dataKey="t" stroke="#fbbf24"/><Line type="monotone" dataKey="h" stroke="#3b82f6"/></LineChart></ResponsiveContainer></div>
      </div>
      <div className="bg-darkCard border border-darkBorder rounded-xl p-4 flex flex-col justify-center items-center text-center">
        <h4 className="text-xs text-slate-400 mb-2 w-full text-left">SENSOR API</h4>
        <div className={\`w-14 h-14 rounded-full flex items-center justify-center font-bold text-xs \${selectedNode.fire_detected?'bg-rose-500/20 text-rose-500 animate-pulse':'bg-emerald-500/20 text-emerald-400'}\`}>{selectedNode.fire_detected?'FIRE':'AMAN'}</div>
      </div>
      <div className="bg-darkCard border border-darkBorder rounded-xl p-4 flex flex-col justify-between">
        <h4 className="text-xs text-slate-400">DATA ASAP</h4>
        <p className="text-2xl font-mono font-bold">{selectedNode.smoke_level} <span className="text-xs font-normal">ppm</span></p>
        <span className="text-[10px] text-slate-500">Kondisi: {selectedNode.smoke_level > 100 ? 'WASPADA' : 'NORMAL'}</span>
      </div>
    </div>
  );
}`,
  'frontend/src/App.jsx': `import React, { useState, useEffect } from 'react'; import io from 'socket.io-client';
import DashboardHeader from './components/DashboardHeader'; import LiveMap from './components/LiveMap'; import DeviceList from './components/DeviceList'; import QosPanel from './components/QosPanel'; import SensorPanels from './components/SensorPanels';
const URL = 'http://localhost:5000';
export default function App() {
  const [nodes, setNodes] = useState([]); const [selectedNode, setSelectedNode] = useState(null);
  const [stats, setStats] = useState({ total: 0, active: 0, offline: 0, warningFire: 0 });
  useEffect(() => {
    const init = async () => {
      try {
        const rN = await fetch(\`\${URL}/api/nodes\`); const dN = await rN.json(); setNodes(dN); if(dN.length > 0) setSelectedNode(dN[0]);
        const rS = await fetch(\`\${URL}/api/nodes/stats\`); const dS = await rS.json(); setStats(dS);
      } catch (e) { console.error(e); }
    };
    init();
    const socket = io(URL);
    socket.on('dashboard_stats', s => setStats(s));
    socket.on('sensor_update', n => {
      setNodes(prev => {
        const idx = prev.findIndex(item => item.node_id === n.node_id);
        if(idx !== -1) { const next = [...prev]; next[idx] = n; return next; }
        return [...prev, n];
      });
      setSelectedNode(curr => curr && curr.node_id === n.node_id ? n : curr);
    });
    return () => { socket.disconnect(); };
  }, []);
  return (
    <div className="min-h-screen bg-darkBg text-slate-100 p-4 space-y-4">
      <DashboardHeader stats={stats} />
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-3"><LiveMap nodes={nodes} selectedNode={selectedNode} onSelectNode={setSelectedNode} /></div>
        <div className="lg:col-span-1"><DeviceList nodes={nodes} selectedNode={selectedNode} onSelectNode={setSelectedNode} /></div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-1"><QosPanel selectedNode={selectedNode} /></div>
        <div className="lg:col-span-3"><SensorPanels selectedNode={selectedNode} /></div>
      </div>
    </div>
  );
}`,
  'frontend/vite.config.js': `import { defineConfig } from 'vite'; import react from '@vitejs/plugin-react';
export default defineConfig({ plugins: [react()], server: { port: 3000 } });`
};

// Proses pembuatan file otomatis
console.log('🏗️ Memulai pembuatan struktur project WANARA...');
Object.entries(projectStructure).forEach(([filePath, content]) => {
  const fullPath = path.join(process.cwd(), filePath);
  const dir = path.dirname(fullPath);
  
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(fullPath, content.trim(), 'utf8');
  console.log(`✅ Terbuat: ${filePath}`);
});
console.log('\n🚀 Selesai! Semua file kode program sudah lengkap berada di folder masins-masing.');