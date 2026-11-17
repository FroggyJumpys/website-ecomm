import { Router } from 'express';
import { ping } from '../config/db.js';
import authRoutes from './auth.js';
import pkg from '../../package.json' with { type: 'json' };

const router = Router();

router.use('/auth', authRoutes);

/** Liveness: the process is up. Never touches the database. */
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: pkg.name,
    version: pkg.version,
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

/** Readiness: the process can reach PostgreSQL. */
router.get('/health/db', async (req, res) => {
  try {
    await ping();
    res.json({ status: 'ok', database: 'up' });
  } catch (error) {
    res.status(503).json({
      error: {
        code: 'DATABASE_UNAVAILABLE',
        message: 'Database is not reachable.',
        details: error.message,
      },
    });
  }
});

export default router;
