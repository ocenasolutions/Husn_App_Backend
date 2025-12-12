const Payout = require('../models/Payout');
const Order = require('../models/Order');
const Professional = require('../models/Professional');
const { getIO } = require('../config/socketConfig');
const razorpayPayoutService = require('../services/razorpayPayoutService');

const getCurrentWeekDates = () => {
  const now = new Date();
  const currentDay = now.getDay(); 
  
  const weekStartDate = new Date(now);
  weekStartDate.setDate(now.getDate() - currentDay);
  weekStartDate.setHours(0, 0, 0, 0);
  
  const weekEndDate = new Date(weekStartDate);
  weekEndDate.setDate(weekStartDate.getDate() + 6);
  weekEndDate.setHours(23, 59, 59, 999);
  
  return { weekStartDate, weekEndDate };
};

const getWeekDatesForDate = (date) => {
  const targetDate = new Date(date);
  const currentDay = targetDate.getDay();
  
  const weekStartDate = new Date(targetDate);
  weekStartDate.setDate(targetDate.getDate() - currentDay);
  weekStartDate.setHours(0, 0, 0, 0);
  
  const weekEndDate = new Date(weekStartDate);
  weekEndDate.setDate(weekStartDate.getDate() + 6);
  weekEndDate.setHours(23, 59, 59, 999);
  
  return { weekStartDate, weekEndDate };
};

// Get weekly payout summary
exports.getWeeklyPayoutSummary = async (req, res) => {
  try {
    const { professionalEmail } = req.params;
    const { weekStart, weekEnd } = req.query;
    
    let weekStartDate, weekEndDate;
    
    if (weekStart && weekEnd) {
      weekStartDate = new Date(weekStart);
      weekEndDate = new Date(weekEnd);
    } else {
      ({ weekStartDate, weekEndDate } = getCurrentWeekDates());
    }
    
    console.log('📊 Calculating payout summary:', {
      professionalEmail,
      weekStart: weekStartDate,
      weekEnd: weekEndDate
    });
    
    const professional = await Professional.findOne({ 
      email: professionalEmail.toLowerCase() 
    });
    
    if (!professional) {
      return res.status(404).json({
        success: false,
        message: 'Professional not found'
      });
    }
    
    const existingPayout = await Payout.findOne({
      professionalEmail: professionalEmail.toLowerCase(),
      weekStartDate,
      weekEndDate
    });
    
    const completedOrders = await Order.find({
      'serviceItems.professionalEmail': professionalEmail.toLowerCase(),
      status: { $in: ['completed', 'delivered'] },
      $or: [
        { completedAt: { $gte: weekStartDate, $lte: weekEndDate } },
        { deliveredAt: { $gte: weekStartDate, $lte: weekEndDate } }
      ]
    }).populate([
      { path: 'serviceItems.serviceId', model: 'Service' },
      { path: 'user', select: 'name phone' }
    ]);
    
    console.log(`✅ Found ${completedOrders.length} completed orders`);
    
    const serviceItems = [];
    let totalRevenue = 0;
    
    for (const order of completedOrders) {
      for (const item of order.serviceItems) {
        if (item.professionalEmail?.toLowerCase() === professionalEmail.toLowerCase()) {
          const isPaid = existingPayout?.status === 'completed';
          const itemAmount = item.price * item.quantity;
          totalRevenue += itemAmount;
          
          serviceItems.push({
            orderId: order._id,
            orderNumber: order.orderNumber,
            serviceId: item.serviceId?._id,
            serviceName: item.serviceId?.name || 'Service',
            amount: itemAmount,
            quantity: item.quantity,
            completedAt: order.completedAt || order.deliveredAt,
            clientName: order.user?.name || 'N/A',
            clientPhone: order.user?.phone || 'N/A',
            isPaid: isPaid
          });
        }
      }
    }
    
    const platformCommission = totalRevenue * 0.25;
    const professionalPayout = totalRevenue * 0.75;
    
    console.log('💰 Payout calculation:', {
      totalRevenue: totalRevenue.toFixed(2),
      platformCommission: platformCommission.toFixed(2),
      professionalPayout: professionalPayout.toFixed(2)
    });
    
    res.json({
      success: true,
      data: {
        professional: {
          id: professional._id,
          name: professional.name,
          email: professional.email,
          bankDetails: professional.bankDetails,
          razorpaySetup: !!(professional.razorpayContactId && professional.razorpayFundAccountId)
        },
        week: {
          startDate: weekStartDate,
          endDate: weekEndDate
        },
        financial: {
          totalRevenue,
          platformCommission,
          professionalPayout,
          commissionRate: 0.25,
          payoutRate: 0.75
        },
        serviceItems,
        totalServices: serviceItems.length,
        existingPayout: existingPayout ? {
          id: existingPayout._id,
          status: existingPayout.status,
          transferredAt: existingPayout.transferredAt,
          transactionId: existingPayout.transactionId,
          razorpayPayoutId: existingPayout.razorpayPayoutId,
          transferMethod: existingPayout.transferMethod
        } : null
      }
    });
    
  } catch (error) {
    console.error('❌ Get weekly payout summary error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get payout summary',
      error: error.message
    });
  }
};

