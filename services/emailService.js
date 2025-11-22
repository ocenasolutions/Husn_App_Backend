const axios = require('axios');

class EmailService {
  constructor() {
    this.apiKey = process.env.BREVO_API_KEY;
    this.senderEmail = process.env.BREVO_SENDER_EMAIL;
    this.senderName = process.env.BREVO_SENDER_NAME;
    this.apiUrl = 'https://api.brevo.com/v3/smtp/email';
  }

  async sendContractEmail(recipientEmail, salonName, salonOwnerName = '') {
    try {
      const emailData = {
        sender: {
          name: this.senderName,
          email: this.senderEmail
        },
        to: [
          {
            email: recipientEmail,
            name: salonOwnerName || recipientEmail
          }
        ],
        subject: 'Contract Signing Required - Husn Salon Partnership',
        htmlContent: this.getContractEmailTemplate(salonName, salonOwnerName),
        textContent: this.getContractEmailTextContent(salonName)
      };

      const response = await axios.post(this.apiUrl, emailData, {
        headers: {
          'accept': 'application/json',
          'api-key': this.apiKey,
          'content-type': 'application/json'
        }
      });

      console.log('Contract email sent successfully:', response.data);
      return {
        success: true,
        messageId: response.data.messageId
      };
    } catch (error) {
      console.error('Error sending contract email:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data || error.message
      };
    }
  }

  getContractEmailTemplate(salonName, salonOwnerName) {
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Contract Signing Required</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f8f9fa;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8f9fa; padding: 40px 20px;">
          <tr>
            <td align="center">
              <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
                
                <!-- Header -->
                <tr>
                  <td style="background: linear-gradient(135deg, #FF6B9D 0%, #FF8FAB 100%); padding: 40px 30px; text-align: center;">
                    <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: bold;">
                      Welcome to Husn! 💅
                    </h1>
                  </td>
                </tr>

                <!-- Content -->
                <tr>
                  <td style="padding: 40px 30px;">
                    ${salonOwnerName ? `<p style="margin: 0 0 20px 0; color: #2C3E50; font-size: 16px; line-height: 1.6;">Dear ${salonOwnerName},</p>` : ''}
                    
                    <p style="margin: 0 0 20px 0; color: #2C3E50; font-size: 16px; line-height: 1.6;">
                      Congratulations! Your salon <strong style="color: #FF6B9D;">"${salonName}"</strong> has been successfully registered on the Husn platform.
                    </p>

                    <p style="margin: 0 0 20px 0; color: #2C3E50; font-size: 16px; line-height: 1.6;">
                      To complete your onboarding and start accepting bookings, we need you to review and sign our partnership agreement.
                    </p>

                    <div style="background-color: #FFF5F8; border-left: 4px solid #FF6B9D; padding: 20px; margin: 30px 0; border-radius: 4px;">
                      <p style="margin: 0; color: #2C3E50; font-size: 15px; line-height: 1.6;">
                        <strong>⚡ Action Required:</strong><br>
                        Please click the button below to review and digitally sign the partnership contract.
                      </p>
                    </div>

                    <!-- CTA Button -->
                    <table width="100%" cellpadding="0" cellspacing="0" style="margin: 30px 0;">
                      <tr>
                        <td align="center">
                          <a href="https://contract-topaz.vercel.app" 
                          style="display: inline-block; background-color: #FF6B9D; color: #ffffff; text-decoration: none; padding: 16px 40px; border-radius: 8px; font-size: 16px; font-weight: bold; box-shadow: 0 4px 12px rgba(255, 107, 157, 0.3);">
                          Sign Contract Now
                          </a>
                        </td>
                      </tr>
                    </table>
                    <p style="margin: 30px 0 10px 0; color: #7F8C8D; font-size: 14px; line-height: 1.6;">
                    Or copy and paste this link into your browser:
                    </p>
                    <p style="margin: 0 0 30px 0; color: #FF6B9D; font-size: 14px; word-break: break-all;">
                    https://contract-topaz.vercel.app
                    </p>
                    <!-- Benefits Section -->
                    <div style="background-color: #F8F9FA; padding: 25px; border-radius: 8px; margin: 30px 0;">
                      <h3 style="margin: 0 0 15px 0; color: #2C3E50; font-size: 18px;">
                        What's Next? 🚀
                      </h3>
                      <ul style="margin: 0; padding: 0 0 0 20px; color: #2C3E50; font-size: 15px; line-height: 1.8;">
                        <li>Review and sign the partnership agreement</li>
                        <li>Complete your salon profile and add services</li>
                        <li>Set your availability and pricing</li>
                        <li>Start receiving bookings from customers</li>
                      </ul>
                    </div>
                    <p style="margin: 30px 0 0 0; color: #2C3E50; font-size: 16px; line-height: 1.6;">
                      If you have any questions or need assistance, please don't hesitate to reach out to our support team.
                    </p>

                    <p style="margin: 20px 0 0 0; color: #2C3E50; font-size: 16px; line-height: 1.6;">
                      Best regards,<br>
                      <strong>The Husn Team</strong>
                    </p>
                  </td>
                </tr>

                <!-- Footer -->
                <tr>
                  <td style="background-color: #F8F9FA; padding: 30px; text-align: center; border-top: 1px solid #E0E0E0;">
                    <p style="margin: 0 0 10px 0; color: #7F8C8D; font-size: 14px;">
                      This is an automated email. Please do not reply to this message.
                    </p>
                    <p style="margin: 0; color: #7F8C8D; font-size: 14px;">
                      © 2024 Husn. All rights reserved.
                    </p>
                  </td>
                </tr>

              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;
  }

