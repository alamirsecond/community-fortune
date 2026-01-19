import Competition from './models/Competition.js';
import fs from 'fs';
import path from 'path';
import { getFileUrl, deleteUploadedFiles } from '../../../middleware/upload.js';
import { 
  createCompetitionSchema, 
  updateCompetitionSchema, 
  skillQuestionAnswerSchema, 
  freeEntrySchema,
  subscribeToCompetitionSchema,
  jackpotThresholdSchema,
  instantWinSchemaValidation,
  miniGameScoreSchema,
  winnerSelectionSchema,
  bulkCompetitionSchema
} from './competitionValidator.js';

// Helper function for validation
const validateRequest = (schema, data) => {
  const validationResult = schema.safeParse(data);
  if (!validationResult.success) {
    return { success: false, errors: validationResult.error.errors };
  }
  return { success: true, data: validationResult.data };
};

// ==================== COMPETITION CREATION & MANAGEMENT ====================

export const createCompetition = async (req, res) => {
  try {
    // Process uploaded files
    const files = req.files || {};
    
    // Combine body and files
    const competitionData = {
      ...req.body,
      featured_image: files.featured_image?.[0] ? getFileUrl(files.featured_image[0].path) : null,
      featured_video: files.featured_video?.[0] ? getFileUrl(files.featured_video[0].path) : null,
      banner_image: files.banner_image?.[0] ? getFileUrl(files.banner_image[0].path) : null,
      gallery_images: files.gallery_images?.map(f => getFileUrl(f.path)) || []
    };

    const validationResult = validateRequest(createCompetitionSchema, { body: competitionData });
    if (!validationResult.success) {
      // Clean up uploaded files if validation fails
      if (files) {
        Object.values(files).forEach(fileArray => {
          fileArray.forEach(file => {
            deleteUploadedFiles(file.path);
          });
        });
      }
      
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: validationResult.errors
      });
    }

    const validatedData = validationResult.data.body;
    
    // Admin role check
    if (req.user.role !== 'admin') {
      // Clean up uploaded files if unauthorized
      if (files) {
        Object.values(files).forEach(fileArray => {
          fileArray.forEach(file => {
            deleteUploadedFiles(file.path);
          });
        });
      }
      
      return res.status(403).json({
        success: false,
        message: 'Only administrators can create competitions'
      });
    }

    // Set competition type based on category
    if (validatedData.category === 'FREE') {
      validatedData.price = 0;
      validatedData.is_free_competition = true;
      validatedData.competition_type = 'FREE';
    } else if (validatedData.category === 'JACKPOT') {
      validatedData.competition_type = 'PAID';
      validatedData.points_per_pound = validatedData.points_per_pound || 100;
    } else if (validatedData.price > 0) {
      validatedData.competition_type = 'PAID';
    }

    // Set defaults based on category
    switch (validatedData.category) {
      case 'JACKPOT':
        validatedData.total_tickets = validatedData.total_tickets || 1000000;
        validatedData.price = validatedData.price || 10;
        validatedData.threshold_type = validatedData.threshold_type || 'AUTOMATIC';
        validatedData.threshold_value = validatedData.threshold_value || 1200;
        break;
      case 'SUBSCRIPTION':
        validatedData.price = 0;
        validatedData.auto_entry_enabled = validatedData.auto_entry_enabled ?? true;
        break;
    }

    // Create competition
    const competitionId = await Competition.create(validatedData);
    
    // Process and save gallery images
    if (files.gallery_images && files.gallery_images.length > 0) {
      const galleryDir = path.join(process.env.COMPETITION_UPLOAD_PATH, competitionId, 'gallery');
      if (!fs.existsSync(galleryDir)) {
        fs.mkdirSync(galleryDir, { recursive: true });
      }
      // Move gallery images to proper directory and update gallery_images array
      const galleryUrls = [];
      for (const file of files.gallery_images) {
        const newPath = path.join(galleryDir, path.basename(file.path));
        fs.renameSync(file.path, newPath);
        galleryUrls.push(getFileUrl(newPath));
      }
      // Update competition gallery_images in DB
      await Competition.update(competitionId, { gallery_images: galleryUrls });
    }

    // Create instant wins if provided
    if (validatedData.instant_wins && validatedData.instant_wins.length > 0) {
      await Competition.createInstantWins(competitionId, validatedData.instant_wins);
    }

    // Create achievements if provided
    if (validatedData.achievements && validatedData.achievements.length > 0) {
      await Competition.createAchievements(competitionId, validatedData.achievements);
    }

    // Auto-subscribe eligible users for subscription competitions
    if (validatedData.category === 'SUBSCRIPTION' && validatedData.auto_entry_enabled) {
      await Competition.autoSubscribeToCompetition(competitionId);
    }

    res.status(201).json({
      success: true,
      message: 'Competition created successfully',
      data: { 
        competitionId,
        category: validatedData.category,
        files: {
          featured_image: validatedData.featured_image,
          featured_video: validatedData.featured_video,
          banner_image: validatedData.banner_image,
          gallery_images: validatedData.gallery_images
        },
        next_steps: getCompetitionNextSteps(validatedData.category)
      }
    });
  } catch (error) {
    console.error('Create competition error:', error);
    
    // Clean up uploaded files on error
    if (req.files) {
      Object.values(req.files).forEach(fileArray => {
        fileArray.forEach(file => {
          deleteUploadedFiles(file.path);
        });
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Failed to create competition',
      error: error.message,
      code: error.code
    });
  }
};

