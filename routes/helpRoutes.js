// routes/helpRoutes.js
const express = require('express');
const router = express.Router();
const SupportTicket = require('../models/SupportTicket');
const ContactInfo = require('../models/ContactInfo');
const authMiddleware = require('../middlewares/authMiddleware');

// GET contact information (public)
router.get('/contact', async (req, res) => {
  try {
    let contactInfo = await ContactInfo.findOne();
    
    // If no contact info exists, create default
    if (!contactInfo) {
      contactInfo = await ContactInfo.create({
        phone: '+91 98765 43210',
        email: 'support@beautyapp.com',
        address: '123 Beauty Street, Amritsar, Punjab 143001',
        workingHours: 'Mon-Sat: 9:00 AM - 8:00 PM'
      });
    }
    
    res.json({
      success: true,
      data: contactInfo
    });
  } catch (error) {
    console.error('Error fetching contact info:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch contact information',
      error: error.message
    });
  }
});

// POST - Submit support ticket (public, but optional auth)
router.post('/support-ticket', async (req, res) => {
  try {
    const { email, subject, message } = req.body;

    // Validation
    if (!email || !subject || !message) {
      return res.status(400).json({
        success: false,
        message: 'Email, subject, and message are required'
      });
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email format'
      });
    }

    // Generate ticket number
    const count = await SupportTicket.countDocuments();
    const ticketNumber = `TKT${Date.now()}${String(count + 1).padStart(4, '0')}`;

    // Create support ticket using new + save pattern
    const ticket = new SupportTicket({
      ticketNumber,
      email,
      subject,
      message,
      userId: req.user ? req.user.id : null, // Use authenticated user if available
      status: 'open',
      priority: 'medium'
    });

    await ticket.save();

    res.status(201).json({
      success: true,
      message: 'Support ticket submitted successfully',
      data: ticket
    });
  } catch (error) {
    console.error('Error creating support ticket:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit support ticket',
      error: error.message
    });
  }
});

// GET all support tickets (requires auth)
router.get('/support-tickets', authMiddleware, async (req, res) => {
  try {
    const { status } = req.query;
    
    // Users can only see their own tickets
    let query = { userId: req.user.id };
    if (status) query.status = status;

    const tickets = await SupportTicket.find(query)
      .sort({ createdAt: -1 })
      .limit(50);

    res.json({
      success: true,
      data: tickets,
      count: tickets.length
    });
  } catch (error) {
    console.error('Error fetching support tickets:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch support tickets',
      error: error.message
    });
  }
});

// GET single support ticket (requires auth)
router.get('/support-ticket/:id', authMiddleware, async (req, res) => {
  try {
    const ticket = await SupportTicket.findOne({
      _id: req.params.id,
      userId: req.user.id // Users can only view their own tickets
    });
    
    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Support ticket not found'
      });
    }

    res.json({
      success: true,
      data: ticket
    });
  } catch (error) {
    console.error('Error fetching support ticket:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch support ticket',
      error: error.message
    });
  }
});

// PATCH - Update support ticket status (admin only)
router.patch('/support-ticket/:id', authMiddleware, async (req, res) => {
  try {
    // This should be admin-only in production
    const { status, priority, response } = req.body;
    
    const updateData = {};
    if (status) updateData.status = status;
    if (priority) updateData.priority = priority;
    if (response) updateData.response = response;
    if (status === 'resolved' || status === 'closed') {
      updateData.resolvedAt = new Date();
    }

    const ticket = await SupportTicket.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Support ticket not found'
      });
    }

    res.json({
      success: true,
      message: 'Support ticket updated successfully',
      data: ticket
    });
  } catch (error) {
    console.error('Error updating support ticket:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update support ticket',
      error: error.message
    });
  }
});

module.exports = router; 