// server/models/ChatSession.js
const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  text: {
    type: String,
    required: true,
    trim: true
  },
  sender: {
    type: String,
    enum: ['user', 'admin'],
    required: true
  },
  readBy: [{
    type: String,
    enum: ['user', 'admin']
  }],
  timestamp: {
    type: Date,
    default: Date.now
  }
});

const chatSessionSchema = new mongoose.Schema({
  sessionNumber: {
    type: String,
    unique: true,
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  userEmail: {
    type: String,
    trim: true
  },
  userName: {
    type: String,
    trim: true
  },
  status: {
    type: String,
    enum: ['active', 'closed', 'resolved'],
    default: 'active'
  },
  messages: [messageSchema],
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  lastMessageAt: {
    type: Date,
    default: Date.now
  },
  unreadUserCount: {
    type: Number,
    default: 0
  },
  unreadAdminCount: {
    type: Number,
    default: 0
  },
  tags: [String],
  priority: {
    type: String,
    enum: ['low', 'medium', 'high'],
    default: 'medium'
  }
}, {
  timestamps: true
});

// Generate unique session number
chatSessionSchema.statics.generateSessionNumber = async function() {
  const count = await this.countDocuments();
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `CS${year}${month}${String(count + 1).padStart(6, '0')}`;
};

// Add message to session
chatSessionSchema.methods.addMessage = async function(text, sender) {
  const message = {
    text,
    sender,
    readBy: [sender], 
    timestamp: new Date()
  };
  
  this.messages.push(message);
  this.lastMessageAt = new Date();
  
  // Update unread counts
  if (sender === 'user') {
    this.unreadAdminCount += 1;
  } else {
    this.unreadUserCount += 1;
  }
  
  await this.save();
  return message;
};

// Mark messages as read
chatSessionSchema.methods.markAsRead = async function(reader) {
  let hasUnread = false;
  
  this.messages.forEach(message => {
    if (message.sender !== reader && !message.readBy.includes(reader)) {
      message.readBy.push(reader);
      hasUnread = true;
    }
  });
  
  if (hasUnread) {
    if (reader === 'user') {
      this.unreadUserCount = 0;
    } else {
      this.unreadAdminCount = 0;
    }
    await this.save();
  }
  
  return hasUnread;
};

// Index for better query performance
chatSessionSchema.index({ userId: 1, status: 1 });
chatSessionSchema.index({ status: 1, lastMessageAt: -1 });
chatSessionSchema.index({ assignedTo: 1 });

const ChatSession = mongoose.model('ChatSession', chatSessionSchema);

module.exports = ChatSession;