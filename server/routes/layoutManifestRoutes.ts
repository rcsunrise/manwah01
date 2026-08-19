import { Router, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types';
import { optionalAuthenticateToken } from '../middleware/auth';
import { LayoutManifestService } from '../services/layoutManifestService';
import { LayoutManifestRepository } from '../repositories/layoutManifestRepository';
import { AppError } from '../types';

const router = Router({ mergeParams: true });

// Apply optional auth
router.use(optionalAuthenticateToken as any);

/**
 * 1. Create / Save Draft Manifest
 * POST /api/canvases/:canvasId/layout-manifests
 */
router.post('/:canvasId/layout-manifests', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const canvasId = String(req.params.canvasId);
    const user = req.user;
    const {
      projectId,
      slots,
      widthPx = 2100,
      targetHeightPx = 14800
    } = req.body;

    if (!projectId) {
      throw new AppError('projectId 必填', 400, 'PROJECT_ID_REQUIRED');
    }

    const manifest = await LayoutManifestService.createDraftManifest({
      canvasId,
      projectId,
      slots,
      widthPx,
      targetHeightPx,
      userId: user?.id || 'system'
    });

    return res.status(201).json({
      success: true,
      manifest
    });
  } catch (err) {
    next(err);
  }
});

/**
 * 2. Get Current Manifest for Canvas
 * GET /api/canvases/:canvasId/layout-manifests/current
 */
router.get('/:canvasId/layout-manifests/current', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const canvasId = String(req.params.canvasId);
    const manifest = await LayoutManifestService.getCurrentManifest(canvasId);

    return res.json({
      success: true,
      manifest: manifest || null
    });
  } catch (err) {
    next(err);
  }
});

/**
 * 3. List All Manifests for Canvas
 * GET /api/canvases/:canvasId/layout-manifests
 */
router.get('/:canvasId/layout-manifests', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const canvasId = String(req.params.canvasId);
    const manifests = await LayoutManifestRepository.getManifestsByCanvasId(canvasId);

    return res.json({
      success: true,
      manifests
    });
  } catch (err) {
    next(err);
  }
});

/**
 * 4. Get Manifest by Manifest ID
 * GET /api/layout-manifests/:manifestId
 */
router.get('/manifests/:manifestId', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const manifestId = String(req.params.manifestId);
    const manifest = await LayoutManifestService.getManifestById(manifestId);

    return res.json({
      success: true,
      manifest
    });
  } catch (err) {
    next(err);
  }
});

router.get('/:manifestId', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const manifestId = String(req.params.manifestId);
    // If it looks like a canvas ID query, skip or handle
    if (manifestId.startsWith('canvas_')) {
      const manifests = await LayoutManifestRepository.getManifestsByCanvasId(manifestId);
      return res.json({ success: true, manifests });
    }
    const manifest = await LayoutManifestService.getManifestById(manifestId);
    return res.json({
      success: true,
      manifest
    });
  } catch (err) {
    next(err);
  }
});

/**
 * 5. Validate Manifest
 * POST /api/layout-manifests/:manifestId/validate
 */
router.post('/:manifestId/validate', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const manifestId = String(req.params.manifestId);
    const result = await LayoutManifestService.validateManifest(manifestId);

    return res.json({
      success: true,
      ...result
    });
  } catch (err) {
    next(err);
  }
});

/**
 * 6. Approve Manifest (Lock for long image synthesis)
 * POST /api/layout-manifests/:manifestId/approve
 */
router.post('/:manifestId/approve', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const manifestId = String(req.params.manifestId);
    const user = req.user;
    const approvedManifest = await LayoutManifestService.approveManifest(manifestId, user?.id || 'system');

    return res.json({
      success: true,
      manifest: approvedManifest
    });
  } catch (err) {
    next(err);
  }
});

/**
 * 7. Derive New Draft from existing Manifest
 * POST /api/layout-manifests/:manifestId/derive
 */
router.post('/:manifestId/derive', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const manifestId = String(req.params.manifestId);
    const user = req.user;
    const derivedDraft = await LayoutManifestService.deriveDraftManifest(manifestId, user?.id || 'system');

    return res.status(201).json({
      success: true,
      manifest: derivedDraft
    });
  } catch (err) {
    next(err);
  }
});

export default router;
