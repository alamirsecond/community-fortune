// src/middleware/upload.js
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import JSZip from 'jszip';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const competitionUploadsDir = path.resolve(process.env.COMPETITION_UPLOAD_PATH || './uploads/competitions');
const gamesUploadDir = path.resolve(process.env.GAMES_UPLOAD_PATH || './uploads/games');
const spinWheelUploadsDir = path.resolve(process.env.SPIN_WHEEL_UPLOAD_PATH || './uploads/spin_wheels');

// Ensure competition uploads directory exists
if (!fs.existsSync(competitionUploadsDir)) {
  fs.mkdirSync(competitionUploadsDir, { recursive: true });
}

// Ensure game uploads directory exists
if (!fs.existsSync(gamesUploadDir)) {
  fs.mkdirSync(gamesUploadDir, { recursive: true });
}

// Ensure spin wheel uploads directory exists
if (!fs.existsSync(spinWheelUploadsDir)) {
  fs.mkdirSync(spinWheelUploadsDir, { recursive: true });
}

// Competition-specific storage configuration
const competitionStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    let subDir = 'temp';
    
    if (req.params.id) {
      // For updates to existing competitions
      subDir = req.params.id;
    } else if (req.body.competitionId) {
      // For new competitions with pre-defined ID
      subDir = req.body.competitionId;
    }
    
    const competitionDir = path.join(competitionUploadsDir, subDir);
    
    if (!fs.existsSync(competitionDir)) {
      fs.mkdirSync(competitionDir, { recursive: true });
    }
    
    // Create subdirectories for different file types
    const fileTypeDirs = {
      'featured_image': 'featured',
      'featured_video': 'featured',
      'banner_image': 'banners',
      'gallery': 'gallery',
      'images': 'gallery',
      'terms_pdf': 'documents',
      'rules_pdf': 'documents',
      'winner_announcement_pdf': 'documents',
      'prize_documentation': 'documents'
    };
    
    const fieldName = file.fieldname;
    const subDirectory = fileTypeDirs[fieldName] || 'others';
    const finalDir = path.join(competitionDir, subDirectory);
    
    if (!fs.existsSync(finalDir)) {
      fs.mkdirSync(finalDir, { recursive: true });
    }
    
    cb(null, finalDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname).toLowerCase();
    const originalName = path.parse(file.originalname).name;
    const sanitizedName = originalName.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase();
    
    cb(null, `${sanitizedName}-${uniqueSuffix}${ext}`);
  }
});