  getContractEmailTextContent(salonName) {
    return `
Welcome to Husn!

Congratulations! Your salon "${salonName}" has been successfully registered on the Husn platform.

To complete your onboarding and start accepting bookings, we need you to review and sign our partnership agreement.

ACTION REQUIRED:
Please visit the following link to review and digitally sign the partnership contract:
https://contract-topaz.vercel.app

What's Next?
- Review and sign the partnership agreement
- Upload the pictures of services you provide. 
- Start receiving bookings from customers

If you have any questions or need assistance, please don't hesitate to reach out to our support team.

Best regards,
The Husn Team

---
This is an automated email. Please do not reply to this message.
© 2024 Husn. All rights reserved.
    `.trim();
  }

  // Method for sending welcome email after contract is signed
  async sendWelcomeEmail(recipientEmail, salonName, salonOwnerName = '') {
    try {
      const emailData = {
        sender: {
          name: this.senderName,
          email: this.senderEmail
        },
        to: [
          {
            email: recipientEmail,
            name: salonOwnerName || recipientEmail
          }
        ],
        subject: 'Welcome to Husn - Let\'s Get Started!',
        htmlContent: this.getWelcomeEmailTemplate(salonName, salonOwnerName)
      };

      const response = await axios.post(this.apiUrl, emailData, {
        headers: {
          'accept': 'application/json',
          'api-key': this.apiKey,
          'content-type': 'application/json'
        }
      });

      console.log('Welcome email sent successfully:', response.data);
      return {
        success: true,
        messageId: response.data.messageId
      };
    } catch (error) {
      console.error('Error sending welcome email:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data || error.message
      };
    }
  }

  getWelcomeEmailTemplate(salonName, salonOwnerName) {
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Welcome to Husn</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f8f9fa;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8f9fa; padding: 40px 20px;">
          <tr>
            <td align="center">
              <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
                
                <tr>
                  <td style="background: linear-gradient(135deg, #10B981 0%, #34D399 100%); padding: 40px 30px; text-align: center;">
                    <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: bold;">
                      🎉 You're All Set!
                    </h1>
                  </td>
                </tr>

                <tr>
                  <td style="padding: 40px 30px; text-align: center;">
                    ${salonOwnerName ? `<p style="margin: 0 0 20px 0; color: #2C3E50; font-size: 16px;">Dear ${salonOwnerName},</p>` : ''}
                    
                    <p style="margin: 0 0 20px 0; color: #2C3E50; font-size: 16px; line-height: 1.6;">
                      Thank you for signing the partnership agreement! <strong>"${salonName}"</strong> is now an official partner of Husn.
                    </p>

                    <p style="margin: 0; color: #2C3E50; font-size: 16px; line-height: 1.6;">
                      You can now start managing your salon, adding services, and accepting bookings through our platform.
                    </p>
                  </td>
                </tr>

                <tr>
                  <td style="background-color: #F8F9FA; padding: 30px; text-align: center; border-top: 1px solid #E0E0E0;">
                    <p style="margin: 0; color: #7F8C8D; font-size: 14px;">
                      © 2024 Husn. All rights reserved.
                    </p>
                  </td>
                </tr>

              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;
  }
}

module.exports = new EmailService();