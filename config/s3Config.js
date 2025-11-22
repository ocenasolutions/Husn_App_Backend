// server/config/s3Config.js

const AWS = require('aws-sdk');
const multer = require('multer');
const multerS3 = require('multer-s3');
const path = require('path');

// Configure AWS
AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION || 'us-east-1'
});

const s3 = new AWS.S3();

// Enhanced file filter function for media (images and videos)
const mediaFileFilter = (req, file, cb) => {
  const imageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
  const videoTypes = [
    'video/mp4', 
    'video/mov', 
    'video/avi', 
    'video/wmv', 
    'video/flv', 
    'video/webm',
    'video/quicktime',
    'video/x-msvideo'
  ];
  
  const allowedTypes = [...imageTypes, ...videoTypes];
  
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type: ${file.mimetype}. Only images (JPEG, PNG, GIF, WEBP) and videos (MP4, MOV, AVI, WMV, FLV, WEBM) are allowed.`), false);
  }
};

// Standard file filter for services (images only)
const serviceFileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
  
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPEG, JPG, PNG, GIF, and WEBP are allowed.'), false);
  }
};

// Multer S3 configuration for media uploads (images and videos)
const uploadToS3 = multer({
  storage: multerS3({
    s3: s3,
    bucket: process.env.AWS_S3_BUCKET_NAME,
    acl: 'public-read',
    contentType: multerS3.AUTO_CONTENT_TYPE,
    metadata: function (req, file, cb) {
      cb(null, {
        fieldName: file.fieldname,
        uploadedBy: req.user?.id || 'admin',
        uploadedAt: new Date().toISOString(),
        originalName: file.originalname,
        mimeType: file.mimetype
      });
    },
    key: function (req, file, cb) {
      const timestamp = Date.now();
      const extension = path.extname(file.originalname).toLowerCase();
      const randomString = Math.random().toString(36).substr(2, 9);
      
      // Determine folder based on file type
      const isVideo = file.mimetype.startsWith('video/');
      const folder = isVideo ? 'videos' : 'images';
      
      const filename = `media/${folder}/${timestamp}_${randomString}${extension}`;
      cb(null, filename);
    }
  }),
  fileFilter: mediaFileFilter,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit for media files (to accommodate videos)
  }
});

// Multer S3 configuration for service images (backward compatibility)
const uploadServiceToS3 = multer({
  storage: multerS3({
    s3: s3,
    bucket: process.env.AWS_S3_BUCKET_NAME,
    acl: 'public-read',
    metadata: function (req, file, cb) {
      cb(null, {
        fieldName: file.fieldname,
        uploadedBy: req.user?.id || 'admin',
        uploadedAt: new Date().toISOString()
      });
    },
    key: function (req, file, cb) {
      const timestamp = Date.now();
      const extension = path.extname(file.originalname);
      const filename = `services/${timestamp}_${Math.random().toString(36).substr(2, 9)}${extension}`;
      cb(null, filename);
    }
  }),
  fileFilter: serviceFileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit for service images
  }
});

// Function to delete file from S3
const deleteFromS3 = (key) => {
  return new Promise((resolve, reject) => {
    if (!key) {
      return resolve({ message: 'No key provided' });
    }

    const params = {
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: key
    };

    s3.deleteObject(params, (err, data) => {
      if (err) {
        console.error('S3 delete error:', err);
        reject(err);
      } else {
        console.log('Successfully deleted from S3:', key);
        resolve(data);
      }
    });
  });
};

// Function to get signed URL for private files
const getSignedUrl = (key, expires = 3600) => {
  const params = {
    Bucket: process.env.AWS_S3_BUCKET_NAME,
    Key: key,
    Expires: expires
  };

  return s3.getSignedUrl('getObject', params);
};

// Function to check if S3 bucket exists and is accessible
const checkS3Connection = async () => {
  try {
    const params = {
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      MaxKeys: 1
    };
    
    await s3.listObjectsV2(params).promise();
    console.log('✅ S3 connection successful');
    return true;
  } catch (error) {
    console.error('❌ S3 connection failed:', error.message);
    return false;
  }
};

// Function to get file info from S3
const getFileInfo = async (key) => {
  try {
    const params = {
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: key
    };
    
    const result = await s3.headObject(params).promise();
    return {
      size: result.ContentLength,
      lastModified: result.LastModified,
      contentType: result.ContentType,
      metadata: result.Metadata
    };
  } catch (error) {
    console.error('Error getting file info from S3:', error);
    throw error;
  }
};

// Function to generate thumbnail for video (you might want to integrate with AWS MediaConvert later)
const generateVideoThumbnail = async (videoKey) => {
  console.log('Video thumbnail generation not implemented yet for:', videoKey);
  return null;
};

module.exports = {
  s3,
  uploadToS3,
  uploadServiceToS3, // Keep for backward compatibility
  deleteFromS3,
  getSignedUrl,
  checkS3Connection,
  getFileInfo,
  generateVideoThumbnail
};