// Competition file filter
const competitionFileFilter = (req, file, cb) => {
  const allowedImageMimes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/gif'
  ];
  
  const allowedDocumentMimes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ];
  
  const allowedVideoMimes = [
    'video/mp4',
    'video/mpeg',
    'video/quicktime',
    'video/x-msvideo',
    'video/x-ms-wmv',
    'video/webm'
  ];
  
  const allAllowedMimes = [...allowedImageMimes, ...allowedDocumentMimes, ...allowedVideoMimes];
  
  if (allAllowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type. Allowed types: Images (JPEG, PNG, WebP, GIF), Documents (PDF, DOC, DOCX, XLS, XLSX), Videos (MP4, MPEG, MOV, AVI, WMV, WebM)`), false);
  }
};

// Create upload instances for different use cases
const competitionUpload = multer({
  storage: competitionStorage,
  fileFilter: competitionFileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max for videos
    files: 20 // max 20 files total
  }
});

const imageOnlyUpload = multer({
  storage: competitionStorage,
  fileFilter: (req, file, cb) => {
    const allowedImageMimes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/webp',
      'image/gif'
    ];
    
    if (allowedImageMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed (JPEG, PNG, WebP, GIF)'), false);
    }
  },
  limits: {
    fileSize: parseInt(process.env.MAX_COMPETITION_IMAGE_SIZE) || 10 * 1024 * 1024,
    files: 10
  }
});

// Spin wheel image storage configuration
const spinWheelStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const wheelId = req.params.wheel_id || req.body.wheel_id || 'temp';
    const wheelDir = path.join(spinWheelUploadsDir, wheelId);

    if (!fs.existsSync(wheelDir)) {
      fs.mkdirSync(wheelDir, { recursive: true });
    }

    const fileTypeDirs = {
      'background_image': 'background'
    };

    const fieldName = file.fieldname;
    const subDirectory = fileTypeDirs[fieldName] || 'others';
    const finalDir = path.join(wheelDir, subDirectory);

    if (!fs.existsSync(finalDir)) {
      fs.mkdirSync(finalDir, { recursive: true });
    }

    cb(null, finalDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname).toLowerCase();
    const originalName = path.parse(file.originalname).name;
    const sanitizedName = originalName.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase();

    cb(null, `${sanitizedName}-${uniqueSuffix}${ext}`);
  }
});

const spinWheelImageUpload = multer({
  storage: spinWheelStorage,
  fileFilter: (req, file, cb) => {
    const allowedImageMimes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/webp',
      'image/gif'
    ];

    if (allowedImageMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed (JPEG, PNG, WebP, GIF)'), false);
    }
  },
  limits: {
    fileSize: parseInt(process.env.MAX_SPIN_WHEEL_IMAGE_SIZE) || 10 * 1024 * 1024,
    files: 1
  }
});

const documentOnlyUpload = multer({
  storage: competitionStorage,
  fileFilter: (req, file, cb) => {
    const allowedDocumentMimes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];
    
    if (allowedDocumentMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only document files are allowed (PDF, DOC, DOCX, XLS, XLSX)'), false);
    }
  },
  limits: {
    fileSize: parseInt(process.env.MAX_COMPETITION_DOCUMENT_SIZE) || 20 * 1024 * 1024,
    files: 5
  }
});

// Preconfigured upload middlewares
export const upload = competitionUpload;


export const competitionFeaturedUpload = competitionUpload.fields([
  { name: 'featured_image', maxCount: 1 },
  { name: 'featured_video', maxCount: 1 },
  { name: 'banner_image', maxCount: 1 },
  { name: 'gallery_images', maxCount: 10 }
]);


export const competitionImagesUpload = imageOnlyUpload.array('images', 10);

export const competitionDocumentsUpload = documentOnlyUpload.fields([
  { name: 'terms_pdf', maxCount: 1 },
  { name: 'rules_pdf', maxCount: 1 },
  { name: 'winner_announcement_pdf', maxCount: 1 },
  { name: 'prize_documentation', maxCount: 3 }
]);

export const bulkUploadCompetitions = documentOnlyUpload.single('csv_file');

export const spinWheelBackgroundUpload = spinWheelImageUpload.single('background_image');

// Middleware to check file types after upload
export const validateUploadedFiles = (req, res, next) => {
  if (!req.files && !req.file) {
    return next();
  }

  // Flatten files to a single array
  let files = [];
  if (req.files && typeof req.files === 'object') {
    files = Object.values(req.files).flat();
  } else if (req.file) {
    files = [req.file];
  }

  const errors = [];

  files.forEach(file => {
    // Video field validation
    if (file.fieldname === 'featured_video' && !file.mimetype.startsWith('video/')) {
      errors.push(`${file.originalname}: Featured video must be a video file`);
    }

    // Image fields validation
    if (
      ['featured_image', 'banner_image', 'gallery_images'].includes(file.fieldname) &&
      !file.mimetype.startsWith('image/')
    ) {
      errors.push(`${file.originalname}: ${file.fieldname} must be an image file`);
    }

    // PDF fields validation
    if (file.fieldname.includes('pdf') && file.mimetype !== 'application/pdf') {
      errors.push(`${file.originalname}: ${file.fieldname} must be a PDF file`);
    }

    // Size validation
    if (file.mimetype.startsWith('image/') &&
        file.size > (parseInt(process.env.MAX_COMPETITION_IMAGE_SIZE) || 10 * 1024 * 1024)) {
      errors.push(`${file.originalname}: Image too large`);
    }

    if (file.mimetype.startsWith('video/') &&
        file.size > (parseInt(process.env.MAX_COMPETITION_VIDEO_SIZE) || 50 * 1024 * 1024)) {
      errors.push(`${file.originalname}: Video too large`);
    }
  });

  if (errors.length > 0) {
    // Clean up uploaded files on error
    files.forEach(file => {
      if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
    });

    return res.status(400).json({
      success: false,
      message: 'File validation failed',
      errors
    });
  }

  next();
};

// Error handling middleware for uploads
export const handleUploadError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    let message = 'File upload error';
    
    switch (err.code) {
      case 'LIMIT_FILE_SIZE':
        message = `File too large. Maximum size allowed is ${err.field === 'csv_file' ? '20MB' : '50MB'}`;
        break;
      case 'LIMIT_FILE_COUNT':
        message = 'Too many files uploaded';
        break;
      case 'LIMIT_UNEXPECTED_FILE':
        message = 'Unexpected field name for file upload';
        break;
      case 'LIMIT_PART_COUNT':
        message = 'Too many parts in the form';
        break;
      case 'LIMIT_FIELD_KEY':
        message = 'Field name too long';
        break;
      case 'LIMIT_FIELD_VALUE':
        message = 'Field value too long';
        break;
      case 'LIMIT_FIELD_COUNT':
        message = 'Too many fields in the form';
        break;
    }
    
    return res.status(400).json({
      success: false,
      message: message
    });
  } else if (err) {
    return res.status(400).json({
      success: false,
      message: err.message
    });
  }
  next();
};

// Utility function to delete uploaded files
export const deleteUploadedFiles = (filePaths) => {
  if (!Array.isArray(filePaths)) {
    filePaths = [filePaths];
  }
  
  filePaths.forEach(filePath => {
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
        
        // Try to remove empty parent directories
        let dir = path.dirname(filePath);
        while (dir !== competitionUploadsDir && fs.readdirSync(dir).length === 0) {
          fs.rmdirSync(dir);
          dir = path.dirname(dir);
        }
      } catch (error) {
        console.error(`Failed to delete file: ${filePath}`, error);
      }
    }
  });
};

// Utility function to get file URL
// In upload.js - FIX THE getFileUrl FUNCTION
export const getFileUrl = (filePath) => {
  if (!filePath) {
    console.error('getFileUrl called with undefined filePath');
    return null;
  }

  console.log('getFileUrl - Input filePath:', filePath);
  console.log('getFileUrl - filePath type:', typeof filePath);
  
  try {
    // On Render, use a different approach
    if (process.env.NODE_ENV === 'production' || process.env.RENDER) {
      return getFileUrlForRender(filePath);
    } else {
      // Local development
      const relativePath = path.relative(competitionUploadsDir, filePath).replace(/\\/g, '/');
      const baseUrl = process.env.SERVER_URL || 'http://localhost:4000';
      return `${baseUrl}/uploads/competitions/${relativePath}`;
    }
  } catch (error) {
    console.error('Error in getFileUrl:', error.message);
    // Fallback: return a simple path
    return `uploads/competitions/${path.basename(filePath)}`;
  }
};

// Special function for Render
const getFileUrlForRender = (filePath) => {
  console.log('Render - filePath:', filePath);
  
  // Extract filename
  const filename = path.basename(filePath);
  
  // Check if it's a gallery image (moved to competition folder)
  if (filePath.includes('/gallery/')) {
    // Extract competition ID from path
    const pathParts = filePath.split('/');
    const competitionIndex = pathParts.findIndex(part => part.length === 36); // UUID
    if (competitionIndex !== -1) {
      const competitionId = pathParts[competitionIndex];
      return `https://community-fortune-api.onrender.com/uploads/competitions/${competitionId}/gallery/${filename}`;
    }
  }
  
  // Otherwise, assume it's in temp folder
  const baseUrl = process.env.SERVER_URL || 'https://community-fortune-api.onrender.com';
  
  // Determine folder based on file type
  let folder = 'temp';
  if (filePath.includes('/featured/')) folder = 'temp/featured';
  if (filePath.includes('/banners/')) folder = 'temp/banners';
  if (filePath.includes('/gallery/')) folder = 'temp/gallery';
  
  return `${baseUrl}/uploads/competitions/${folder}/${filename}`;
};