export const updateCompetition = async (req, res) => {
  try {
    const { id } = req.params;
    const files = req.files || {};
    
    // Get current competition to check existing files
    const currentCompetition = await Competition.findById(id);
    if (!currentCompetition) {
      // Clean up any uploaded files
      if (files) {
        Object.values(files).forEach(fileArray => {
          fileArray.forEach(file => {
            deleteUploadedFiles(file.path);
          });
        });
      }
      
      return res.status(404).json({
        success: false,
        message: 'Competition not found'
      });
    }

    // Combine body and files
    const competitionData = {
      ...req.body
    };

    // Process uploaded files and delete old ones
    if (files.featured_image?.[0]) {
      // Delete old featured image if exists
      if (currentCompetition.featured_image) {
        const oldPath = path.join(process.env.COMPETITION_UPLOAD_PATH, currentCompetition.featured_image.replace('/uploads/competitions/', ''));
        deleteUploadedFiles(oldPath);
      }
      competitionData.featured_image = getFileUrl(files.featured_image[0].path);
    }
    
    if (files.featured_video?.[0]) {
      // Delete old featured video if exists
      if (currentCompetition.featured_video) {
        const oldPath = path.join(process.env.COMPETITION_UPLOAD_PATH, currentCompetition.featured_video.replace('/uploads/competitions/', ''));
        deleteUploadedFiles(oldPath);
      }
      competitionData.featured_video = getFileUrl(files.featured_video[0].path);
    }
    
    if (files.banner_image?.[0]) {
      // Delete old banner image if exists
      if (currentCompetition.banner_image) {
        const oldPath = path.join(process.env.COMPETITION_UPLOAD_PATH, currentCompetition.banner_image.replace('/uploads/competitions/', ''));
        deleteUploadedFiles(oldPath);
      }
      competitionData.banner_image = getFileUrl(files.banner_image[0].path);
    }
    
    // Handle gallery images
    if (files.gallery_images && files.gallery_images.length > 0) {
      const galleryDir = path.join(process.env.COMPETITION_UPLOAD_PATH, id, 'gallery');
      if (!fs.existsSync(galleryDir)) {
        fs.mkdirSync(galleryDir, { recursive: true });
      }
      // Move new gallery images
      const galleryUrls = [];
      for (const file of files.gallery_images) {
        const newPath = path.join(galleryDir, path.basename(file.path));
        fs.renameSync(file.path, newPath);
        galleryUrls.push(getFileUrl(newPath));
      }
      // Get all gallery images in directory
      let allGallery = [];
      if (fs.existsSync(galleryDir)) {
        allGallery = fs.readdirSync(galleryDir).map(file => getFileUrl(path.join(galleryDir, file)));
      }
      competitionData.gallery_images = allGallery;
    }

    const validationResult = validateRequest(updateCompetitionSchema, { body: competitionData });
    
    if (!validationResult.success) {
      // Clean up uploaded files if validation fails
      if (files) {
        Object.values(files).forEach(fileArray => {
          fileArray.forEach(file => {
            deleteUploadedFiles(file.path);
          });
        });
      }
      
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: validationResult.errors
      });
    }

    if (req.user.role !== 'admin') {
      // Clean up uploaded files if unauthorized
      if (files) {
        Object.values(files).forEach(fileArray => {
          fileArray.forEach(file => {
            deleteUploadedFiles(file.path);
          });
        });
      }
      
      return res.status(403).json({
        success: false,
        message: 'Only administrators can update competitions'
      });
    }

    const updateData = validationResult.data.body;
    const updated = await Competition.update(id, updateData);

    if (!updated) {
      // Clean up uploaded files if update fails
      if (files) {
        Object.values(files).forEach(fileArray => {
          fileArray.forEach(file => {
            deleteUploadedFiles(file.path);
          });
        });
      }
      
      return res.status(404).json({
        success: false,
        message: 'Competition not found or update failed'
      });
    }

    // Update related data if provided
    if (updateData.instant_wins) {
      await Competition.updateInstantWins(id, updateData.instant_wins);
    }

    if (updateData.achievements) {
      await Competition.updateAchievements(id, updateData.achievements);
    }

    res.json({
      success: true,
      message: 'Competition updated successfully',
      data: { 
        competitionId: id,
        updated_files: {
          featured_image: updateData.featured_image,
          featured_video: updateData.featured_video,
          banner_image: updateData.banner_image,
          gallery_images: updateData.gallery_images?.length || 0
        }
      }
    });
  } catch (error) {
    console.error('Update competition error:', error);
    
    // Clean up uploaded files on error
    if (req.files) {
      Object.values(req.files).forEach(fileArray => {
        fileArray.forEach(file => {
          deleteUploadedFiles(file.path);
        });
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Failed to update competition',
      error: error.message
    });
  }
};

// ==================== COMPETITION LISTING & DETAILS ====================

export const getCompetitions = async (req, res) => {
  try {
    const filters = {
      status: req.query.status || 'ACTIVE',
      category: req.query.category,
      competition_type: req.query.type,
      is_free: req.query.free_only ? true : undefined,
      min_price: req.query.min_price,
      max_price: req.query.max_price,
      search: req.query.search,
      limit: parseInt(req.query.limit) || 20,
      page: parseInt(req.query.page) || 1,
      sort_by: req.query.sort_by || 'created_at',
      sort_order: req.query.sort_order || 'desc'
    };
    
    if (req.user) {
      filters.user_id = req.user.id;
      
      // Filter out subscription competitions user can't access
      if (req.user.role !== 'admin') {
        filters.exclude_inaccessible_subscription = true;
      }
    }

    const { competitions, total, totalPages } = await Competition.findCompetitions(filters);
    
    const formattedCompetitions = competitions.map(comp => ({
      id: comp.id,
      title: comp.title,
      description: comp.description,
      featured_image: comp.featured_image,
      featured_video: comp.featured_video,
      price: comp.price,
      total_tickets: comp.total_tickets,
      sold_tickets: comp.sold_tickets,
      category: comp.category,
      type: comp.type,
      is_free_competition: comp.is_free_competition,
      competition_type: comp.competition_type,
      subscription_tier: comp.subscription_tier,
      wheel_type: comp.wheel_type,
      game_type: comp.game_type,
      progress: {
        sold: comp.sold_tickets,
        total: comp.total_tickets,
        percentage: comp.total_tickets > 0 ? Math.round((comp.sold_tickets / comp.total_tickets) * 100) : 0
      },
      countdown: comp.countdown_seconds > 0 ? comp.countdown_seconds : null,
      status: comp.status,
      start_date: comp.start_date,
      end_date: comp.end_date,
      tags: getCompetitionTags(comp),
      features: getCompetitionFeatures(comp),
      eligibility: comp.user_eligibility || null,
      stats: {
        entries: comp.total_entries || 0,
        participants: comp.unique_participants || 0,
        instant_wins_available: comp.instant_wins_count || 0
      }
    }));
    
    res.json({
      success: true,
      data: {
        competitions: formattedCompetitions,
        pagination: {
          total,
          page: filters.page,
          total_pages: totalPages,
          limit: filters.limit
        },
        filters: filters,
        summary: {
          active: competitions.filter(c => c.status === 'ACTIVE').length,
          upcoming: competitions.filter(c => new Date(c.start_date) > new Date()).length,
          ending_soon: competitions.filter(c => {
            if (!c.end_date) return false;
            const endDate = new Date(c.end_date);
            const now = new Date();
            const hoursDiff = (endDate - now) / (1000 * 60 * 60);
            return hoursDiff > 0 && hoursDiff < 24;
          }).length
        }
      }
    });
  } catch (error) {
    console.error('Get competitions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch competitions',
      error: error.message
    });
  }
};

