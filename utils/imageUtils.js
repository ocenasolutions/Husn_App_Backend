// server/utils/imageUtils.js
const axios = require('axios');

/**
 * Validates if a URL points to a valid image
 * @param {string} url - The image URL to validate
 * @returns {Promise<boolean>} - Returns true if valid image URL
 */
const validateImageUrl = async (url) => {
  try {
    // Basic URL validation
    const urlPattern = /^(https?:\/\/)[\w\-]+(\.[\w\-]+)+([\w\-\.,@?^=%&:/~\+#]*[\w\-\@?^=%&/~\+#])?$/;
    if (!urlPattern.test(url)) {
      return false;
    }

    // Check if URL points to an image by making a HEAD request
    const response = await axios.head(url, { 
      timeout: 10000,
      validateStatus: (status) => status < 500 // Accept redirects
    });
    
    const contentType = response.headers['content-type'];
    const validImageTypes = [
      'image/jpeg',
      'image/jpg', 
      'image/png',
      'image/gif',
      'image/webp',
      'image/svg+xml'
    ];

    return validImageTypes.some(type => contentType?.startsWith(type));
  } catch (error) {
    console.error('Image URL validation error:', error.message);
    return false;
  }
};

/**
 * Extracts file extension from image URL
 * @param {string} url - The image URL
 * @returns {string} - File extension (e.g., 'jpg', 'png')
 */
const getImageExtensionFromUrl = (url) => {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const extension = pathname.split('.').pop()?.toLowerCase();
    
    const validExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'];
    return validExtensions.includes(extension) ? extension : 'jpg';
  } catch (error) {
    return 'jpg';
  }
};

/**
 * Generates a safe filename from image URL
 * @param {string} url - The image URL
 * @returns {string} - Safe filename
 */
const generateFilenameFromUrl = (url) => {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const filename = pathname.split('/').pop();
    
    if (filename && filename.includes('.')) {
      // Clean the filename to make it safe
      return filename.replace(/[^a-zA-Z0-9.-]/g, '_');
    }
    
    const extension = getImageExtensionFromUrl(url);
    const timestamp = Date.now();
    return `image_${timestamp}.${extension}`;
  } catch (error) {
    return `image_${Date.now()}.jpg`;
  }
};

module.exports = {
  validateImageUrl,
  getImageExtensionFromUrl,
  generateFilenameFromUrl
};