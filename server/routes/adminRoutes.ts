import { Router, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../../src/lib/supabase';
import { AuthenticatedRequest, AppError } from '../types';
import { authenticateToken } from '../middleware/auth';
import { requireAdminOrDeptAdmin } from '../middleware/roleGuard';

const router = Router();

// Apply auth middleware to all admin routes
router.use(authenticateToken as any);
router.use(requireAdminOrDeptAdmin as any);

// API Route for Admin to test API connection
router.post('/test-connection', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { baseUrl, apiKey, provider } = req.body;
    if (!baseUrl || !apiKey) {
      return res.status(400).json({ success: false, message: "Missing baseUrl or apiKey" });
    }
    
    let targetUrl = `${baseUrl.replace(/\/+$/, '')}`;
    if (provider === "routerhub" || provider === "vectorengine" || targetUrl.includes('generative')) {
        targetUrl = targetUrl.replace(/\/v1beta\/?$/, '').replace(/\/v1\/?$/, '');
    }
    
    let testMethod = 'POST';
    let body: any = JSON.stringify({
       contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
       generationConfig: { maxOutputTokens: 1 }
    });
    
    if (provider === "routerhub" || provider === "vectorengine") {
        targetUrl += "/v1/models";
        testMethod = 'GET';
        body = undefined;
    } else {
        targetUrl += "/v1beta/models/gemini-1.5-flash:generateContent";
        if (provider === "google" || targetUrl.includes('generativelanguage.googleapis.com')) {
           targetUrl += `?key=${apiKey}`;
        }
    }
    
    const headers: any = {};
    if (testMethod !== 'GET') headers["Content-Type"] = "application/json";
    
    if (provider === "routerhub" || provider === "vectorengine") {
        headers["Authorization"] = `Bearer ${apiKey}`;
    } else {
        headers["x-goog-api-key"] = apiKey;
    }

    const fetchOptions: any = { headers, method: testMethod };
    if (body) fetchOptions.body = body;

    const response = await fetch(targetUrl, fetchOptions);
    if (!response.ok) {
        const errText = await response.text();
        let parsedErr = errText;
        try {
           let j = JSON.parse(errText);
           if (j.error && j.error.message) parsedErr = j.error.message;
        } catch(e) {}
        return res.status(200).json({ success: false, status: response.status, message: `(${response.status}) ${parsedErr.slice(0, 300)}` });
    }
    await response.json();
    return res.json({ success: true, message: "通信测试成功" });
  } catch (err: any) {
    next(err);
  }
});

// API Route to refund points for failed image generation
router.post('/refund-log', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const adminUser = req.user!;
    const { logId, comment = "生图失败，人工纠偏核减" } = req.body;
    if (!logId) {
      throw new AppError('Missing logId', 400, 'BAD_REQUEST');
    }

    // 1. Fetch the usage log
    const { data: log, error: logError } = await supabaseAdmin
      .from('usage_logs')
      .select('*')
      .eq('id', logId)
      .single();

    if (logError || !log) {
      throw new AppError('Log not found', 404, 'NOT_FOUND');
    }

    // 2. Department isolation check for dept_admin
    if (adminUser.role === 'dept_admin') {
      const { data: userProfile } = await supabaseAdmin
        .from('profiles')
        .select('dept_id')
        .eq('id', log.user_id)
        .single();

      if (!userProfile || userProfile.dept_id !== adminUser.departmentId) {
        throw new AppError('Forbidden: You can only refund users from your own department', 403, 'FORBIDDEN');
      }
    }

    // 3. Double-refund prevention
    if (log.tokens_used <= 0) {
      throw new AppError('This log has already been refunded or holds 0 points', 400, 'BAD_REQUEST');
    }

    // 4. Fetch user's current profile balance/use
    const { data: userProfile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('quota_used, username')
      .eq('id', log.user_id)
      .single();

    if (profileError || !userProfile) {
      throw new AppError('User profile not found', 404, 'NOT_FOUND');
    }

    const refundPoints = log.tokens_used;
    const originUsed = userProfile.quota_used || 0;
    const targetUsed = Math.max(0, originUsed - refundPoints);

    // 5. Update user profile to deduct their quota_used
    const { error: profileUpdateError } = await supabaseAdmin
      .from('profiles')
      .update({ quota_used: targetUsed })
      .eq('id', log.user_id);

    if (profileUpdateError) {
      throw new AppError(`Profile update failed: ${profileUpdateError.message}`, 500, 'DATABASE_ERROR');
    }

    // 6. Update usage log to set tokens_used and cost_usd to 0, and prepend a tag
    const updatedModelName = `[已核退-${comment}] ` + log.model;
    const { error: logUpdateError } = await supabaseAdmin
      .from('usage_logs')
      .update({
        tokens_used: 0,
        cost_usd: 0,
        model: updatedModelName.slice(0, 250)
      })
      .eq('id', logId);

    if (logUpdateError) {
      // Rollback user balance if database update failed
      await supabaseAdmin.from('profiles').update({ quota_used: originUsed }).eq('id', log.user_id);
      throw new AppError(`Usage log update failed: ${logUpdateError.message}`, 500, 'DATABASE_ERROR');
    }

    console.log(`[Billing Audit] Refunded user ${userProfile.username} (${log.user_id}) for log ${logId}: ${refundPoints} points refunded.`);

    return res.json({
      success: true,
      message: `成功退还 ${userProfile.username} ${refundPoints}点额度，已核回为 0 点。`,
      pointsReturned: refundPoints
    });
  } catch (err) {
    next(err);
  }
});

