import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import path from 'path';
import multer from 'multer';
import '../src/config/cloudinary.js'; 
const uploadRoot = process.env.UPLOAD_ROOT
  ? path.resolve(process.env.UPLOAD_ROOT)
  : path.resolve('./uploads');

// KYC-specific storage configuration
const kycStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'kyc_documents',
    allowed_formats: ['jpg', 'jpeg', 'png', 'pdf'],
    public_id: (req, file) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const documentType = file.fieldname;
      // Use email or 'temp' as a subfolder-like prefix if needed, or just part of filename
      // To keep it simple and avoid folder creation issues, we'll just use a descriptive filename
      const userId = req.body.email ? req.body.email.replace(/[^a-zA-Z0-9]/g, '_') : 'temp';
      return `${userId}-${documentType}-${uniqueSuffix}`;
    }
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