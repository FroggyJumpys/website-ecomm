import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../app.js';

describe('GET /api/v1/health', () => {
  it('reports the service as healthy without touching the database', async () => {
    const response = await request(app).get('/api/v1/health');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: 'ok', service: 'server' });
    expect(response.body.timestamp).toBeTypeOf('string');
  });
});

describe('unknown routes', () => {
  it('returns the standard error shape with a 404', async () => {
    const response = await request(app).get('/api/v1/does-not-exist');

    expect(response.status).toBe(404);
    expect(response.body.error).toMatchObject({ code: 'NOT_FOUND' });
  });
});