// API Route for Admin or Dept Admin to create a user account
router.post('/create-user', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const adminUser = req.user!;
    const { employeeId, password, username, quotaLimit, dept_id } = req.body;

    if (!employeeId || !password) {
      throw new AppError('Missing employeeId or password.', 400, 'BAD_REQUEST');
    }

    let targetDeptId = dept_id;
    if (adminUser.role === 'dept_admin') {
      targetDeptId = adminUser.departmentId;
    }

    // 1. Create auth user with Admin SDK
    const authResponse = await supabaseAdmin.auth.admin.createUser({
      email: `${employeeId}@manwah.com`,
      password: password,
      email_confirm: true 
    });

    if (authResponse.error) {
      throw new AppError(authResponse.error.message, 400, 'CREATE_USER_FAILED');
    }

    // 2. Update profile with extra info
    if (authResponse.data?.user?.id) {
      const updatePayload: any = { 
        employee_id: employeeId, 
        username: username || employeeId, 
        quota_limit: quotaLimit ? parseInt(quotaLimit) : 100000 
      };
      
      if (targetDeptId) {
        updatePayload.dept_id = targetDeptId;
      }

      const { error: profileError } = await supabaseAdmin
        .from('profiles')
        .update(updatePayload)
        .eq('id', authResponse.data.user.id);

      if (profileError) {
        console.error("Profile update error:", profileError);
      }
    }

    return res.status(200).json({ success: true, user: authResponse.data.user });
  } catch (err) {
    next(err);
  }
});

// API Route for Admin to reset a user's password
router.post('/reset-password', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const adminUser = req.user!;
    const { userId, newPassword } = req.body;

    if (!userId || !newPassword) {
      throw new AppError('Missing userId or newPassword.', 400, 'BAD_REQUEST');
    }

    // If dept_admin, verify target user belongs to the same department
    if (adminUser.role === 'dept_admin') {
      const { data: targetProfile } = await supabaseAdmin
        .from('profiles')
        .select('dept_id')
        .eq('id', userId)
        .single();
      
      if (!targetProfile || targetProfile.dept_id !== adminUser.departmentId) {
        throw new AppError('Forbidden: You can only manage users in your own department.', 403, 'FORBIDDEN');
      }
    }

    const authResponse = await supabaseAdmin.auth.admin.updateUserById(userId, {
      password: newPassword
    });

    if (authResponse.error) {
      throw new AppError(authResponse.error.message, 400, 'RESET_PASSWORD_FAILED');
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    next(err);
  }
});

// API Route for Admin to delete a user
router.delete('/users/:userId', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const adminUser = req.user!;
    const { userId } = req.params;

    // If dept_admin, verify target user belongs to the same department
    if (adminUser.role === 'dept_admin') {
      const { data: targetProfile } = await supabaseAdmin
        .from('profiles')
        .select('dept_id')
        .eq('id', userId)
        .single();
      
      if (!targetProfile || targetProfile.dept_id !== adminUser.departmentId) {
        throw new AppError('Forbidden: You can only delete users in your own department.', 403, 'FORBIDDEN');
      }
    }

    // Delete the user from auth.users
    const authResponse = await supabaseAdmin.auth.admin.deleteUser(userId);

    if (authResponse.error) {
      throw new AppError(authResponse.error.message, 400, 'DELETE_USER_FAILED');
    }
    
    // Delete from profiles
    await supabaseAdmin.from('profiles').delete().eq('id', userId);

    return res.status(200).json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