export const getCompetitionDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const competition = await Competition.findById(id);

    if (!competition) {
      return res.status(404).json({
        success: false,
        message: 'Competition not found'
      });
    }

    // Check various eligibility criteria
    let eligibility = { can_enter: true, reason: null, requirements: [] };
    let userEntryStatus = null;
    let subscriptionEligibility = { eligible: true };
    let jackpotProgress = null;
    let instantWins = [];
    let achievements = [];
    let leaderboard = null;

    if (req.user) {
      // Check if user can enter
      userEntryStatus = await Competition.canUserEnter(id, req.user.id);
      eligibility.can_enter = userEntryStatus.canEnter;
      eligibility.reason = userEntryStatus.reason;
      
      // Check entry count and limits
      const userEntries = await Competition.getUserEntries(id, req.user.id);
      eligibility.entries_used = userEntries.length;
      eligibility.entries_remaining = competition.max_entries_per_user - userEntries.length;
      
      // Check if user has any instant wins
      const userInstantWins = await Competition.getUserInstantWins(id, req.user.id);
      if (userInstantWins.length > 0) {
        eligibility.has_instant_wins = true;
        eligibility.instant_wins = userInstantWins;
      }
      
      // Check achievements progress
      const userAchievements = await Competition.getUserAchievementsProgress(id, req.user.id);
      if (userAchievements.length > 0) {
        eligibility.achievements_progress = userAchievements;
      }
    }

    // Check subscription eligibility
    if (competition.category === 'SUBSCRIPTION') {
      subscriptionEligibility = await Competition.checkSubscriptionEligibility(id, req.user?.id);
      if (!subscriptionEligibility.eligible) {
        eligibility.can_enter = false;
        eligibility.reason = subscriptionEligibility.reason;
        eligibility.requirements.push('Valid subscription required');
      }
    }

    // Get jackpot progress if applicable
    if (competition.category === 'JACKPOT') {
      jackpotProgress = await Competition.getJackpotProgress(id);
      eligibility.jackpot_info = jackpotProgress;
      
      // Check threshold status
      const thresholdStatus = await Competition.checkThreshold(id);
      eligibility.threshold_reached = thresholdStatus.threshold_reached;
      eligibility.threshold_progress = {
        current: thresholdStatus.sold_tickets,
        required: thresholdStatus.threshold_value,
        percentage: Math.round((thresholdStatus.sold_tickets / thresholdStatus.threshold_value) * 100)
      };
    }

    // Get instant wins if enabled
    if (competition.category === 'PAID' || competition.category === 'JACKPOT') {
      instantWins = await Competition.getInstantWins(id);
    }

    // Get achievements if enabled
    achievements = await Competition.getAchievements(id);

    // Get leaderboard if applicable
    if (competition.category === 'MINI_GAME' || competition.leaderboard_type) {
      leaderboard = await Competition.getLeaderboard(id, competition.leaderboard_type);
    }

    // Get competition statistics
    const stats = await Competition.getStats(id);

    // Get gallery images
    let galleryImages = [];
    const galleryDir = path.join(process.env.COMPETITION_UPLOAD_PATH, id, 'gallery');
    if (fs.existsSync(galleryDir)) {
      const files = fs.readdirSync(galleryDir);
      galleryImages = files.map(file => getFileUrl(path.join(galleryDir, file)));
    }

    // Get documents if any
    let documents = [];
    const docDir = path.join(process.env.COMPETITION_UPLOAD_PATH, id, 'documents');
    if (fs.existsSync(docDir)) {
      const docFiles = fs.readdirSync(docDir);
      documents = docFiles.map(file => ({
        name: file,
        url: getFileUrl(path.join(docDir, file)),
        type: path.extname(file).substring(1).toUpperCase(),
        size: fs.statSync(path.join(docDir, file)).size
      }));
    }

    res.json({
      success: true,
      data: {
        ...competition,
        gallery_images: galleryImages,
        documents: documents,
        eligibility,
        subscription_eligible: subscriptionEligibility,
        user_entry_status: userEntryStatus,
        jackpot_progress: jackpotProgress,
        instant_wins: instantWins,
        achievements: achievements,
        leaderboard: leaderboard,
        stats: stats,
        features: {
          has_instant_wins: instantWins.length > 0,
          has_leaderboard: leaderboard !== null,
          requires_subscription: competition.category === 'SUBSCRIPTION',
          has_skill_question: competition.skill_question_enabled,
          has_free_entry: competition.free_entry_enabled,
          has_mini_game: competition.category === 'MINI_GAME',
          has_jackpot: competition.category === 'JACKPOT'
        },
        compliance: {
          uk_compliant: competition.skill_question_enabled || competition.free_entry_enabled || competition.category === 'FREE',
          free_entry_available: competition.free_entry_enabled,
          skill_question_required: competition.skill_question_enabled
        },
        timestamps: {
          created_at: competition.created_at,
          updated_at: competition.updated_at,
          time_remaining: competition.end_date ? 
            Math.max(0, new Date(competition.end_date) - new Date()) : null
        }
      }
    });
  } catch (error) {
    console.error('Get competition details error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch competition details',
      error: error.message
    });
  }
};

