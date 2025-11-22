const axios = require('axios');

// =======================
// FREE SMS SERVICE (Using Fast2SMS / TextLocal / MSG91)
// =======================

/**
 * Send SMS via Fast2SMS (Free tier: 1000 SMS/day in India)
 * Sign up at: https://www.fast2sms.com/
 */
const sendSMSViaFast2SMS = async (phoneNumber, message) => {
  const FAST2SMS_API_KEY = process.env.FAST2SMS_API_KEY;
  
  if (!FAST2SMS_API_KEY) {
    console.error('⚠️ FAST2SMS_API_KEY not configured');
    return { success: false, error: 'SMS service not configured' };
  }

  try {
    const response = await axios.post('https://www.fast2sms.com/dev/bulkV2', {
      route: 'v3',
      sender_id: 'HUSNAP', // 6 character sender ID (customize after approval)
      message: message,
      language: 'english',
      numbers: phoneNumber.replace(/[^\d]/g, '') // Remove non-numeric chars
    }, {
      headers: {
        'authorization': FAST2SMS_API_KEY,
        'Content-Type': 'application/json'
      }
    });

    console.log('✅ SMS sent via Fast2SMS:', response.data);
    return { success: true, data: response.data };
  } catch (error) {
    console.error('❌ Fast2SMS error:', error.response?.data || error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Send SMS via MSG91 (Free trial available, then very cheap)
 * Sign up at: https://msg91.com/
 */
const sendSMSViaMSG91 = async (phoneNumber, message) => {
  const MSG91_AUTH_KEY = process.env.MSG91_AUTH_KEY;
  const MSG91_SENDER_ID = process.env.MSG91_SENDER_ID || 'HUSNAP';
  
  if (!MSG91_AUTH_KEY) {
    console.error('⚠️ MSG91_AUTH_KEY not configured');
    return { success: false, error: 'SMS service not configured' };
  }

  try {
    const response = await axios.get('https://api.msg91.com/api/sendhttp.php', {
      params: {
        authkey: MSG91_AUTH_KEY,
        mobiles: phoneNumber.replace(/[^\d]/g, ''),
        message: message,
        sender: MSG91_SENDER_ID,
        route: 4, // Transactional route
        country: 91 // India country code
      }
    });

    console.log('✅ SMS sent via MSG91:', response.data);
    return { success: true, data: response.data };
  } catch (error) {
    console.error('❌ MSG91 error:', error.response?.data || error.message);
    return { success: false, error: error.message };
  }
};

// =======================
// FREE WHATSAPP SERVICE (Using Twilio Sandbox / CallMeBot)
// =======================

/**
 * Send WhatsApp message via Twilio WhatsApp Sandbox (FREE for testing)
 * Sign up at: https://www.twilio.com/
 * Note: Recipients must join your sandbox first by sending "join <code>" to your Twilio number
 */
const sendWhatsAppViaTwilio = async (phoneNumber, message) => {
  const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
  const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
  const TWILIO_WHATSAPP_NUMBER = process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+14155238886';
  
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    console.error('⚠️ Twilio credentials not configured');
    return { success: false, error: 'WhatsApp service not configured' };
  }

  try {
    // Format phone number for WhatsApp (must include country code)
    const formattedNumber = phoneNumber.startsWith('+') ? 
      `whatsapp:${phoneNumber}` : 
      `whatsapp:+91${phoneNumber.replace(/[^\d]/g, '')}`;

    const response = await axios.post(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
      new URLSearchParams({
        From: TWILIO_WHATSAPP_NUMBER,
        To: formattedNumber,
        Body: message
      }),
      {
        auth: {
          username: TWILIO_ACCOUNT_SID,
          password: TWILIO_AUTH_TOKEN
        },
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    console.log('✅ WhatsApp sent via Twilio:', response.data);
    return { success: true, data: response.data };
  } catch (error) {
    console.error('❌ Twilio WhatsApp error:', error.response?.data || error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Send WhatsApp message via CallMeBot API (100% FREE, no signup)
 * Get API key by sending "I allow callmebot to send me messages" to +34 644 44 71 67
 * Then you'll receive your API key
 * Works with personal WhatsApp numbers
 */
const sendWhatsAppViaCallMeBot = async (phoneNumber, message) => {
  const CALLMEBOT_API_KEY = process.env.CALLMEBOT_API_KEY;
  
  if (!CALLMEBOT_API_KEY) {
    console.error('⚠️ CALLMEBOT_API_KEY not configured');
    console.log('ℹ️ To get free CallMeBot API key:');
    console.log('   1. Save +34 644 44 71 67 to your contacts');
    console.log('   2. Send: "I allow callmebot to send me messages"');
    console.log('   3. You will receive your API key');
    return { success: false, error: 'WhatsApp service not configured' };
  }

  try {
    // Format phone number (remove + and spaces)
    const formattedNumber = phoneNumber.replace(/[^\d]/g, '');
    
    const response = await axios.get('https://api.callmebot.com/whatsapp.php', {
      params: {
        phone: formattedNumber,
        text: message,
        apikey: CALLMEBOT_API_KEY
      }
    });

    console.log('✅ WhatsApp sent via CallMeBot:', response.data);
    return { success: true, data: response.data };
  } catch (error) {
    console.error('❌ CallMeBot error:', error.response?.data || error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Send WhatsApp Business API message via WATI.io (Free trial available)
 * Sign up at: https://www.wati.io/
 */
const sendWhatsAppViaWATI = async (phoneNumber, templateName, parameters) => {
  const WATI_API_ENDPOINT = process.env.WATI_API_ENDPOINT;
  const WATI_API_KEY = process.env.WATI_API_KEY;
  
  if (!WATI_API_ENDPOINT || !WATI_API_KEY) {
    console.error('⚠️ WATI credentials not configured');
    return { success: false, error: 'WhatsApp Business service not configured' };
  }

  try {
    const response = await axios.post(
      `${WATI_API_ENDPOINT}/api/v1/sendTemplateMessage`,
      {
        whatsappNumber: phoneNumber.replace(/[^\d]/g, ''),
        template_name: templateName,
        broadcast_name: 'Contract Notification',
        parameters: parameters
      },
      {
        headers: {
          'Authorization': `Bearer ${WATI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('✅ WhatsApp sent via WATI:', response.data);
    return { success: true, data: response.data };
  } catch (error) {
    console.error('❌ WATI error:', error.response?.data || error.message);
    return { success: false, error: error.message };
  }
};

// =======================
// UNIFIED MESSAGING FUNCTIONS
// =======================

/**
 * Send contract notification SMS
 */
const sendContractSMS = async (phoneNumber, salonName, ownerName) => {
  const message = `Hello ${ownerName}! 

Welcome to Husn App! 🎉

Your salon "${salonName}" has been successfully registered on our platform.

Next Steps:
✅ Review your contract details
✅ Complete your profile
✅ Start accepting bookings

We'll send you the complete contract document shortly.

Thank you for partnering with us!

- Team Husn App

Reply STOP to unsubscribe`;

  // Try Fast2SMS first (best for India), then MSG91 as fallback
  let result = await sendSMSViaFast2SMS(phoneNumber, message);
  
  if (!result.success) {
    console.log('Trying MSG91 as fallback...');
    result = await sendSMSViaMSG91(phoneNumber, message);
  }
  
  return result;
};

/**
 * Send contract notification via WhatsApp
 */
const sendContractWhatsApp = async (phoneNumber, salonName, ownerName) => {
  const message = `🎉 *Welcome to Husn App!*

Hello ${ownerName},

Congratulations! Your salon *${salonName}* has been successfully registered on our platform.

📋 *Next Steps:*
✅ Review your contract details
✅ Complete your salon profile  
✅ Start accepting bookings

📄 We'll send you the complete contract document shortly.

Thank you for partnering with Husn App! 💼

_For support, reply to this message or contact us._

Team Husn App`;

  // Try CallMeBot first (completely free), then Twilio, then WATI
  let result = await sendWhatsAppViaCallMeBot(phoneNumber, message);
  
  if (!result.success) {
    console.log('Trying Twilio WhatsApp...');
    result = await sendWhatsAppViaTwilio(phoneNumber, message);
  }
  
  if (!result.success) {
    console.log('Trying WATI...');
    result = await sendWhatsAppViaWATI(phoneNumber, 'contract_notification', [
      { name: 'owner_name', value: ownerName },
      { name: 'salon_name', value: salonName }
    ]);
  }
  
  return result;
};

/**
 * Send booking confirmation SMS
 */
const sendBookingConfirmationSMS = async (phoneNumber, bookingDetails) => {
  const message = `Booking Confirmed! ✅

Salon: ${bookingDetails.salonName}
Date: ${bookingDetails.date}
Time: ${bookingDetails.time}
Service: ${bookingDetails.service}

Show this message at the salon.

- Husn App`;

  return await sendSMSViaFast2SMS(phoneNumber, message);
};

/**
 * Send booking reminder SMS
 */
const sendBookingReminderSMS = async (phoneNumber, bookingDetails) => {
  const message = `Reminder: Your appointment at ${bookingDetails.salonName} is tomorrow at ${bookingDetails.time}. See you there! - Husn App`;

  return await sendSMSViaFast2SMS(phoneNumber, message);
};

/**
 * Test all messaging services
 */
const testMessagingServices = async () => {
  console.log('\n🧪 Testing Messaging Services...\n');
  
  const results = {
    sms: {
      fast2sms: !!process.env.FAST2SMS_API_KEY,
      msg91: !!process.env.MSG91_AUTH_KEY
    },
    whatsapp: {
      callmebot: !!process.env.CALLMEBOT_API_KEY,
      twilio: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN),
      wati: !!(process.env.WATI_API_ENDPOINT && process.env.WATI_API_KEY)
    }
  };
  
  console.log('SMS Services:', results.sms);
  console.log('WhatsApp Services:', results.whatsapp);
  
  return results;
};

module.exports = {
  // SMS Functions
  sendContractSMS,
  sendBookingConfirmationSMS,
  sendBookingReminderSMS,
  sendSMSViaFast2SMS,
  sendSMSViaMSG91,
  
  // WhatsApp Functions
  sendContractWhatsApp,
  sendWhatsAppViaCallMeBot,
  sendWhatsAppViaTwilio,
  sendWhatsAppViaWATI,
  
  // Testing
  testMessagingServices
};