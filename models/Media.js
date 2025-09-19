// server/models/Media.js
const mongoose = require('mongoose');

const mediaSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Title is required'],
    trim: true,
    maxlength: [200, 'Title cannot exceed 200 characters']
  },
  
  description: {
    type: String,
    trim: true,
    maxlength: [1000, 'Description cannot exceed 1000 characters'],
    default: ''
  },
  
  type: {
    type: String,
    required: [true, 'Media type is required'],
    enum: ['image', 'video'],
    lowercase: true
  },
  
  category: {
    type: String,
    required: true,
    enum: [
      'general', 
      'beauty', 
      'wellness', 
      'tutorials', 
      'before-after', 
      'tips', 
      'products', 
      'services', 
      'promotional'
    ],
    default: 'general'
  },
  
  tags: [{
    type: String,
    trim: true,
    lowercase: true
  }],
  
  featured: {
    type: Boolean,
    default: false
  },
  
  isActive: {
    type: Boolean,
    default: true
  },
  
  // File information
  fileUrl: {
    type: String,
    required: true
  },
  
  fileSize: {
    type: Number,
    required: true
  },
  
  // Image-specific fields
  image_url: {
    type: String,
    default: null
  },
  
  imageKey: {
    type: String,
    default: null
  },
  
  // Video-specific fields
  video_url: {
    type: String,
    default: null
  },
  
  videoKey: {
    type: String,
    default: null
  },
  
  duration: {
    type: String,
    default: null // Format: "mm:ss" or "hh:mm:ss"
  },
  
  // Thumbnail fields (for both images and videos)
  thumbnail_url: {
    type: String,
    default: null
  },
  
  thumbnailKey: {
    type: String,
    default: null
  },
  
  // Analytics
  views: {
    type: Number,
    default: 0,
    min: 0
  },
  
  likes: {
    type: Number,
    default: 0,
    min: 0
  },
  
  downloads: {
    type: Number,
    default: 0,
    min: 0
  },
  
  // User management
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  
  // Metadata
  metadata: {
    width: Number,
    height: Number,
    format: String,
    colorSpace: String,
    quality: Number
  }
}, {
  timestamps: true, // This creates createdAt and updatedAt automatically
  toJSON: { 
    virtuals: true,
    transform: function(doc, ret) {
      ret.id = ret._id;
      delete ret._id;
      delete ret.__v;
      return ret;
    }
  },
  toObject: { virtuals: true }
});

// Indexes for better query performance
mediaSchema.index({ type: 1, isActive: 1 });
mediaSchema.index({ category: 1, isActive: 1 });
mediaSchema.index({ featured: 1, isActive: 1 });
mediaSchema.index({ createdAt: -1 });
mediaSchema.index({ tags: 1 });
mediaSchema.index({ title: 'text', description: 'text' }); // Text search index

// Virtual for getting the appropriate URL based on type
mediaSchema.virtual('displayUrl').get(function() {
  if (this.type === 'image') {
    return this.image_url || this.fileUrl;
  } else if (this.type === 'video') {
    return this.thumbnail_url || this.video_url || this.fileUrl;
  }
  return this.fileUrl;
});

// Virtual for getting media URL
mediaSchema.virtual('mediaUrl').get(function() {
  if (this.type === 'image') {
    return this.image_url || this.fileUrl;
  } else if (this.type === 'video') {
    return this.video_url || this.fileUrl;
  }
  return this.fileUrl;
});

// Pre-save middleware to ensure consistency
mediaSchema.pre('save', function(next) {
  // Ensure type-specific URLs are set correctly
  if (this.type === 'image' && !this.image_url && this.fileUrl) {
    this.image_url = this.fileUrl;
    if (!this.thumbnail_url) {
      this.thumbnail_url = this.fileUrl;
    }
  }
  
  if (this.type === 'video' && !this.video_url && this.fileUrl) {
    this.video_url = this.fileUrl;
    if (!this.thumbnail_url) {
      this.thumbnail_url = this.fileUrl; // Fallback, should be replaced with actual thumbnail
    }
  }
  
  // Ensure tags are clean
  if (this.tags && this.tags.length > 0) {
    this.tags = this.tags
      .filter(tag => tag && tag.trim().length > 0)
      .map(tag => tag.trim().toLowerCase())
      .filter((tag, index, arr) => arr.indexOf(tag) === index); // Remove duplicates
  }
  
  next();
});

// Static methods
mediaSchema.statics.findByType = function(type, options = {}) {
  const query = { type, isActive: true, ...options };
  return this.find(query).populate('createdBy', 'name email');
};

mediaSchema.statics.findFeatured = function(limit = 10) {
  return this.find({ featured: true, isActive: true })
    .populate('createdBy', 'name email')
    .sort({ createdAt: -1 })
    .limit(limit);
};

mediaSchema.statics.searchMedia = function(searchTerm, options = {}) {
  const query = {
    isActive: true,
    $or: [
      { title: { $regex: searchTerm, $options: 'i' } },
      { description: { $regex: searchTerm, $options: 'i' } },
      { tags: { $in: [new RegExp(searchTerm, 'i')] } }
    ],
    ...options
  };
  
  return this.find(query).populate('createdBy', 'name email');
};

// Instance methods
mediaSchema.methods.incrementViews = function() {
  this.views += 1;
  return this.save();
};

mediaSchema.methods.incrementLikes = function() {
  this.likes += 1;
  return this.save();
};

mediaSchema.methods.incrementDownloads = function() {
  this.downloads += 1;
  return this.save();
};

const Media = mongoose.model('Media', mediaSchema);

module.exports = Media;