import Competition from './models/Competition.js';
import fs from 'fs';
import path from 'path';
import { Parser } from 'json2csv';
import { getFileUrl, deleteUploadedFiles } from '../../../middleware/upload.js';
import SubscriptionTicketService from '../Payments/SubscriptionTicketService.js';
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

const uploadRoot = process.env.UPLOAD_ROOT
  ? path.resolve(process.env.UPLOAD_ROOT)
  : path.resolve('./uploads');
const competitionUploadsBase = process.env.COMPETITION_UPLOAD_PATH
  ? path.resolve(process.env.COMPETITION_UPLOAD_PATH)
  : path.join(uploadRoot, 'competitions');

// Helper function for validation
export const validateRequest = (schema, data) => {
  const validationResult = schema.safeParse(data);
  if (!validationResult.success) {
    return { success: false, errors: validationResult.error.issues };
  }
  return { success: true, data: validationResult.data };
};


// ==================== COMPETITION CREATION & MANAGEMENT ====================

const safeParseInt = (val) => (val !== undefined ? parseInt(val) : undefined);
const safeParseFloat = (val) => (val !== undefined ? parseFloat(val) : undefined);
const safeParseBool = (val) => val === 'true' || val === true;

const toMySQLDateTime = (value) => {
  if (!value) return null;

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const pad = (num) => String(num).padStart(2, '0');

  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
};

// Helper to delete uploaded files
const cleanupFiles = (files) => {
  Object.values(files).flat().forEach(file => {
    if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
  });
};

// Normalize incoming rules/restrictions payloads into a consistent array structure
const normalizeRulesAndRestrictions = (rawValue) => {
  if (rawValue === undefined || rawValue === null) {
    return [];
  }

  const formatEntry = (entry) => {
    if (typeof entry === 'string') {
      const trimmed = entry.trim();
      return trimmed ? { title: trimmed, description: null } : null;
    }

    if (entry && typeof entry === 'object') {
      const title = entry.title || entry.rule || entry.label || '';
      const description = entry.description || entry.details || entry.restriction || null;
      return title ? { title, description } : null;
    }

    return null;
  };

  const parseValue = (value) => {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return [];

      try {
        return parseValue(JSON.parse(trimmed));
      } catch (err) {
        return trimmed
          .split('\n')
          .map(line => line.trim())
          .filter(Boolean)
          .map(line => ({ title: line, description: null }));
      }
    }

    if (Array.isArray(value)) {
      return value.map(formatEntry).filter(Boolean);
    }

    if (value && typeof value === 'object') {
      const normalized = formatEntry(value);
      return normalized ? [normalized] : [];
    }

    return [];
  };

  return parseValue(rawValue);
};

const ensureInstantWinCapacity = (instantWins, totalTickets) => {
  if (!Array.isArray(instantWins) || instantWins.length === 0) {
    return { valid: true };
  }

  const normalizedTotalTickets = parseInt(totalTickets, 10);
  if (!Number.isInteger(normalizedTotalTickets) || normalizedTotalTickets <= 0) {
    return {
      valid: false,
      message: 'Total tickets must be a positive integer when configuring instant wins'
    };
  }

  const usedTicketNumbers = new Set();
  let allocatedSlots = 0;

  for (let index = 0; index < instantWins.length; index += 1) {
    const instantWin = instantWins[index] || {};
    const tickets = Array.isArray(instantWin.ticket_numbers) ? instantWin.ticket_numbers : [];

    for (const rawTicket of tickets) {
      const ticketNumber = parseInt(rawTicket, 10);
      if (!Number.isInteger(ticketNumber) || ticketNumber < 1 || ticketNumber > normalizedTotalTickets) {
        return {
          valid: false,
          message: `Instant win #${index + 1} has ticket number ${rawTicket} outside the range 1-${normalizedTotalTickets}`
        };
      }

      if (usedTicketNumbers.has(ticketNumber)) {
        return {
          valid: false,
          message: `Instant win ticket number ${ticketNumber} is duplicated across prizes`
        };
      }

      usedTicketNumbers.add(ticketNumber);
    }

    const maxCount = parseInt(instantWin.max_count ?? instantWin.max_winners, 10);
    if (Number.isInteger(maxCount) && maxCount > 0) {
      allocatedSlots += maxCount;
      continue;
    }

    const randomCount = parseInt(instantWin.random_count, 10);
    const firstEntryCount = parseInt(instantWin.first_entry_count, 10);
    const derivedSlotCount =
      (Number.isInteger(randomCount) ? randomCount : 0) +
      (Number.isInteger(firstEntryCount) ? firstEntryCount : 0);

    if (derivedSlotCount > 0) {
      allocatedSlots += derivedSlotCount;
    } else {
      allocatedSlots += tickets.length;
    }
  }

  if (allocatedSlots > normalizedTotalTickets) {
    return {
      valid: false,
      message: `Instant win allocations (${allocatedSlots}) exceed total tickets (${normalizedTotalTickets})`
    };
  }

  return { valid: true };
};

