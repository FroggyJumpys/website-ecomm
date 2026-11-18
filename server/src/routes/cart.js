import { Router } from 'express';
import { createCartControllers } from '../controllers/cart.js';
import { createCartService } from '../services/cart.js';
import { createResolveCartOwner } from '../middleware/cart-owner.js';

/**
 * `/api/v1/cart`.
 *
 * Every route resolves an owner first: an account when the session cookie is
 * valid, otherwise a guest identified by its own cookie. There is no route here
 * that takes an owner id from the request.
 */
export function createCartRouter({ pool }) {
  const router = Router();
  const controllers = createCartControllers(createCartService(pool));

  router.use(createResolveCartOwner(pool));

  router.get('/', controllers.index);
  router.delete('/', controllers.clear);

  router.post('/items', controllers.add);
  router.patch('/items/:id', controllers.updateQuantity);
  router.delete('/items/:id', controllers.remove);

  return router;
}
