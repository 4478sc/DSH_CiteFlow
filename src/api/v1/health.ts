import { Router } from 'express';

const router = Router();

/**
 * GET /api/v1/health - 健康检查
 */
router.get('/', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

export default router;