// Generate weekly payout
exports.generateWeeklyPayout = async (req, res) => {
  try {
    const { professionalEmail } = req.params;
    const { weekStart, weekEnd } = req.body;
    
    let weekStartDate, weekEndDate;
    
    if (weekStart && weekEnd) {
      weekStartDate = new Date(weekStart);
      weekEndDate = new Date(weekEnd);
    } else {
      ({ weekStartDate, weekEndDate } = getCurrentWeekDates());
    }
    
    const professional = await Professional.findOne({ 
      email: professionalEmail.toLowerCase() 
    });
    
    if (!professional) {
      return res.status(404).json({
        success: false,
        message: 'Professional not found'
      });
    }
    
    if (!professional.bankDetails || !professional.bankVerified) {
      return res.status(400).json({
        success: false,
        message: 'Professional bank details not verified'
      });
    }
    
    const existingPayout = await Payout.findOne({
      professionalEmail: professionalEmail.toLowerCase(),
      weekStartDate,
      weekEndDate
    });
    
    if (existingPayout) {
      return res.status(400).json({
        success: false,
        message: 'Payout already generated for this week',
        data: existingPayout
      });
    }
    
    const completedOrders = await Order.find({
      'serviceItems.professionalEmail': professionalEmail.toLowerCase(),
      status: { $in: ['completed', 'delivered'] },
      $or: [
        { completedAt: { $gte: weekStartDate, $lte: weekEndDate } },
        { deliveredAt: { $gte: weekStartDate, $lte: weekEndDate } }
      ]
    }).populate([
      { path: 'serviceItems.serviceId', model: 'Service' },
      { path: 'user', select: 'name phone' }
    ]);
    
    if (completedOrders.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No completed services found for this week'
      });
    }
    
    const serviceItems = [];
    let totalRevenue = 0;
    
    for (const order of completedOrders) {
      for (const item of order.serviceItems) {
        if (item.professionalEmail?.toLowerCase() === professionalEmail.toLowerCase()) {
          const itemAmount = item.price * item.quantity;
          totalRevenue += itemAmount;
          
          serviceItems.push({
            orderId: order._id,
            orderNumber: order.orderNumber,
            serviceId: item.serviceId?._id,
            serviceName: item.serviceId?.name || 'Service',
            amount: itemAmount,
            quantity: item.quantity,
            completedAt: order.completedAt || order.deliveredAt,
            clientName: order.user?.name || 'N/A',
            clientPhone: order.user?.phone || 'N/A'
          });
        }
      }
    }
    
    const platformCommission = totalRevenue * 0.25;
    const professionalPayout = totalRevenue * 0.75;
    
    const payout = new Payout({
      professional: professional._id,
      professionalEmail: professional.email,
      professionalName: professional.name,
      weekStartDate,
      weekEndDate,
      totalRevenue,
      platformCommission,
      professionalPayout,
      serviceItems,
      bankDetails: {
        accountNumber: professional.bankDetails.accountNumber,
        ifscCode: professional.bankDetails.ifscCode,
        accountHolderName: professional.bankDetails.accountHolderName,
        bankName: professional.bankDetails.bankName,
        branchName: professional.bankDetails.branchName
      },
      status: 'pending',
      transferMethod: 'automated'
    });
    
    await payout.save();
    
    console.log('✅ Payout generated:', {
      payoutId: payout._id,
      amount: professionalPayout.toFixed(2),
      services: serviceItems.length
    });
    
    res.status(201).json({
      success: true,
      message: 'Weekly payout generated successfully',
      data: payout
    });
    
  } catch (error) {
    console.error('❌ Generate payout error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate payout',
      error: error.message
    });
  }
};