const generateUniqueTicketNumbers = (count, maxTicket, usedNumbers = new Set()) => {
  if (!Number.isInteger(count) || count <= 0) {
    return [];
  }

  if (!Number.isInteger(maxTicket) || maxTicket <= 0) {
    return null;
  }

  const availableCount = maxTicket - usedNumbers.size;
  if (count > availableCount) {
    return null;
  }

  if (count > availableCount / 2) {
    const available = [];
    for (let i = 1; i <= maxTicket; i += 1) {
      if (!usedNumbers.has(i)) {
        available.push(i);
      }
    }

    for (let i = available.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [available[i], available[j]] = [available[j], available[i]];
    }

    return available.slice(0, count);
  }

  const selected = [];
  const localUsed = new Set(usedNumbers);
  let attempts = 0;
  const maxAttempts = count * 25 + 500;

  while (selected.length < count && attempts < maxAttempts) {
    const candidate = Math.floor(Math.random() * maxTicket) + 1;
    if (!localUsed.has(candidate)) {
      localUsed.add(candidate);
      selected.push(candidate);
    }
    attempts += 1;
  }

  if (selected.length < count) {
    const remaining = [];
    for (let i = 1; i <= maxTicket; i += 1) {
      if (!localUsed.has(i)) {
        remaining.push(i);
      }
    }

    while (selected.length < count) {
      const idx = Math.floor(Math.random() * remaining.length);
      selected.push(remaining.splice(idx, 1)[0]);
    }
  }

  return selected;
};

const groupInstantWins = (instantWins = []) => {
  const grouped = new Map();

  instantWins.forEach((win) => {
    const key = JSON.stringify({
      prize_name: win.prize_name || null,
      prize_value: win.prize_value ?? null,
      payout_type: win.payout_type || null,
      image_url: win.image_url || null,
      prize_type: win.prize_type || null,
      title: win.title || null
    });

    if (!grouped.has(key)) {
      grouped.set(key, {
        ...win,
        ticket_numbers: [],
        claimed_ticket_numbers: []
      });
    }

    const entry = grouped.get(key);

    if (Number.isInteger(win.ticket_number)) {
      if (!entry.ticket_numbers.includes(win.ticket_number)) {
        entry.ticket_numbers.push(win.ticket_number);
      }

      if (win.claimed_by && !entry.claimed_ticket_numbers.includes(win.ticket_number)) {
        entry.claimed_ticket_numbers.push(win.ticket_number);
      }
    }
  });

  return Array.from(grouped.values()).map((win) => {
    const totalSlots = win.ticket_numbers.length;
    const claimedSlots = win.claimed_ticket_numbers.length;
    return {
      ...win,
      ticket_numbers: win.ticket_numbers.sort((a, b) => a - b),
      total_slots: totalSlots,
      claimed_slots: claimedSlots,
      remaining_slots: Math.max(0, totalSlots - claimedSlots)
    };
  });
};

