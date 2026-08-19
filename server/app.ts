import express from 'express';
import cors from 'cors';
import { errorHandler } from './middleware/errorHandler';
import adminRoutes from './routes/adminRoutes';
import projectRoutes from './routes/projectRoutes';
import agentRoutes from './routes/agentRoutes';
import canvasRoutes from './routes/canvasRoutes';
import assetRoutes from './routes/assetRoutes';
import productDnaRoutes from './routes/productDnaRoutes';
import copyRoutes from './routes/copyRoutes';
import layoutManifestRoutes from './routes/layoutManifestRoutes';

export function createApp(): express.Express {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '150mb' }));
  app.use(express.urlencoded({ extended: true, limit: '150mb' }));

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Mount modular sub-routers
  app.use('/api/admin', adminRoutes);
  app.use('/api/projects', projectRoutes);
  app.use('/api/agent-runs', agentRoutes);
  app.use('/api/agent', agentRoutes);
  app.use('/api/canvases', canvasRoutes);
  app.use('/api/canvases', layoutManifestRoutes);
  app.use('/api/layout-manifests', layoutManifestRoutes);
  app.use('/api/asset-skus', assetRoutes);
  app.use('/api/asset-versions', assetRoutes);
  app.use('/api/product-dnas', productDnaRoutes);
  app.use('/api/product-dna-versions', productDnaRoutes);
  app.use('/api', productDnaRoutes);
  app.use('/api', assetRoutes);
  app.use('/api', copyRoutes);

  // Global Error Handler
  app.use(errorHandler as any);

  return app;
}