// Process automated payout
exports.processPayout = async (req, res) => {
  try {
    const { payoutId } = req.params;
    const { adminNotes } = req.body;
    
    const payout = await Payout.findById(payoutId).populate('professional');
    
    if (!payout) {
      return res.status(404).json({
        success: false,
        message: 'Payout not found'
      });
    }
    
    if (payout.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `Cannot process payout with status: ${payout.status}`
      });
    }

    const professional = payout.professional;
    
    // Verify bank details
    if (!professional.bankVerified) {
      return res.status(400).json({
        success: false,
        message: 'Bank details not verified for this professional'
      });
    }

    // Update status to processing
    payout.status = 'processing';
    if (adminNotes) payout.adminNotes = adminNotes;
    await payout.save();

    try {
      // Setup Razorpay account (creates contact and fund account if not exists)
      console.log('🔄 Setting up Razorpay account...');
      const { fundAccountId } = await razorpayPayoutService.setupProfessionalAccount(professional);

      // Process the payout
      console.log('💸 Processing payout via Razorpay...');
      const razorpayPayout = await razorpayPayoutService.processPayout(
        fundAccountId,
        payout.professionalPayout,
        payout._id,
        professional.name
      );

      // Update payout with Razorpay details
      payout.razorpayPayoutId = razorpayPayout.id;
      payout.transactionId = razorpayPayout.utr || razorpayPayout.id;
      payout.status = razorpayPayout.status === 'processed' ? 'completed' : 'processing';
      payout.transferredAt = razorpayPayout.status === 'processed' ? new Date() : null;
      payout.transferredBy = req.user._id;
      
      await payout.save();

      console.log('✅ Payout processed successfully:', {
        payoutId: payout._id,
        razorpayPayoutId: razorpayPayout.id,
        status: razorpayPayout.status,
        amount: payout.professionalPayout.toFixed(2)
      });

      // Emit socket event
      const io = getIO();
      io.emit('payout-processed', {
        payoutId: payout._id,
        professionalEmail: payout.professionalEmail,
        amount: payout.professionalPayout,
        status: payout.status,
        timestamp: new Date()
      });

      res.json({
        success: true,
        message: payout.status === 'completed' 
          ? 'Payout completed successfully' 
          : 'Payout is being processed',
        data: {
          ...payout.toObject(),
          razorpayStatus: razorpayPayout.status,
          razorpayPayoutId: razorpayPayout.id
        }
      });

    } catch (razorpayError) {
      console.error('❌ Razorpay payout error:', razorpayError);
      
      // Update payout status to failed
      payout.status = 'failed';
      payout.failureReason = razorpayError.message;
      await payout.save();

      return res.status(500).json({
        success: false,
        message: 'Failed to process payout through payment gateway',
        error: razorpayError.message
      });
    }
    
  } catch (error) {
    console.error('❌ Process payout error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process payout',
      error: error.message
    });
  }
};

