// setup.js
import fs from 'fs';
import path from 'path';

const frontendStructure = {
  'package.json': `{
  "name": "wanara-frontend",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
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
  'tailwind.config.js': `/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        darkBg: '#0b111e',
        darkCard: '#111a2e',
        darkBorder: '#1e293b',
      }
    },
  },
  plugins: [],
}`,
  'postcss.config.js': `export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}`,
  'index.html': `<!DOCTYPE html>
<html lang="id">
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
  'src/index.css': `@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  background-color: #0b111e;
  color: #f8fafc;
  font-family: ui-sans-serif, system-ui, sans-serif;
  margin: 0;
}

.leaflet-container {
  width: 100%;
  height: 100%;
  background: #111a2e !important;
}

::-webkit-scrollbar {
  width: 6px;
}
::-webkit-scrollbar-track {
  background: #0b111e;
}
::-webkit-scrollbar-thumb {
  background: #1e293b;
  border-radius: 4px;
}
::-webkit-scrollbar-thumb:hover {
  background: #334155;
}`,
  'src/main.jsx': `import React from 'react'
import 'leaflet/dist/leaflet.css'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './index.css'

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)`,
  'src/App.jsx': `import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import { Radio, Activity, Thermometer, Flame, Wind, Cpu } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

const BACKEND_URL = 'http://localhost:5000';

function RecenterMap({ lat, lng }) {
  const map = useMap();
  if (lat && lng) map.setView([lat, lng], 6);
  return null;
}

export default function App() {
  const [nodes, setNodes] = useState([]);
  const [selectedNode, setSelectedNode] = useState(null);
  const [stats, setStats] = useState({ total: 0, active: 0, offline: 0, alerts: 0 });

  useEffect(() => {
    const total = nodes.length;
    const active = nodes.filter(n => n.status !== 'OFFLINE').length;
    const offline = nodes.filter(n => n.status === 'OFFLINE').length;
    const alerts = nodes.filter(n => n.status === 'CRITICAL' || n.fire_detected).length;
    setStats({ total, active, offline, alerts });
  }, [nodes]);

  useEffect(() => {
    // 1. Ambil data awal dari state agregasi terbaru MongoDB
    const fetchLatestData = async () => {
      try {
        const res = await fetch(\`\${BACKEND_URL}/api/sensor-data/latest\`);
        const json = await res.json();
        const flatNodes = json.map(item => item.data).sort((a, b) => a.node_id.localeCompare(b.node_id));
        setNodes(flatNodes);
        if (flatNodes.length > 0) {
          setSelectedNode(flatNodes[0]);
        }
      } catch (err) {
        console.error('Gagal mengambil data dari API backend:', err);
      }
    };

    fetchLatestData();

    // 2. Integrasikan ke Stream Realtime WS Server.js milik Anda
    const socket = io(BACKEND_URL);

    socket.on('new-data', (payload) => {
      if (!payload || !payload.node_id) return;
      
      setNodes((prevNodes) => {
        const index = prevNodes.findIndex(n => n.node_id === payload.node_id);
        if (index !== -1) {
          const updated = [...prevNodes];
          updated[index] = payload;
          return updated;
        } else {
          return [...prevNodes, payload].sort((a, b) => a.node_id.localeCompare(b.node_id));
        }
      });

      setSelectedNode((current) => {
        if (current && current.node_id === payload.node_id) {
          return payload;
        }
        return current;
      });
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const getMarkerIcon = (status, fireDetected) => {
    let color = '#10b981';
    if (status === 'WARNING') color = '#f59e0b';
    if (status === 'CRITICAL' || fireDetected) color = '#ef4444';
    if (status === 'OFFLINE') color = '#64748b';

    return L.divIcon({
      className: 'custom-marker',
      html: \`<span style="background-color: \${color}; width: 15px; height: 15px; display: block; border-radius: 50%; border: 2.5px solid white; box-shadow: 0 0 10px \${color};"></span>\`,
      iconSize: [15, 15],
      iconAnchor: [7.5, 7.5]
    });
  };

  const chartData = selectedNode ? [
    { name: '-20s', temp: Number((selectedNode.temperature - 0.7).toFixed(1)), hum: Number((selectedNode.humidity + 1.5).toFixed(1)) },
    { name: '-10s', temp: Number((selectedNode.temperature + 0.4).toFixed(1)), hum: Number((selectedNode.humidity - 0.8).toFixed(1)) },
    { name: 'Sekarang', temp: selectedNode.temperature, hum: selectedNode.humidity }
  ] : [];

  return (
    <div className="min-h-screen bg-darkBg text-slate-100 flex flex-col font-sans antialiased">
      <header className="bg-darkCard border-b border-darkBorder p-4 flex flex-wrap justify-between items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="bg-emerald-600/10 p-2.5 rounded-xl border border-emerald-500/20">
            <Radio className="w-6 h-6 text-emerald-400 animate-pulse" />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-widest text-emerald-400 font-mono">WANARA</h1>
            <p className="text-xs text-slate-400">Sistem Monitoring Penjaga Kebakaran Hutan IoT</p>
          </div>
        </div>
        
        <div className="flex flex-wrap gap-3">
          <div className="bg-darkBg border border-darkBorder px-4 py-1.5 rounded-xl text-center min-w-[95px]">
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Total Node</p>
            <p className="text-lg font-black font-mono text-slate-200">{stats.total}</p>
          </div>
          <div className="bg-darkBg border border-darkBorder px-4 py-1.5 rounded-xl text-center min-w-[95px]">
            <p className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider">Aktif</p>
            <p className="text-lg font-black font-mono text-emerald-400">{stats.active}</p>
          </div>
          <div className="bg-darkBg border border-darkBorder px-4 py-1.5 rounded-xl text-center min-w-[95px]">
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Offline</p>
            <p className="text-lg font-black font-mono text-slate-400">{stats.offline}</p>
          </div>
          <div className="bg-darkBg border border-darkBorder px-4 py-1.5 rounded-xl text-center min-w-[95px]">
            <p className="text-[10px] text-rose-500 font-bold uppercase tracking-wider">Bahaya</p>
            <p className="text-lg font-black font-mono text-rose-500">{stats.alerts}</p>
          </div>
        </div>
      </header>

      <main className="p-4 flex-1 flex flex-col gap-4 max-w-[1600px] w-full mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <div className="lg:col-span-3 bg-darkCard border border-darkBorder rounded-2xl h-[440px] overflow-hidden relative shadow-inner">
            <MapContainer center={[-0.7893, 113.9213]} zoom={5} style={{ height: "100%", width: "100%" }}>
              <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
              {nodes.map(n => (
                <Marker 
                  key={n.node_id} 
                  position={[n.latitude, n.longitude]} 
                  icon={getMarkerIcon(n.status, n.fire_detected)}
                  eventHandlers={{ click: () => setSelectedNode(n) }}
                >
                  <Popup>
                    <div className="text-slate-900 p-1 font-sans">
                      <b className="text-sm font-bold block border-b pb-1 mb-1">{n.node_name}</b>
                      <p className="text-xs text-slate-700 font-medium">{n.forest_name}</p>
                      <div className="mt-2 pt-1 border-t flex justify-between gap-2 text-[11px] font-mono">
                        <span>Suhu: <b>{n.temperature}°C</b></span>
                        <span>Asap: <b>{n.smoke_level} ppm</b></span>
                      </div>
                    </div>
                  </Popup>
                </Marker>
              ))}
              {selectedNode && <RecenterMap lat={selectedNode.latitude} lng={selectedNode.longitude} />}
            </MapContainer>
          </div>

          <div className="lg:col-span-1 bg-darkCard border border-darkBorder rounded-2xl p-4 h-[440px] flex flex-col shadow-lg">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 font-mono flex items-center gap-2">
              <span className="w-1.5 h-3 bg-emerald-500 rounded-sm"></span> Daftar Node Perangkat
            </h2>
            <div className="overflow-y-auto flex-1 space-y-2 pr-1">
              {nodes.map(n => {
                const isSelected = selectedNode?.node_id === n.node_id;
                const isFire = n.status === 'CRITICAL' || n.fire_detected;
                return (
                  <div 
                    key={n.node_id} 
                    onClick={() => setSelectedNode(n)}
                    className={\`p-3 rounded-xl border transition-all duration-200 cursor-pointer flex justify-between items-center \${
                      isSelected ? 'bg-emerald-950/20 border-emerald-500/70 shadow-md ring-1 ring-emerald-500/30' : 'bg-darkBg border-darkBorder hover:border-slate-700'
                    }\`}
                  >
                    <div className="truncate max-w-[70%]">
                      <div className="flex items-center gap-2">
                        <span className={\`w-2 h-2 rounded-full shrink-0 \${
                          isFire ? 'bg-rose-500 animate-ping' : n.status === 'WARNING' ? 'bg-amber-400' : n.status === 'OFFLINE' ? 'bg-slate-500' : 'bg-emerald-400'
                        }\`} />
                        <span className="font-bold text-sm text-slate-200 truncate">{n.node_name}</span>
                      </div>
                      <p className="text-xs text-slate-400 truncate mt-0.5 font-sans">{n.forest_name}</p>
                    </div>
                    <span className={\`text-[10px] font-mono font-bold px-2 py-0.5 rounded uppercase tracking-wide shrink-0 \${
                      isFire ? 'bg-rose-500/10 text-rose-400' : n.status === 'WARNING' ? 'bg-amber-400/10 text-amber-400' : 'bg-emerald-500/10 text-emerald-400'
                    }\`}>
                      {isFire ? 'FIRE' : n.status}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {selectedNode && (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            <div className="bg-darkCard border border-darkBorder rounded-2xl p-4 font-mono text-xs flex flex-col justify-between shadow-lg">
              <div>
                <div className="flex items-center gap-2 mb-4 font-sans">
                  <Cpu className="w-4 h-4 text-slate-400" />
                  <h3 className="font-bold text-slate-400 uppercase tracking-wider text-[11px]">KUALITAS LAYANAN (QoS)</h3>
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between border-b border-darkBorder/30 pb-1.5">
                    <span className="text-slate-400">Kuat Sinyal</span>
                    <span className="text-emerald-400 font-bold">{selectedNode.qos?.signal_strength_dbm ?? 0} dBm</span>
                  </div>
                  <div className="flex justify-between border-b border-darkBorder/30 pb-1.5">
                    <span className="text-slate-400">Latensi Jaringan</span>
                    <span className="text-slate-200 font-bold">{selectedNode.qos?.latency_ms ?? 0} ms</span>
                  </div>
                  <div className="flex justify-between border-b border-darkBorder/30 pb-1.5">
                    <span className="text-slate-400">Packet Loss</span>
                    <span className="text-slate-200 font-bold">{selectedNode.qos?.packet_loss_percent ?? 0} %</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Kondisi Jaringan</span>
                    <span className="text-[10px] font-bold text-emerald-400">{selectedNode.qos?.network_status ?? 'UNKNOWN'}</span>
                  </div>
                </div>
              </div>
              <div className="border-t border-darkBorder/40 pt-2 text-[10px] text-slate-500 font-sans">
                ID: <b>{selectedNode.node_id}</b> | {selectedNode.city}
              </div>
            </div>

            <div className="lg:col-span-3 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-darkCard border border-darkBorder rounded-2xl p-4 flex flex-col justify-between shadow-lg">
                <div className="flex justify-between items-center mb-2">
                  <div className="flex items-center gap-2 font-sans">
                    <Thermometer className="w-4 h-4 text-amber-500" />
                    <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Tren Suhu & Humid</h4>
                  </div>
                </div>
                <div className="h-28 w-full mt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <XAxis dataKey="name" hide />
                      <YAxis hide domain={['dataMin - 5', 'dataMax + 5']} />
                      <Tooltip contentStyle={{ backgroundColor: '#111a2e', borderColor: '#1e293b' }} />
                      <Line type="monotone" dataKey="temp" stroke="#f59e0b" strokeWidth={2.5} dot={{ r: 3 }} name="Suhu (°C)" />
                      <Line type="monotone" dataKey="hum" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 3 }} name="Humid (%)" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-darkCard border border-darkBorder rounded-2xl p-4 flex flex-col items-center justify-between text-center shadow-lg">
                <div className="flex items-center gap-2 w-full text-left font-sans">
                  <Flame className="w-4 h-4 text-rose-500" />
                  <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Detektor Api</h4>
                </div>
                <div className={\`w-16 h-16 rounded-full flex flex-col items-center justify-center font-bold font-mono text-xs border transition-all duration-300 \${
                  selectedNode.fire_detected || selectedNode.status === 'CRITICAL' ? 'bg-rose-500/20 text-rose-500 border-rose-500/50 animate-pulse' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                }\`}>
                  <span className="text-lg">🔥</span>
                  <span className="text-[10px] mt-0.5">{selectedNode.fire_detected || selectedNode.status === 'CRITICAL' ? 'API!!' : 'AMAN'}</span>
                </div>
                <span className="text-[10px] font-mono text-slate-400 truncate max-w-full">{selectedNode.district}</span>
              </div>

              <div className="bg-darkCard border border-darkBorder rounded-2xl p-4 flex flex-col justify-between shadow-lg">
                <div className="flex items-center gap-2 font-sans">
                  <Wind className="w-4 h-4 text-sky-400" />
                  <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Kerapatan Asap</h4>
                </div>
                <div className="my-2">
                  <p className="text-3xl font-black font-mono text-slate-100">{selectedNode.smoke_level} <span className="text-xs font-normal text-slate-400">ppm</span></p>
                  <span className={\`text-[10px] px-2 py-0.5 rounded-md font-bold uppercase font-mono tracking-wider inline-block mt-1 \${
                    selectedNode.smoke_level > 250 ? 'bg-rose-500/10 text-rose-400' : 'bg-sky-500/10 text-sky-400'
                  }\`}>
                    {selectedNode.smoke_level > 250 ? 'PEKAT / BAHAYA' : 'BERSIH'}
                  </span>
                </div>
                <p className="text-[9px] text-slate-500 font-mono text-right">Update: {selectedNode.timestamp}</p>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
`
};

console.log('🏗️ Membuat struktur project Frontend WANARA...');
Object.entries(frontendStructure).forEach(([filePath, content]) => {
  const fullPath = path.join(process.cwd(), filePath);
  const dir = path.dirname(fullPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(fullPath, content.trim(), 'utf8');
  console.log(`✅ File Sukses Terbuat: ${filePath}`);
});
console.log('\n🚀 Semua komponen frontend siap dijalankan!');