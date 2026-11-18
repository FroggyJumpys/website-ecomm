import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { parseBody, parseQuery } from '../lib/validation.js';

const schema = z.object({
  page: z.coerce.number().int().min(1, { message: 'Halaman minimal 1.' }),
});

describe('parseQuery', () => {
  it('returns the parsed value for valid input', () => {
    expect(parseQuery(schema, { page: '2' })).toEqual({ page: 2 });
  });

  it('throws a 422 with the field and message for invalid input', () => {
    expect(() => parseQuery(schema, { page: '0' })).toThrow(
      expect.objectContaining({
        status: 422,
        code: 'VALIDATION_ERROR',
        details: { field: 'page', message: 'Halaman minimal 1.' },
      })
    );
  });

  it('reports (root) for an issue with no field path', () => {
    const rootSchema = z.string().min(3, { message: 'Terlalu pendek.' });

    expect(() => parseQuery(rootSchema, 'ab')).toThrow(
      expect.objectContaining({ details: { field: '(root)', message: 'Terlalu pendek.' } })
    );
  });

  it('leaves parseBody behaviour unchanged', () => {
    expect(() => parseBody(schema, { page: '0' })).toThrow(
      expect.objectContaining({ details: { field: 'page', message: 'Halaman minimal 1.' } })
    );
  });
});
