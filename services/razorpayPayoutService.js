// services/razorpayPayoutService.js
const Razorpay = require('razorpay');
const crypto = require('crypto');

// Initialize Razorpay instance for payouts
const razorpayX = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

class RazorpayPayoutService {
  /**
   * Create a contact for the professional (one-time)
   */
  async createContact(professional) {
    try {
      const contactData = {
        name: professional.name,
        email: professional.email,
        contact: professional.phone || '9999999999',
        type: 'vendor',
        reference_id: professional._id.toString(),
        notes: {
          professional_id: professional._id.toString(),
          role: 'professional'
        }
      };

      const contact = await razorpayX.contacts.create(contactData);
      console.log('✅ Contact created:', contact.id);
      return contact;
    } catch (error) {
      console.error('❌ Create contact error:', error);
      throw new Error(`Failed to create contact: ${error.message}`);
    }
  }

  /**
   * Create a fund account for the professional's bank details
   */
  async createFundAccount(contactId, bankDetails) {
    try {
      const fundAccountData = {
        contact_id: contactId,
        account_type: 'bank_account',
        bank_account: {
          name: bankDetails.accountHolderName,
          ifsc: bankDetails.ifscCode,
          account_number: bankDetails.accountNumber
        }
      };

      const fundAccount = await razorpayX.fundAccount.create(fundAccountData);
      console.log('✅ Fund account created:', fundAccount.id);
      return fundAccount;
    } catch (error) {
      console.error('❌ Create fund account error:', error);
      throw new Error(`Failed to create fund account: ${error.message}`);
    }
  }

  /**
   * Process automated payout
   */
  async processPayout(fundAccountId, amount, payoutId, professionalName) {
    try {
      // Amount should be in paise (multiply by 100)
      const amountInPaise = Math.round(amount * 100);

      const payoutData = {
        account_number: process.env.RAZORPAY_ACCOUNT_NUMBER, // Your RazorpayX account number
        fund_account_id: fundAccountId,
        amount: amountInPaise,
        currency: 'INR',
        mode: 'IMPS', // IMPS/NEFT/RTGS
        purpose: 'payout',
        queue_if_low_balance: true,
        reference_id: payoutId.toString(),
        narration: `Payout for ${professionalName}`,
        notes: {
          payout_id: payoutId.toString(),
          type: 'weekly_payout'
        }
      };

      const payout = await razorpayX.payouts.create(payoutData);
      console.log('✅ Payout created:', payout.id);
      return payout;
    } catch (error) {
      console.error('❌ Process payout error:', error);
      throw new Error(`Failed to process payout: ${error.message}`);
    }
  }

  /**
   * Get payout status
   */
  async getPayoutStatus(razorpayPayoutId) {
    try {
      const payout = await razorpayX.payouts.fetch(razorpayPayoutId);
      return payout;
    } catch (error) {
      console.error('❌ Get payout status error:', error);
      throw new Error(`Failed to get payout status: ${error.message}`);
    }
  }

  /**
   * Verify webhook signature
   */
  verifyWebhookSignature(payload, signature) {
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
      .update(JSON.stringify(payload))
      .digest('hex');

    return expectedSignature === signature;
  }

  /**
   * Setup or get existing contact and fund account for professional
   */
  async setupProfessionalAccount(professional) {
    try {
      // Check if professional already has Razorpay details
      if (professional.razorpayContactId && professional.razorpayFundAccountId) {
        return {
          contactId: professional.razorpayContactId,
          fundAccountId: professional.razorpayFundAccountId
        };
      }

      // Create contact if not exists
      let contactId = professional.razorpayContactId;
      if (!contactId) {
        const contact = await this.createContact(professional);
        contactId = contact.id;
        
        // Save to professional model
        professional.razorpayContactId = contactId;
        await professional.save();
      }

      // Create fund account if not exists
      let fundAccountId = professional.razorpayFundAccountId;
      if (!fundAccountId) {
        const fundAccount = await this.createFundAccount(
          contactId,
          professional.bankDetails
        );
        fundAccountId = fundAccount.id;
        
        // Save to professional model
        professional.razorpayFundAccountId = fundAccountId;
        await professional.save();
      }

      return { contactId, fundAccountId };
    } catch (error) {
      console.error('❌ Setup professional account error:', error);
      throw error;
    }
  }
}

module.exports = new RazorpayPayoutService();