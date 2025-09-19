const User = require('../models/User');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const axios = require('axios');
const { OAuth2Client } = require('google-auth-library');
const { sendOTPEmail } = require('../utils/emailService');

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-key';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;

const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

// Generate tokens
const generateTokens = (userId) => {
  const accessToken = jwt.sign({ userId }, JWT_SECRET, { expiresIn: '15m' });
  const refreshToken = jwt.sign({ userId }, JWT_REFRESH_SECRET, { expiresIn: '7d' });
  return { accessToken, refreshToken };
};

// Generate OTP
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Signup Controller
exports.signup = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Validation
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, and password are required'
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'User already exists with this email'
      });
    }

    // Create new user
    const user = new User({ name, email, password });
    await user.save();

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user._id);

    // Save refresh token to user
    user.refreshToken = refreshToken;
    await user.save();

    // Cache session in Redis
    await req.app.locals.redis.setEx(`session:${accessToken}`, 7 * 24 * 60 * 60, user._id.toString());

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      user: user.toJSON(),
      tokens: { accessToken, refreshToken }
    });

  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Login Controller
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Check password
    const isValidPassword = await user.comparePassword(password);
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user._id);

    // Update refresh token
    user.refreshToken = refreshToken;
    await user.save();

    // Cache session in Redis
    await req.app.locals.redis.setEx(`session:${accessToken}`, 7 * 24 * 60 * 60, user._id.toString());

    res.json({
      success: true,
      message: 'Login successful',
      user: user.toJSON(),
      tokens: { accessToken, refreshToken }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Send OTP Controller
exports.sendOTP = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    // Check if user exists
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'No account found with this email'
      });
    }

    // Generate OTP
    const otp = generateOTP();

    // Store OTP in Redis with 5 minute expiry
    await req.app.locals.redis.setEx(`otp:${email}`, 5 * 60, otp);

    // Send OTP via email
    await sendOTPEmail(email, user.name, otp);

    res.json({
      success: true,
      message: 'OTP sent successfully to your email'
    });

  } catch (error) {
    console.error('Send OTP error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send OTP'
    });
  }
};

// Verify OTP Controller
exports.verifyOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        message: 'Email and OTP are required'
      });
    }

    // Get OTP from Redis
    const storedOTP = await req.app.locals.redis.get(`otp:${email}`);

    if (!storedOTP) {
      return res.status(400).json({
        success: false,
        message: 'OTP expired or invalid'
      });
    }

    if (storedOTP !== otp) {
      return res.status(400).json({
        success: false,
        message: 'Invalid OTP'
      });
    }

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user._id);

    // Update refresh token
    user.refreshToken = refreshToken;
    user.isVerified = true;
    await user.save();

    // Delete OTP from Redis
    await req.app.locals.redis.del(`otp:${email}`);

    // Cache session in Redis
    await req.app.locals.redis.setEx(`session:${accessToken}`, 7 * 24 * 60 * 60, user._id.toString());

    res.json({
      success: true,
      message: 'OTP verified successfully',
      user: user.toJSON(),
      tokens: { accessToken, refreshToken }
    });

  } catch (error) {
    console.error('Verify OTP error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Google Auth Controller
exports.googleAuth = async (req, res) => {
  try {
    const { accessToken } = req.body;

    if (!accessToken) {
      return res.status(400).json({
        success: false,
        message: 'Access token is required'
      });
    }

    // Get user info from Google
    const response = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const { id, email, name, picture } = response.data;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Unable to get email from Google'
      });
    }

    // Check if user exists
    let user = await User.findOne({ 
      $or: [
        { googleId: id },
        { email: email }
      ]
    });

    if (user) {
      // Update existing user
      if (!user.googleId) {
        user.googleId = id;
        user.googleEmail = email;
      }
      if (!user.avatar && picture) {
        user.avatar = picture;
      }
      await user.save();
    } else {
      // Create new user
      user = new User({
        name,
        email,
        googleId: id,
        googleEmail: email,
        avatar: picture,
        isVerified: true
      });
      await user.save();
    }

    // Generate tokens
    const { accessToken: jwtToken, refreshToken } = generateTokens(user._id);

    // Update refresh token
    user.refreshToken = refreshToken;
    await user.save();

    // Cache session in Redis
    await req.app.locals.redis.setEx(`session:${jwtToken}`, 7 * 24 * 60 * 60, user._id.toString());

    res.json({
      success: true,
      message: 'Google authentication successful',
      user: user.toJSON(),
      tokens: { accessToken: jwtToken, refreshToken }
    });

  } catch (error) {
    console.error('Google auth error:', error);
    
    if (error.response?.status === 401) {
      return res.status(401).json({
        success: false,
        message: 'Invalid Google access token'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Google authentication failed'
    });
  }
};

// Refresh Token Controller
exports.refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        message: 'Refresh token is required'
      });
    }

    // Verify refresh token
    const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
    const user = await User.findById(decoded.userId);

    if (!user || user.refreshToken !== refreshToken) {
      return res.status(401).json({
        success: false,
        message: 'Invalid refresh token'
      });
    }

    // Generate new tokens
    const tokens = generateTokens(user._id);

    // Update refresh token
    user.refreshToken = tokens.refreshToken;
    await user.save();

    // Cache new session in Redis
    await req.app.locals.redis.setEx(`session:${tokens.accessToken}`, 7 * 24 * 60 * 60, user._id.toString());

    res.json({
      success: true,
      message: 'Token refreshed successfully',
      tokens
    });

  } catch (error) {
    console.error('Refresh token error:', error);
    res.status(401).json({
      success: false,
      message: 'Invalid or expired refresh token'
    });
  }
};