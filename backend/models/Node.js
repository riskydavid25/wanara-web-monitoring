import mongoose from 'mongoose';
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
export const Node = mongoose.model('Node', nodeSchema);