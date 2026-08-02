import { Response, NextFunction } from 'express';
import { AuthenticatedRequest, AppError } from '../types';

export function requireRole(allowedRoles: Array<'user' | 'dept_admin' | 'admin'>) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError('未登录或未验证身份', 401, 'UNAUTHORIZED'));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(new AppError('权限不足，无法访问该资源', 403, 'FORBIDDEN'));
    }

    next();
  };
}

export const requireAdmin = requireRole(['admin']);
export const requireAdminOrDeptAdmin = requireRole(['admin', 'dept_admin']);
