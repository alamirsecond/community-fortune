// src/middleware/upload.js
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import JSZip from 'jszip';
import { exec } from 'child_process';
import { promisify } from 'util';
import { cloudinary, CloudinaryStorage } from '../src/config/cloudinary.js';

const execAsync = promisify(exec);

const uploadRoot = process.env.UPLOAD_ROOT
  ? path.resolve(process.env.UPLOAD_ROOT)
  : path.resolve('./uploads');

const gamesUploadDir = process.env.GAMES_UPLOAD_PATH
  ? path.resolve(process.env.GAMES_UPLOAD_PATH)
  : path.join(uploadRoot, 'games');

// Ensure game uploads directory exists (User opted for Persistent Volume for Games)
if (!fs.existsSync(gamesUploadDir)) {
  fs.mkdirSync(gamesUploadDir, { recursive: true });
}

// Helper to determine folder based on file type/field
const getCloudinaryFolder = (req, file) => {
  if (file.fieldname === 'profile_photo') return 'users/profiles';
  if (file.fieldname === 'background_image') return 'spin_wheels';

  // Competition related
  let subDir = 'competitions';
  if (req.params.id) subDir += `/${req.params.id}`;
  else if (req.body.competitionId) subDir += `/${req.body.competitionId}`;
  else subDir += '/temp';

  const fieldTypeMap = {
    'featured_image': 'featured',
    'featured_video': 'featured',
    'banner_image': 'banners',
    'gallery': 'gallery',
    'images': 'gallery',
    'instant_win_images': 'instant_wins',
    'achievement_images': 'achievements',
    'terms_pdf': 'documents',
    'rules_pdf': 'documents',
    'winner_announcement_pdf': 'documents',
    'prize_documentation': 'documents'
  };

  const typeDir = fieldTypeMap[file.fieldname] || 'others';
  return `${subDir}/${typeDir}`;
};

// Generic Cloudinary Storage for all media
const cloudinaryStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    const folder = getCloudinaryFolder(req, file);
    const originalName = path.parse(file.originalname).name;
    const sanitizedName = originalName.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase();

    // Determine resource type
    let resource_type = 'auto'; // Default to auto detection
    if (file.mimetype.startsWith('image/')) resource_type = 'image';
    else if (file.mimetype.startsWith('video/')) resource_type = 'video';
    else if (file.mimetype === 'application/pdf') resource_type = 'raw'; // PDFs are treated as 'raw' or 'image' (if acting as image) but usually 'raw' for docs

    return {
      folder: folder,
      public_id: `${sanitizedName}-${Date.now()}`,
      resource_type: resource_type,
      // Keep original format by default, or specific transformations can be added here
      format: file.mimetype.split('/')[1] === 'jpeg' ? 'jpg' : undefined // normalize jpeg
    };
  },
});