// ==================== ENTRY & PARTICIPATION ====================
export const answerSkillQuestion = async (req, res) => {
  try {
    const validationResult = validateRequest(skillQuestionAnswerSchema, req);
    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: validationResult.errors
      });
    }

    const { answer, competition_id, user_id, useUniversalTicket } = validationResult.data.body;
    const userId = user_id || req.user.id;
    
    const competition = await Competition.findById(competition_id);

    if (!competition) {
      return res.status(404).json({
        success: false,
        message: 'Competition not found'
      });
    }

    if (!competition.skill_question_enabled) {
      return res.status(400).json({
        success: false,
        message: 'This competition does not require a skill question'
      });
    }

    const canEnter = await Competition.canUserEnter(competition_id, userId);
    if (!canEnter.canEnter) {
      return res.status(400).json({
        success: false,
        message: canEnter.reason
      });
    }

    // Check if user already answered
    const existingEntry = await Competition.getUserSkillQuestionEntry(competition_id, userId);
    if (existingEntry) {
      return res.status(400).json({
        success: false,
        message: 'You have already answered the skill question for this competition',
        data: { 
          previously_correct: existingEntry.skill_question_correct,
          attempts_remaining: 0
        }
      });
    }

    const isCorrect = answer.toLowerCase().trim() === competition.skill_question_answer.toLowerCase().trim();
    
    // Record the attempt
    await Competition.recordSkillQuestionAttempt({
      competition_id,
      user_id: userId,
      answer,
      is_correct: isCorrect,
      attempts: 1
    });

    if (isCorrect) {
      // Universal Ticket logic
      if (useUniversalTicket) {
        // Use a transaction to check and decrement universal_tickets
        const pool = require("../../../database.js").default || require("../../../database.js");
        const connection = await pool.getConnection();
        try {
          await connection.beginTransaction();
          // Check universal_tickets
          const [userRow] = await connection.query(
            `SELECT universal_tickets FROM users WHERE id = UUID_TO_BIN(?) FOR UPDATE`,
            [userId]
          );
          if (!userRow.length || userRow[0].universal_tickets < 1) {
            await connection.rollback();
            return res.status(400).json({ success: false, message: "No universal tickets available" });
          }
          // Decrement
          await connection.query(
            `UPDATE users SET universal_tickets = universal_tickets - 1 WHERE id = UUID_TO_BIN(?)`,
            [userId]
          );
          // Optionally log usage (e.g., insert into ticket_usage or audit table)
          await connection.query(
            `INSERT INTO ticket_usage_audit (user_id, competition_id, used_at, method) VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?), NOW(), 'UNIVERSAL_TICKET')`,
            [userId, competition_id]
          );
          await connection.commit();
        } catch (err) {
          await connection.rollback();
          connection.release();
          return res.status(500).json({ success: false, message: "Failed to use universal ticket", error: err.message });
        }
        // Record entry as UNIVERSAL_TICKET_ENTRY
        await Competition.recordEntry({
          competition_id,
          user_id: userId,
          entry_type: 'UNIVERSAL_TICKET_ENTRY',
          skill_question_correct: true,
          skill_question_answered: true
        });
        return res.json({
          success: true,
          message: 'Skill question answered and entry submitted using universal ticket',
          data: {
            qualified: true,
            used_universal_ticket: true,
            entry_id: await Competition.getLatestEntryId(competition_id, userId)
          }
        });
      } else {
        // Default: normal entry
        await Competition.recordEntry({
          competition_id,
          user_id: userId,
          entry_type: 'SKILL_QUESTION_ENTRY',
          skill_question_correct: true,
          skill_question_answered: true
        });
        return res.json({
          success: true,
          message: 'Skill question answered correctly',
          data: {
            qualified: true,
            next_step: competition.price > 0 ? 'proceed_to_payment' : 'entry_confirmed',
            entry_id: await Competition.getLatestEntryId(competition_id, userId)
          }
        });
      }
    } else {
      const attemptsAllowed = 3; // Configurable
      const attemptsRemaining = attemptsAllowed - 1;
      
      res.json({
        success: false,
        message: 'Incorrect answer',
        data: { 
          qualified: false,
          attempts_remaining: attemptsRemaining,
          can_retry: attemptsRemaining > 0,
          correct_answer_hint: attemptsRemaining === 0 ? competition.skill_question_answer.substring(0, 3) + '...' : null
        }
      });
    }
  } catch (error) {
    console.error('Skill question error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process skill question',
      error: error.message
    });
  }
};

export const submitFreeEntry = async (req, res) => {
  try {
    // Handle file uploads for postal proof
    const files = req.files || {};
    let postalProofUrl = null;
    
    if (files.postal_proof?.[0]) {
      postalProofUrl = getFileUrl(files.postal_proof[0].path);
    }

    const validationResult = validateRequest(freeEntrySchema, {
      ...req,
      body: {
        ...req.body,
        postal_proof: postalProofUrl
      }
    });
    
    if (!validationResult.success) {
      // Clean up uploaded files if validation fails
      if (files.postal_proof?.[0]) {
        deleteUploadedFiles(files.postal_proof[0].path);
      }
      
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: validationResult.errors
      });
    }

    const { competition_id, user_address, postal_proof, answer, user_id } = validationResult.data.body;
    const userId = user_id || req.user.id;
    
    const competition = await Competition.findById(competition_id);

    if (!competition) {
      // Clean up uploaded files if competition not found
      if (files.postal_proof?.[0]) {
        deleteUploadedFiles(files.postal_proof[0].path);
      }
      
      return res.status(404).json({
        success: false,
        message: 'Competition not found'
      });
    }

    if (!competition.free_entry_enabled) {
      // Clean up uploaded files if free entry not enabled
      if (files.postal_proof?.[0]) {
        deleteUploadedFiles(files.postal_proof[0].path);
      }
      
      return res.status(400).json({
        success: false,
        message: 'Free entry not available for this competition'
      });
    }

    const canEnter = await Competition.canUserEnter(competition_id, userId);
    if (!canEnter.canEnter) {
      // Clean up uploaded files if user cannot enter
      if (files.postal_proof?.[0]) {
        deleteUploadedFiles(files.postal_proof[0].path);
      }
      
      return res.status(400).json({
        success: false,
        message: canEnter.reason
      });
    }

    // Check if skill question is required for free entry
    if (competition.skill_question_enabled) {
      if (!answer) {
        // Clean up uploaded files if answer missing
        if (files.postal_proof?.[0]) {
          deleteUploadedFiles(files.postal_proof[0].path);
        }
        
        return res.status(400).json({
          success: false,
          message: 'Skill question answer is required for free entry'
        });
      }
      
      const isCorrect = answer.toLowerCase().trim() === competition.skill_question_answer.toLowerCase().trim();
      if (!isCorrect) {
        // Clean up uploaded files if answer incorrect
        if (files.postal_proof?.[0]) {
          deleteUploadedFiles(files.postal_proof[0].path);
        }
        
        return res.status(400).json({
          success: false,
          message: 'Incorrect answer to skill question'
        });
      }
    }

    // Check if user has already submitted free entry
    const existingFreeEntries = await Competition.getUserFreeEntries(competition_id, userId);
    if (existingFreeEntries.length >= competition.max_entries_per_user) {
      // Clean up uploaded files if max entries reached
      if (files.postal_proof?.[0]) {
        deleteUploadedFiles(files.postal_proof[0].path);
      }
      
      return res.status(400).json({
        success: false,
        message: 'Maximum free entries reached for this competition'
      });
    }

    // Record free entry with postal verification
    const entryId = await Competition.recordEntry({
      competition_id,
      user_id: userId,
      entry_type: 'FREE_ENTRY',
      postal_entry_received: !!postal_proof,
      skill_question_answered: !!answer,
      skill_question_correct: !!answer,
      user_address: user_address,
      postal_proof: postal_proof,
      status: postal_proof ? 'VERIFIED' : 'PENDING_VERIFICATION'
    });

    // If postal proof provided, update sold tickets
    if (postal_proof) {
      await Competition.updateSoldTickets(competition_id, 1);
    }

    res.json({
      success: true,
      message: postal_proof ? 'Free entry submitted and verified' : 'Free entry submitted successfully',
      data: { 
        entry_id: entryId,
        entry_received: true,
        requires_postal_confirmation: !postal_proof,
        verification_status: postal_proof ? 'VERIFIED' : 'PENDING',
        instructions: competition.free_entry_instructions,
        postal_address: competition.postal_address,
        deadline: competition.end_date,
        entry_number: existingFreeEntries.length + 1,
        postal_proof_url: postal_proof
      }
    });
  } catch (error) {
    console.error('Free entry error:', error);
    
    // Clean up uploaded files on error
    if (req.files?.postal_proof?.[0]) {
      deleteUploadedFiles(req.files.postal_proof[0].path);
    }
    
    res.status(500).json({
      success: false,
      message: 'Failed to submit free entry',
      error: error.message
    });
  }
};

