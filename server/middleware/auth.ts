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
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const { data, error } = await supabaseAdmin.auth.getUser(token);
      const user = data?.user;

      if (!error && user) {
        const { data: profile } = await supabaseAdmin
          .from('profiles')
          .select('role, dept_id')
          .eq('id', user.id)
          .single();

        const authUser: AuthenticatedUser = {
          id: user.id,
          email: user.email,
          role: (profile?.role as 'user' | 'dept_admin' | 'admin') || 'user',
          departmentId: profile?.dept_id || undefined
        };

        req.user = authUser;
        return next();
      }
    }

    if (req.user && req.user.id) {
      return next();
    }

    const xUserId = req.headers['x-user-id'] as string;
    if (xUserId) {
      req.user = { id: xUserId, role: 'user' };
      return next();
    }

    req.user = { id: 'system', role: 'user' };
    next();
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
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const { data } = await supabaseAdmin.auth.getUser(token);
      const user = data?.user;
      if (user) {
        const { data: profile } = await supabaseAdmin
          .from('profiles')
          .select('role, dept_id')
          .eq('id', user.id)
          .single();

        req.user = {
          id: user.id,
          email: user.email,
          role: (profile?.role as 'user' | 'dept_admin' | 'admin') || 'user',
          departmentId: profile?.dept_id || undefined
        };
      }
    }
    next();
  } catch {
    next();
  }
}