// ============================================
// GAME ZIP UPLOAD CONFIGURATION
// ============================================

// Game ZIP upload storage configuration
const gameZipStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const tempDir = path.join(gamesUploadDir, 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    cb(null, tempDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `game-${uniqueSuffix}.zip`);
  }
});

// Game ZIP upload middleware
export const gameZipUpload = multer({
  storage: gameZipStorage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/zip' || 
        file.mimetype === 'application/x-zip-compressed' ||
        file.originalname.endsWith('.zip')) {
      cb(null, true);
    } else {
      cb(new Error('Only ZIP files are allowed for game uploads'), false);
    }
  },
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB max for game ZIPs
  }
}).single('game_zip');

// Helper function to unzip game files
export const unzipGameFile = async (zipPath, gameId) => {
  try {
    const gameDir = path.join(gamesUploadDir, gameId);
    
    // If game directory exists, remove it first
    if (fs.existsSync(gameDir)) {
      fs.rmSync(gameDir, { recursive: true, force: true });
    }
    
    // Create game directory
    fs.mkdirSync(gameDir, { recursive: true });
    
    // Read the ZIP file
    const data = fs.readFileSync(zipPath);
    const zip = await JSZip.loadAsync(data);
    
    // Extract all files
    const extractPromises = [];
    zip.forEach((relativePath, zipEntry) => {
      if (!zipEntry.dir) {
        const filePath = path.join(gameDir, relativePath);
        const dirPath = path.dirname(filePath);
        
        // Ensure directory exists
        if (!fs.existsSync(dirPath)) {
          fs.mkdirSync(dirPath, { recursive: true });
        }
        
        // Extract file
        extractPromises.push(
          zipEntry.async('nodebuffer').then(content => {
            fs.writeFileSync(filePath, content);
          })
        );
      }
    });
    
    await Promise.all(extractPromises);
    
    // Check for index.html
    const indexPath = path.join(gameDir, 'index.html');
    if (!fs.existsSync(indexPath)) {
      throw new Error('Game ZIP must contain index.html at the root');
    }
    
    // Clean up ZIP file
    fs.unlinkSync(zipPath);
    
    return {
      gameDir,
      indexPath,
      files: Object.keys(zip.files).length
    };
  } catch (error) {
    // Clean up on error
    const gameDir = path.join(gamesUploadDir, gameId);
    if (fs.existsSync(gameDir)) {
      fs.rmSync(gameDir, { recursive: true, force: true });
    }
    throw error;
  }
};