// ==================== SPECIALIZED COMPETITION FUNCTIONS ====================

export const startJackpotCountdown = async (req, res) => {
  try {
    const validationResult = validateRequest(jackpotThresholdSchema, req);
    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: validationResult.errors
      });
    }

    const { competition_id, start_countdown, threshold_value } = validationResult.data.body;
    
    const competition = await Competition.findById(competition_id);
    
    if (!competition) {
      return res.status(404).json({
        success: false,
        message: 'Competition not found'
      });
    }

    if (competition.category !== 'JACKPOT') {
      return res.status(400).json({
        success: false,
        message: 'Only jackpot competitions can start countdown'
      });
    }

    // Update competition with threshold settings
    await Competition.update(competition_id, {
      threshold_type: start_countdown ? 'MANUAL' : 'AUTOMATIC',
      ...(threshold_value && { threshold_value })
    });

    // Log the action
    await Competition.logAdminAction({
      admin_id: req.user.id,
      action: start_countdown ? 'START_JACKPOT_COUNTDOWN' : 'STOP_JACKPOT_COUNTDOWN',
      target_id: competition_id,
      details: { threshold_value }
    });

    res.json({
      success: true,
      message: start_countdown ? 'Jackpot countdown started successfully' : 'Jackpot countdown stopped',
      data: { 
        competition_id,
        threshold_type: start_countdown ? 'MANUAL' : 'AUTOMATIC',
        threshold_value: threshold_value || competition.threshold_value,
        current_tickets: competition.sold_tickets,
        tickets_needed: threshold_value ? threshold_value - competition.sold_tickets : competition.threshold_value - competition.sold_tickets
      }
    });
  } catch (error) {
    console.error('Start jackpot countdown error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to start jackpot countdown',
      error: error.message
    });
  }
};

export const submitMiniGameScore = async (req, res) => {
  try {
    const validationResult = validateRequest(miniGameScoreSchema, req);
    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: validationResult.errors
      });
    }

    const { competition_id, game_id, score, time_taken, level_reached, session_data } = validationResult.data.body;
    const userId = req.user.id;
    
    const competition = await Competition.findById(competition_id);
    
    if (!competition) {
      return res.status(404).json({
        success: false,
        message: 'Competition not found'
      });
    }

    if (competition.category !== 'MINI_GAME') {
      return res.status(400).json({
        success: false,
        message: 'Only mini-game competitions accept scores'
      });
    }

    // Check if competition is active
    if (competition.status !== 'ACTIVE') {
      return res.status(400).json({
        success: false,
        message: 'Competition is not active'
      });
    }

    // Record the score
    const scoreRecord = await Competition.recordMiniGameScore({
      competition_id,
      game_id,
      user_id: userId,
      score,
      time_taken,
      level_reached,
      session_data
    });

    // Award points based on performance
    const pointsAwarded = await Competition.awardGamePoints({
      competition_id,
      user_id: userId,
      score,
      game_type: competition.game_type,
      points_per_play: competition.points_per_play
    });

    // Update leaderboard
    await Competition.updateLeaderboard(competition_id, userId, score);

    // Check for achievements
    const achievementsUnlocked = await Competition.checkGameAchievements(competition_id, userId, score);

    res.json({
      success: true,
      message: 'Score submitted successfully',
      data: {
        score_record: scoreRecord,
        points_awarded: pointsAwarded,
        current_rank: await Competition.getUserRank(competition_id, userId),
        achievements_unlocked: achievementsUnlocked,
        leaderboard_position: await Competition.getLeaderboardPosition(competition_id, userId)
      }
    });
  } catch (error) {
    console.error('Mini game score error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit mini-game score',
      error: error.message
    });
  }
};

export const claimInstantWin = async (req, res) => {
  try {
    const validationResult = validateRequest(instantWinSchemaValidation, req);
    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: validationResult.errors
      });
    }

    const { competition_id, ticket_number, user_id } = validationResult.data.body;
    const userId = user_id || req.user.id;
    
    const competition = await Competition.findById(competition_id);
    
    if (!competition) {
      return res.status(404).json({
        success: false,
        message: 'Competition not found'
      });
    }

    // Check if ticket number is a winning instant win
    const instantWin = await Competition.getInstantWinByTicketNumber(competition_id, ticket_number);
    
    if (!instantWin) {
      return res.status(404).json({
        success: false,
        message: 'No instant win found for this ticket number'
      });
    }

    if (instantWin.claimed_by) {
      return res.status(400).json({
        success: false,
        message: 'This instant win has already been claimed'
      });
    }

    // Verify user owns the ticket
    const ticketOwnership = await Competition.verifyTicketOwnership(competition_id, ticket_number, userId);
    if (!ticketOwnership) {
      return res.status(403).json({
        success: false,
        message: 'You do not own this ticket'
      });
    }

    // Claim the instant win
    const claimResult = await Competition.claimInstantWin(instantWin.id, userId);

    // Award the prize
    const awardResult = await Competition.awardInstantWinPrize(userId, instantWin);

    res.json({
      success: true,
      message: 'Instant win claimed successfully!',
      data: {
        instant_win: claimResult,
        prize_awarded: awardResult,
        claim_details: {
          claimed_at: new Date(),
          claim_id: claimResult.id,
          prize_value: instantWin.prize_value,
          prize_type: instantWin.payout_type
        }
      }
    });
  } catch (error) {
    console.error('Claim instant win error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to claim instant win',
      error: error.message
    });
  }
};

