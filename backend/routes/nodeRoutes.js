import express from 'express';
import { getNodes, getNodeById, getStats } from '../controllers/nodeController.js';
const router = express.Router();
router.get('/', getNodes);
router.get('/stats', getStats);
router.get('/:id', getNodeById);
export default router;