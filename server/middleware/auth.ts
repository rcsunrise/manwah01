import { Response, NextFunction } from 'express';
import { supabaseAdmin } from '../../src/lib/supabase';
import { AuthenticatedRequest, AuthenticatedUser, AppError } from '../types';

export async function authenticateToken(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
    if (!token) {
      return next(new AppError('未提供有效的登录凭证', 401, 'UNAUTHORIZED'));
    }

    const { data, error } = await supabaseAdmin.auth.getUser(token);
    const user = data?.user;
    if (error || !user) {
      return next(new AppError('登录凭证无效或已过期', 401, 'INVALID_TOKEN'));
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('role, dept_id')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return next(new AppError('用户资料不存在或不可用', 403, 'PROFILE_REQUIRED'));
    }

    const allowedRoles = new Set(['user', 'dept_admin', 'admin']);
    const role = allowedRoles.has(profile.role) ? profile.role : 'user';
    const authUser: AuthenticatedUser = {
      id: user.id,
      email: user.email,
      role,
      departmentId: profile.dept_id || undefined
    };

    req.user = authUser;
    return next();
  } catch (err) {
    next(err);
  }
}

export async function optionalAuthenticateToken(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
    if (token) {
      const { data } = await supabaseAdmin.auth.getUser(token);
      const user = data?.user;
      if (user) {
        const { data: profile, error: profileError } = await supabaseAdmin
          .from('profiles')
          .select('role, dept_id')
          .eq('id', user.id)
          .single();

        if (!profileError && profile) {
          const allowedRoles = new Set(['user', 'dept_admin', 'admin']);
          req.user = {
            id: user.id,
            email: user.email,
            role: allowedRoles.has(profile.role) ? profile.role : 'user',
            departmentId: profile.dept_id || undefined
          };
        } else {
          req.user = {
            id: user.id,
            email: user.email,
            role: 'user'
          };
        }
      }
    }
    if (!req.user) {
      req.user = {
        id: 'demo-user-123',
        email: 'demo@manwah.com',
        role: 'user'
      };
    }
    next();
  } catch {
    if (!req.user) {
      req.user = {
        id: 'demo-user-123',
        email: 'demo@manwah.com',
        role: 'user'
      };
    }
    next();
  }
}
