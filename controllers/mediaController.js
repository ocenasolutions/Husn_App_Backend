// server/controllers/mediaController.js
const Media = require('../models/Media');
const { deleteFromS3 } = require('../config/s3Config');

// Get all images (Public)
exports.getAllImages = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 12,
      category,
      featured,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const query = { isActive: true, type: 'image' };

    // Add filters
    if (category && category !== 'general') {
      query.category = category;
    }
    
    if (featured !== undefined) {
      query.featured = featured === 'true';
    }

    // Add search functionality
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { tags: { $in: [new RegExp(search, 'i')] } }
      ];
    }

    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const skip = (page - 1) * limit;

    const images = await Media.find(query)
      .populate('createdBy', 'name email')
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // Transform data to include proper URLs
    const transformedImages = images.map(image => ({
      ...image,
      image_url: image.image_url || image.fileUrl,
      thumbnail_url: image.thumbnail_url || image.image_url || image.fileUrl,
      id: image._id,
      createdAt: image.createdAt,
      views: image.views || 0,
      likes: image.likes || 0
    }));

    const total = await Media.countDocuments(query);

    res.json({
      success: true,
      data: transformedImages,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        hasNext: page * limit < total,
        hasPrev: page > 1
      }
    });

  } catch (error) {
    console.error('Get images error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch images',
      error: error.message
    });
  }
};

// Get all videos (Public)
exports.getAllVideos = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 12,
      category,
      featured,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const query = { isActive: true, type: 'video' };

    // Add filters
    if (category && category !== 'general') {
      query.category = category;
    }
    
    if (featured !== undefined) {
      query.featured = featured === 'true';
    }

    // Add search functionality
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { tags: { $in: [new RegExp(search, 'i')] } }
      ];
    }

    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const skip = (page - 1) * limit;

    const videos = await Media.find(query)
      .populate('createdBy', 'name email')
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // Transform data to include proper URLs and video-specific fields
    const transformedVideos = videos.map(video => ({
      ...video,
      video_url: video.video_url || video.fileUrl,
      thumbnail_url: video.thumbnail_url || video.video_url || video.fileUrl,
      id: video._id,
      createdAt: video.createdAt,
      views: video.views || 0,
      likes: video.likes || 0,
      duration: video.duration || '0:00'
    }));

    const total = await Media.countDocuments(query);

    res.json({
      success: true,
      data: transformedVideos,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        hasNext: page * limit < total,
        hasPrev: page > 1
      }
    });

  } catch (error) {
    console.error('Get videos error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch videos',
      error: error.message
    });
  }
};

// Get featured content (Public)
exports.getFeaturedContent = async (req, res) => {
  try {
    const featuredContent = await Media.find({ 
      isActive: true, 
      featured: true 
    })
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    // Transform data
    const transformedContent = featuredContent.map(item => ({
      ...item,
      image_url: item.image_url || item.video_url || item.fileUrl,
      thumbnail_url: item.thumbnail_url || item.image_url || item.video_url || item.fileUrl,
      video_url: item.video_url || item.fileUrl,
      id: item._id,
      views: item.views || 0,
      likes: item.likes || 0,
      duration: item.duration || (item.type === 'video' ? '0:00' : null)
    }));

    res.json({
      success: true,
      data: transformedContent
    });

  } catch (error) {
    console.error('Get featured content error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch featured content',
      error: error.message
    });
  }
};

// Get single media item (Public)
exports.getMediaById = async (req, res) => {
  try {
    const { id } = req.params;

    const media = await Media.findOne({ _id: id, isActive: true })
      .populate('createdBy', 'name email')
      .lean();

    if (!media) {
      return res.status(404).json({
        success: false,
        message: 'Media not found'
      });
    }

    // Increment views
    await Media.findByIdAndUpdate(id, { $inc: { views: 1 } });

    // Transform data
    const transformedMedia = {
      ...media,
      image_url: media.image_url || media.video_url || media.fileUrl,
      thumbnail_url: media.thumbnail_url || media.image_url || media.video_url || media.fileUrl,
      video_url: media.video_url || media.fileUrl,
      id: media._id,
      views: (media.views || 0) + 1,
      likes: media.likes || 0,
      duration: media.duration || (media.type === 'video' ? '0:00' : null)
    };

    res.json({
      success: true,
      data: transformedMedia
    });

  } catch (error) {
    console.error('Get media error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch media',
      error: error.message
    });
  }
};

