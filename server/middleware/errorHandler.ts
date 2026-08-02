import { Request, Response, NextFunction } from 'express';
import { AppError } from '../types';

export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) {
  const requestId = (req.headers['x-request-id'] as string) || `req_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
  
  const statusCode = err instanceof AppError ? err.statusCode : (err.status || err.statusCode || 500);
  const errorCode = err instanceof AppError ? err.errorCode : (err.code || 'INTERNAL_SERVER_ERROR');
  const message = err.message || '服务器内部错误';

  if (statusCode >= 500) {
    console.error(`[Error] [${requestId}]`, err);
  }

  res.status(statusCode).json({
    error: {
      code: errorCode,
      message,
      requestId,
      details: err.details || (process.env.NODE_ENV !== 'production' ? err.stack : undefined)
    }
  });
}
