const User = require('../models/User');
const Professional = require('../models/Professional');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const axios = require('axios');
const { OAuth2Client } = require('google-auth-library');
const { sendOTPEmail, sendWelcomeEmail } = require('../utils/emailService');
const { createWallet } = require('./walletController');

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-key';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_IOS_CLIENT_ID = process.env.GOOGLE_IOS_CLIENT_ID;
const GOOGLE_ANDROID_CLIENT_ID = process.env.GOOGLE_ANDROID_CLIENT_ID;

const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

const ADMIN_EMAILS = [
  'testingaditya5@gmail.com',
  'aditya2.ocena@gmail.com',
  'testing.ocena@gmail.com',
];

const generateTokens = (userId, isProfessional = false) => {
  const payload = { 
    userId, 
    isProfessional,
    timestamp: Date.now()
  };
  const accessToken = jwt.sign(payload, JWT_SECRET, { expiresIn: '15d' });
  const refreshToken = jwt.sign(payload, JWT_REFRESH_SECRET, { expiresIn: '7d' });
  return { accessToken, refreshToken };
};

// Generate OTP
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Verify Google ID Token
const verifyGoogleToken = async (idToken) => {
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: [GOOGLE_CLIENT_ID, GOOGLE_IOS_CLIENT_ID, GOOGLE_ANDROID_CLIENT_ID].filter(Boolean),
    });
    
    const payload = ticket.getPayload();
    return {
      success: true,
      payload
    };
  } catch (error) {
    console.error('Google token verification error:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// Verify Google Access Token
const verifyGoogleAccessToken = async (accessToken) => {
  try {
    const response = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    return {
      success: true,
      userInfo: response.data
    };
  } catch (error) {
    console.error('Google access token verification error:', error);
    return {
      success: false,
      error: error.response?.data?.error || error.message
    };
  }
};

// ✅ FIXED: Signup Controller - Step 1: Send OTP
exports.signupSendOTP = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    // Validation
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, and password are required'
      });
    }

    if (name.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Name must be at least 2 characters'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters'
      });
    }

    const emailLower = email.toLowerCase();

    // Determine user type based on role parameter
    const isAdmin = ADMIN_EMAILS.includes(emailLower);
    const isProfessional = role === 'professional';
    
    // Determine final role
    let userRole;
    if (isAdmin) {
      userRole = 'admin';
    } else if (isProfessional) {
      userRole = 'professional';
    } else {
      userRole = 'user'; // Regular customer
    }

    console.log('📝 Signup initiated:', { email: emailLower, role: userRole, isProfessional });

    // Check if email already exists
    if (isProfessional) {
      // Check Professional collection for professionals
      const existingProfessional = await Professional.findOne({ email: emailLower });
      if (existingProfessional) {
        return res.status(409).json({
          success: false,
          message: 'Professional already exists with this email'
        });
      }
    } else {
      // Check User collection for regular users and admins
      const existingUser = await User.findOne({ email: emailLower });
      if (existingUser && existingUser.isVerified) {
        return res.status(409).json({
          success: false,
          message: 'User already exists with this email'
        });
      }
    }

    // Generate OTP
    const otp = generateOTP();

    // Store signup data temporarily in Redis with OTP
    const signupData = {
      name: name.trim(),
      email: emailLower,
      password,
      role: userRole,
      otp,
      isProfessional
    };

    if (req.app.locals.redis) {
      await req.app.locals.redis.setEx(`signup:${emailLower}`, 10 * 60, JSON.stringify(signupData));
    }

    // Send OTP via email
    await sendOTPEmail(email, name, otp);

    res.status(200).json({
      success: true,
      message: 'OTP sent to your email for account verification',
      role: userRole
    });

  } catch (error) {
    console.error('Signup send OTP error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send OTP'
    });
  }
};

