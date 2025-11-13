const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    minlength: [2, 'Name must be at least 2 characters long']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email']
  },
  password: {
    type: String,
    required: function() {
      return !this.googleId && !this.facebookId;
    },
    minlength: [6, 'Password must be at least 6 characters long']
  },
  role: {
    type: String,
    enum: ['professional', 'admin', 'user'],
    default: 'professional' 
  },
  googleId: {
    type: String,
    sparse: true
  },
  googleEmail: {
    type: String,
    sparse: true
  },
  facebookId: {
    type: String,
    sparse: true
  },
  avatar: {
    type: String,
    default: null
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  refreshToken: {
    type: String,
    default: null
  },
  phone: {
    type: String,
    default: null
  },
  
  // ✅ NEW: Skills with subcategories (for professionals)
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
  
  // ✅ NEW: Financial details (for professionals)
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
  },
  
  // Driver/Professional-related fields (kept for backward compatibility)
  isOnline: {
    type: Boolean,
    default: false
  },
  lastLocation: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number], 
      default: [0, 0]
    }
  },
  lastLocationUpdate: {
    type: Date,
    default: null
  },
  vehicleNumber: {
    type: String,
    default: null
  },
  vehicleType: {
    type: String,
    enum: ['car', 'bike', 'auto', 'suv'],
    default: null
  },
  vehicleModel: {
    type: String,
    default: null
  },
  vehicleColor: {
    type: String,
    default: null
  }
}, {
  timestamps: true
});

// Create geospatial index for location queries
userSchema.index({ lastLocation: '2dsphere' });

// Hash password before saving
userSchema.pre('save', async function(next) {
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
userSchema.methods.comparePassword = async function(candidatePassword) {
  if (!this.password) return false;
  return await bcrypt.compare(candidatePassword, this.password);
};

// Check if user is admin
userSchema.methods.isAdmin = function() {
  const adminEmails = [
    'testingaditya5@gmail.com',
    'aditya2.ocena@gmail.com',
    'testing.ocena@gmail.com',
  ];
  return adminEmails.includes(this.email.toLowerCase()) || this.role === 'admin';
};

// ✅ NEW: Virtual for profile completion percentage
userSchema.virtual('profileCompletionPercentage').get(function() {
  if (this.role !== 'professional') return 100;
  
  let completed = 0;
  const total = 6;

  if (this.name) completed++;
  if (this.phone) completed++;
  if (this.skills && this.skills.length > 0) completed++;
  if (this.avatar) completed++;
  if (this.panVerified) completed++;
  if (this.bankVerified) completed++;

  return Math.round((completed / total) * 100);
});

// Remove sensitive data when converting to JSON
userSchema.methods.toJSON = function() {
  const userObject = this.toObject();
  delete userObject.password;
  delete userObject.refreshToken;
  return userObject;
};

// Ensure virtuals are included in JSON
userSchema.set('toJSON', { virtuals: true });
userSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('User', userSchema);