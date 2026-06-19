import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Flame, Thermometer, Wind, Cpu, ShieldAlert, ListFilter } from 'lucide-react';
import 'leaflet/dist/leaflet.css';

const BACKEND_URL = 'http://localhost:5000';

function RecenterMap({ lat, lng }) {
  const map = useMap();
  useEffect(() => {
    if (lat && lng) {
      map.setView([lat, lng], 6);
    }
  }, [lat, lng, map]);
  return null;
}

function MinimalGauge({ value, min = 0, max = 100, label = "", unit = "", color = "#10b981", type = "semi", isOffline = false }) {
  const displayValue = isOffline ? "--" : value;
  const percentage = isOffline ? 0 : Math.min(Math.max((value - min) / (max - min), 0), 1);
  const strokeColor = isOffline ? "#334155" : color;

  if (type === "semi") {
    const radius = 50;
    const circumference = Math.PI * radius;
    const strokeDashoffset = circumference - (percentage * circumference);
    return (
      <div className="flex flex-col items-center justify-center p-1 w-full min-w-[110px]">
        <svg width="110" height="60" viewBox="0 0 120 70" className="overflow-visible">
          <path d="M 10 65 A 50 50 0 0 1 110 65" fill="none" stroke="#1e293b" strokeWidth="10" strokeLinecap="round" />
          <path d="M 10 65 A 50 50 0 0 1 110 65" fill="none" stroke={strokeColor} strokeWidth="10" strokeLinecap="round"
            strokeDasharray={circumference} strokeDashoffset={strokeDashoffset} className="transition-all duration-700 ease-out" />
        </svg>
        <div className="-mt-2 text-center">
          <p className="text-xl font-extrabold tracking-tight text-slate-100 font-sans">
            {displayValue}<span className="text-xs font-normal text-slate-400"> {!isOffline && unit}</span>
          </p>
          <p className="text-[10px] text-slate-400 font-medium tracking-wide uppercase mt-0.5">{label}</p>
        </div>
      </div>
    );
  } else {
    const radius = 45;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (percentage * circumference);
    return (
      <div className="relative w-24 h-24 flex items-center justify-center">
        <svg width="100" height="100" viewBox="0 0 110 110" className="transform -rotate-90">
          <circle cx="55" cy="55" r={radius} fill="none" stroke="#1e293b" strokeWidth="10" />
          <circle cx="55" cy="55" r={radius} fill="none" stroke={strokeColor} strokeWidth="10" strokeLinecap="round"
            strokeDasharray={circumference} strokeDashoffset={strokeDashoffset} className="transition-all duration-700 ease-out" />
        </svg>
        <div className="absolute text-center">
          <p className="text-2xl font-black text-slate-100 tracking-tight font-sans">{displayValue}</p>
          <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">{!isOffline ? unit : 'OFFLINE'}</p>
        </div>
      </div>
    );
  }
}

// ─────────────────────────────────────────────
// HELPERS — ikut persis field `status` dari simulator Python
// ─────────────────────────────────────────────

// Nomor numerik node untuk sorting
const getNodeNumber = (nodeId) => {
  if (!nodeId) return 9999;
  const match = nodeId.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : 9999;
};

const sortNodesNumerically = (arr) =>
  [...arr].sort((a, b) => getNodeNumber(a.node_id) - getNodeNumber(b.node_id));

/**
 * STATUS KONEKSI — 2 nilai saja: ONLINE | OFFLINE
 * Node dianggap OFFLINE jika field status === 'OFFLINE'
 * atau memang tidak ada data (node belum pernah kirim).
 */
const getConnectionStatus = (node) => {
  if (!node || node.status === 'OFFLINE') return 'OFFLINE';
  return 'ONLINE';
};

/**
 * KONDISI SENSOR — 3 nilai (hanya bermakna jika ONLINE):
 *   NORMAL     → status === 'NORMAL'
 *   WARNING    → status === 'WARNING'  (anomaly_score ≥ 0.65 dari simulator)
 *   KEBAKARAN  → status === 'FIRE_ALERT' atau fire_detected === true
 *
 * Mengembalikan null jika node OFFLINE (tidak ditampilkan).
 */
const getSensorCondition = (node) => {
  if (!node || node.status === 'OFFLINE') return null;
  if (node.status === 'FIRE_ALERT' || node.fire_detected) return 'KEBAKARAN';
  if (node.status === 'WARNING') return 'WARNING';
  return 'NORMAL';
};