// ✅ FIXED: Signup Controller - Step 2: Verify OTP and Create Account
exports.signupVerifyOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        message: 'Email and OTP are required'
      });
    }

    const emailLower = email.toLowerCase();

    // Get signup data from Redis
    let signupDataStr = null;
    if (req.app.locals.redis) {
      signupDataStr = await req.app.locals.redis.get(`signup:${emailLower}`);
    }

    if (!signupDataStr) {
      return res.status(400).json({
        success: false,
        message: 'OTP expired or invalid. Please start signup process again.'
      });
    }

    const signupData = JSON.parse(signupDataStr);

    if (signupData.otp !== otp) {
      return res.status(400).json({
        success: false,
        message: 'Invalid OTP'
      });
    }

    let userData;
    let isProfessional = signupData.isProfessional;

    console.log('✅ OTP verified. Creating account:', { email: emailLower, isProfessional });

    if (isProfessional) {
      // ✅ Create Professional account in Professional collection
      const professional = new Professional({
        name: signupData.name,
        email: signupData.email,
        phone: null,
        role: 'Professional',
        rating: 5.0,
        isActive: true,
        status: 'active',
        password: signupData.password
      });

      await professional.save();
      userData = professional.toJSON();
      userData.role = 'professional';

      console.log('✅ Professional created:', professional.email);

      // Generate tokens with professional flag
      const { accessToken, refreshToken } = generateTokens(professional._id, true);

      // Cache session in Redis
      if (req.app.locals.redis) {
        await req.app.locals.redis.setEx(
          `session:${accessToken}`, 
          7 * 24 * 60 * 60, 
          JSON.stringify({ id: professional._id, isProfessional: true })
        );
        await req.app.locals.redis.del(`signup:${emailLower}`);
      }

      // Send welcome email
      try {
        await sendWelcomeEmail(professional.email, professional.name);
      } catch (emailError) {
        console.error('Welcome email error:', emailError);
      }

      res.status(201).json({
        success: true,
        message: 'Professional account created successfully',
        user: userData,
        tokens: { accessToken, refreshToken }
      });

    } else {
      // ✅ Create User account in User collection (Regular user or Admin)
      let user = await User.findOne({ email: signupData.email });
      
      if (user && !user.isVerified) {
        user.name = signupData.name;
        user.password = signupData.password;
        user.role = signupData.role;
        user.isVerified = true;
      } else {
        user = new User({
          name: signupData.name,
          email: signupData.email,
          password: signupData.password,
          role: signupData.role, // 'user' or 'admin'
          isVerified: true
        });
      }

      await user.save();

      console.log('✅ User created:', user.email, 'Role:', user.role);

      // Create wallet for user/admin
      try {
        await createWallet(user._id);
      } catch (walletError) {
        console.error('Wallet creation error during signup:', walletError);
      }

      // Generate tokens
      const { accessToken, refreshToken } = generateTokens(user._id, false);

      user.refreshToken = refreshToken;
      await user.save();

      // Cache session in Redis
      if (req.app.locals.redis) {
        await req.app.locals.redis.setEx(
          `session:${accessToken}`, 
          7 * 24 * 60 * 60, 
          JSON.stringify({ id: user._id, isProfessional: false })
        );
        await req.app.locals.redis.del(`signup:${emailLower}`);
      }

      // Send welcome email
      try {
        await sendWelcomeEmail(user.email, user.name);
      } catch (emailError) {
        console.error('Welcome email error:', emailError);
      }

      res.status(201).json({
        success: true,
        message: 'Account created successfully',
        user: user.toJSON(),
        tokens: { accessToken, refreshToken }
      });
    }

  } catch (error) {
    console.error('Signup verify OTP error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create account'
    });
  }
};

