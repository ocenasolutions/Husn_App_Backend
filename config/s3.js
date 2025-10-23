// server/config/s3.js
const AWS = require('aws-sdk');

// Configure AWS SDK
AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION
});

const s3 = new AWS.S3();

/**
 * Upload file to S3
 * @param {Buffer} fileBuffer - File buffer
 * @param {String} fileName - File name
 * @param {String} mimeType - File MIME type
 * @param {String} folder - S3 folder path (e.g., 'reviews/images')
 * @returns {Promise<Object>} - Upload result with URL and key
 */
const uploadToS3 = async (fileBuffer, fileName, mimeType, folder = 'reviews') => {
  const key = `${folder}/${Date.now()}-${fileName}`;
  
  const params = {
    Bucket: process.env.AWS_S3_BUCKET_NAME,
    Key: key,
    Body: fileBuffer,
    ContentType: mimeType,
    ACL: 'public-read'
  };

  try {
    const result = await s3.upload(params).promise();
    return {
      url: result.Location,
      key: result.Key
    };
  } catch (error) {
    console.error('S3 upload error:', error);
    throw new Error('Failed to upload file to S3');
  }
};

/**
 * Delete file from S3
 * @param {String} key - S3 object key
 * @returns {Promise<void>}
 */
const deleteFromS3 = async (key) => {
  const params = {
    Bucket: process.env.AWS_S3_BUCKET_NAME,
    Key: key
  };

  try {
    await s3.deleteObject(params).promise();
  } catch (error) {
    console.error('S3 delete error:', error);
    throw new Error('Failed to delete file from S3');
  }
};

/**
 * Delete multiple files from S3
 * @param {Array<String>} keys - Array of S3 object keys
 * @returns {Promise<void>}
 */
const deleteMultipleFromS3 = async (keys) => {
  if (!keys || keys.length === 0) return;

  const params = {
    Bucket: process.env.AWS_S3_BUCKET_NAME,
    Delete: {
      Objects: keys.map(key => ({ Key: key }))
    }
  };

  try {
    await s3.deleteObjects(params).promise();
  } catch (error) {
    console.error('S3 delete multiple error:', error);
    throw new Error('Failed to delete files from S3');
  }
};

module.exports = {
  s3,
  uploadToS3,
  deleteFromS3,
  deleteMultipleFromS3
};