/**
 * WARNA marker & badge berdasarkan kondisi sensor.
 * OFFLINE  → abu  #64748b
 * NORMAL   → hijau #10b981
 * WARNING  → kuning #f59e0b
 * KEBAKARAN→ merah #ef4444
 */
const getConditionColor = (node) => {
  if (getConnectionStatus(node) === 'OFFLINE') return '#64748b';
  const cond = getSensorCondition(node);
  if (cond === 'KEBAKARAN') return '#ef4444';
  if (cond === 'WARNING')   return '#f59e0b';
  return '#10b981';
};

// Style badge kondisi untuk popup & list
const conditionBadgeClass = (cond) => {
  if (!cond) return 'bg-slate-800 text-slate-500';
  if (cond === 'KEBAKARAN') return 'bg-rose-500/20 text-rose-400 border border-rose-500/40 animate-pulse';
  if (cond === 'WARNING')   return 'bg-amber-500/20 text-amber-400 border border-amber-500/40';
  return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
};

// Style badge untuk node list (label ringkas)
const listBadgeClass = (node) => {
  if (getConnectionStatus(node) === 'OFFLINE') return 'bg-slate-800 text-slate-400';
  const cond = getSensorCondition(node);
  if (cond === 'KEBAKARAN') return 'bg-rose-500/10 text-rose-400';
  if (cond === 'WARNING')   return 'bg-amber-500/10 text-amber-400';
  return 'bg-emerald-500/10 text-emerald-400';
};

const listBadgeLabel = (node) => {
  if (getConnectionStatus(node) === 'OFFLINE') return 'OFF';
  const cond = getSensorCondition(node);
  if (cond === 'KEBAKARAN') return 'FIRE';
  if (cond === 'WARNING')   return 'WARN';
  return 'OK';
};

// Dot warna di node list
const dotClass = (node) => {
  if (getConnectionStatus(node) === 'OFFLINE') return 'bg-slate-600';
  const cond = getSensorCondition(node);
  if (cond === 'KEBAKARAN') return 'bg-rose-500 animate-pulse';
  if (cond === 'WARNING')   return 'bg-amber-400 animate-pulse';
  return 'bg-emerald-400';
};

