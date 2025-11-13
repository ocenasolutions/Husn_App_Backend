const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const professionalSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  phone: {
    type: String,
    default: null
  },
  password: {
    type: String,
    required: function() {
      return !this.googleId;
    },
    minlength: 6
  },
  googleId: {
    type: String,
    sparse: true
  },
  refreshToken: {
    type: String,
    default: null
  },
  profilePicture: {
    type: String,
    default: null
  },
  role: {
    type: String,
    default: 'Professional',
    trim: true
  },
  skills: [{
    category: {
      type: String,
      required: true,
      trim: true
    },
    subcategories: [{
      type: String,
      trim: true
    }]
  }],
  services: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Service'
  }],
  specializations: [{
    type: String,
    trim: true
  }],
  
  // ONE-TIME FIELDS (Cannot be changed after first save)
  specialization: {
    type: String,
    default: null,
    trim: true
  },
  experience: {
    type: Number,
    min: 0,
    default: null
  },
  bio: {
    type: String,
    maxlength: 500,
    default: null
  },
  availableDays: [{
    type: String,
    enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
  }],
  
  // Flags to lock one-time fields
  oneTimeFieldsLocked: {
    type: Boolean,
    default: false
  },
  
  // EDITABLE ANYTIME FIELDS
  // Status can be changed anytime (active/inactive/on-leave)
profileStatus: {
  type: String,
  enum: ['active', 'on-leave'],
  default: 'active'
},
  
  // Ratings
  rating: {
    type: Number,
    default: 5.0,
    min: 0,
    max: 5
  },
  reviewCount: {
    type: Number,
    default: 0
  },
  
  // Availability (can be toggled anytime)
  isActive: {
    type: Boolean,
    default: true
  },
  
  workingHours: {
    start: {
      type: String,
      default: '09:00'
    },
    end: {
      type: String,
      default: '18:00'
    }
  },
  
  // Booking statistics
  totalBookings: {
    type: Number,
    default: 0
  },
  completedBookings: {
    type: Number,
    default: 0
  },
  
  // Status
  status: {
    type: String,
    enum: ['active', 'inactive', 'suspended'],
    default: 'active'
  },
  
  // Financial details
  panCard: {
    type: String,
    default: null
  },
  panName: {
    type: String,
    default: null
  },
  panVerified: {
    type: Boolean,
    default: false
  },
  bankDetails: {
    accountNumber: {
      type: String,
      default: null
    },
    ifscCode: {
      type: String,
      default: null
    },
    accountHolderName: {
      type: String,
      default: null
    },
    bankName: {
      type: String,
      default: null
    },
    branchName: {
      type: String,
      default: null
    }
  },
  bankVerified: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Indexes
professionalSchema.index({ name: 1 });
professionalSchema.index({ email: 1 });
professionalSchema.index({ 'skills.category': 1 });
professionalSchema.index({ services: 1 });
professionalSchema.index({ specializations: 1 });
professionalSchema.index({ rating: -1 });
professionalSchema.index({ status: 1 });
professionalSchema.index({ isActive: 1 });
professionalSchema.index({ googleId: 1 });

// Hash password before saving
professionalSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password method
professionalSchema.methods.comparePassword = async function(candidatePassword) {
  if (!this.password) return false;
  return await bcrypt.compare(candidatePassword, this.password);
};

// Virtual for checking availability
professionalSchema.virtual('isAvailable').get(function() {
  return this.profileStatus === 'active' && this.status === 'active';
});

// Virtual for profile completion percentage
professionalSchema.virtual('profileCompletionPercentage').get(function() {
  let completed = 0;
  const total = 10;

  if (this.name) completed++;
  if (this.email) completed++;
  if (this.phone) completed++;
  if (this.skills && this.skills.length > 0) completed++;
  if (this.specialization) completed++;
  if (this.experience !== null) completed++;
  if (this.bio) completed++;
  if (this.availableDays && this.availableDays.length > 0) completed++;
  if (this.panVerified) completed++;
  if (this.bankVerified) completed++;

  return Math.round((completed / total) * 100);
});

// Method to extract all categories from skills
professionalSchema.methods.getCategories = function() {
  return this.skills.map(skill => skill.category);
};

// Method to extract all subcategories from skills
professionalSchema.methods.getSubcategories = function() {
  const subcategories = [];
  this.skills.forEach(skill => {
    subcategories.push(...skill.subcategories);
  });
  return subcategories;
};

// Remove sensitive data when converting to JSON
professionalSchema.methods.toJSON = function() {
  const professionalObject = this.toObject();
  delete professionalObject.password;
  delete professionalObject.refreshToken;
  professionalObject.role = 'professional';
  return professionalObject;
};

// Ensure virtuals are included in JSON
professionalSchema.set('toJSON', { virtuals: true });
professionalSchema.set('toObject', { virtuals: true });

const Professional = mongoose.model('Professional', professionalSchema);

module.exports = Professional;