export const createCompetition = async (req, res) => {
  try {
    const files = req.files || {};

    // Normalize request body: numbers, booleans, and dates
    const bodyData = {
      ...req.body,
      price: req.body.price !== undefined ? parseFloat(req.body.price) : undefined,
      total_tickets: req.body.total_tickets !== undefined ? parseInt(req.body.total_tickets) : undefined,
      max_entries_per_user: req.body.max_entries_per_user !== undefined ? parseInt(req.body.max_entries_per_user) : undefined,
      points_per_pound: req.body.points_per_pound !== undefined ? parseInt(req.body.points_per_pound) : undefined,
      free_entry_enabled: req.body.free_entry_enabled === 'true' || req.body.free_entry_enabled === true,
      auto_entry_enabled: req.body.auto_entry_enabled === 'true' || req.body.auto_entry_enabled === true,
      skill_question_enabled: req.body.skill_question_enabled === 'true' || req.body.skill_question_enabled === true,
      instant_win_enabled: req.body.instant_win_enabled === 'true' || req.body.instant_win_enabled === true,
      max_instant_wins_per_user: req.body.max_instant_wins_per_user !== undefined ? parseInt(req.body.max_instant_wins_per_user) : undefined,
      is_free_competition: req.body.is_free_competition === 'true' || req.body.is_free_competition === true,
      no_end_date: req.body.no_end_date === 'true' || req.body.no_end_date === true,
      achievements_enabled: req.body.achievements_enabled === 'true' || req.body.achievements_enabled === true,
      start_date: req.body.start_date ? new Date(req.body.start_date) : undefined,
      end_date: req.body.end_date ? new Date(req.body.end_date) : undefined,
    };

    // Combine body and uploaded files
    const competitionData = {
      ...bodyData,

      featured_image:
        files?.featured_image?.[0]
          ? getFileUrl(files.featured_image[0].path)
          : null,

      featured_video:
        files?.featured_video?.[0]
          ? getFileUrl(files.featured_video[0].path)
          : null,

      banner_image:
        files?.banner_image?.[0]
          ? getFileUrl(files.banner_image[0].path)
          : null,

      gallery_images:
        files?.gallery_images?.length
          ? files.gallery_images.map(f => getFileUrl(f.path))
          : [],

      rules_and_restrictions: normalizeRulesAndRestrictions(req.body.rules_and_restrictions)
    };

    // Allow JSON string fields when using multipart/form-data (Postman form-data)
    const parseJsonField = (v) => {
      if (v === undefined || v === null) return v;
      if (typeof v === 'string') {
        try {
          return JSON.parse(v);
        } catch (e) {
          return v;
        }
      }
      return v;
    };

    // If client sent arrays/objects as JSON strings in form-data, parse them
    if (!competitionData.instant_wins || typeof competitionData.instant_wins === 'string') {
      const parsed = parseJsonField(req.body.instant_wins);
      if (parsed) competitionData.instant_wins = parsed;
    }
    if (!competitionData.achievements || typeof competitionData.achievements === 'string') {
      const parsed = parseJsonField(req.body.achievements);
      if (parsed) competitionData.achievements = parsed;
    }
    if ((!competitionData.gallery_images || competitionData.gallery_images.length === 0) && req.body.gallery_images) {
      const parsed = parseJsonField(req.body.gallery_images);
      if (Array.isArray(parsed)) competitionData.gallery_images = parsed;
    }

    // Attach uploaded instant win images: align by index, or reuse a single upload for all
    if (Array.isArray(competitionData.instant_wins) && files.instant_win_images?.length) {
      const instantWinImages = files.instant_win_images.map(f => getFileUrl(f.path));

      competitionData.instant_wins = competitionData.instant_wins.map((instantWin, index) => ({
        ...instantWin,
        image_url:
          instantWinImages[index] ||
          (instantWinImages.length === 1 ? instantWinImages[0] : instantWin.image_url) ||
          instantWin.image_url
      }));
    }

    // Attach uploaded achievement images: align by index, or reuse a single upload for all
    const achievementFiles =
      files.achievement_images?.length
        ? files.achievement_images
        : (Array.isArray(competitionData.instant_wins) && competitionData.instant_wins.length > 0)
          ? []
          : (files.instant_win_images || []);

    if (Array.isArray(competitionData.achievements) && achievementFiles.length) {
      const achievementImages = achievementFiles.map(f => getFileUrl(f.path));

      competitionData.achievements = competitionData.achievements.map((achievement, index) => ({
        ...achievement,
        image_url:
          achievementImages[index] ||
          (achievementImages.length === 1 ? achievementImages[0] : achievement.image_url) ||
          achievement.image_url
      }));
    }

    // Auto-generate instant win ticket numbers when none are provided
    if (Array.isArray(competitionData.instant_wins) && competitionData.instant_wins.length > 0) {
      const usedNumbers = new Set();

      competitionData.instant_wins.forEach((instantWin) => {
        const ticketNumbers = Array.isArray(instantWin.ticket_numbers)
          ? instantWin.ticket_numbers
          : [];

        const normalized = ticketNumbers
          .map((num) => parseInt(num, 10))
          .filter((num) => Number.isInteger(num) && num > 0);

        instantWin.ticket_numbers = normalized;
        normalized.forEach((num) => usedNumbers.add(num));
      });

      const maxTicket = Number.isInteger(competitionData.total_tickets)
        ? competitionData.total_tickets
        : null;

      if (maxTicket) {
        for (const instantWin of competitionData.instant_wins) {
          const randomCount = parseInt(instantWin.random_count, 10);
          const firstEntryCount = parseInt(instantWin.first_entry_count, 10);
          const hasSplitCounts =
            Number.isInteger(randomCount) || Number.isInteger(firstEntryCount);
          const targetRandomCount = Number.isInteger(randomCount) ? randomCount : 0;

          if (hasSplitCounts && instantWin.ticket_numbers.length === 0 && targetRandomCount > 0) {
            const generated = generateUniqueTicketNumbers(targetRandomCount, maxTicket, usedNumbers);
            if (!generated) {
              return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors: [
                  {
                    path: 'body.instant_wins',
                    message: 'Not enough unique ticket numbers available to generate instant wins'
                  }
                ]
              });
            }

            instantWin.ticket_numbers = generated;
          }
        }
      }
    }


    // Validate with Zod
    const validationResult = validateRequest(createCompetitionSchema, { body: competitionData });
    console.log('Validation Result:', validationResult);

    if (!validationResult.success) {
      const formattedErrors = validationResult.errors.map(err => ({
        path: ['body', ...err.path].join('.'),
        message: err.message
      }));

      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: formattedErrors
      });
    }

    const validatedData = validationResult.data.body;

    const instantWinCapacity = ensureInstantWinCapacity(
      validatedData.instant_wins,
      validatedData.total_tickets
    );

    if (!instantWinCapacity.valid) {
      cleanupFiles(files);
      return res.status(400).json({
        success: false,
        message: 'Instant win validation failed',
        errors: [
          {
            path: 'body.instant_wins',
            message: instantWinCapacity.message
          }
        ]
      });
    }

    // Convert dates to MySQL DATETIME format
    validatedData.start_date = toMySQLDateTime(validatedData.start_date);
    validatedData.end_date = toMySQLDateTime(validatedData.end_date);

    // Check admin role
    if (!['SUPERADMIN', 'ADMIN'].includes(req.user.role)) {
      Object.values(files).flat().forEach(file => deleteUploadedFiles(file.path));
      return res.status(403).json({
        success: false,
        message: 'Only administrators can create competitions'
      });
    }

    // Competition type logic
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

    // Category defaults
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

    // Process gallery images
    // Process gallery images - with Render workaround
    // Process gallery images
    if (files.gallery_images?.length > 0) {
      // Cloudinary/Render: Use original file paths (URLs)
      const galleryUrls = files.gallery_images.map(file => getFileUrl(file.path));
      await Competition.update(competitionId, { gallery_images: galleryUrls });
      validatedData.gallery_images = galleryUrls;
    }

    // Instant wins
    if (validatedData.instant_wins?.length > 0) {
      await Competition.createInstantWins(competitionId, validatedData.instant_wins);
    }

    // Achievements
    if (validatedData.achievements?.length > 0) {
      await Competition.createAchievements(competitionId, validatedData.achievements);
    }

    // Auto-subscribe
    if (validatedData.category === 'SUBSCRIPTION' && validatedData.auto_entry_enabled) {
      await Competition.autoSubscribeToCompetition(competitionId);
    }

    // Success response
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
    if (req.files) Object.values(req.files).flat().forEach(file => deleteUploadedFiles(file.path));
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

    if (Object.prototype.hasOwnProperty.call(req.body, 'rules_and_restrictions')) {
      competitionData.rules_and_restrictions = normalizeRulesAndRestrictions(req.body.rules_and_restrictions);
    }

    // Allow JSON strings for form-data submissions
    const parseJsonField = (v) => {
      if (v === undefined || v === null) return v;
      if (typeof v === 'string') {
        try {
          return JSON.parse(v);
        } catch (e) {
          return v;
        }
      }
      return v;
    };

    if (typeof competitionData.instant_wins === 'string') {
      const parsedInstantWins = parseJsonField(competitionData.instant_wins);
      if (parsedInstantWins) competitionData.instant_wins = parsedInstantWins;
    }

    if (typeof competitionData.achievements === 'string') {
      const parsedAchievements = parseJsonField(competitionData.achievements);
      if (parsedAchievements) competitionData.achievements = parsedAchievements;
    }

    if (typeof competitionData.gallery_images === 'string') {
      const parsedGalleryImages = parseJsonField(competitionData.gallery_images);
      if (Array.isArray(parsedGalleryImages)) competitionData.gallery_images = parsedGalleryImages;
    }

    // Attach uploaded achievement images by index order (if provided)
    const updateAchievementFiles =
      files.achievement_images?.length
        ? files.achievement_images
        : (Array.isArray(competitionData.instant_wins) && competitionData.instant_wins.length > 0)
          ? []
          : (files.instant_win_images || []);

    if (Array.isArray(competitionData.achievements) && updateAchievementFiles.length) {
      competitionData.achievements = competitionData.achievements.map((achievement, index) => ({
        ...achievement,
        image_url: updateAchievementFiles[index]
          ? getFileUrl(updateAchievementFiles[index].path)
          : achievement.image_url
      }));
    }

    // Attach uploaded instant win images by index order (if provided)
    if (Array.isArray(competitionData.instant_wins) && files.instant_win_images?.length) {
      competitionData.instant_wins = competitionData.instant_wins.map((instantWin, index) => ({
        ...instantWin,
        image_url: files.instant_win_images[index]
          ? getFileUrl(files.instant_win_images[index].path)
          : instantWin.image_url
      }));
    }

    // Process uploaded files and delete old ones
    if (files.featured_image?.[0]) {
      // Delete old featured image if exists
      if (currentCompetition.featured_image) {
        const oldPath = path.join(competitionUploadsBase, currentCompetition.featured_image.replace('/uploads/competitions/', ''));
        deleteUploadedFiles(oldPath);
      }
      competitionData.featured_image = getFileUrl(files.featured_image[0].path);
    }

    if (files.featured_video?.[0]) {
      // Delete old featured video if exists
      if (currentCompetition.featured_video) {
        const oldPath = path.join(competitionUploadsBase, currentCompetition.featured_video.replace('/uploads/competitions/', ''));
        deleteUploadedFiles(oldPath);
      }
      competitionData.featured_video = getFileUrl(files.featured_video[0].path);
    }

    if (files.banner_image?.[0]) {
      // Delete old banner image if exists
      if (currentCompetition.banner_image) {
        const oldPath = path.join(competitionUploadsBase, currentCompetition.banner_image.replace('/uploads/competitions/', ''));
        deleteUploadedFiles(oldPath);
      }
      competitionData.banner_image = getFileUrl(files.banner_image[0].path);
    }

    // Handle gallery images
    if (files.gallery_images && files.gallery_images.length > 0) {
      const galleryDir = path.join(competitionUploadsBase, id, 'gallery');
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

    // Auto-generate instant win ticket numbers when none are provided
    if (Array.isArray(competitionData.instant_wins) && competitionData.instant_wins.length > 0) {
      const usedNumbers = new Set();

      competitionData.instant_wins.forEach((instantWin) => {
        const ticketNumbers = Array.isArray(instantWin.ticket_numbers)
          ? instantWin.ticket_numbers
          : [];

        const normalized = ticketNumbers
          .map((num) => parseInt(num, 10))
          .filter((num) => Number.isInteger(num) && num > 0);

        instantWin.ticket_numbers = normalized;
        normalized.forEach((num) => usedNumbers.add(num));
      });

      const totalTicketsRaw =
        competitionData.total_tickets !== undefined
          ? competitionData.total_tickets
          : currentCompetition.total_tickets;
      const maxTicket = parseInt(totalTicketsRaw, 10);

      if (Number.isInteger(maxTicket) && maxTicket > 0) {
        for (const instantWin of competitionData.instant_wins) {
          const randomCount = parseInt(instantWin.random_count, 10);
          const firstEntryCount = parseInt(instantWin.first_entry_count, 10);
          const hasSplitCounts =
            Number.isInteger(randomCount) || Number.isInteger(firstEntryCount);
          const targetRandomCount = Number.isInteger(randomCount) ? randomCount : 0;

          if (hasSplitCounts && instantWin.ticket_numbers.length === 0 && targetRandomCount > 0) {
            const generated = generateUniqueTicketNumbers(targetRandomCount, maxTicket, usedNumbers);
            if (!generated) {
              return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors: [
                  {
                    path: 'body.instant_wins',
                    message: 'Not enough unique ticket numbers available to generate instant wins'
                  }
                ]
              });
            }

            instantWin.ticket_numbers = generated;
          }
        }
      }
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

    const totalTicketsForInstantWins =
      updateData.total_tickets !== undefined
        ? updateData.total_tickets
        : currentCompetition.total_tickets;
    const instantWinCapacity = ensureInstantWinCapacity(
      updateData.instant_wins,
      totalTicketsForInstantWins
    );

    if (!instantWinCapacity.valid) {
      if (files) {
        Object.values(files).forEach(fileArray => {
          fileArray.forEach(file => {
            deleteUploadedFiles(file.path);
          });
        });
      }

      return res.status(400).json({
        success: false,
        message: 'Instant win validation failed',
        errors: [
          {
            path: 'body.instant_wins',
            message: instantWinCapacity.message
          }
        ]
      });
    }

    if (
      updateData.total_tickets !== undefined &&
      (!Array.isArray(updateData.instant_wins) || updateData.instant_wins.length === 0)
    ) {
      const existingInstantWins = currentCompetition.instant_wins_count || 0;
      if (updateData.total_tickets < existingInstantWins) {
        if (files) {
          Object.values(files).forEach(fileArray => {
            fileArray.forEach(file => {
              deleteUploadedFiles(file.path);
            });
          });
        }

        return res.status(400).json({
          success: false,
          message: 'Instant win validation failed',
          errors: [
            {
              path: 'body.total_tickets',
              message: `Total tickets cannot be less than existing instant wins (${existingInstantWins})`
            }
          ]
        });
      }
    }
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
    const hasStatusParam = req.query.status !== undefined;
    const normalizedStatus = hasStatusParam ? String(req.query.status).toUpperCase() : undefined;
    const statusFilter = hasStatusParam
      ? (normalizedStatus === 'ALL' ? undefined : normalizedStatus)
      : undefined; // default: no status filter, return all

    const rawLimit = req.query.limit;
    const limitIsAll = typeof rawLimit === 'string' && rawLimit.toUpperCase() === 'ALL';
    const limit = limitIsAll ? null : (parseInt(rawLimit) || 20);
    const page = limitIsAll ? 1 : (parseInt(req.query.page) || 1);

    const isFreeParam = req.query.is_free;
    let isFreeFilter;
    if (isFreeParam === 'true' || isFreeParam === true) {
      isFreeFilter = true;
    } else if (isFreeParam === 'false' || isFreeParam === false) {
      isFreeFilter = false;
    } else if (req.query.free_only) {
      isFreeFilter = true;
    }

    const filters = {
      status: statusFilter,
      category: req.query.category,
      competition_type: req.query.type ? String(req.query.type).toUpperCase() : undefined,
      is_free: isFreeFilter,
      min_price: req.query.min_price,
      max_price: req.query.max_price,
      search: req.query.search,
      limit,
      page,
      sort_by: req.query.sort_by || 'created_at',
      sort_order: req.query.sort_order || 'desc'
    };

    if (req.user) {
      filters.user_id = req.user.id;

      // Filter out subscription competitions user can't access
      if (req.user.role !== 'ADMIN' && req.user.role !== 'SUPERADMIN') {
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
      game_id: comp.game_id,
      leaderboard_type: comp.leaderboard_type,
      game_name: comp.game_name,
      game_code: comp.game_code,
      points_per_play: comp.points_per_play,
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
      has_instant_wins: (comp.instant_wins_count || 0) > 0,
      instant_wins_summary: (comp.instant_wins_count || 0) > 0 ? {
        total: comp.instant_wins_count || 0,
        claimed: comp.instant_wins_claimed_count || 0,
        remaining: Math.max(0, (comp.instant_wins_count || 0) - (comp.instant_wins_claimed_count || 0))
      } : null,
      rules_and_restrictions: comp.rules_and_restrictions || [],
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

export const getUserCompetitions = async (req, res) => {
  try {
    const rawLimit = req.query.limit;
    const limitIsAll = typeof rawLimit === 'string' && rawLimit.toUpperCase() === 'ALL';
    const limit = limitIsAll ? null : (parseInt(rawLimit) || 20);
    const page = limitIsAll ? 1 : (parseInt(req.query.page) || 1);

    const hasStatusParam = req.query.status !== undefined;
    const normalizedStatus = hasStatusParam ? String(req.query.status).toUpperCase() : undefined;
    const statusFilter = hasStatusParam
      ? (normalizedStatus === 'ALL' ? undefined : normalizedStatus)
      : undefined;

    const isFreeParam = req.query.is_free;
    let isFreeFilter;
    if (isFreeParam === 'true' || isFreeParam === true) {
      isFreeFilter = true;
    } else if (isFreeParam === 'false' || isFreeParam === false) {
      isFreeFilter = false;
    } else if (req.query.free_only) {
      isFreeFilter = true;
    }

    const filters = {
      status: statusFilter,
      category: req.query.category,
      competition_type: req.query.type ? String(req.query.type).toUpperCase() : undefined,
      is_free: isFreeFilter,
      min_price: req.query.min_price,
      max_price: req.query.max_price,
      search: req.query.search,
      limit,
      page,
      sort_by: req.query.sort_by || 'created_at',
      sort_order: req.query.sort_order || 'desc',
      user_id: req.user.id,
      only_entered_by_user: true
    };

    if (req.user.role !== 'ADMIN' && req.user.role !== 'SUPERADMIN') {
      filters.exclude_inaccessible_subscription = true;
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
      game_id: comp.game_id,
      leaderboard_type: comp.leaderboard_type,
      game_name: comp.game_name,
      game_code: comp.game_code,
      points_per_play: comp.points_per_play,
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
      has_instant_wins: (comp.instant_wins_count || 0) > 0,
      instant_wins_summary: (comp.instant_wins_count || 0) > 0 ? {
        total: comp.instant_wins_count || 0,
        claimed: comp.instant_wins_claimed_count || 0,
        remaining: Math.max(0, (comp.instant_wins_count || 0) - (comp.instant_wins_claimed_count || 0))
      } : null,
      rules_and_restrictions: comp.rules_and_restrictions || [],
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
        filters
      }
    });
  } catch (error) {
    console.error('Get user competitions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user competitions',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// ==================== COMPETITION PRESET ROUTES ====================
export const getAllCompetitions = (req, res) => {
  req.query.status = 'ALL';
  req.query.limit = 'ALL'; // disable pagination for this endpoint
  req.query.page = 1;
  return getCompetitions(req, res);
};

export const getActiveCompetitions = (req, res) => {
  req.query.status = 'ACTIVE';
  return getCompetitions(req, res);
};

export const getEndedCompetitions = (req, res) => {
  req.query.status = 'COMPLETED';
  return getCompetitions(req, res);
};

export const getFreeCompetitions = (req, res) => {
  req.query.status = 'ALL';
  req.query.is_free = 'true';
  return getCompetitions(req, res);
};

export const getPaidCompetitions = (req, res) => {
  req.query.status = 'ALL';
  req.query.is_free = 'false';
  return getCompetitions(req, res);
};

export const getJackpotCompetitions = (req, res) => {
  req.query.status = 'ALL';
  req.query.type = 'JACKPOT';
  return getCompetitions(req, res);
};

export const getCompetitionStatsDashboard = async (req, res) => {
  try {
    // Get stats data from the model/service
    const statsData = await Competition.getCompetitionStatsDashboard();

    const { active, thisMonth, completed, ending, totalTickets, soldTickets, fillRate, todayEntries } = statsData;

    // Format response matching your pattern
    res.status(200).json({
      success: true,
      data: {
        stats: {
          activeCompetitions: {
            value: active,
            change: thisMonth > 0 ? `🏆 +${thisMonth} this month` : 'No new competitions this month',
            trend: thisMonth > 0 ? 'up' : 'neutral',
            description: 'Currently running competitions'
          },
          totalEntriesToday: {
            value: todayEntries.toLocaleString(),
            change: `Approx. ${fillRate}% fill rate`,
            trend: parseFloat(fillRate) > 50 ? 'up' : 'down',
            description: 'Total entries submitted today'
          },
          completedThisMonth: {
            value: completed,
            change: completed > 0 ? 'Winners announced' : 'No competitions completed',
            trend: 'completed',
            description: 'Competitions finalized this month'
          },
          endingToday: {
            value: ending,
            change: ending > 0 ? 'Requires attention' : 'No competitions ending',
            attention: ending > 0,
            trend: 'alert',
            description: 'Competitions ending today'
          }
        },
        metrics: {
          totalActive: active,
          totalCompleted: completed,
          totalEnding: ending,
          ticketMetrics: {
            totalAvailable: totalTickets,
            totalSold: soldTickets,
            fillRate: `${fillRate}%`,
            remaining: totalTickets - soldTickets
          },
          monthlyGrowth: thisMonth
        }
      }
    });

  } catch (error) {
    console.error('Get competition stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch competition statistics',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};


export const getCompetitionDetails = async (req, res) => {
  try {
    const { id } = req.params;

    // Validate the ID format
    const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

    if (!uuidRegex.test(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid competition ID format'
      });
    }

    console.log('🔍 Fetching competition with ID:', id);

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
    let instantWinSummary = {
      total: competition.instant_wins_count || 0,
      claimed: competition.instant_wins_claimed_count || 0,
      remaining: Math.max(
        0,
        (competition.instant_wins_count || 0) - (competition.instant_wins_claimed_count || 0)
      )
    };

    if (req.user) {
      try {
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
      } catch (userError) {
        console.error('User eligibility check error:', userError);
        // Don't fail the entire request for user-specific checks
      }
    }

    // Check subscription eligibility
    if (competition.category === 'SUBSCRIPTION') {
      try {
        subscriptionEligibility = await Competition.checkSubscriptionEligibility(id, req.user?.id);
        if (!subscriptionEligibility.eligible) {
          eligibility.can_enter = false;
          eligibility.reason = subscriptionEligibility.reason;
          eligibility.requirements.push('Valid subscription required');
        }
      } catch (subError) {
        console.error('❌ Subscription check error:', subError);
      }
    }

    // Get jackpot progress if applicable
    if (competition.category === 'JACKPOT') {
      try {
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
      } catch (jackpotError) {
        console.error('❌ Jackpot progress error:', jackpotError);
      }
    }


    // Get instant wins if enabled
    if ((competition.instant_wins_count || 0) > 0) {
      try {
        instantWins = await Competition.getInstantWins(id);
        instantWinSummary = await Competition.getInstantWinStats(id);
      } catch (instantWinError) {
        console.error('❌ Instant wins fetch error:', instantWinError);
      }
    }

    const instantWinsResponse = groupInstantWins(instantWins);

    // Get achievements if enabled - FIXED WITH TRY-CATCH
    try {
      achievements = await Competition.getAchievements(id);
    } catch (achievementError) {
      console.error('❌ Achievements fetch error:', achievementError);
      achievements = []; // Return empty array on error
    }

    // Get leaderboard if applicable
    if (competition.category === 'MINI_GAME' || competition.leaderboard_type) {
      try {
        leaderboard = await Competition.getLeaderboard(id, competition.leaderboard_type);
      } catch (leaderboardError) {
        console.error('❌ Leaderboard fetch error:', leaderboardError);
      }
    }

    // Get competition statistics
    let stats = {};
    try {
      stats = await Competition.getStats(id);
    } catch (statsError) {
      console.error('❌ Stats fetch error:', statsError);
    }

    // Get gallery images
    let galleryImages = [];
    try {
      const galleryDir = path.join(competitionUploadsBase, id, 'gallery');
      if (fs.existsSync(galleryDir)) {
        const files = fs.readdirSync(galleryDir);
        galleryImages = files.map(file => getFileUrl(path.join(galleryDir, file)));
      }
    } catch (galleryError) {
      console.error('❌ Gallery images error:', galleryError);
    }

    if (galleryImages.length === 0 && Array.isArray(competition.gallery_images)) {
      galleryImages = competition.gallery_images;
    }

    // Get documents if any
    let documents = [];
    try {
      const docDir = path.join(competitionUploadsBase, id, 'documents');
      if (fs.existsSync(docDir)) {
        const docFiles = fs.readdirSync(docDir);
        documents = docFiles.map(file => ({
          name: file,
          url: getFileUrl(path.join(docDir, file)),
          type: path.extname(file).substring(1).toUpperCase(),
          size: fs.statSync(path.join(docDir, file)).size
        }));
      }
    } catch (docError) {
      console.error('❌ Documents error:', docError);
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
        instant_wins: instantWinsResponse,
        instant_wins_rows: instantWins,
        instant_wins_summary: instantWinSummary,
        instant_wins_total: instantWinSummary.total,
        instant_wins_claimed: instantWinSummary.claimed,
        instant_wins_remaining: instantWinSummary.remaining,
        achievements: achievements,
        leaderboard: leaderboard,
        stats: stats,
        features: {
          has_instant_wins: instantWinsResponse.length > 0,
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
    console.error('❌ Get competition details error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch competition details',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
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

    if (!status || !['ACTIVE', 'PAUSED', 'INACTIVE', 'COMPLETED', 'CANCELLED'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Valid status is required'
      });
    }

    const meta = {
      ip_address: req.ip || (req.headers['x-forwarded-for'] || null),
      user_agent: req.get('User-Agent') || null
    };

    const updated = await Competition.updateStatus(id, status, reason, req.user?.id || null, meta);

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

export const deleteCompetition = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ success: false, message: 'Competition ID is required' });
    }

    // Fetch competition to remove uploaded files
    const competition = await Competition.findById(id);
    if (!competition) {
      return res.status(404).json({ success: false, message: 'Competition not found' });
    }

    // Collect file URLs/paths (may be stored as URLs)
    const fileUrls = [];
    if (competition.featured_image) fileUrls.push(competition.featured_image);
    if (competition.featured_video) fileUrls.push(competition.featured_video);
    if (competition.banner_image) fileUrls.push(competition.banner_image);
    if (competition.gallery_images) {
      try {
        const gallery = typeof competition.gallery_images === 'string' ? JSON.parse(competition.gallery_images) : competition.gallery_images;
        if (Array.isArray(gallery)) fileUrls.push(...gallery);
      } catch (e) {
        // ignore parse errors
      }
    }

    // Convert stored URLs to filesystem paths and delete
    const path = (await import('path')).default;
    const baseUploads = competitionUploadsBase;
    const filesToDelete = [];
    fileUrls.forEach(u => {
      if (!u) return;
      // Cloudinary: URLs are passed directly to deleteUploadedFiles
      // Local files (legacy): Paths are also handled by deleteUploadedFiles (if they exist)
      filesToDelete.push(u);
    });

    // Use deleteUploadedFiles utility
    const { deleteUploadedFiles } = await import('../../../middleware/upload.js');
    try {
      deleteUploadedFiles(filesToDelete);
    } catch (err) {
      console.error('Error deleting files:', err);
    }

    const meta = {
      reason: req.body?.reason || null,
      ip_address: req.ip || (req.headers['x-forwarded-for'] || null),
      user_agent: req.get('User-Agent') || null
    };

    const deleted = await Competition.deleteCompetition(id, req.user?.id || null, meta);
    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Competition not found or could not be deleted' });
    }

    res.json({ success: true, message: 'Competition deleted successfully', data: { competition_id: id } });
  } catch (error) {
    console.error('Delete competition error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete competition', error: error.message });
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
    const originalDir = path.join(competitionUploadsBase, id);
    const newDir = path.join(competitionUploadsBase, newCompetitionId);

    // Cloudinary Migration: File copying for duplicates is disabled for now.
    // Users will need to re-upload images for the new competition.
    /*
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
    */
    console.log(`Competition duplicated (ID: ${newCompetitionId}). Files were NOT copied (Cloudinary data model requires re-upload or advanced duplication logic).`);

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

// Export competitions by status/type as CSV
export const exportCompetitionCSV = async (req, res) => {
  try {
    const rawStatus = req.query.status;
    const normalizedStatus = rawStatus ? String(rawStatus).toUpperCase() : undefined;
    const statusFilter = normalizedStatus === 'ALL' ? undefined : normalizedStatus;
    const typeFilter = req.query.type ? String(req.query.type).toUpperCase() : undefined;

    const isFreeParam = req.query.is_free;
    let isFreeFilter;
    if (isFreeParam === 'true' || isFreeParam === true) {
      isFreeFilter = true;
    } else if (isFreeParam === 'false' || isFreeParam === false) {
      isFreeFilter = false;
    }

    const filters = {
      status: statusFilter,
      competition_type: typeFilter,
      is_free: isFreeFilter,
      limit: parseInt(req.query.limit) || 10000,
      page: 1,
      sort_by: 'created_at',
      sort_order: 'desc'
    };

    const { competitions } = await Competition.findCompetitions(filters);
    const fields = [
      'id',
      'title',
      'status',
      'competition_type',
      'is_free_competition',
      'price',
      'start_date',
      'end_date',
      'total_tickets',
      'sold_tickets'
    ];

    const parser = new Parser({ fields });
    const csv = parser.parse(competitions || []);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="competitions-export.csv"');
    return res.send(csv);
  } catch (error) {
    console.error('CSV Export error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to export competitions as CSV',
      error: error.message
    });
  }
};

// ==================== COMPETITION CSV EXPORT PRESETS ====================
export const exportAllCompetitionsCSV = (req, res) => {
  req.query.status = 'ALL';
  return exportCompetitionCSV(req, res);
};

export const exportActiveCompetitionsCSV = (req, res) => {
  req.query.status = 'ACTIVE';
  return exportCompetitionCSV(req, res);
};

export const exportEndedCompetitionsCSV = (req, res) => {
  req.query.status = 'COMPLETED';
  return exportCompetitionCSV(req, res);
};

export const exportFreeCompetitionsCSV = (req, res) => {
  req.query.status = 'ALL';
  req.query.is_free = 'true';
  return exportCompetitionCSV(req, res);
};

export const exportPaidCompetitionsCSV = (req, res) => {
  req.query.status = 'ALL';
  req.query.is_free = 'false';
  return exportCompetitionCSV(req, res);
};

export const exportJackpotCompetitionsCSV = (req, res) => {
  req.query.status = 'ALL';
  req.query.type = 'JACKPOT';
  return exportCompetitionCSV(req, res);
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

export const enterCompetition = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    const quantity = Number.isInteger(req.body?.quantity) ? req.body.quantity : 1;
    const payment_method = req.body?.payment_method || 'WALLET';
    const use_wallet = req.body?.use_wallet !== undefined ? req.body.use_wallet : true;
    const payment_method_id = req.body?.payment_method_id || null;

    if (!id) {
      return res.status(400).json({ success: false, message: 'Competition ID is required' });
    }

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    if (!Number.isInteger(quantity) || quantity <= 0 || quantity > 100) {
      return res.status(400).json({ success: false, message: 'Quantity must be between 1 and 100' });
    }

    const competition = await Competition.findById(id);
    if (!competition) {
      return res.status(404).json({ success: false, message: 'Competition not found' });
    }

    if (competition.status !== 'ACTIVE') {
      return res.status(400).json({ success: false, message: 'Competition is not active' });
    }

    if (competition.end_date && new Date(competition.end_date) <= new Date()) {
      return res.status(400).json({ success: false, message: 'Competition has ended' });
    }

    const purchase = await SubscriptionTicketService.purchaseTickets(userId, {
      competition_id: id,
      quantity,
      payment_method,
      use_wallet,
      payment_method_id,
    });

    return res.status(200).json({
      success: true,
      message: 'Entry created successfully',
      data: {
        competition_id: id,
        tickets: purchase.tickets,
        purchase,
        next_action: 'PLAY_OR_SCORE'
      }
    });
  } catch (error) {
    console.error('Enter competition error:', error);
    return res.status(400).json({
      success: false,
      message: 'Failed to enter competition',
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