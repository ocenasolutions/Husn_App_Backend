const axios = require('axios');

// Brevo (formerly Sendinblue) configuration
const BREVO_API_KEY = process.env.BREVO_API_KEY;
const BREVO_SENDER_EMAIL = process.env.BREVO_SENDER_EMAIL || 'contact.husn@gmail.com';
const BREVO_SENDER_NAME = process.env.BREVO_SENDER_NAME || 'Husn Salon';
const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

/**
 * Send email via Brevo API
 * @param {string} to - Recipient email
 * @param {string} toName - Recipient name
 * @param {string} subject - Email subject
 * @param {string} htmlContent - HTML content
 * @returns {Promise<object>} Brevo response
 */
const sendEmail = async (to, toName, subject, htmlContent) => {
  if (!BREVO_API_KEY) {
    console.error('❌ BREVO_API_KEY is not set in environment variables');
    throw new Error('Brevo API key is not configured. Please set BREVO_API_KEY in your .env file');
  }

  // Log API key format for debugging (hide most characters)
  const keyPreview = BREVO_API_KEY ? 
    `${BREVO_API_KEY.substring(0, 10)}...${BREVO_API_KEY.substring(BREVO_API_KEY.length - 4)}` : 
    'undefined';
  console.log('Using Brevo API key:', keyPreview);

  try {
    const payload = {
      sender: {
        name: BREVO_SENDER_NAME,
        email: BREVO_SENDER_EMAIL
      },
      to: [
        {
          email: to,
          name: toName
        }
      ],
      subject: subject,
      htmlContent: htmlContent
    };

    const response = await axios.post(BREVO_API_URL, payload, {
      headers: {
        'accept': 'application/json',
        'api-key': BREVO_API_KEY,
        'content-type': 'application/json'
      }
    });

    console.log('Email sent successfully via Brevo:', response.data);
    return response.data;
  } catch (error) {
    console.error('Brevo error:', error.response?.data || error.message);
    throw new Error(`Failed to send email: ${error.response?.data?.message || error.message}`);
  }
};

/**
 * Generate a 6-digit OTP
 * @returns {string} OTP code
 */
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * Send OTP verification email
 * @param {string} email - Recipient email
 * @param {string} name - Recipient name
 * @param {string} otp - OTP code
 * @returns {Promise<object>} Email send result
 */
const sendOTPEmail = async (email, name, otp) => {
  console.log(`Attempting to send OTP ${otp} to ${email}`);
  
  const subject = 'Your OTP Code - Auth App';
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body {
          margin: 0;
          padding: 0;
          font-family: Arial, sans-serif;
          background-color: #f4f4f4;
        }
        .container {
          max-width: 600px;
          margin: 0 auto;
          padding: 20px;
        }
        .header {
          background-color: #007AFF;
          color: white;
          padding: 20px;
          text-align: center;
          border-radius: 8px 8px 0 0;
        }
        .header h1 {
          margin: 0;
          font-size: 24px;
        }
        .content {
          background-color: #ffffff;
          padding: 30px;
          border-radius: 0 0 8px 8px;
        }
        .content h2 {
          color: #333;
          margin-top: 0;
        }
        .content p {
          color: #666;
          line-height: 1.6;
        }
        .otp-code {
          font-size: 32px;
          font-weight: bold;
          color: #007AFF;
          text-align: center;
          padding: 20px;
          background-color: #f9f9f9;
          border-radius: 8px;
          margin: 20px 0;
          letter-spacing: 5px;
          border: 2px dashed #007AFF;
        }
        .warning {
          color: #FF3B30;
          font-weight: bold;
        }
        .footer {
          text-align: center;
          color: #999;
          margin-top: 20px;
          font-size: 14px;
          padding-top: 20px;
          border-top: 1px solid #eee;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Auth App</h1>
        </div>
        <div class="content">
          <h2>Hello ${name}!</h2>
          <p>You requested a verification code. Here's your OTP:</p>
          
          <div class="otp-code">${otp}</div>
          
          <p class="warning">This code will expire in 10 minutes.</p>
          <p>If you didn't request this code, please ignore this email and ensure your account is secure.</p>
          
          <div class="footer">
            <p>Thank you for using Auth App!</p>
            <p>This is an automated message, please do not reply.</p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;

  return await sendEmail(email, name, subject, htmlContent);
};

/**
 * Send welcome email - DISABLED (stub function for compatibility)
 * @param {string} email - Recipient email
 * @param {string} name - Recipient name
 * @returns {Promise<object>} Mock success response
 */
const sendWelcomeEmail = async (email, name) => {
  console.log(`Welcome email disabled - skipping for ${email}`);
  return { success: true, message: 'Welcome email disabled' };
};

/**
 * Test Brevo connection
 * @returns {Promise<boolean>} Connection status
 */
const testEmailConnection = async () => {
  try {
    if (!BREVO_API_KEY) {
      console.error('Brevo API key is missing');
      return false;
    }

    // Test API key by getting account info
    const response = await axios.get('https://api.brevo.com/v3/account', {
      headers: {
        'accept': 'application/json',
        'api-key': BREVO_API_KEY
      }
    });

    console.log('Brevo connection successful:', response.data.email);
    console.log('Daily sending limit:', response.data.plan?.[0]?.credits || 'Unlimited');
    return true;
  } catch (error) {
    console.error('Brevo connection failed:', error.response?.data || error.message);
    return false;
  }
};

module.exports = {
  sendOTPEmail,
  sendWelcomeEmail, // Stub function - does nothing
  testEmailConnection,
  generateOTP,
  sendEmail // Export for custom emails if needed
};