// ==================== ADMIN FUNCTIONS ====================

export const selectWinners = async (req, res) => {
  try {
    const validationResult = validateRequest(winnerSelectionSchema, req);
    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: validationResult.errors
      });
    }

    const { competition_id, method, winners_count, criteria } = validationResult.data.body;
    
    const competition = await Competition.findById(competition_id);
    
    if (!competition) {
      return res.status(404).json({
        success: false,
        message: 'Competition not found'
      });
    }

    // Check if competition has ended
    if (competition.status === 'ACTIVE' && competition.end_date && new Date(competition.end_date) > new Date()) {
      return res.status(400).json({
        success: false,
        message: 'Competition has not ended yet'
      });
    }

    let winners = [];
    
    switch (method) {
      case 'RANDOM_DRAW':
        winners = await Competition.selectRandomWinners(competition_id, winners_count || 1);
        break;
        
      case 'MANUAL_SELECTION':
        if (!criteria || !criteria.user_ids) {
          return res.status(400).json({
            success: false,
            message: 'User IDs required for manual selection'
          });
        }
        winners = await Competition.selectManualWinners(competition_id, criteria.user_ids);
        break;
        
      case 'SKILL_BASED':
        if (!criteria || !criteria.min_score) {
          return res.status(400).json({
            success: false,
            message: 'Score criteria required for skill-based selection'
          });
        }
        winners = await Competition.selectSkillBasedWinners(competition_id, criteria);
        break;
        
      case 'FIRST_ENTRY':
        winners = await Competition.selectFirstEntryWinners(competition_id, winners_count || 1);
        break;
    }

    // Record winners
    await Competition.recordWinners(competition_id, winners, method);

    // Update competition status
    await Competition.update(competition_id, { status: 'COMPLETED' });

    // Notify winners
    await Competition.notifyWinners(competition_id, winners);

    res.json({
      success: true,
      message: `Winners selected successfully using ${method.replace('_', ' ').toLowerCase()}`,
      data: {
        competition_id,
        method,
        winners_count: winners.length,
        winners: winners,
        next_steps: [
          'Send winner notifications',
          'Process prize distribution',
          'Update competition status to completed'
        ]
      }
    });
  } catch (error) {
    console.error('Select winners error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to select winners',
      error: error.message
    });
  }
};

export const autoSubscribeUsers = async (req, res) => {
  try {
    const { competition_id } = req.body;
    
    if (!competition_id) {
      return res.status(400).json({
        success: false,
        message: 'Competition ID is required'
      });
    }

    const competition = await Competition.findById(competition_id);
    
    if (!competition) {
      return res.status(404).json({
        success: false,
        message: 'Competition not found'
      });
    }

    if (competition.category !== 'SUBSCRIPTION') {
      return res.status(400).json({
        success: false,
        message: 'Only subscription competitions support auto-subscription'
      });
    }

    // Get eligible users based on subscription tier
    const eligibleUsers = await Competition.getEligibleUsersForSubscription(competition_id);
    
    // Auto-subscribe users
    const results = await Competition.autoSubscribeToCompetition(competition_id);
    
    res.json({
      success: true,
      message: `Auto-subscription completed for ${results.subscribed_count} users`,
      data: {
        competition_id,
        eligible_users_count: eligibleUsers.length,
        subscribed_count: results.subscribed_count,
        already_subscribed: results.already_subscribed,
        errors: results.errors,
        details: {
          subscription_tier: competition.subscription_tier,
          auto_entry_enabled: competition.auto_entry_enabled,
          competition_type: competition.subscriber_competition_type
        }
      }
    });
  } catch (error) {
    console.error('Auto subscribe error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to auto-subscribe users',
      error: error.message
    });
  }
};

export const getCompetitionStats = async (req, res) => {
  try {
    const { id } = req.params;
    const stats = await Competition.getStats(id);

    if (!stats) {
      return res.status(404).json({
        success: false,
        message: 'Competition not found'
      });
    }

    // Add analytics
    const analytics = await Competition.getAnalytics(id);
    const leaderboard = await Competition.getLeaderboard(id);
    const revenue = await Competition.getRevenueStats(id);
    const participation = await Competition.getParticipationStats(id);

    res.json({
      success: true,
      data: {
        basic_stats: stats,
        analytics: analytics,
        leaderboard: leaderboard,
        revenue: revenue,
        participation: participation,
        summary: {
          conversion_rate: stats.total_tickets > 0 ? (stats.sold_tickets / stats.total_tickets) * 100 : 0,
          avg_tickets_per_user: stats.unique_participants > 0 ? stats.sold_tickets / stats.unique_participants : 0,
          completion_status: stats.status,
          time_remaining: stats.end_date ? new Date(stats.end_date) - new Date() : null
        }
      }
    });
  } catch (error) {
    console.error('Get competition stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch competition stats',
      error: error.message
    });
  }
};

// ==================== ADDITIONAL CONTROLLER FUNCTIONS ====================

export const getCompetitionLeaderboard = async (req, res) => {
  try {
    const { id } = req.params;
    const { type = 'DAILY', limit = 50 } = req.query;
    
    const leaderboard = await Competition.getLeaderboard(id, type, parseInt(limit));
    
    res.json({
      success: true,
      data: leaderboard
    });
  } catch (error) {
    console.error('Get leaderboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch leaderboard',
      error: error.message
    });
  }
};

export const getCompetitionAnalytics = async (req, res) => {
  try {
    const { id } = req.params;
    const { period = '7d' } = req.query;
    
    const analytics = await Competition.getAnalytics(id, period);
    
    res.json({
      success: true,
      data: analytics
    });
  } catch (error) {
    console.error('Get analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch analytics',
      error: error.message
    });
  }
};

