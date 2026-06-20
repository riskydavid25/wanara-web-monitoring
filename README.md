# WANARA Forest IoT Monitor

## Sistem Deteksi Dini Kebakaran Hutan Real-Time

![Python](https://img.shields.io/badge/Python-3.x-blue.svg)
![MQTT](https://img.shields.io/badge/MQTT-Public%20Broker-green.svg)
![React](https://img.shields.io/badge/React-18.x-61DAFB.svg)
![MongoDB](https://img.shields.io/badge/MongoDB-6.x-47A248.svg)
![Node.js](https://img.shields.io/badge/Node.js-18.x-339933.svg)
![Status](https://img.shields.io/badge/Status-Active-brightgreen.svg)
![License](https://img.shields.io/badge/License-MIT-yellow.svg)

---

## 📋 Tentang Proyek

**WANARA Forest IoT Monitor** adalah platform monitoring berbasis Internet of Things (IoT) yang dirancang untuk mendukung deteksi dini potensi kebakaran hutan secara **real-time** di berbagai wilayah Indonesia.

Sistem mengintegrasikan perangkat node sensor lapangan dengan dashboard monitoring berbasis web untuk menampilkan kondisi lingkungan secara langsung, termasuk suhu, kelembapan, indikasi asap, lokasi node, dan kualitas layanan komunikasi (QoS).

---

## ✨ Fitur Dashboard

### 🗺️ Monitoring Peta Interaktif
- Visualisasi lokasi node pada peta Indonesia
- Pemantauan status node secara real-time
- Identifikasi wilayah pemantauan hutan

### 🌡️ Data Lingkungan
- Monitoring suhu udara
- Monitoring kelembapan udara
- Deteksi asap
- Status kondisi lingkungan (NORMAL, WARNING, FIRE_ALERT)

### 📡 Monitoring Node
- Daftar seluruh node yang terdaftar
- Status Online / Offline
- Informasi lokasi pemasangan node

### 📶 Quality of Service (QoS)
- Signal Strength (RSSI)
- Latency
- Packet Loss
- Status komunikasi perangkat

### 📝 Telemetry Log
- Riwayat data telemetri real-time
- Pencatatan aktivitas seluruh node
- Monitoring kondisi sensor secara historis

---

## 🏗️ Arsitektur Sistem

```
┌─────────────────┐
│   IoT Node      │
│    Sensor       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   MQTT Broker   │
│  (EMQX Public)  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Backend API   │
│   (Node.js)     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│     MongoDB     │
│    Database     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   WANARA        │
│   Dashboard     │
└─────────────────┘
```

---

## 📁 Struktur Proyek

```
wanara-web-monitoring/
├── backend/
│   ├── config/           # Konfigurasi database & MQTT
│   ├── controllers/      # Logic handler
│   ├── models/           # Skema database
│   ├── routes/           # Endpoint API
│   ├── services/         # Business logic
│   ├── sockets/          # WebSocket handling
│   ├── .env              # Environment variables
│   ├── package.json      # Dependencies
│   ├── package-lock.json
│   └── server.js         # Entry point backend
├── frontend/
│   ├── src/              # Source code React
│   ├── index.html        # HTML template
│   ├── package.json      # Dependencies
│   ├── package-lock.json
│   ├── postcss.config.js # PostCSS config
│   ├── setup.js          # Setup script
│   └── tailwind.config.js # Tailwind CSS config
├── .gitignore
├── README.md
└── setup.js
```

---

## 🛠️ Technology Stack

### Frontend
- **React** 18.x
- **Vite** - Build Tool
- **Tailwind CSS** - Styling
- **Leaflet Maps** - Interactive Maps

### Backend
- **Node.js** 18.x
- **Express.js** 4.x

### Database
- **MongoDB** 6.x

### Communication Protocol
- **MQTT** - IoT Data Streaming
- **WebSocket** - Real-time updates

---

## 🚀 Cara Menjalankan

### 1. Clone Repository
```bash
git clone https://github.com/riskydavid25/wanara-web-monitoring.git
cd wanara-web-monitoring
```

### 2. Setup Environment
```bash
# Copy environment example
cp backend/.env.example backend/.env

# Edit .env dengan konfigurasi Anda
# MONGODB_URI=mongodb://localhost:27017/wanara
# MQTT_BROKER=broker.emqx.io
# MQTT_PORT=1883
# PORT=5000
```

### 3. Install Dependencies
```bash
# Backend
cd backend
npm install

# Frontend
cd ../frontend
npm install
```

### 4. Jalankan Aplikasi
```bash
# Terminal 1 - Backend
cd backend
npm start

# Terminal 2 - Frontend
cd frontend
npm run dev
```

### 5. Akses Dashboard
Buka browser: `http://localhost:5173`

---

## 🔧 Konfigurasi

### Backend .env
```env
PORT=5000
MONGODB_URI=mongodb://localhost:27017/wanara
MQTT_BROKER=broker.emqx.io
MQTT_PORT=1883
JWT_SECRET=your_secret_key
```

### Frontend .env
```env
VITE_API_URL=http://localhost:5000
VITE_MQTT_BROKER=broker.emqx.io
VITE_MQTT_PORT=1883
```

---

## 📊 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/nodes` | Get all nodes |
| GET | `/api/nodes/:id` | Get node by ID |
| POST | `/api/nodes` | Add new node |
| PUT | `/api/nodes/:id` | Update node |
| DELETE | `/api/nodes/:id` | Delete node |
| GET | `/api/telemetry` | Get telemetry data |
| GET | `/api/telemetry/:nodeId` | Get telemetry by node |
| GET | `/api/dashboard/stats` | Get dashboard statistics |
| GET | `/api/qos` | Get QoS data |

---

## 📊 Data Model

### Node Schema
```javascript
{
  node_id: String,
  node_name: String,
  forest_name: String,
  latitude: Number,
  longitude: Number,
  district: String,
  city: String,
  province: String,
  status: String, // ONLINE, OFFLINE
  createdAt: Date,
  updatedAt: Date
}
```

### Telemetry Schema
```javascript
{
  node_id: String,
  temperature: Number,
  humidity: Number,
  fire_detected: Boolean,
  smoke_level: Number,
  status: String, // NORMAL, WARNING, FIRE_ALERT
  qos: {
    network_status: String, // GOOD, POOR
    signal_strength_dbm: Number,
    latency_ms: Number,
    packet_loss_percent: Number
  },
  timestamp: Date
}
```

---

## 🎯 Use Case

Sistem dapat digunakan untuk:

- 🔥 **Deteksi dini kebakaran hutan**
- 🌿 **Monitoring kawasan konservasi**
- 🏞️ **Monitoring taman nasional**
- 🌲 **Smart Forestry**
- 🌍 **Environmental Monitoring**

---

## 🐛 Troubleshooting

| Masalah | Solusi |
|---------|--------|
| **MQTT Connection Failed** | Pastikan internet terhubung, coba ganti broker |
| **MongoDB Connection Error** | Pastikan MongoDB berjalan: `mongod` |
| **Dashboard Tidak Muncul** | Jalankan frontend: `npm run dev` |
| **Data Tidak Muncul** | Cek koneksi backend dan database |
| **Port Already in Use** | Ganti PORT di .env |

---

## 🤝 Kontribusi

Silakan fork repository ini dan buat pull request untuk perbaikan atau penambahan fitur.

### Ide Pengembangan:
- [ ] Notifikasi Telegram/Email untuk FIRE_ALERT
- [ ] Export data ke CSV/Excel
- [ ] Prediksi AI untuk deteksi kebakaran
- [ ] Mobile app (React Native)
- [ ] Multi-user authentication
- [ ] Historical data analytics

---

## 📄 Lisensi

MIT License - Silakan gunakan dan modifikasi untuk keperluan pembelajaran dan penelitian.

---

## 👨‍💻 Author

**Risky David**

- **Email:** riskydavidkasyanto25@gmail.com
- **GitHub:** riskydavid25

---

**🌿 Jaga Hutan Kita, Cegah Kebakaran!**
