import { Router } from 'express';
import {
  createCompetition,
  updateCompetition,
  getCompetitions,
  getCompetitionDetails,
  answerSkillQuestion,
  submitFreeEntry,
  startJackpotCountdown,
  getCompetitionStats,
  processWheelSpin,
  submitMiniGameScore,
  claimInstantWin,
  selectWinners,
  autoSubscribeUsers,
  getCompetitionLeaderboard,
  getCompetitionAnalytics,
  updateCompetitionStatus,
  duplicateCompetition,
  exportCompetitionData,
  getCompetitionWinners,
  validateCompetitionEntry,
  bulkCreateCompetitions,
  getCompetitionTypes,
  getCompetitionTemplates
} from './competitionController.js';
import authenticate from '../../../middleware/auth.js';
import {
  competitionImagesUpload,
  competitionFeaturedUpload,
  competitionDocumentsUpload,
  bulkUploadCompetitions,
  validateUploadedFiles,
  handleUploadError
} from '../../../middleware/upload.js';

const router = Router();

//==================== PUBLIC ROUTES ====================
router.get('/', getCompetitions);
router.get('/types', getCompetitionTypes);
router.get('/templates', getCompetitionTemplates);
router.get('/:id', getCompetitionDetails);
router.get('/:id/stats', getCompetitionStats);
router.get('/:id/leaderboard', getCompetitionLeaderboard);
router.get('/:id/analytics', getCompetitionAnalytics);
router.get('/:id/winners', getCompetitionWinners);
router.post('/validate-entry', validateCompetitionEntry);

//==================== PROTECTED ROUTES ====================
router.post('/skill-question', authenticate(), answerSkillQuestion);
router.post('/free-entry', authenticate(), submitFreeEntry);
router.post('/wheel-spin', authenticate(), processWheelSpin);
router.post('/mini-game/score', authenticate(), submitMiniGameScore);
router.post('/instant-win/claim', authenticate(), claimInstantWin);

// ==================== ADMIN ROUTES ====================
//aklilu:Create competition with featured images/videos
router.post('/', 
  authenticate(['ADMIN']), 
  competitionFeaturedUpload,
  validateUploadedFiles,
  handleUploadError,
  createCompetition
);

//aklilu:Bulk create competitions from CSV
router.post('/bulk', 
  authenticate(['admin']), 
  bulkUploadCompetitions,
  validateUploadedFiles,
  handleUploadError,
  bulkCreateCompetitions
);

//aklilu:Update competition with images
router.put('/:id', 
  authenticate(['admin']), 
  competitionFeaturedUpload,
  validateUploadedFiles,
  handleUploadError,
  updateCompetition
);

//aklilu:Upload competition gallery images
router.post('/:id/images', 
  authenticate(['admin']), 
  competitionImagesUpload,
  validateUploadedFiles,
  handleUploadError,
  (req, res) => {
    res.json({
      success: true,
      message: 'Images uploaded successfully',
      data: { images: req.files }
    });
  }
);

//aklilu:Upload competition documents
router.post('/:id/documents', 
  authenticate(['admin']), 
  competitionDocumentsUpload,
  validateUploadedFiles,
  handleUploadError,
  (req, res) => {
    res.json({
      success: true,
      message: 'Documents uploaded successfully',
      data: { documents: req.files }
    });
  }
);

//aklilu:Other admin routes
router.post('/:id/duplicate', authenticate(['admin']), duplicateCompetition);
router.post('/:id/status', authenticate(['admin']), updateCompetitionStatus);
router.post('/jackpot/start-countdown', authenticate(['admin']), startJackpotCountdown);
router.post('/winners/select', authenticate(['admin']), selectWinners);
router.post('/subscription/auto-subscribe', authenticate(['admin']), autoSubscribeUsers);
router.get('/export/:id', authenticate(['admin']), exportCompetitionData);

export default router;
