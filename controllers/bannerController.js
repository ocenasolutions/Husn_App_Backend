// server/controllers/bannerController.js
const Banner = require('../models/Banner');
const { deleteFromS3 } = require('../config/s3Config');

// Get all active banners (Public)
exports.getAllBanners = async (req, res) => {
  try {
    const { position, targetGender, type } = req.query;
    
    const query = { isActive: true };
    
    if (position) {
      query.position = position;
    }
    
    if (type) {
      query.type = type;
    }
    
    if (targetGender) {
      query.targetGender = { $in: [targetGender, 'all'] };
    }
    
    const banners = await Banner.find(query)
      .sort({ order: 1, createdAt: -1 })
      .populate('createdBy', 'name email');
    
    res.json({
      success: true,
      data: banners
    });
  } catch (error) {
    console.error('Get banners error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch banners'
    });
  }
};

// Get all banners for admin (Admin only)
exports.getAllBannersForAdmin = async (req, res) => {
  try {
    const banners = await Banner.find()
      .sort({ type: 1, order: 1, createdAt: -1 })
      .populate('createdBy', 'name email');
    
    res.json({
      success: true,
      data: banners
    });
  } catch (error) {
    console.error('Get admin banners error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch banners'
    });
  }
};

// Create new banner (Admin only)
exports.createBanner = async (req, res) => {
  try {
    const {
      title,
      description,
      link,
      position,
      type,
      targetGender,
      order,
      imageUrl
    } = req.body;

    if (!title) {
      return res.status(400).json({
        success: false,
        message: 'Banner title is required'
      });
    }

    if (!type || !['service', 'product'].includes(type)) {
      return res.status(400).json({
        success: false,
        message: 'Banner type is required and must be either "service" or "product"'
      });
    }

    const bannerData = {
      title,
      type,
      createdBy: req.user._id
    };

    if (description) bannerData.description = description;
    if (link) bannerData.link = link;
    if (position) bannerData.position = position;
    if (targetGender) bannerData.targetGender = targetGender;
    if (order !== undefined) bannerData.order = parseInt(order);

    // Handle image upload or URL
    if (req.file) {
      bannerData.image_url = req.file.location;
      bannerData.imageKey = req.file.key;
    } else if (imageUrl && imageUrl.trim()) {
      bannerData.image_url = imageUrl.trim();
      bannerData.imageKey = null;
    } else {
      return res.status(400).json({
        success: false,
        message: 'Banner image is required'
      });
    }

    const banner = new Banner(bannerData);
    await banner.save();

    res.status(201).json({
      success: true,
      message: 'Banner created successfully',
      data: banner
    });
  } catch (error) {
    console.error('Create banner error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to create banner'
    });
  }
};

// Update banner (Admin only)
exports.updateBanner = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      description,
      link,
      position,
      type,
      targetGender,
      order,
      isActive,
      imageUrl
    } = req.body;

    const banner = await Banner.findById(id);
    if (!banner) {
      return res.status(404).json({
        success: false,
        message: 'Banner not found'
      });
    }

    if (title) banner.title = title;
    if (description !== undefined) banner.description = description;
    if (link !== undefined) banner.link = link;
    if (position) banner.position = position;
    if (type && ['service', 'product'].includes(type)) banner.type = type;
    if (targetGender) banner.targetGender = targetGender;
    if (order !== undefined) banner.order = parseInt(order);
    if (isActive !== undefined) banner.isActive = isActive === 'true' || isActive === true;

    banner.updatedBy = req.user._id;

    // Handle image upload or URL
    if (req.file) {
      if (banner.imageKey) {
        try {
          await deleteFromS3(banner.imageKey);
        } catch (error) {
          console.error('Error deleting old image:', error);
        }
      }
      
      banner.image_url = req.file.location;
      banner.imageKey = req.file.key;
    } else if (imageUrl !== undefined) {
      if (banner.imageKey) {
        try {
          await deleteFromS3(banner.imageKey);
        } catch (error) {
          console.error('Error deleting old image:', error);
        }
      }
      
      banner.image_url = imageUrl ? imageUrl.trim() : banner.image_url;
      banner.imageKey = null;
    }

    await banner.save();

    res.json({
      success: true,
      message: 'Banner updated successfully',
      data: banner
    });
  } catch (error) {
    console.error('Update banner error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to update banner'
    });
  }
};

// Delete banner (Admin only)
exports.deleteBanner = async (req, res) => {
  try {
    const { id } = req.params;

    const banner = await Banner.findById(id);
    if (!banner) {
      return res.status(404).json({
        success: false,
        message: 'Banner not found'
      });
    }

    if (banner.imageKey) {
      try {
        await deleteFromS3(banner.imageKey);
      } catch (error) {
        console.error('Error deleting image from S3:', error);
      }
    }

    await Banner.findByIdAndDelete(id);

    res.json({
      success: true,
      message: 'Banner deleted successfully'
    });
  } catch (error) {
    console.error('Delete banner error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete banner'
    });
  }
};

// Toggle banner status (Admin only)
exports.toggleBannerStatus = async (req, res) => {
  try {
    const { id } = req.params;

    const banner = await Banner.findById(id);
    if (!banner) {
      return res.status(404).json({
        success: false,
        message: 'Banner not found'
      });
    }

    banner.isActive = !banner.isActive;
    banner.updatedBy = req.user._id;
    await banner.save();

    res.json({
      success: true,
      message: `Banner ${banner.isActive ? 'activated' : 'deactivated'} successfully`,
      data: banner
    });
  } catch (error) {
    console.error('Toggle banner status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to toggle banner status'
    });
  }
};