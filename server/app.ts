import express from 'express';
import cors from 'cors';
import { errorHandler } from './middleware/errorHandler';
import adminRoutes from './routes/adminRoutes';
import projectRoutes from './routes/projectRoutes';
import agentRoutes from './routes/agentRoutes';

export function createApp(): express.Express {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Mount modular sub-routers
  app.use('/api/admin', adminRoutes);
  app.use('/api/projects', projectRoutes);
  app.use('/api/agent-runs', agentRoutes);

  // Global Error Handler
  app.use(errorHandler as any);

  return app;
}