// Upload media (Admin only) - UPDATED TO SUPPORT URLS
exports.uploadMedia = async (req, res) => {
  try {
    const {
      title,
      description,
      tags,
      featured,
      category,
      type,
      mediaUrl,
      thumbnailUrl,
      duration
    } = req.body;

    console.log('Upload request body:', req.body);
    console.log('Upload file:', req.file);

    // Validation
    if (!title || !type) {
      return res.status(400).json({
        success: false,
        message: 'Title and type are required'
      });
    }

    // Check if we have either file upload or URL
    if (!req.file && !mediaUrl) {
      return res.status(400).json({
        success: false,
        message: 'Either upload a file or provide a media URL'
      });
    }

    const mediaData = {
      title: title.trim(),
      description: description ? description.trim() : '',
      type: type.toLowerCase(),
      category: category || 'general',
      featured: featured === 'true' || featured === true,
      createdBy: req.user._id,
      isActive: true
    };

    // Handle tags
    if (tags && tags.trim()) {
      mediaData.tags = tags.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
    } else {
      mediaData.tags = [];
    }

    // Handle file upload vs URL
    if (req.file) {
      // File upload case
      mediaData.fileSize = req.file.size;
      mediaData.fileUrl = req.file.location;
      
      if (type.toLowerCase() === 'image') {
        mediaData.image_url = req.file.location;
        mediaData.imageKey = req.file.key;
        mediaData.thumbnail_url = req.file.location;
      } else if (type.toLowerCase() === 'video') {
        mediaData.video_url = req.file.location;
        mediaData.videoKey = req.file.key;
        mediaData.thumbnail_url = thumbnailUrl || req.file.location;
        mediaData.duration = duration || '0:00';
      }
    } else {
      // URL case
      mediaData.fileUrl = mediaUrl;
      mediaData.fileSize = 0; // Unknown size for URLs
      
      if (type.toLowerCase() === 'image') {
        mediaData.image_url = mediaUrl;
        mediaData.thumbnail_url = thumbnailUrl || mediaUrl;
      } else if (type.toLowerCase() === 'video') {
        mediaData.video_url = mediaUrl;
        mediaData.thumbnail_url = thumbnailUrl || mediaUrl;
        mediaData.duration = duration || '0:00';
      }
    }

    console.log('Creating media with data:', mediaData);

    const media = new Media(mediaData);
    await media.save();

    await media.populate('createdBy', 'name email');

    // Transform response
    const responseData = {
      ...media.toObject(),
      id: media._id
    };

    res.status(201).json({
      success: true,
      message: `${type === 'image' ? 'Image' : 'Video'} uploaded successfully`,
      data: responseData
    });

  } catch (error) {
    console.error('Upload media error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload media',
      error: error.message
    });
  }
};

// Update media (Admin only)
exports.updateMedia = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      description,
      tags,
      featured,
      category,
      isActive,
      mediaUrl,
      thumbnailUrl,
      duration
    } = req.body;

    const media = await Media.findById(id);
    if (!media) {
      return res.status(404).json({
        success: false,
        message: 'Media not found'
      });
    }

    // Update fields
    if (title) media.title = title.trim();
    if (description !== undefined) media.description = description.trim();
    if (category) media.category = category;
    if (featured !== undefined) media.featured = featured === 'true' || featured === true;
    if (isActive !== undefined) media.isActive = isActive === 'true' || isActive === true;
    if (duration && media.type === 'video') media.duration = duration;
    
    if (tags !== undefined) {
      media.tags = tags ? tags.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0) : [];
    }

    // Update URLs if provided
    if (mediaUrl) {
      media.fileUrl = mediaUrl;
      if (media.type === 'image') {
        media.image_url = mediaUrl;
      } else if (media.type === 'video') {
        media.video_url = mediaUrl;
      }
    }

    if (thumbnailUrl) {
      media.thumbnail_url = thumbnailUrl;
    }

    media.updatedBy = req.user._id;
    media.updatedAt = new Date();

    await media.save();
    await media.populate('createdBy', 'name email');

    // Transform response
    const responseData = {
      ...media.toObject(),
      id: media._id,
      image_url: media.image_url || media.video_url || media.fileUrl,
      thumbnail_url: media.thumbnail_url || media.image_url || media.video_url || media.fileUrl,
      video_url: media.video_url || media.fileUrl
    };

    res.json({
      success: true,
      message: 'Media updated successfully',
      data: responseData
    });

  } catch (error) {
    console.error('Update media error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update media',
      error: error.message
    });
  }
};

// Delete media (Admin only)
exports.deleteMedia = async (req, res) => {
  try {
    const { id } = req.params;

    const media = await Media.findById(id);
    if (!media) {
      return res.status(404).json({
        success: false,
        message: 'Media not found'
      });
    }

    // Delete files from S3 only if they exist (uploaded files, not URLs)
    try {
      if (media.imageKey) {
        await deleteFromS3(media.imageKey);
      }
      if (media.videoKey) {
        await deleteFromS3(media.videoKey);
      }
      if (media.thumbnailKey) {
        await deleteFromS3(media.thumbnailKey);
      }
    } catch (error) {
      console.error('Error deleting files from S3:', error);
      // Continue with database deletion even if S3 deletion fails
    }

    await Media.findByIdAndDelete(id);

    res.json({
      success: true,
      message: 'Media deleted successfully'
    });

  } catch (error) {
    console.error('Delete media error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete media',
      error: error.message
    });
  }
};

// Get media categories (Public)
exports.getMediaCategories = async (req, res) => {
  try {
    const categories = await Media.distinct('category', { isActive: true });
    
    res.json({
      success: true,
      data: categories
    });

  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch categories',
      error: error.message
    });
  }
};

// Toggle media status (Admin only)
exports.toggleMediaStatus = async (req, res) => {
  try {
    const { id } = req.params;

    const media = await Media.findById(id);
    if (!media) {
      return res.status(404).json({
        success: false,
        message: 'Media not found'
      });
    }

    media.isActive = !media.isActive;
    media.updatedBy = req.user._id;
    media.updatedAt = new Date();
    await media.save();

    res.json({
      success: true,
      message: `Media ${media.isActive ? 'activated' : 'deactivated'} successfully`,
      data: media
    });

  } catch (error) {
    console.error('Toggle media status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to toggle media status',
      error: error.message
    });
  }
};