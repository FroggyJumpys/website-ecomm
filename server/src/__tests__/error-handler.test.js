import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { errorHandler } from '../middleware/error-handler.js';
import { AppError } from '../lib/errors.js';

function appThrowing(error) {
  const app = express();
  app.get('/boom', () => {
    throw error;
  });
  app.use(errorHandler);
  return app;
}

describe('errorHandler', () => {
  it('renders an AppError with its status, code and details', async () => {
    const response = await request(
      appThrowing(new AppError(409, 'EMAIL_TAKEN', 'Email ini sudah terdaftar.', { field: 'email' }))
    ).get('/boom');

    expect(response.status).toBe(409);
    expect(response.body.error).toEqual({
      code: 'EMAIL_TAKEN',
      message: 'Email ini sudah terdaftar.',
      details: { field: 'email' },
    });
  });

  it('does not expose a raw database SQLSTATE as the public error code', async () => {
    const databaseError = Object.assign(new Error('duplicate key value violates unique constraint'), {
      code: '23505',
      severity: 'ERROR',
      constraint: 'tbl_pengguna_email_key',
    });

    const response = await request(appThrowing(databaseError)).get('/boom');

    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe('INTERNAL_ERROR');
    expect(response.body.error.message).not.toContain('unique constraint');
  });

  it('never echoes a raw SQLSTATE in production', async () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    try {
      const databaseError = Object.assign(new Error('relation "x" does not exist'), {
        code: '42P01',
      });
      const response = await request(appThrowing(databaseError)).get('/boom');

      expect(response.status).toBe(500);
      expect(response.body.error.code).toBe('INTERNAL_ERROR');
      expect(response.body.error.message).not.toContain('does not exist');
    } finally {
      process.env.NODE_ENV = previous;
    }
  });
});
