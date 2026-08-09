// Voice API routes
import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '@shared/middleware/auth';
import { processVoiceCommand, getVoiceCommandsHelp } from './service';

const router = Router();
router.use(authenticate);

/**
 * POST /api/voice/process
 * Process a voice command
 */
router.post('/process', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { text } = req.body;
    if (!text || typeof text !== 'string') {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'Voice text is required' },
      });
      return;
    }

    const result = await processVoiceCommand(req.user!.storeId, text);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/voice/commands
 * Get available voice commands
 */
router.get('/commands', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const commands = getVoiceCommandsHelp();
    res.json({ success: true, data: commands });
  } catch (error) {
    next(error);
  }
});

export default router;