// Validate game structure after extraction
export const validateGameStructure = (gameDir) => {
  const requiredFiles = ['index.html'];
  const allowedExtensions = ['.html', '.css', '.js', '.json', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico', '.ttf', '.woff', '.woff2', '.mp3', '.wav', '.ogg'];
  
  const missingFiles = [];
  const invalidFiles = [];
  
  // Check for required files
  requiredFiles.forEach(file => {
    const filePath = path.join(gameDir, file);
    if (!fs.existsSync(filePath)) {
      missingFiles.push(file);
    }
  });
  
  if (missingFiles.length > 0) {
    throw new Error(`Missing required files: ${missingFiles.join(', ')}`);
  }
  
  // Check all files for allowed extensions
  const checkFiles = (dir) => {
    const files = fs.readdirSync(dir);
    
    files.forEach(file => {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      
      if (stat.isDirectory()) {
        checkFiles(filePath);
      } else {
        const ext = path.extname(file).toLowerCase();
        if (!allowedExtensions.includes(ext) && !file.includes('.')) {
          invalidFiles.push(path.relative(gameDir, filePath));
        }
      }
    });
  };
  
  checkFiles(gameDir);
  
  if (invalidFiles.length > 0) {
    throw new Error(`Invalid file types found: ${invalidFiles.join(', ')}. Only HTML, CSS, JS, images, fonts, and audio files are allowed.`);
  }
  
//Check index.html for security
  const indexPath = path.join(gameDir, 'index.html');
  const indexContent = fs.readFileSync(indexPath, 'utf8');
const dangerousPatterns = [
  /<script\s+[^>]*src\s*=\s*["'](https?:)?\/\//i,
  /<iframe/i,
  /(^|\W)eval\s*\(/i,
  /document\.write\s*\(/i,
  /<object/i,
  /<embed/i,
];

const dangerousMatches = [];

dangerousPatterns.forEach(pattern => {
  const match = indexContent.match(pattern);
  if (match) {
    console.error("Blocked:", pattern, "Match:", match[0]);
    dangerousMatches.push(pattern.toString());
  }
});

if (dangerousMatches.length > 0) {
  throw new Error(
    'Game contains potentially dangerous code patterns: ' +
    dangerousMatches.join(', ')
  );
}
  return true;
};

// Get game URL for frontend
export const getGameUrl = (gameId) => {
  return `/uploads/games/${gameId}/index.html`;
};

// Get game files list
export const getGameFiles = (gameId) => {
  const gameDir = path.join(gamesUploadDir, gameId);
  if (!fs.existsSync(gameDir)) {
    return null;
  }
  
  const files = [];
  
  const scanDir = (dir, baseDir = gameDir) => {
    const items = fs.readdirSync(dir);
    
    items.forEach(item => {
      const fullPath = path.join(dir, item);
      const relativePath = path.relative(baseDir, fullPath);
      const stat = fs.statSync(fullPath);
      const isDir = stat.isDirectory();
      files.push({
        name: item,
        path: relativePath,
        type: isDir ? 'directory' : 'file',
        size: isDir ? 0 : stat.size,
        extension: isDir ? '' : path.extname(item).toLowerCase(),
        url: isDir ? null : `/uploads/games/${gameId}/${relativePath}`
      });
      
      if (stat.isDirectory()) {
        scanDir(fullPath, baseDir);
      }
    });
  };
  
  scanDir(gameDir);
  return files;
};

// Delete game
export const deleteGame = (gameId) => {
  const gameDir = path.join(gamesUploadDir, gameId);
  if (fs.existsSync(gameDir)) {
    fs.rmSync(gameDir, { recursive: true, force: true });
    return true;
  }
  return false;
};

export default {
  upload,
  competitionFeaturedUpload,
  competitionImagesUpload,
  competitionDocumentsUpload,
  bulkUploadCompetitions,
  validateUploadedFiles,
  handleUploadError,
  deleteUploadedFiles,
  getFileUrl,
  // Game upload exports
  gameZipUpload,
  unzipGameFile,
  validateGameStructure,
  getGameUrl,
  getGameFiles,
  deleteGame
};

// Utility function to get spin wheel file URL
export const getSpinWheelFileUrl = (filePath) => {
  if (!filePath) {
    console.error('getSpinWheelFileUrl called with undefined filePath');
    return null;
  }

  try {
    const relativePath = path.relative(spinWheelUploadsDir, filePath).replace(/\\/g, '/');
    const baseUrl = process.env.SERVER_URL || 'http://localhost:4000';
    return `${baseUrl}/uploads/spin_wheels/${relativePath}`;
  } catch (error) {
    console.error('Error in getSpinWheelFileUrl:', error.message);
    return `uploads/spin_wheels/${path.basename(filePath)}`;
  }
};