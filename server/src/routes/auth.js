import { Router } from 'express';
import {
  getMe,
  postLogin,
  postLogout,
  postRegister,
} from '../controllers/auth.js';
import { requireAuth } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rate-limit.js';
import { validateBody } from '../middleware/validate.js';
import { loginSchema, registerSchema } from '../validators/auth.js';

const router = Router();

router.post('/register', authLimiter, validateBody(registerSchema), postRegister);
router.post('/login', authLimiter, validateBody(loginSchema), postLogin);
router.post('/logout', postLogout);
router.get('/me', requireAuth, getMe);

export default router;