// ✅ FIXED: Login Controller
exports.login = async (req, res) => {
  try {
    const { email, password, requestedRole } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    const emailLower = email.toLowerCase();
    const isAdminEmail = ADMIN_EMAILS.includes(emailLower);

    console.log('🔍 Login attempt:', { 
      email: emailLower, 
      requestedRole, 
      isAdminEmail,
      hasPassword: !!password 
    });

    let userData;
    let isProfessional = false;
    let actualRole = null;

    // ✅ SMART DETECTION: Check based on requestedRole or try both collections
    
    if (requestedRole === 'professional' || isAdminEmail) {
      // Professional or Admin login attempt
      
      if (isAdminEmail) {
        console.log('🔍 Admin email detected, checking User collection...');
        
        // Admin - check User collection
        const user = await User.findOne({ email: emailLower });
        
        if (!user) {
          return res.status(401).json({
            success: false,
            message: 'Admin account not found. Please contact support.'
          });
        }

        console.log('✅ Admin user found:', { 
          email: user.email, 
          role: user.role,
          isVerified: user.isVerified,
          hasPassword: !!user.password
        });

        // Check if user has a password
        if (!user.password) {
          return res.status(401).json({
            success: false,
            message: 'Please set up your password using "Forgot Password" option or sign up with Google.'
          });
        }

        const isValidPassword = await user.comparePassword(password);
        
        console.log('🔐 Admin password check:', isValidPassword);
        
        if (!isValidPassword) {
          return res.status(401).json({
            success: false,
            message: 'Invalid email or password'
          });
        }

        // Update role to admin if needed
        if (user.role !== 'admin') {
          console.log('🔄 Updating user role to admin:', user.email);
          user.role = 'admin';
          await user.save();
        }

        userData = user;
        isProfessional = false;
        actualRole = 'admin';

        console.log('✅ Admin login successful:', user.email);

      } else {
        // Professional login
        console.log('🔍 Checking Professional collection...');
        const professional = await Professional.findOne({ email: emailLower });
        
        if (!professional) {
          console.log('❌ Professional not found:', emailLower);
          return res.status(401).json({
            success: false,
            message: 'Invalid email or password'
          });
        }

        console.log('✅ Professional found:', { 
          email: professional.email, 
          hasPassword: !!professional.password 
        });

        // Check if professional has a password
        if (!professional.password) {
          return res.status(401).json({
            success: false,
            message: 'Account not properly configured. Please contact support or sign up again.'
          });
        }

        const isValidPassword = await professional.comparePassword(password);
        
        console.log('🔐 Professional password check:', isValidPassword);
        
        if (!isValidPassword) {
          return res.status(401).json({
            success: false,
            message: 'Invalid email or password'
          });
        }

        if (!professional.isActive || professional.status !== 'active') {
          return res.status(403).json({
            success: false,
            message: 'Your account is not active. Please contact admin.'
          });
        }

        userData = professional;
        isProfessional = true;
        actualRole = 'professional';
        userData.role = 'professional';

        console.log('✅ Professional login successful:', professional.email);
      }

    } else {
      // ✅ Regular User login (requestedRole === 'user' or undefined)
      console.log('🔍 Regular user login, checking User collection...');
      
      const user = await User.findOne({ email: emailLower });
      
      if (!user) {
        console.log('❌ User not found:', emailLower);
        return res.status(401).json({
          success: false,
          message: 'Invalid email or password'
        });
      }

      console.log('✅ User found:', { 
        email: user.email, 
        role: user.role,
        isVerified: user.isVerified,
        hasPassword: !!user.password
      });

      // Check if user is verified
      if (!user.isVerified) {
        return res.status(403).json({
          success: false,
          message: 'Please verify your email address'
        });
      }

      // Check if user has a password
      if (!user.password) {
        return res.status(401).json({
          success: false,
          message: 'Please set up your password using "Forgot Password" option or sign up with Google.'
        });
      }

      const isValidPassword = await user.comparePassword(password);
      
      console.log('🔐 User password check:', isValidPassword);
      
      if (!isValidPassword) {
        return res.status(401).json({
          success: false,
          message: 'Invalid email or password'
        });
      }

      userData = user;
      isProfessional = false;
      actualRole = user.role; // 'user' or 'admin'

      console.log('✅ User login successful:', user.email, 'Role:', user.role);
    }

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(userData._id, isProfessional);

    // Update refresh token
    if (isProfessional) {
      await Professional.findByIdAndUpdate(userData._id, { refreshToken });
    } else {
      userData.refreshToken = refreshToken;
      await userData.save();
    }

    // Cache session in Redis
    if (req.app.locals.redis) {
      await req.app.locals.redis.setEx(
        `session:${accessToken}`, 
        7 * 24 * 60 * 60, 
        JSON.stringify({ id: userData._id, isProfessional })
      );
    }

    res.json({
      success: true,
      message: 'Login successful',
      user: userData.toJSON ? userData.toJSON() : userData,
      tokens: { accessToken, refreshToken }
    });

  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// ✅ FIXED: Enhanced Google Auth Controller
exports.googleAuth = async (req, res) => {
  try {
    const { accessToken, idToken, userInfo, role } = req.body;

    if (!accessToken && !idToken) {
      return res.status(400).json({
        success: false,
        message: 'Access token or ID token is required'
      });
    }

    let googleUserData = null;

    // Verify ID token first
    if (idToken) {
      const idTokenResult = await verifyGoogleToken(idToken);
      if (idTokenResult.success) {
        const payload = idTokenResult.payload;
        googleUserData = {
          id: payload.sub,
          email: payload.email,
          name: payload.name,
          picture: payload.picture,
          givenName: payload.given_name,
          familyName: payload.family_name,
          emailVerified: payload.email_verified,
        };
      }
    }

    // Fallback to access token
    if (!googleUserData && accessToken) {
      const accessTokenResult = await verifyGoogleAccessToken(accessToken);
      if (accessTokenResult.success) {
        const userData = accessTokenResult.userInfo;
        googleUserData = {
          id: userData.id,
          email: userData.email,
          name: userData.name,
          picture: userData.picture,
          givenName: userData.given_name,
          familyName: userData.family_name,
          emailVerified: userData.verified_email,
        };
      }
    }

    // Use userInfo from frontend as fallback
    if (!googleUserData && userInfo) {
      googleUserData = {
        id: userInfo.id,
        email: userInfo.email,
        name: userInfo.name,
        picture: userInfo.photo,
        givenName: userInfo.givenName,
        familyName: userInfo.familyName,
        emailVerified: true,
      };
    }

    if (!googleUserData || !googleUserData.email) {
      return res.status(400).json({
        success: false,
        message: 'Unable to verify Google authentication'
      });
    }

    const emailLower = googleUserData.email.toLowerCase();
    const isAdmin = ADMIN_EMAILS.includes(emailLower);
    const isProfessional = role === 'professional';
    
    // Determine final role
    let userRole;
    if (isAdmin) {
      userRole = 'admin';
    } else if (isProfessional) {
      userRole = 'professional';
    } else {
      userRole = 'user';
    }

    console.log('🔐 Google auth:', { email: emailLower, role: userRole, isProfessional });

    let userData;

    if (isProfessional) {
      // ✅ Professional - use Professional collection
      let professional = await Professional.findOne({ 
        $or: [
          { googleId: googleUserData.id },
          { email: emailLower }
        ]
      });

      if (professional) {
        // Update existing professional
        let updated = false;
        if (!professional.googleId) {
          professional.googleId = googleUserData.id;
          updated = true;
        }
        if (!professional.profilePicture && googleUserData.picture) {
          professional.profilePicture = googleUserData.picture;
          updated = true;
        }
        if (updated) {
          await professional.save();
        }
        userData = professional;
      } else {
        // Create new professional
        professional = new Professional({
          name: googleUserData.name || `${googleUserData.givenName} ${googleUserData.familyName}`.trim(),
          email: emailLower,
          googleId: googleUserData.id,
          profilePicture: googleUserData.picture,
          role: 'Professional',
          rating: 5.0,
          isActive: true,
          status: 'active'
        });
        await professional.save();
        userData = professional;

        try {
          await sendWelcomeEmail(professional.email, professional.name);
        } catch (emailError) {
          console.error('Welcome email error:', emailError);
        }
      }
      userData.role = 'professional';

      console.log('✅ Professional Google auth successful:', professional.email);

    } else {
      // ✅ Regular user or Admin - use User collection
      let user = await User.findOne({ 
        $or: [
          { googleId: googleUserData.id },
          { email: emailLower }
        ]
      });

      if (user) {
        let updated = false;
        if (!user.googleId) {
          user.googleId = googleUserData.id;
          updated = true;
        }
        if (!user.googleEmail) {
          user.googleEmail = emailLower;
          updated = true;
        }
        if (!user.avatar && googleUserData.picture) {
          user.avatar = googleUserData.picture;
          updated = true;
        }
        if (!user.isVerified) {
          user.isVerified = true;
          updated = true;
        }
        if (isAdmin && user.role !== 'admin') {
          user.role = 'admin';
          updated = true;
        }
        if (updated) {
          await user.save();
        }
        userData = user;
      } else {
        user = new User({
          name: googleUserData.name || `${googleUserData.givenName} ${googleUserData.familyName}`.trim(),
          email: emailLower,
          googleId: googleUserData.id,
          googleEmail: emailLower,
          avatar: googleUserData.picture,
          isVerified: true,
          role: userRole // 'user' or 'admin'
        });
        await user.save();
        userData = user;

        try {
          await sendWelcomeEmail(user.email, user.name);
        } catch (emailError) {
          console.error('Welcome email error:', emailError);
        }
      }

      console.log('✅ User Google auth successful:', user.email, 'Role:', user.role);
    }

    // Generate tokens
    const { accessToken: jwtToken, refreshToken } = generateTokens(userData._id, isProfessional);

    // Update refresh token
    if (isProfessional) {
      await Professional.findByIdAndUpdate(userData._id, { refreshToken });
    } else {
      userData.refreshToken = refreshToken;
      await userData.save();
    }

    // Cache session in Redis
    if (req.app.locals.redis) {
      await req.app.locals.redis.setEx(
        `session:${jwtToken}`, 
        7 * 24 * 60 * 60, 
        JSON.stringify({ id: userData._id, isProfessional })
      );
    }

    res.json({
      success: true,
      message: 'Google authentication successful',
      user: userData.toJSON(),
      tokens: { accessToken: jwtToken, refreshToken }
    });

  } catch (error) {
    console.error('Google auth error:', error);
    res.status(500).json({
      success: false,
      message: 'Google authentication failed'
    });
  }
};

// Forgot Password - Send OTP Controller
exports.forgotPasswordSendOTP = async (req, res) => {
  try {
    const { email, role } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    const emailLower = email.toLowerCase();
    const isProfessional = role === 'professional';

    let userData = null;

    if (isProfessional) {
      userData = await Professional.findOne({ email: emailLower });
    } else {
      userData = await User.findOne({ email: emailLower });
    }

    if (!userData) {
      return res.status(404).json({
        success: false,
        message: 'No account found with this email'
      });
    }

    // Generate OTP
    const otp = generateOTP();

    // Store OTP in Redis
    if (req.app.locals.redis) {
      await req.app.locals.redis.setEx(`forgot-password:${emailLower}`, 10 * 60, otp);
    }

    // Send OTP via email
    await sendOTPEmail(email, userData.name, otp);

    res.json({
      success: true,
      message: 'OTP sent successfully to your email'
    });

  } catch (error) {
    console.error('Forgot password send OTP error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send OTP'
    });
  }
};

// Forgot Password - Verify OTP Controller
exports.forgotPasswordVerifyOTP = async (req, res) => {
  try {
    const { email, otp, role } = req.body;

    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        message: 'Email and OTP are required'
      });
    }

    const emailLower = email.toLowerCase();
    const isProfessional = role === 'professional';

    // Get OTP from Redis
    let storedOTP = null;
    if (req.app.locals.redis) {
      storedOTP = await req.app.locals.redis.get(`forgot-password:${emailLower}`);
    }

    if (!storedOTP || storedOTP !== otp) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired OTP'
      });
    }

    let userData;

    if (isProfessional) {
      userData = await Professional.findOne({ email: emailLower });
    } else {
      userData = await User.findOne({ email: emailLower });
    }

    if (!userData) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(userData._id, isProfessional);

    // Update refresh token
    if (isProfessional) {
      await Professional.findByIdAndUpdate(userData._id, { refreshToken });
    } else {
      userData.refreshToken = refreshToken;
      await userData.save();
    }

    // Delete OTP from Redis
    if (req.app.locals.redis) {
      await req.app.locals.redis.del(`forgot-password:${emailLower}`);
    }

    // Cache session
    if (req.app.locals.redis) {
      await req.app.locals.redis.setEx(
        `session:${accessToken}`, 
        7 * 24 * 60 * 60, 
        JSON.stringify({ id: userData._id, isProfessional })
      );
    }

    res.json({
      success: true,
      message: 'OTP verified successfully. You are now logged in.',
      user: userData.toJSON(),
      tokens: { accessToken, refreshToken }
    });

  } catch (error) {
    console.error('Forgot password verify OTP error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Legacy methods
exports.sendOTP = exports.forgotPasswordSendOTP;
exports.verifyOTP = exports.forgotPasswordVerifyOTP;

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

    const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
    const isProfessional = decoded.isProfessional || false;

    let userData;
    if (isProfessional) {
      userData = await Professional.findById(decoded.userId);
      if (!userData || userData.refreshToken !== refreshToken) {
        return res.status(401).json({
          success: false,
          message: 'Invalid refresh token'
        });
      }
    } else {
      userData = await User.findById(decoded.userId);
      if (!userData || userData.refreshToken !== refreshToken) {
        return res.status(401).json({
          success: false,
          message: 'Invalid refresh token'
        });
      }
    }

    // Generate new tokens
    const tokens = generateTokens(userData._id, isProfessional);

    // Update refresh token
    if (isProfessional) {
      await Professional.findByIdAndUpdate(userData._id, { refreshToken: tokens.refreshToken });
    } else {
      userData.refreshToken = tokens.refreshToken;
      await userData.save();
    }

    // Cache new session
    if (req.app.locals.redis) {
      await req.app.locals.redis.setEx(
        `session:${tokens.accessToken}`, 
        7 * 24 * 60 * 60, 
        JSON.stringify({ id: userData._id, isProfessional })
      );
    }

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

// Delete Account Controller
exports.deleteAccount = async (req, res) => {
  try {
    const { password } = req.body;
    const userId = req.user._id;
    const isProfessional = req.isProfessional || false;

    let userData;
    if (isProfessional) {
      userData = await Professional.findById(userId);
    } else {
      userData = await User.findById(userId);
    }

    if (!userData) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Verify password if it exists
    if (userData.password && password) {
      const bcrypt = require('bcryptjs');
      const isValidPassword = await bcrypt.compare(password, userData.password);
      if (!isValidPassword) {
        return res.status(401).json({
          success: false,
          message: 'Invalid password'
        });
      }
    }

    const userEmail = userData.email;
    const token = req.header('Authorization')?.replace('Bearer ', '');

    // Clean up Redis
    if (req.app.locals.redis) {
      if (token) await req.app.locals.redis.del(`session:${token}`);
      await req.app.locals.redis.del(`forgot-password:${userEmail}`);
      await req.app.locals.redis.del(`signup:${userEmail}`);
    }

    // Delete account
    if (isProfessional) {
      await Professional.findByIdAndDelete(userId);
    } else {
      await User.findByIdAndDelete(userId);
    }

    res.json({
      success: true,
      message: 'Account deleted successfully'
    });

  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete account'
    });
  }
};