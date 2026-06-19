import { Node } from '../models/Node.js';
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
};