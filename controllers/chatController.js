// server/controllers/chatController.js
const ChatSession = require('../models/ChatSession');

// Auto-response logic
const getAutoResponse = (message) => {
  const lowerMessage = message.toLowerCase();
  
  const responses = {
    greeting: {
      keywords: ['hello', 'hi', 'hey', 'good morning', 'good evening'],
      response: "Hello! Welcome to our support chat. How can I assist you today?"
    },
    hours: {
      keywords: ['working hours', 'timing', 'open', 'close', 'schedule'],
      response: "Our working hours are Monday to Saturday, 9:00 AM to 8:00 PM. We're closed on Sundays and major holidays."
    },
    payment: {
      keywords: ['payment', 'pay', 'method', 'credit card', 'debit', 'upi'],
      response: "We accept all major credit/debit cards, UPI, net banking, and digital wallets like Paytm, PhonePe, and Google Pay. You can also pay cash on arrival for certain services."
    },
    booking: {
      keywords: ['book', 'appointment', 'reserve', 'schedule service'],
      response: "To book a service, browse our services section, select your preferred service, choose a date and time, and confirm your booking. You'll receive a confirmation once it's successful."
    },
    cancel: {
      keywords: ['cancel', 'reschedule', 'change appointment'],
      response: "You can cancel or reschedule your booking from the 'My Bookings' section. Free cancellation is available up to 24 hours before your appointment. Cancellations within 24 hours may incur a 50% charge."
    },
    homeService: {
      keywords: ['home service', 'doorstep', 'at home'],
      response: "Yes! We offer selected beauty and grooming services at your doorstep. Look for services marked with a 'Home Service Available' tag. Additional charges may apply."
    },
    products: {
      keywords: ['product', 'buy', 'purchase', 'shop'],
      response: "You can browse and purchase our beauty and grooming products from the Products section. We offer home delivery for all product orders."
    },
    contact: {
      keywords: ['contact', 'phone', 'email', 'reach'],
      response: "You can reach us at +91 98765 43210 or email us at support@beautyapp.com. We're here to help!"
    }
  };
  
  for (const [key, value] of Object.entries(responses)) {
    if (value.keywords.some(keyword => lowerMessage.includes(keyword))) {
      return value.response;
    }
  }
  
  return null;
};

// Create new chat session
exports.createSession = async (req, res) => {
  try {
    const { userId, userEmail, userName } = req.body;
    
    // Check if user already has an active session
    let existingSession = null;
    
    if (req.user?.id || userId) {
      existingSession = await ChatSession.findOne({
        userId: req.user?.id || userId,
        status: 'active',
      }).sort({ lastMessageAt: -1 });
    }
    
    if (existingSession) {
      return res.json({
        success: true,
        message: 'Active session found',
        data: existingSession,
      });
    }
    
    // Generate session number
    const sessionNumber = await ChatSession.generateSessionNumber();
    
    // Create new session
    const session = new ChatSession({
      userId: req.user?.id || userId || null,
      sessionNumber,
      userEmail: userEmail || req.user?.email,
      userName: userName || req.user?.name,
      status: 'active',
    });
    
    // Add welcome message
    await session.addMessage(
      "Hello! I'm here to help you. You can ask me anything or select a question below.",
      'admin'
    );
    
    await session.save();
    
    res.status(201).json({
      success: true,
      message: 'Chat session created successfully',
      data: session,
    });
  } catch (error) {
    console.error('Error creating chat session:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create chat session',
      error: error.message,
    });
  }
};

// Get active chat session
exports.getActiveSession = async (req, res) => {
  try {
    if (!req.user?.id) {
      return res.json({
        success: true,
        message: 'No active session',
        data: null,
      });
    }
    
    const session = await ChatSession.findOne({
      userId: req.user.id,
      status: 'active',
    }).sort({ lastMessageAt: -1 });
    
    if (session) {
      // Mark admin messages as read
      await session.markAsRead('user');
    }
    
    res.json({
      success: true,
      data: session,
    });
  } catch (error) {
    console.error('Error fetching chat session:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch chat session',
      error: error.message,
    });
  }
};

// Get all user's chat sessions
exports.getUserSessions = async (req, res) => {
  try {
    const sessions = await ChatSession.find({
      userId: req.user.id,
    })
      .sort({ lastMessageAt: -1 })
      .limit(50);
    
    res.json({
      success: true,
      data: sessions,
      count: sessions.length,
    });
  } catch (error) {
    console.error('Error fetching chat sessions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch chat sessions',
      error: error.message,
    });
  }
};

// Send message (user)
exports.sendMessage = async (req, res) => {
  try {
    const { sessionId, message } = req.body;
    
    if (!sessionId || !message?.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Session ID and message are required',
      });
    }
    
    const session = await ChatSession.findById(sessionId);
    
    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Chat session not found',
      });
    }
    
    // Verify user owns this session (if authenticated)
    if (req.user?.id && session.userId && session.userId.toString() !== req.user.id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized access to chat session',
      });
    }
    
    // Add user message
    await session.addMessage(message.trim(), 'user');
    
    // Get auto-response
    const adminMessage = getAutoResponse(message);
    
    // Add auto-response if available
    if (adminMessage) {
      await session.addMessage(adminMessage, 'admin');
    }
    
    res.json({
      success: true,
      message: 'Message sent successfully',
      data: {
        session,
        adminMessage,
      },
    });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send message',
      error: error.message,
    });
  }
};