export const updateCompetitionStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, reason } = req.body;
    
    if (!status || !['ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Valid status is required'
      });
    }
    
    const updated = await Competition.updateStatus(id, status, reason);
    
    if (!updated) {
      return res.status(404).json({
        success: false,
        message: 'Competition not found'
      });
    }
    
    res.json({
      success: true,
      message: `Competition status updated to ${status}`,
      data: { competition_id: id, status, updated_at: new Date() }
    });
  } catch (error) {
    console.error('Update status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update competition status',
      error: error.message
    });
  }
};

export const duplicateCompetition = async (req, res) => {
  try {
    const { id } = req.params;
    const { title_suffix = 'Copy', ...overrides } = req.body;
    
    const originalCompetition = await Competition.findById(id);
    if (!originalCompetition) {
      return res.status(404).json({
        success: false,
        message: 'Original competition not found'
      });
    }

    // Create competition data from original
    const newCompetitionData = {
      ...originalCompetition,
      ...overrides,
      title: `${originalCompetition.title} (${title_suffix})`,
      id: undefined,
      created_at: undefined,
      updated_at: undefined,
      status: 'DRAFT',
      sold_tickets: 0
    };

    // Create new competition
    const newCompetitionId = await Competition.create(newCompetitionData);

    // Copy files if they exist
    const originalDir = path.join(process.env.COMPETITION_UPLOAD_PATH, id);
    const newDir = path.join(process.env.COMPETITION_UPLOAD_PATH, newCompetitionId);
    
    if (fs.existsSync(originalDir)) {
      // Copy directory recursively
      const copyDirRecursive = (src, dest) => {
        if (fs.existsSync(src)) {
          if (!fs.existsSync(dest)) {
            fs.mkdirSync(dest, { recursive: true });
          }
          
          const items = fs.readdirSync(src);
          items.forEach(item => {
            const srcPath = path.join(src, item);
            const destPath = path.join(dest, item);
            
            if (fs.statSync(srcPath).isDirectory()) {
              copyDirRecursive(srcPath, destPath);
            } else {
              fs.copyFileSync(srcPath, destPath);
            }
          });
        }
      };
      
      copyDirRecursive(originalDir, newDir);
    }
    
    res.json({
      success: true,
      message: 'Competition duplicated successfully',
      data: { 
        original_id: id, 
        new_competition_id: newCompetitionId,
        duplicated_at: new Date()
      }
    });
  } catch (error) {
    console.error('Duplicate competition error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to duplicate competition',
      error: error.message
    });
  }
};

export const exportCompetitionData = async (req, res) => {
  try {
    const { id } = req.params;
    const { format = 'json', include = 'all' } = req.query;
    
    const competition = await Competition.findById(id);
    if (!competition) {
      return res.status(404).json({
        success: false,
        message: 'Competition not found'
      });
    }

    // Gather all competition data
    const exportData = {
      competition: competition,
      entries: await Competition.getCompetitionEntries(id),
      winners: await Competition.getWinners(id),
      statistics: await Competition.getStats(id),
      instant_wins: await Competition.getInstantWins(id),
      achievements: await Competition.getAchievements(id),
      exported_at: new Date().toISOString(),
      export_format: format,
      included_data: include
    };

    if (format === 'csv') {
      // Convert to CSV format
      const { Parser } = await import('json2csv');
      const parser = new Parser();
      const csv = parser.parse(exportData.competition);
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="competition-${id}-export.csv"`);
      return res.send(csv);
    }

    // Default to JSON
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="competition-${id}-export.json"`);
    res.send(JSON.stringify(exportData, null, 2));
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to export competition data',
      error: error.message
    });
  }
};

export const getCompetitionWinners = async (req, res) => {
  try {
    const { id } = req.params;
    
    const winners = await Competition.getWinners(id);
    
    res.json({
      success: true,
      data: winners
    });
  } catch (error) {
    console.error('Get winners error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch winners',
      error: error.message
    });
  }
};

export const validateCompetitionEntry = async (req, res) => {
  try {
    const { competition_id, user_id } = req.body;
    
    if (!competition_id) {
      return res.status(400).json({
        success: false,
        message: 'Competition ID is required'
      });
    }
    
    const userId = user_id || req.user?.id;
    const validation = await Competition.validateEntry(competition_id, userId);
    
    res.json({
      success: true,
      data: validation
    });
  } catch (error) {
    console.error('Validate entry error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to validate entry',
      error: error.message
    });
  }
};

export const bulkCreateCompetitions = async (req, res) => {
  try {
    // Handle CSV file upload
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'CSV file is required for bulk creation'
      });
    }

    const csvPath = req.file.path;
    
    // Read and parse CSV file
    const competitions = await parseCompetitionsCSV(csvPath);
    
    // Validate each competition
    const validCompetitions = [];
    const invalidCompetitions = [];
    
    for (const competition of competitions) {
      const validationResult = createCompetitionSchema.safeParse({ 
        body: competition 
      });
      
      if (validationResult.success) {
        validCompetitions.push(validationResult.data.body);
      } else {
        invalidCompetitions.push({
          row: competition._row,
          errors: validationResult.error.errors,
          data: competition
        });
      }
    }
    
    // Create valid competitions
    const createdIds = [];
    const errors = [];
    
    for (const competition of validCompetitions) {
      try {
        const competitionId = await Competition.create(competition);
        createdIds.push(competitionId);
      } catch (error) {
        errors.push({
          row: competition._row,
          error: error.message,
          data: competition
        });
      }
    }
    
    // Delete CSV file
    deleteUploadedFiles(csvPath);
    
    res.json({
      success: true,
      message: 'Bulk competition creation completed',
      data: {
        total_processed: competitions.length,
        created: createdIds.length,
        failed: invalidCompetitions.length + errors.length,
        created_ids: createdIds,
        validation_errors: invalidCompetitions,
        creation_errors: errors
      }
    });
  } catch (error) {
    console.error('Bulk create error:', error);
    
    // Clean up uploaded file on error
    if (req.file) {
      deleteUploadedFiles(req.file.path);
    }
    
    res.status(500).json({
      success: false,
      message: 'Failed to bulk create competitions',
      error: error.message
    });
  }
};

