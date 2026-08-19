import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  single: vi.fn()
}));

vi.mock('../src/lib/supabase', () => ({
  supabaseAdmin: {
    auth: { getUser: mocks.getUser },
    from: mocks.from
  }
}));

import { authenticateToken } from '../server/middleware/auth';
import { AppError } from '../server/types';

async function runMiddleware(req: any) {
  let nextError: any;
  let nextCalled = false;
  await authenticateToken(req, {} as any, (error?: any) => {
    nextError = error;
    nextCalled = !error;
  });
  return { nextError, nextCalled };
}

describe('P0 authentication security', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.from.mockReturnValue({ select: mocks.select });
    mocks.select.mockReturnValue({ eq: mocks.eq });
    mocks.eq.mockReturnValue({ single: mocks.single });
  });

  it('rejects a request without a Bearer token', async () => {
    const result = await runMiddleware({ headers: {} });

    expect(result.nextError).toBeInstanceOf(AppError);
    expect(result.nextError.statusCode).toBe(401);
    expect(result.nextError.errorCode).toBe('UNAUTHORIZED');
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it('does not trust a spoofed x-user-id header', async () => {
    const req = {
      headers: { 'x-user-id': 'victim-user-id' },
      user: { id: 'victim-user-id', role: 'admin' }
    };

    const result = await runMiddleware(req);

    expect(result.nextError).toBeInstanceOf(AppError);
    expect(result.nextError.statusCode).toBe(401);
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it('rejects an invalid or expired token', async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: null },
      error: new Error('invalid token')
    });

    const result = await runMiddleware({
      headers: { authorization: 'Bearer invalid-token' }
    });

    expect(result.nextError).toBeInstanceOf(AppError);
    expect(result.nextError.statusCode).toBe(401);
    expect(result.nextError.errorCode).toBe('INVALID_TOKEN');
  });

  it('rejects an authenticated account without a profile', async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'user@example.com' } },
      error: null
    });
    mocks.single.mockResolvedValue({
      data: null,
      error: new Error('profile missing')
    });

    const result = await runMiddleware({
      headers: { authorization: 'Bearer valid-token' }
    });

    expect(result.nextError).toBeInstanceOf(AppError);
    expect(result.nextError.statusCode).toBe(403);
    expect(result.nextError.errorCode).toBe('PROFILE_REQUIRED');
  });

  it('uses only the server-side profile role for authorization', async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'user@example.com' } },
      error: null
    });
    mocks.single.mockResolvedValue({
      data: { role: 'dept_admin', dept_id: 'dept-1' },
      error: null
    });
    const req: any = {
      headers: {
        authorization: 'Bearer valid-token',
        'x-user-id': 'attacker-controlled-id'
      }
    };

    const result = await runMiddleware(req);

    expect(result.nextError).toBeUndefined();
    expect(result.nextCalled).toBe(true);
    expect(req.user).toEqual({
      id: 'user-1',
      email: 'user@example.com',
      role: 'dept_admin',
      departmentId: 'dept-1'
    });
  });

  it('falls back to the least-privileged role for an unknown profile role', async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'user@example.com' } },
      error: null
    });
    mocks.single.mockResolvedValue({
      data: { role: 'unexpected-role', dept_id: null },
      error: null
    });
    const req: any = { headers: { authorization: 'Bearer valid-token' } };

    const result = await runMiddleware(req);

    expect(result.nextCalled).toBe(true);
    expect(req.user.role).toBe('user');
  });
});