// Close chat session
exports.closeSession = async (req, res) => {
  try {
    const session = await ChatSession.findById(req.params.id);
    
    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Chat session not found',
      });
    }
    
    // Verify user owns this session
    if (req.user?.id && session.userId && session.userId.toString() !== req.user.id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized access to chat session',
      });
    }
    
    session.status = 'closed';
    await session.save();
    
    res.json({
      success: true,
      message: 'Chat session closed successfully',
      data: session,
    });
  } catch (error) {
    console.error('Error closing chat session:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to close chat session',
      error: error.message,
    });
  }
};

// Get unread count
exports.getUnreadCount = async (req, res) => {
  try {
    const sessions = await ChatSession.find({
      userId: req.user.id,
      status: 'active',
      unreadUserCount: { $gt: 0 },
    });
    
    const totalUnread = sessions.reduce((sum, session) => sum + session.unreadUserCount, 0);
    
    res.json({
      success: true,
      data: {
        count: totalUnread,
        sessions: sessions.length,
      },
    });
  } catch (error) {
    console.error('Error fetching unread count:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch unread count',
      error: error.message,
    });
  }
};

// ===== ADMIN CONTROLLERS =====

// Get all chat sessions (admin)
exports.getAllSessions = async (req, res) => {
  try {
    const { status, page = 1, limit = 20, search } = req.query;
    
    const query = {};
    if (status && status !== 'all') query.status = status;
    
    // Search by session number, user email, or user name
    if (search) {
      query.$or = [
        { sessionNumber: { $regex: search, $options: 'i' } },
        { userEmail: { $regex: search, $options: 'i' } },
        { userName: { $regex: search, $options: 'i' } },
      ];
    }
    
    const sessions = await ChatSession.find(query)
      .populate('userId', 'name email phone')
      .populate('assignedTo', 'name email')
      .sort({ lastMessageAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);
    
    const total = await ChatSession.countDocuments(query);
    
    res.json({
      success: true,
      data: sessions,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / limit),
        limit: parseInt(limit),
      },
    });
  } catch (error) {
    console.error('Error fetching admin chat sessions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch chat sessions',
      error: error.message,
    });
  }
};

// Get single chat session (admin)
exports.getSessionById = async (req, res) => {
  try {
    const session = await ChatSession.findById(req.params.id)
      .populate('userId', 'name email phone')
      .populate('assignedTo', 'name email');
    
    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Chat session not found',
      });
    }
    
    // Mark user messages as read
    await session.markAsRead('admin');
    
    res.json({
      success: true,
      data: session,
    });
  } catch (error) {
    console.error('Error fetching chat session:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch chat session',
      error: error.message,
    });
  }
};

// Send admin message
exports.sendAdminMessage = async (req, res) => {
  try {
    const { sessionId, message } = req.body;
    
    if (!sessionId || !message?.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Session ID and message are required',
      });
    }
    
    const session = await ChatSession.findById(sessionId);
    
    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Chat session not found',
      });
    }
    
    // Assign admin to session if not already assigned
    if (!session.assignedTo) {
      session.assignedTo = req.user.id;
    }
    
    // Add admin message
    await session.addMessage(message.trim(), 'admin');
    
    res.json({
      success: true,
      message: 'Message sent successfully',
      data: session,
    });
  } catch (error) {
    console.error('Error sending admin message:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send message',
      error: error.message,
    });
  }
};

// Update session status (admin)
exports.updateSessionStatus = async (req, res) => {
  try {
    const { status, assignedTo, priority, tags } = req.body;
    
    const updateData = {};
    if (status) updateData.status = status;
    if (assignedTo !== undefined) updateData.assignedTo = assignedTo;
    if (priority) updateData.priority = priority;
    if (tags) updateData.tags = tags;
    
    const session = await ChatSession.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    )
      .populate('userId', 'name email phone')
      .populate('assignedTo', 'name email');
    
    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Chat session not found',
      });
    }
    
    res.json({
      success: true,
      message: 'Session updated successfully',
      data: session,
    });
  } catch (error) {
    console.error('Error updating chat session:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update chat session',
      error: error.message,
    });
  }
};

// Get admin stats
exports.getAdminStats = async (req, res) => {
  try {
    const activeCount = await ChatSession.countDocuments({ status: 'active' });
    const closedCount = await ChatSession.countDocuments({ status: 'closed' });
    const resolvedCount = await ChatSession.countDocuments({ status: 'resolved' });
    const unreadCount = await ChatSession.countDocuments({ 
      status: 'active', 
      unreadAdminCount: { $gt: 0 } 
    });
    
    res.json({
      success: true,
      data: {
        active: activeCount,
        closed: closedCount,
        resolved: resolvedCount,
        unread: unreadCount,
        total: activeCount + closedCount + resolvedCount,
      },
    });
  } catch (error) {
    console.error('Error fetching admin stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch stats',
      error: error.message,
    });
  }
};