export default function App() {
  const [nodes, setNodes]             = useState([]);
  const [selectedNode, setSelectedNode] = useState(null);
  const [stats, setStats]             = useState({ total: 0, online: 0, offline: 0, warning: 0 });
  const [logs, setLogs]               = useState([]);
  const [currentTime, setCurrentTime] = useState('');

  const formatFullTimestamp = (dateObj = new Date()) => {
    const d = String(dateObj.getDate()).padStart(2, '0');
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const y = dateObj.getFullYear();
    const t = dateObj.toLocaleTimeString('en-US', { hour12: false });
    return `${d}/${m}/${y} ${t} WIB`;
  };

  // Clock
  useEffect(() => {
    const tick = () => setCurrentTime(formatFullTimestamp());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // Statistik header — dihitung dari kondisi sensor
  useEffect(() => {
    if (nodes.length === 0) return;
    const total   = nodes.length;
    const offline = nodes.filter(n => getConnectionStatus(n) === 'OFFLINE').length;
    // Warning header = WARNING + KEBAKARAN (semua yang tidak normal & tidak offline)
    const warning = nodes.filter(n => {
      const c = getSensorCondition(n);
      return c === 'WARNING' || c === 'KEBAKARAN';
    }).length;
    const online  = total - offline;
    setStats({ total, online, offline, warning });
  }, [nodes]);

  // Fetch + Socket
  useEffect(() => {
    const fetchLatest = async () => {
      try {
        const res  = await fetch(`${BACKEND_URL}/api/sensor-data/latest`);
        const json = await res.json();
        const flat = json.map(item => ({
          ...item.data,
          formatted_time: item.data.timestamp || formatFullTimestamp()
        }));
        const sorted = sortNodesNumerically(flat);
        setNodes(sorted);
        if (sorted.length > 0) setSelectedNode(sorted[0]);
      } catch (err) {
        console.error('Gagal memuat REST API:', err);
      }
    };
    fetchLatest();

    const socket = io(BACKEND_URL);
    socket.on('new-data', (payload) => {
      if (!payload || !payload.node_id) return;
      const enriched = { ...payload, formatted_time: formatFullTimestamp() };

      setNodes(prev => {
        const idx = prev.findIndex(n => n.node_id === payload.node_id);
        const updated = idx !== -1
          ? prev.map((n, i) => i === idx ? enriched : n)
          : [...prev, enriched];
        return sortNodesNumerically(updated);
      });

      setSelectedNode(cur =>
        cur && cur.node_id === payload.node_id ? enriched : cur
      );

      setLogs(prev => [enriched, ...prev.slice(0, 29)]);
    });

    return () => socket.disconnect();
  }, []);

  const handleStatCardClick = (category) => {
    let target = null;
    if (category === 'online')  target = nodes.find(n => getConnectionStatus(n) === 'ONLINE');
    if (category === 'offline') target = nodes.find(n => getConnectionStatus(n) === 'OFFLINE');
    if (category === 'warning') target = nodes.find(n => {
      const c = getSensorCondition(n);
      return c === 'WARNING' || c === 'KEBAKARAN';
    });
    if (target) setSelectedNode(target);
  };

  const getMarkerIcon = (node) => {
    const color     = getConditionColor(node);
    const isOffline = getConnectionStatus(node) === 'OFFLINE';
    return L.divIcon({
      className: 'custom-marker',
      html: `<div class="relative flex items-center justify-center">
        <span class="absolute inline-flex h-4 w-4 rounded-full ${!isOffline ? 'animate-ping' : ''} opacity-75" style="background-color:${color};"></span>
        <span class="relative inline-flex rounded-full h-3 w-3 border border-slate-950" style="background-color:${color};"></span>
      </div>`,
      iconSize: [16, 16],
      iconAnchor: [8, 8]
    });
  };

  const isNodeOffline = getConnectionStatus(selectedNode) === 'OFFLINE';

  // Warna gauge asap berdasarkan kondisi
  const smokeGaugeColor = () => {
    if (!selectedNode || isNodeOffline) return '#22d3ee';
    const cond = getSensorCondition(selectedNode);
    if (cond === 'KEBAKARAN') return '#ef4444';
    if (cond === 'WARNING')   return '#f59e0b';
    return '#22d3ee';
  };

  // Label badge asap
  const smokeBadge = () => {
    if (!selectedNode || isNodeOffline) return { text: 'STATUS TIDAK TERSEDIA', cls: 'bg-slate-800 text-slate-500' };
    const cond = getSensorCondition(selectedNode);
    if (cond === 'KEBAKARAN') return { text: 'BAHAYA — ASAP PEKAT', cls: 'bg-rose-500/10 text-rose-400' };
    if (cond === 'WARNING')   return { text: 'WASPADA ASAP', cls: 'bg-amber-500/10 text-amber-400' };
    return { text: 'BERSIH / NORMAL', cls: 'bg-sky-500/10 text-sky-400' };
  };

  // Label & warna panel DATA API
  const firePanel = () => {
    if (!selectedNode || isNodeOffline) return { icon: '✖', textCls: 'text-slate-500', bgCls: 'bg-slate-800 text-slate-500', label: 'N/A' };
    const cond = getSensorCondition(selectedNode);
    if (cond === 'KEBAKARAN') return { icon: <ShieldAlert className="w-7 h-7" />, textCls: 'text-rose-500', bgCls: 'bg-rose-500/20 text-rose-500 scale-110', label: 'KEBAKARAN' };
    if (cond === 'WARNING')   return { icon: '⚠', textCls: 'text-amber-400', bgCls: 'bg-amber-500/20 text-amber-400', label: 'WASPADA' };
    return { icon: '✓', textCls: 'text-emerald-400', bgCls: 'bg-emerald-500/10 text-emerald-400', label: 'AMAN' };
  };

  // Badge status di tabel log
  const logBadge = (log) => {
    const conn = getConnectionStatus(log);
    if (conn === 'OFFLINE') return { text: 'OFFLINE', cls: 'bg-slate-800 text-slate-400 border border-slate-700/50' };
    const cond = getSensorCondition(log);
    if (cond === 'KEBAKARAN') return { text: 'KEBAKARAN', cls: 'bg-rose-950 text-rose-400 border border-rose-500/30 animate-pulse' };
    if (cond === 'WARNING')   return { text: 'WARNING',   cls: 'bg-amber-950 text-amber-400 border border-amber-500/30' };
    return { text: 'NORMAL', cls: 'bg-emerald-950 text-emerald-400 border border-emerald-500/30' };
  };

  const smoke = smokeBadge();
  const fire  = firePanel();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col antialiased selection:bg-rose-500/30 p-4 gap-4">

      {/* ─── HEADER ─── */}
      <header className="bg-slate-900/90 backdrop-blur-md border border-slate-800/80 px-6 py-3 flex items-center justify-between rounded-2xl shadow-xl">
        <div className="flex items-center gap-3.5">
          <div className="bg-gradient-to-br from-rose-500 to-amber-500 p-2 rounded-xl shadow-lg shadow-rose-500/10">
            <Flame className="w-6 h-6 text-slate-950 stroke-[2.5]" />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tighter bg-gradient-to-r from-slate-100 via-rose-400 to-amber-400 bg-clip-text text-transparent font-sans leading-none">
              WANARA <span className="font-light tracking-normal text-slate-400 text-lg ml-1">FOREST IOT MONITOR</span>
            </h1>
            <p className="text-[10px] text-slate-400 font-semibold tracking-widest uppercase mt-1">Sistem Deteksi Dini Kebakaran Hutan Real-time</p>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-4">
          <div className="flex items-center gap-4 bg-slate-950/80 px-4 py-1.5 rounded-xl border border-slate-800/80 shadow-inner">
            <div className="text-center px-1">
              <p className="text-[10px] text-slate-500 font-bold uppercase">Total Node</p>
              <p className="text-base font-black text-slate-300 mt-0.5">{stats.total}</p>
            </div>
            <div className="w-px h-6 bg-slate-800" />
            <button onClick={() => handleStatCardClick('online')} className="text-center px-2 hover:bg-slate-900/60 p-1 rounded-lg transition-colors cursor-pointer group">
              <p className="text-[10px] text-emerald-400 font-bold uppercase group-hover:underline">🟢 Online</p>
              <p className="text-base font-black text-emerald-400 mt-0.5">{stats.online}</p>
            </button>
            <div className="w-px h-6 bg-slate-800" />
            <button onClick={() => handleStatCardClick('offline')} className="text-center px-2 hover:bg-slate-900/60 p-1 rounded-lg transition-colors cursor-pointer group">
              <p className="text-[10px] text-slate-400 font-bold uppercase group-hover:underline">⚪ Offline</p>
              <p className="text-base font-black text-slate-400 mt-0.5">{stats.offline}</p>
            </button>
            <div className="w-px h-6 bg-slate-800" />
            <button onClick={() => handleStatCardClick('warning')} className="text-center px-2 hover:bg-slate-900/60 p-1 rounded-lg transition-colors cursor-pointer group">
              <p className="text-[10px] text-amber-400 font-bold uppercase group-hover:underline">⚠️ Warning</p>
              <p className="text-base font-black text-amber-400 mt-0.5">{stats.warning}</p>
            </button>
          </div>
          <div className="bg-slate-950/80 border border-slate-800 text-slate-200 font-mono font-bold px-4 py-2 rounded-xl text-xs tracking-wider shadow-inner">
            {currentTime || '01/01/2026 00:00:00 WIB'}
          </div>
        </div>
      </header>

      {/* ─── MAP + NODE LIST ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-3 bg-slate-900 border border-slate-800/80 rounded-2xl h-[380px] overflow-hidden relative shadow-lg">
          <MapContainer center={[-0.7893, 113.9213]} zoom={5} style={{ height: "100%", width: "100%" }}>
            <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
            {nodes.map(n => {
              const connStatus = getConnectionStatus(n);
              const sensorCond = getSensorCondition(n);
              return (
                <Marker
                  key={n.node_id}
                  position={[n.latitude, n.longitude]}
                  icon={getMarkerIcon(n)}
                  eventHandlers={{ click: () => setSelectedNode(n) }}
                >
                  <Popup>
                    <div className="bg-slate-900 text-slate-100 p-3.5 rounded-xl border border-slate-800 w-[240px] shadow-2xl font-sans">
                      <div className="border-b border-slate-800 pb-2 mb-2">
                        <h4 className="text-sm font-bold text-slate-100 tracking-tight">
                          {n.node_name || n.node_id?.replace('node_', 'Node ')}{' '}
                          <span className="text-xs text-amber-400 font-medium">({n.province})</span>
                        </h4>
                        <p className="text-[11px] text-slate-400 mt-0.5">{n.forest_name || 'Hutan Konservasi'}</p>
                      </div>
                      <div className="space-y-1.5 text-xs">
                        <div className="flex justify-between">
                          <span className="text-slate-400">Suhu:</span>
                          <span className="text-amber-400 font-bold">{connStatus === 'OFFLINE' ? '--' : `${n.temperature}°C`}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Kelembapan:</span>
                          <span className="text-blue-400 font-bold">{connStatus === 'OFFLINE' ? '--' : `${n.humidity}%`}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Kadar Asap:</span>
                          <span className="text-sky-400 font-bold">{connStatus === 'OFFLINE' ? '--' : `${n.smoke_level || 0} ppm`}</span>
                        </div>

                        {/* STATUS: ONLINE / OFFLINE */}
                        <div className="flex justify-between items-center pt-2 border-t border-slate-800 mt-1.5">
                          <span className="text-slate-500 text-[10px] font-semibold uppercase tracking-wide">Status</span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                            connStatus === 'OFFLINE'
                              ? 'bg-slate-800 text-slate-400'
                              : 'bg-emerald-500/20 text-emerald-400'
                          }`}>
                            {connStatus}
                          </span>
                        </div>

                        {/* KONDISI: NORMAL / WARNING / KEBAKARAN */}
                        <div className="flex justify-between items-center">
                          <span className="text-slate-500 text-[10px] font-semibold uppercase tracking-wide">Kondisi</span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${conditionBadgeClass(sensorCond)}`}>
                            {sensorCond ?? 'N/A'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </Popup>
                </Marker>
              );
            })}
            {selectedNode && <RecenterMap lat={selectedNode.latitude} lng={selectedNode.longitude} />}
          </MapContainer>
        </div>

        {/* NODE LIST — urut numerik Node 1–25 */}
        <div className="lg:col-span-1 bg-slate-900 border border-slate-800/80 rounded-2xl p-4 h-[380px] flex flex-col shadow-lg">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
            <span className="w-1.5 h-3 bg-rose-500 rounded-sm"></span> Daftar Perangkat Node
          </h2>
          <div className="overflow-y-auto flex-1 space-y-2 pr-1 custom-scrollbar">
            {nodes.map(n => {
              const isSelected = selectedNode?.node_id === n.node_id;
              return (
                <div
                  key={n.node_id}
                  onClick={() => setSelectedNode(n)}
                  className={`p-3 rounded-xl border transition-all duration-200 cursor-pointer flex justify-between items-center ${
                    isSelected
                      ? 'bg-slate-950 border-rose-500/50 ring-1 ring-rose-500/10'
                      : 'bg-slate-950/40 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="truncate max-w-[75%]">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${dotClass(n)}`} />
                      <span className="font-bold text-slate-200 font-sans tracking-tight text-xs">
                        {n.node_name || n.node_id?.replace('node_', 'Node ')}{' '}
                        <span className="text-slate-400 font-normal">- {n.province}</span>
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 truncate mt-0.5 pl-4">{n.forest_name || 'Hutan Konservasi'}</p>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded tracking-wide shrink-0 ${listBadgeClass(n)}`}>
                    {listBadgeLabel(n)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ─── SENSOR PANELS ─── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Suhu & Kelembapan */}
        <div className="bg-slate-900 border border-slate-800/80 rounded-2xl p-4 flex flex-col justify-between shadow-lg">
          <div className="flex items-center gap-2 mb-3 border-b border-slate-800 pb-2">
            <Thermometer className="w-4 h-4 text-amber-500" />
            <h3 className="font-bold text-slate-300 tracking-wide text-xs">DATA SUHU & KELEMBAPAN</h3>
          </div>
          <div className="flex flex-row gap-4 justify-center items-center flex-1 w-full py-1">
            <MinimalGauge value={selectedNode?.temperature ?? 0} min={0} max={70} label="Suhu" unit="°C" color="#f59e0b" type="semi" isOffline={!selectedNode || isNodeOffline} />
            <MinimalGauge value={selectedNode?.humidity ?? 0} min={0} max={100} label="Kelembapan" unit="%" color="#3b82f6" type="semi" isOffline={!selectedNode || isNodeOffline} />
          </div>
        </div>

        {/* Data API (kondisi kebakaran) */}
        <div className="bg-slate-900 border border-slate-800/80 rounded-2xl p-4 flex flex-col justify-between items-center shadow-lg">
          <div className="flex items-center gap-2 w-full border-b border-slate-800 pb-2">
            <Flame className="w-4 h-4 text-rose-500" />
            <h3 className="font-bold text-slate-300 tracking-wide text-xs">DATA API</h3>
          </div>
          <div className="flex flex-col items-center justify-center flex-1 py-2">
            <div className={`w-14 h-14 rounded-full flex items-center justify-center text-2xl mb-2 ${fire.bgCls}`}>
              {fire.icon}
            </div>
            <p className={`text-lg font-black font-sans tracking-wide ${fire.textCls}`}>{fire.label}</p>
          </div>
          <span className="text-[11px] text-slate-400 font-medium truncate max-w-full text-center">
            {selectedNode ? `${selectedNode.forest_name || 'Hutan Konservasi'} (${selectedNode.province})` : 'Menunggu Node...'}
          </span>
        </div>

        {/* Data Asap */}
        <div className="bg-slate-900 border border-slate-800/80 rounded-2xl p-4 flex flex-col justify-between items-center shadow-lg">
          <div className="flex items-center gap-2 w-full border-b border-slate-800 pb-2">
            <Wind className="w-4 h-4 text-sky-400" />
            <h3 className="font-bold text-slate-300 tracking-wide text-xs">DATA ASAP</h3>
          </div>
          <div className="flex flex-col items-center justify-center flex-1 py-1">
            <MinimalGauge
              value={selectedNode?.smoke_level ?? 0}
              min={0} max={1000}
              label="Kepadatan Asap" unit="ppm"
              color={smokeGaugeColor()}
              type="circular"
              isOffline={!selectedNode || isNodeOffline}
            />
          </div>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded mt-1 ${smoke.cls}`}>
            {smoke.text}
          </span>
        </div>

        {/* QoS */}
        <div className="bg-slate-900 border border-slate-800/80 rounded-2xl p-4 flex flex-col justify-between shadow-lg">
          <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
            <Cpu className="w-4 h-4 text-slate-400" />
            <h3 className="font-bold text-slate-300 tracking-wide text-xs">KUALITAS LAYANAN (QoS)</h3>
          </div>
          <div className="space-y-2 py-2 text-xs">
            <div className="flex justify-between border-b border-slate-800/40 pb-1">
              <span className="text-slate-400">Signal Strength</span>
              <span className={`font-bold ${!selectedNode || isNodeOffline ? 'text-slate-500' : 'text-emerald-400'}`}>
                {!selectedNode || isNodeOffline ? 'N/A' : `${selectedNode.qos?.signal_strength_dbm ?? -64} dBm`}
              </span>
            </div>
            <div className="flex justify-between border-b border-slate-800/40 pb-1">
              <span className="text-slate-400">Latency</span>
              <span className={`font-semibold ${!selectedNode || isNodeOffline ? 'text-slate-500' : 'text-slate-200'}`}>
                {!selectedNode || isNodeOffline ? 'N/A' : `${selectedNode.qos?.latency_ms ?? 55} ms`}
              </span>
            </div>
            <div className="flex justify-between border-b border-slate-800/40 pb-1">
              <span className="text-slate-400">Packet Loss</span>
              <span className={`font-semibold ${!selectedNode || isNodeOffline ? 'text-slate-500' : 'text-slate-200'}`}>
                {!selectedNode || isNodeOffline ? 'N/A' : `${selectedNode.qos?.packet_loss_percent ?? 1.55} %`}
              </span>
            </div>
          </div>
          <div className="border-t border-slate-800 pt-2 mt-1 flex flex-col gap-1 bg-slate-950/40 p-2 rounded-xl border border-slate-800/50">
            <div className="flex justify-between items-center">
              <span className="text-[10px] text-slate-400">Identifikasi:</span>
              <span className={`text-xs font-extrabold tracking-tight uppercase font-sans ${!selectedNode || isNodeOffline ? 'text-slate-500' : 'text-emerald-400'}`}>
                {selectedNode ? (selectedNode.node_name || selectedNode.node_id?.replace('node_', 'Node ')) : 'BELUM ADA NODE'}
              </span>
            </div>
            <div className="flex justify-between items-center text-[10px]">
              <span className="text-slate-500">Terakhir Diterima:</span>
              <span className="text-slate-300 font-mono font-medium tracking-tight text-[10px]">
                {!selectedNode || isNodeOffline ? '---' : (selectedNode.formatted_time || currentTime)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ─── LOG TELEMETRI (diperbesar) ─── */}
      <div className="w-full bg-slate-900 border border-slate-800 p-3 rounded-2xl shadow-inner">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <ListFilter className="w-3.5 h-3.5 text-blue-400 animate-pulse" />
            Log Aktivitas Telemetri Real-Time
          </h3>
          <span className="text-[9px] text-slate-500 font-mono">30 entri terakhir</span>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-800 max-h-72 overflow-y-auto custom-scrollbar">
          <table className="w-full text-left text-[11px] border-collapse">
            <thead className="bg-slate-950 text-slate-400 sticky top-0 z-10 text-[10px] font-bold border-b border-slate-800">
              <tr>
                <th className="p-2 pl-3 w-[175px]">Tanggal & Waktu</th>
                <th className="p-2">Node</th>
                <th className="p-2">Provinsi</th>
                <th className="p-2">Suhu</th>
                <th className="p-2">Kelembapan</th>
                <th className="p-2">Asap</th>
                <th className="p-2 text-center w-[105px]">Status</th>
                <th className="p-2 text-center pr-3 w-[115px]">Kondisi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/40 text-slate-300">
              {logs.length === 0 ? (
                <tr>
                  <td colSpan="8" className="text-center py-6 text-slate-500 italic text-[10px]">
                    Menunggu aliran data telemetri nirkabel...
                  </td>
                </tr>
              ) : (
                logs.map((log, index) => {
                  const isOff  = getConnectionStatus(log) === 'OFFLINE';
                  const cond   = getSensorCondition(log);

                  // Badge STATUS: ONLINE (hijau) / OFFLINE (abu)
                  const statusCls = isOff
                    ? 'bg-slate-800 text-slate-400 border border-slate-700/50'
                    : 'bg-emerald-950 text-emerald-400 border border-emerald-500/30';
                  const statusText = isOff ? 'OFFLINE' : 'ONLINE';

                  // Badge KONDISI: NORMAL / WARNING / KEBAKARAN / N/A
                  const kondisiCls = !cond
                    ? 'bg-slate-800 text-slate-500 border border-slate-700/30'
                    : cond === 'KEBAKARAN'
                      ? 'bg-rose-950 text-rose-400 border border-rose-500/30 animate-pulse'
                      : cond === 'WARNING'
                        ? 'bg-amber-950 text-amber-400 border border-amber-500/30'
                        : 'bg-sky-950 text-sky-400 border border-sky-500/20';
                  const kondisiText = cond ?? 'N/A';

                  return (
                    <tr key={log._id || index} className="hover:bg-slate-950/40 transition-colors">
                      <td className="p-1.5 font-mono text-slate-400 text-[10px] pl-3 whitespace-nowrap">
                        {log.formatted_time || currentTime}
                      </td>
                      <td className="p-1.5 font-bold text-rose-400 text-[11px]">
                        {log.node_name || log.node_id?.replace('node_', 'Node ')}
                      </td>
                      <td className="p-1.5 text-slate-400 text-[10px]">{log.province}</td>
                      <td className="p-1.5 text-slate-200">{isOff ? '--' : `${log.temperature ?? 0} °C`}</td>
                      <td className="p-1.5 text-slate-200">{isOff ? '--' : `${log.humidity ?? 0} %`}</td>
                      <td className="p-1.5 font-mono text-slate-400">{isOff ? '--' : `${log.smoke_level ?? 0} ppm`}</td>
                      {/* Kolom STATUS */}
                      <td className="p-1.5 text-center">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-black tracking-wide uppercase block text-center ${statusCls}`}>
                          {statusText}
                        </span>
                      </td>
                      {/* Kolom KONDISI */}
                      <td className="p-1.5 text-center pr-3">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-black tracking-wide uppercase block text-center ${kondisiCls}`}>
                          {kondisiText}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <style>{`
        .leaflet-popup-content-wrapper, .leaflet-popup-tip {
          background: transparent !important;
          box-shadow: none !important;
          border: none !important;
          padding: 0 !important;
        }
        .leaflet-popup-close-button { display: none !important; }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; height: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #0f172a; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #334155; border-radius: 2px; }
      `}</style>
    </div>
  );
}