// Webhook handler for Razorpay payout status updates
exports.handlePayoutWebhook = async (req, res) => {
  try {
    const signature = req.headers['x-razorpay-signature'];
    
    // Verify webhook signature
    const isValid = razorpayPayoutService.verifyWebhookSignature(
      req.body,
      signature
    );

    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: 'Invalid webhook signature'
      });
    }

    const { event, payload } = req.body;

    if (event === 'payout.processed' || event === 'payout.failed') {
      const razorpayPayoutId = payload.payout.entity.id;
      
      // Find payout by Razorpay payout ID
      const payout = await Payout.findOne({ razorpayPayoutId });

      if (payout) {
        if (event === 'payout.processed') {
          payout.status = 'completed';
          payout.transferredAt = new Date();
          payout.transactionId = payload.payout.entity.utr || razorpayPayoutId;
        } else if (event === 'payout.failed') {
          payout.status = 'failed';
          payout.failureReason = payload.payout.entity.failure_reason || 'Payment failed';
        }

        await payout.save();

        console.log(`✅ Webhook processed: ${event}`, {
          payoutId: payout._id,
          razorpayPayoutId,
          status: payout.status
        });

        // Emit socket event
        const io = getIO();
        io.emit('payout-status-updated', {
          payoutId: payout._id,
          professionalEmail: payout.professionalEmail,
          status: payout.status,
          timestamp: new Date()
        });
      }
    }

    res.json({ success: true });
    
  } catch (error) {
    console.error('❌ Webhook error:', error);
    res.status(500).json({
      success: false,
      message: 'Webhook processing failed',
      error: error.message
    });
  }
};

// Get payout history
exports.getPayoutHistory = async (req, res) => {
  try {
    const { professionalEmail } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;
    
    const payouts = await Payout.find({
      professionalEmail: professionalEmail.toLowerCase()
    })
    .sort({ weekStartDate: -1 })
    .skip(skip)
    .limit(parseInt(limit));
    
    const total = await Payout.countDocuments({
      professionalEmail: professionalEmail.toLowerCase()
    });
    
    res.json({
      success: true,
      data: {
        payouts,
        pagination: {
          current: parseInt(page),
          pages: Math.ceil(total / limit),
          total
        }
      }
    });
    
  } catch (error) {
    console.error('❌ Get payout history error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get payout history',
      error: error.message
    });
  }
};

// Get payout by ID
exports.getPayoutById = async (req, res) => {
  try {
    const { payoutId } = req.params;
    
    const payout = await Payout.findById(payoutId)
      .populate('professional', 'name email phone');
    
    if (!payout) {
      return res.status(404).json({
        success: false,
        message: 'Payout not found'
      });
    }
    
    res.json({
      success: true,
      data: payout
    });
    
  } catch (error) {
    console.error('❌ Get payout error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get payout details',
      error: error.message
    });
  }
};

// Get all pending payouts
exports.getAllPendingPayouts = async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const skip = (page - 1) * limit;
    
    const payouts = await Payout.find({
      status: 'pending'
    })
    .populate('professional', 'name email phone')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));
    
    const total = await Payout.countDocuments({ status: 'pending' });
    
    res.json({
      success: true,
      data: {
        payouts,
        pagination: {
          current: parseInt(page),
          pages: Math.ceil(total / limit),
          total
        }
      }
    });
    
  } catch (error) {
    console.error('❌ Get pending payouts error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get pending payouts',
      error: error.message
    });
  }
};

// Check payout status (manual refresh)
exports.checkPayoutStatus = async (req, res) => {
  try {
    const { payoutId } = req.params;
    
    const payout = await Payout.findById(payoutId);
    
    if (!payout) {
      return res.status(404).json({
        success: false,
        message: 'Payout not found'
      });
    }

    if (!payout.razorpayPayoutId) {
      return res.json({
        success: true,
        data: payout
      });
    }

    // Fetch latest status from Razorpay
    const razorpayPayout = await razorpayPayoutService.getPayoutStatus(
      payout.razorpayPayoutId
    );

    // Update local status if changed
    if (razorpayPayout.status === 'processed' && payout.status !== 'completed') {
      payout.status = 'completed';
      payout.transferredAt = new Date();
      payout.transactionId = razorpayPayout.utr || payout.razorpayPayoutId;
      await payout.save();
    } else if (razorpayPayout.status === 'failed' && payout.status !== 'failed') {
      payout.status = 'failed';
      payout.failureReason = razorpayPayout.failure_reason || 'Payment failed';
      await payout.save();
    }

    res.json({
      success: true,
      data: {
        ...payout.toObject(),
        razorpayStatus: razorpayPayout.status
      }
    });
    
  } catch (error) {
    console.error('❌ Check payout status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check payout status',
      error: error.message
    });
  }
};

module.exports = exports;