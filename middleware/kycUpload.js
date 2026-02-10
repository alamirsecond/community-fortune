// src/middleware/kycUpload.js
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

const uploadRoot = process.env.UPLOAD_ROOT
  ? path.resolve(process.env.UPLOAD_ROOT)
  : path.resolve('./uploads');
const kycUploadsDir = process.env.KYC_UPLOAD_PATH
  ? path.resolve(process.env.KYC_UPLOAD_PATH)
  : path.join(uploadRoot, 'kyc_documents');

// Ensure KYC uploads directory exists
if (!fs.existsSync(kycUploadsDir)) {
  fs.mkdirSync(kycUploadsDir, { recursive: true });
}

// KYC-specific storage configuration
const kycStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const tempUserId = req.body.email || 'temp';
    const userDir = path.join(kycUploadsDir, tempUserId);
    
    if (!fs.existsSync(userDir)) {
      fs.mkdirSync(userDir, { recursive: true });
    }
    
    cb(null, userDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    const documentType = file.fieldname;
    cb(null, `${documentType}-${uniqueSuffix}${ext}`);
  }
});

// KYC file filter
const kycFileFilter = (req, file, cb) => {
  const allowedMimes = [
    'image/jpeg',
    'image/png',
    'image/jpg',
    'application/pdf'
  ];
  
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type for ${file.fieldname}. Allowed types: JPEG, PNG, PDF`), false);
  }
};

const kycUpload = multer({
  storage: kycStorage,
  fileFilter: kycFileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max
    files: 5 // max 5 files total
  }
});

// KYC-specific upload middleware
export const kycDocumentsUpload = kycUpload.fields([
  { name: 'governmentId', maxCount: 1 },
  { name: 'selfiePhoto', maxCount: 1 },
  { name: 'additionalDocuments', maxCount: 3 }
]);

// Error handling middleware for KYC uploads
export const handleKycUploadError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File too large. Maximum size allowed is 5MB'
      });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        message: 'Too many files uploaded'
      });
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({
        success: false,
        message: 'Unexpected field name for file upload'
      });
    }
  } else if (err) {
    return res.status(400).json({
      success: false,
      message: err.message
    });
  }
  next();
};

export default {
  kycDocumentsUpload,
  handleKycUploadError
};