// Helper function to parse CSV
const parseCompetitionsCSV = async (csvPath) => {
  return new Promise((resolve, reject) => {
    const fs = require('fs');
    const csv = require('csv-parser');
    
    const competitions = [];
    let rowNumber = 1;
    
    fs.createReadStream(csvPath)
      .pipe(csv())
      .on('data', (row) => {
        // Map CSV columns to competition fields
        const competition = {
          title: row.title,
          description: row.description,
          price: parseFloat(row.price) || 0,
          total_tickets: parseInt(row.total_tickets) || 100,
          category: row.category || 'PAID',
          type: row.type || 'STANDARD',
          start_date: row.start_date || new Date().toISOString(),
          end_date: row.end_date || null,
          _row: rowNumber++
        };
        
        competitions.push(competition);
      })
      .on('end', () => {
        resolve(competitions);
      })
      .on('error', (error) => {
        reject(error);
      });
  });
};

export const getCompetitionTypes = async (req, res) => {
  try {
    const types = [
      {
        value: 'PAID',
        label: 'Paid Competition',
        description: 'Users purchase tickets to enter',
        requirements: ['Skill question OR Free entry route required'],
        icon: '💰'
      },
      {
        value: 'FREE',
        label: 'Free Competition',
        description: 'No payment required to enter',
        requirements: ['Price must be 0'],
        icon: '🎁'
      },
      {
        value: 'JACKPOT',
        label: 'Jackpot Competition',
        description: 'Big prize competition with threshold',
        requirements: ['Minimum £10 ticket', 'Prize option', 'Ticket model'],
        icon: '🎰'
      },
      {
        value: 'MINI_GAME',
        label: 'Mini-Game Competition',
        description: 'Skill-based game with leaderboard',
        requirements: ['Game type', 'Leaderboard type'],
        icon: '🎮'
      },
      {
        value: 'SUBSCRIPTION',
        label: 'Subscription Competition',
        description: 'Only for subscribed members',
        requirements: ['Subscription tier', 'Auto-entry enabled'],
        icon: '👑'
      },
      {
        value: 'VIP',
        label: 'VIP Competition',
        description: 'Exclusive competitions for VIP members',
        requirements: ['VIP status verification'],
        icon: '⭐'
      },
      {
        value: 'INSTANT_WIN',
        label: 'Instant Win Competition',
        description: 'Instant prizes while competition runs',
        requirements: ['Instant win configurations'],
        icon: '⚡'
      },
      {
        value: 'ROLLING',
        label: 'Rolling Competition',
        description: 'Continuous competition without fixed end',
        requirements: ['No end date'],
        icon: '🔄'
      }
    ];
    
    res.json({
      success: true,
      data: types
    });
  } catch (error) {
    console.error('Get types error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch competition types',
      error: error.message
    });
  }
};

export const getCompetitionTemplates = async (req, res) => {
  try {
    const { category } = req.query;
    
    const templates = {
      'JACKPOT': {
        name: 'Standard Jackpot',
        description: '£1,000,000 jackpot with 1,000,000 tickets',
        defaults: {
          price: 10,
          total_tickets: 1000000,
          prize_option: 'A',
          ticket_model: 'MODEL_1',
          threshold_type: 'AUTOMATIC',
          threshold_value: 1200
        }
      },
      'SUBSCRIPTION': {
        name: 'Monthly Subscriber Draw',
        description: 'Monthly draw for subscribers only',
        defaults: {
          price: 0,
          subscription_tier: 'TIER_2',
          auto_entry_enabled: true
        }
      },
      'MINI_GAME': {
        name: 'Daily Mini-Game Challenge',
        description: 'Daily skill game with leaderboard',
        defaults: {
          game_type: 'FREE_TO_PLAY',
          leaderboard_type: 'DAILY',
          points_per_play: 10
        }
      },
      'PAID': {
        name: 'Standard Paid Competition',
        description: 'Standard competition with skill question',
        defaults: {
          price: 5,
          total_tickets: 1000,
          skill_question_enabled: true,
          free_entry_enabled: false
        }
      },
      'FREE': {
        name: 'Free Entry Competition',
        description: 'Free to enter competition',
        defaults: {
          price: 0,
          is_free_competition: true,
          competition_type: 'FREE'
        }
      }
    };
    
    const result = category ? { [category]: templates[category] } : templates;
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Get templates error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch templates',
      error: error.message
    });
  }
};

export const processWheelSpin = async (req, res) => {
  try {
    // Wheel spin removed - return appropriate response
    return res.status(400).json({
      success: false,
      message: 'Wheel spin competitions have been removed from the system'
    });
  } catch (error) {
    console.error('Wheel spin error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process wheel spin',
      error: error.message
    });
  }
};

// ==================== HELPER FUNCTIONS ====================

function getCompetitionTags(competition) {
  const tags = [competition.category, competition.competition_type];
  
  if (competition.subscription_tier) {
    tags.push(competition.subscription_tier);
  }
  
  if (competition.game_type) {
    tags.push(competition.game_type);
  }
  
  if (competition.is_free_competition) {
    tags.push('FREE');
  }
  
  if (competition.skill_question_enabled) {
    tags.push('SKILL_QUESTION');
  }
  
  if (competition.free_entry_enabled) {
    tags.push('FREE_ENTRY');
  }
  
  if (competition.leaderboard_type) {
    tags.push(competition.leaderboard_type);
  }
  
  return [...new Set(tags)]; // Remove duplicates
}

function getCompetitionFeatures(competition) {
  return {
    has_instant_wins: competition.instant_wins_count > 0,
    has_achievements: competition.achievements_count > 0,
    has_mini_game: competition.category === 'MINI_GAME',
    requires_subscription: competition.category === 'SUBSCRIPTION',
    is_jackpot: competition.category === 'JACKPOT',
    has_countdown: competition.countdown_seconds > 0,
    has_skill_question: competition.skill_question_enabled,
    has_free_entry: competition.free_entry_enabled,
    auto_entry: competition.auto_entry_enabled,
    has_leaderboard: competition.leaderboard_type !== null
  };
}

function getCompetitionNextSteps(category) {
  const steps = {
    'JACKPOT': ['Set up prize distribution', 'Configure threshold', 'Start marketing campaign'],
    'SUBSCRIPTION': ['Link to subscription tiers', 'Configure auto-entry', 'Notify eligible users'],
    'MINI_GAME': ['Configure game settings', 'Set up leaderboard', 'Test game integration'],
    'PAID': ['Set up payment integration', 'Configure compliance options', 'Start ticket sales'],
    'FREE': ['Configure entry limits', 'Set up sharing options', 'Start promotion']
  };
  
  return steps[category] || ['Review settings', 'Test functionality', 'Launch competition'];
}