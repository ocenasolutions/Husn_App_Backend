// server/middlewares/adminMiddleware.js
const User = require('../models/User');

const adminMiddleware = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    const adminEmails = [
      'testingaditya5@gmail.com',
      'aditya2.ocena@gmail.com',
      'testing.ocena@gmail.com',
    ];
    const isAuthorizedAdmin = adminEmails.includes(user.email.toLowerCase());
    if (!isAuthorizedAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Only authorized administrators can perform this action.'
      });
    }
    req.isAdmin = true;
    next();
  } catch (error) {
    console.error('Admin middleware error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error in admin authorization'
    });
  }
};
module.exports = adminMiddleware;