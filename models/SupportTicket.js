
// models/SupportTicket.js
const mongoose = require('mongoose');

const supportTicketSchema = new mongoose.Schema({
  ticketNumber: {
    type: String,
    unique: true,
    required: true
  },
  email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true
  },
  subject: {
    type: String,
    required: true,
    trim: true
  },
  message: {
    type: String,
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  status: {
    type: String,
    enum: ['open', 'in-progress', 'resolved', 'closed'],
    default: 'open'
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  category: {
    type: String,
    enum: ['technical', 'billing', 'service', 'account', 'general', 'complaint'],
    default: 'general'
  },
  response: {
    type: String,
    default: null
  },
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  attachments: [{
    filename: String,
    url: String,
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  conversation: [{
    from: {
      type: String,
      enum: ['user', 'support'],
      required: true
    },
    message: {
      type: String,
      required: true
    },
    timestamp: {
      type: Date,
      default: Date.now
    }
  }],
  resolvedAt: {
    type: Date,
    default: null
  },
  closedAt: {
    type: Date,
    default: null
  },
  rating: {
    type: Number,
    min: 1,
    max: 5,
    default: null
  },
  feedback: {
    type: String,
    default: null
  }
}, {
  timestamps: true
});

// Generate unique ticket number before saving
supportTicketSchema.pre('save', async function(next) {
  if (!this.ticketNumber) {
    const count = await mongoose.model('SupportTicket').countDocuments();
    this.ticketNumber = `TKT${Date.now()}${String(count + 1).padStart(4, '0')}`;
  }
  next();
});

// Indexes for better performance
supportTicketSchema.index({ ticketNumber: 1 });
supportTicketSchema.index({ email: 1 });
supportTicketSchema.index({ userId: 1 });
supportTicketSchema.index({ status: 1, createdAt: -1 });
supportTicketSchema.index({ assignedTo: 1, status: 1 });

module.exports = mongoose.model('SupportTicket', supportTicketSchema);
