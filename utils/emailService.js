const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

const sendOTPEmail = async (email, name, otp) => {
  console.log(`Attempting to send OTP ${otp} to ${email}`);
  
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: 'Your OTP Code - Auth App',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          .container {
            font-family: Arial, sans-serif;
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
          .content {
            background-color: #f9f9f9;
            padding: 30px;
            border-radius: 0 0 8px 8px;
          }
          .otp-code {
            font-size: 32px;
            font-weight: bold;
            color: #007AFF;
            text-align: center;
            padding: 20px;
            background-color: white;
            border-radius: 8px;
            margin: 20px 0;
            letter-spacing: 5px;
          }
          .footer {
            text-align: center;
            color: #666;
            margin-top: 20px;
            font-size: 14px;
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
            <p>You requested to login with OTP. Here's your verification code:</p>
            
            <div class="otp-code">${otp}</div>
            
            <p><strong>This code will expire in 10 minutes.</strong></p>
            <p>If you didn't request this code, please ignore this email.</p>
            
            <div class="footer">
              <p>Thank you for using Auth App!</p>
              <p>This is an automated message, please do not reply.</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent successfully:', info.response);
    return info;
  } catch (error) {
    console.error('Error sending email:', error);
    throw error;
  }
};

const sendWelcomeEmail = async (email, name) => {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: 'Welcome to Auth App!',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          .container {
            font-family: Arial, sans-serif;
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
          .content {
            background-color: #f9f9f9;
            padding: 30px;
            border-radius: 0 0 8px 8px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Welcome to Auth App!</h1>
          </div>
          <div class="content">
            <h2>Hello ${name}!</h2>
            <p>Thank you for signing up! Your account has been created successfully.</p>
            <p>You can now enjoy all the features of our app.</p>
            <p>If you have any questions, feel free to contact our support team.</p>
            <p>Happy exploring!</p>
          </div>
        </div>
      </body>
      </html>
    `
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('Welcome email sent successfully:', info.response);
    return info;
  } catch (error) {
    console.error('Error sending welcome email:', error);
    throw error;
  }
};
const testEmailConnection = async () => {
  try {
    await transporter.verify();
    console.log('Email server is ready to take our messages');
    return true;
  } catch (error) {
    console.error('Email server connection failed:', error);
    return false;
  }
};

module.exports = {
  sendOTPEmail,
  sendWelcomeEmail,
  testEmailConnection,
  generateOTP
};