// Competition file filter
const competitionFileFilter = (req, file, cb) => {
  const allowedMimes = [
    'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif',
    'application/pdf', 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'video/mp4', 'video/mpeg', 'video/quicktime', 'video/x-msvideo', 'video/x-ms-wmv', 'video/webm'
  ];

  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type for competition upload`), false);
  }
};

// Create upload instances using Cloudinary Storage
const competitionUpload = multer({
  storage: cloudinaryStorage,
  fileFilter: competitionFileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max
    files: 20
  }
});

const imageOnlyUpload = multer({
  storage: cloudinaryStorage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'), false);
  },
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 10
  }
});

const userImageUpload = multer({
  storage: cloudinaryStorage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'), false);
  },
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1
  }
}).single('profile_photo');

const spinWheelImageUpload = multer({
  storage: cloudinaryStorage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'), false);
  },
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 1
  }
});

const documentOnlyUpload = multer({
  storage: cloudinaryStorage,
  fileFilter: (req, file, cb) => {
    const allowedDocs = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (allowedDocs.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only document files are allowed'), false);
  },
  limits: {
    fileSize: 20 * 1024 * 1024,
    files: 5
  }
});

// Exports for Preconfigured middlewares
export const upload = competitionUpload;

export const competitionFeaturedUpload = competitionUpload.fields([
  { name: 'featured_image', maxCount: 1 },
  { name: 'featured_video', maxCount: 1 },
  { name: 'banner_image', maxCount: 1 },
  { name: 'gallery_images', maxCount: 10 },
  { name: 'instant_win_images', maxCount: 20 },
  { name: 'achievement_images', maxCount: 20 }
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
export const userProfileImageUpload = userImageUpload;

// Middleware to check file types after upload (Simplified since Multer/Cloudinary handles most)
export const validateUploadedFiles = (req, res, next) => {
  if (!req.files && !req.file) return next();
  // Cloudinary storage already validates mimetypes in the fileFilter
  next();
};

export const handleUploadError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ success: false, message: `Upload error: ${err.message}` });
  } else if (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
  next();
};

// Delete files from Cloudinary
export const deleteUploadedFiles = async (filePaths) => {
  if (!Array.isArray(filePaths)) filePaths = [filePaths];

  for (const filePath of filePaths) {
    if (!filePath) continue;

    // Extract public_id from Cloudinary URL
    // URL Format: https://res.cloudinary.com/<cloud_name>/<resource_type>/upload/v<version>/<folder>/<public_id>.<extension>
    // We need <folder>/<public_id>
    try {
      const parts = filePath.split('/');
      const versionIndex = parts.findIndex(p => p.startsWith('v') && !isNaN(Number(p.substring(1))));

      if (versionIndex !== -1) {
        const publicIdWithExt = parts.slice(versionIndex + 1).join('/');
        const publicId = publicIdWithExt.substring(0, publicIdWithExt.lastIndexOf('.'));

        // Determine resource type based on extension/context if possible, or try both
        // NOTE: Cloudinary requires knowing resource_type for deletion (default: image)
        await cloudinary.uploader.destroy(publicId); // Deletes images by default
        await cloudinary.uploader.destroy(publicId, { resource_type: 'video' });
        await cloudinary.uploader.destroy(publicId, { resource_type: 'raw' });
        console.log(`Deleted from Cloudinary: ${publicId}`);
      }
    } catch (error) {
      console.error(`Failed to delete file ${filePath} from Cloudinary:`, error);
    }
  }
};

// Get File URL - In Cloudinary, the file path IS the URL
export const getFileUrl = (filePath) => {
  if (!filePath) return null;
  // If it's already a URL (Cloudinary), return it
  if (filePath.startsWith('http')) return filePath;
  // Fallback for old local files or games
  return filePath;
};

export const getSpinWheelFileUrl = getFileUrl;


// ============================================
// GAME ZIP UPLOAD CONFIGURATION (LOCAL STORAGE)
// ============================================

const gameZipStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const tempDir = path.join(gamesUploadDir, 'temp');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    cb(null, tempDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `game-${uniqueSuffix}.zip`);
  }
});

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
  limits: { fileSize: 100 * 1024 * 1024 }
}).single('game_zip');

export const unzipGameFile = async (zipPath, gameId) => {
  try {
    const gameDir = path.join(gamesUploadDir, gameId);
    if (fs.existsSync(gameDir)) fs.rmSync(gameDir, { recursive: true, force: true });
    fs.mkdirSync(gameDir, { recursive: true });

    const data = fs.readFileSync(zipPath);
    const zip = await JSZip.loadAsync(data);

    const extractPromises = [];
    zip.forEach((relativePath, zipEntry) => {
      if (!zipEntry.dir) {
        const filePath = path.join(gameDir, relativePath);
        const dirPath = path.dirname(filePath);
        if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });

        extractPromises.push(
          zipEntry.async('nodebuffer').then(content => fs.writeFileSync(filePath, content))
        );
      }
    });

    await Promise.all(extractPromises);

    const indexPath = path.join(gameDir, 'index.html');
    if (!fs.existsSync(indexPath)) throw new Error('Game ZIP must contain index.html at the root');

    fs.unlinkSync(zipPath); // Delete zip

    return { gameDir, indexPath, files: Object.keys(zip.files).length };
  } catch (error) {
    const gameDir = path.join(gamesUploadDir, gameId);
    if (fs.existsSync(gameDir)) fs.rmSync(gameDir, { recursive: true, force: true });
    throw error;
  }
};

export const validateGameStructure = (gameDir) => {
  // ... (Keep existing validation logic)
  const requiredFiles = ['index.html'];
  const allowedExtensions = ['.html', '.css', '.js', '.json', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico', '.ttf', '.woff', '.woff2', '.mp3', '.wav', '.ogg'];

  const missingFiles = [];
  const invalidFiles = [];

  requiredFiles.forEach(file => {
    if (!fs.existsSync(path.join(gameDir, file))) missingFiles.push(file);
  });

  if (missingFiles.length > 0) throw new Error(`Missing required files: ${missingFiles.join(', ')}`);

  const checkFiles = (dir) => {
    const files = fs.readdirSync(dir);
    files.forEach(file => {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) checkFiles(filePath);
      else {
        const ext = path.extname(file).toLowerCase();
        if (!allowedExtensions.includes(ext) && !file.includes('.')) invalidFiles.push(path.relative(gameDir, filePath));
      }
    });
  };
  checkFiles(gameDir);

  if (invalidFiles.length > 0) throw new Error(`Invalid file types found: ${invalidFiles.join(', ')}`);

  const indexPath = path.join(gameDir, 'index.html');
  const indexContent = fs.readFileSync(indexPath, 'utf8');
  const dangerousPatterns = [
    /<script\s+[^>]*src\s*=\s*["'](https?:)?\/\//i,
    /<iframe/i,
    /(^|\W)eval\s*\(/i,
    /document\.write\s*\(/i,
  ];

  const dangerousMatches = [];
  dangerousPatterns.forEach(pattern => {
    if (indexContent.match(pattern)) dangerousMatches.push(pattern.toString());
  });

  if (dangerousMatches.length > 0) throw new Error('Game contains potentially dangerous code patterns');

  return true;
};

export const getGameUrl = (gameId) => `/uploads/games/${gameId}/index.html`;

export const getGameFiles = (gameId) => {
  const gameDir = path.join(gamesUploadDir, gameId);
  if (!fs.existsSync(gameDir)) return null;

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
      if (isDir) scanDir(fullPath, baseDir);
    });
  };
  scanDir(gameDir);
  return files;
};

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
  userProfileImageUpload,
  getFileUrl,
  gameZipUpload,
  unzipGameFile,
  validateGameStructure,
  getGameUrl,
  getGameFiles,
  deleteGame
};
