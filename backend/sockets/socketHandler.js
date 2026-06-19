import { Node } from '../models/Node.js';
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
};