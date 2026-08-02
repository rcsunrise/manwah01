import { describe, it, expect, vi } from 'vitest';
import { requireRole } from '../server/middleware/roleGuard';
import { errorHandler } from '../server/middleware/errorHandler';
import { AppError } from '../server/types';

describe('Server Middleware Tests', () => {
  describe('roleGuard Middleware', () => {
    it('should block unauthenticated requests with 401', () => {
      const middleware = requireRole(['admin']);
      const req: any = {};
      const res: any = {};
      let error: any = null;
      const next = (err?: any) => { error = err; };

      middleware(req, res, next);
      expect(error).toBeInstanceOf(AppError);
      expect(error.statusCode).toBe(401);
    });

    it('should block user with insufficient role with 403', () => {
      const middleware = requireRole(['admin']);
      const req: any = { user: { role: 'user' } };
      const res: any = {};
      let error: any = null;
      const next = (err?: any) => { error = err; };

      middleware(req, res, next);
      expect(error).toBeInstanceOf(AppError);
      expect(error.statusCode).toBe(403);
    });

    it('should allow user with matching role', () => {
      const middleware = requireRole(['admin', 'dept_admin']);
      const req: any = { user: { role: 'dept_admin' } };
      const res: any = {};
      let nextCalled = false;
      let error: any = null;
      const next = (err?: any) => {
        if (err) error = err;
        else nextCalled = true;
      };

      middleware(req, res, next);
      expect(error).toBeNull();
      expect(nextCalled).toBe(true);
    });
  });

  describe('errorHandler Middleware', () => {
    it('should format AppError into structured JSON', () => {
      const err = new AppError('权限不足', 403, 'FORBIDDEN', { role: 'user' });
      const req: any = { headers: {} };
      let responseStatus = 0;
      let responseJson: any = null;
      const res: any = {
        status: (code: number) => {
          responseStatus = code;
          return res;
        },
        json: (data: any) => {
          responseJson = data;
          return res;
        }
      };
      const next = vi.fn();

      errorHandler(err, req, res, next);

      expect(responseStatus).toBe(403);
      expect(responseJson.error.code).toBe('FORBIDDEN');
      expect(responseJson.error.message).toBe('权限不足');
      expect(responseJson.error.requestId).toBeDefined();
    });
  });
});
