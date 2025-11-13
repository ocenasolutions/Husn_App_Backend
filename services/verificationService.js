// server/services/verificationService.js
const axios = require('axios');

// ============================================
// 1. SUREPASS API INTEGRATION (Recommended for India)
// ============================================

/**
 * Surepass PAN Verification
 * Docs: https://docs.surepass.io/docs/pan-verification
 * Pricing: ~₹3-5 per verification
 */
class SurepassVerification {
  constructor() {
    this.apiKey = process.env.SUREPASS_API_KEY;
    this.baseUrl = 'https://kyc-api.surepass.io/api/v1';
  }

  // Verify PAN Card
  async verifyPAN(panNumber, fullName) {
    try {
      const response = await axios.post(
        `${this.baseUrl}/pan/pan`,
        {
          id_number: panNumber.toUpperCase()
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.data.success) {
        const data = response.data.data;
        
        // Match name with provided name
        const nameMatch = this.matchNames(fullName, data.full_name);
        
        return {
          success: true,
          verified: data.pan_status === 'VALID' && nameMatch,
          data: {
            panNumber: data.pan_number,
            fullName: data.full_name,
            category: data.category,
            aadhaarLinked: data.aadhaar_seeding_status === 'Y',
            nameMatch: nameMatch
          },
          message: nameMatch ? 'PAN verified successfully' : 'Name mismatch detected'
        };
      }

      return {
        success: false,
        verified: false,
        message: 'PAN verification failed'
      };

    } catch (error) {
      console.error('Surepass PAN verification error:', error);
      return {
        success: false,
        verified: false,
        message: error.response?.data?.message || 'Verification service error',
        error: error.message
      };
    }
  }

  // Verify Bank Account
  async verifyBankAccount(accountNumber, ifscCode, accountHolderName) {
    try {
      const response = await axios.post(
        `${this.baseUrl}/bank-verification`,
        {
          bank_account_number: accountNumber,
          bank_ifsc_code: ifscCode.toUpperCase()
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.data.success) {
        const data = response.data.data;
        
        // Match account holder name
        const nameMatch = this.matchNames(
          accountHolderName, 
          data.beneficiary_name_with_bank
        );
        
        return {
          success: true,
          verified: data.account_exists && nameMatch,
          data: {
            accountNumber: data.account_number,
            ifscCode: data.ifsc,
            accountHolderName: data.beneficiary_name_with_bank,
            bankName: data.bank_name,
            branchName: data.branch,
            accountStatus: data.account_status,
            nameMatch: nameMatch
          },
          message: nameMatch ? 'Bank account verified successfully' : 'Name mismatch detected'
        };
      }

      return {
        success: false,
        verified: false,
        message: 'Bank account verification failed'
      };

    } catch (error) {
      console.error('Surepass bank verification error:', error);
      return {
        success: false,
        verified: false,
        message: error.response?.data?.message || 'Verification service error',
        error: error.message
      };
    }
  }

  // Helper: Fuzzy name matching
  matchNames(name1, name2) {
    const normalize = (str) => 
      str.toLowerCase()
         .replace(/[^a-z\s]/g, '')
         .replace(/\s+/g, ' ')
         .trim();
    
    const n1 = normalize(name1);
    const n2 = normalize(name2);
    
    // Exact match
    if (n1 === n2) return true;
    
    // Check if one contains the other
    if (n1.includes(n2) || n2.includes(n1)) return true;
    
    // Check word-by-word match (at least 70% words match)
    const words1 = n1.split(' ');
    const words2 = n2.split(' ');
    const matchCount = words1.filter(w => words2.includes(w)).length;
    const matchPercentage = matchCount / Math.max(words1.length, words2.length);
    
    return matchPercentage >= 0.7;
  }
}

// ============================================
// 2. RAZORPAY FUND ACCOUNT VALIDATION
// ============================================

/**
 * Razorpay Bank Verification
 * Docs: https://razorpay.com/docs/api/fund-accounts/validations/
 * Pricing: ₹3 per verification
 */
class RazorpayVerification {
  constructor() {
    this.keyId = process.env.RAZORPAY_KEY_ID;
    this.keySecret = process.env.RAZORPAY_KEY_SECRET;
    this.baseUrl = 'https://api.razorpay.com/v1';
    this.auth = Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64');
  }

  async verifyBankAccount(accountNumber, ifscCode, accountHolderName) {
    try {
      // Step 1: Create contact
      const contactResponse = await axios.post(
        `${this.baseUrl}/contacts`,
        {
          name: accountHolderName,
          type: 'vendor'
        },
        {
          headers: {
            'Authorization': `Basic ${this.auth}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const contactId = contactResponse.data.id;

      // Step 2: Create fund account
      const fundAccountResponse = await axios.post(
        `${this.baseUrl}/fund_accounts`,
        {
          contact_id: contactId,
          account_type: 'bank_account',
          bank_account: {
            name: accountHolderName,
            ifsc: ifscCode.toUpperCase(),
            account_number: accountNumber
          }
        },
        {
          headers: {
            'Authorization': `Basic ${this.auth}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const fundAccountId = fundAccountResponse.data.id;

      // Step 3: Validate fund account
      const validationResponse = await axios.post(
        `${this.baseUrl}/fund_accounts/validations`,
        {
          fund_account: {
            id: fundAccountId
          },
          amount: 100, // Rs 1.00 (minimum amount)
          currency: 'INR',
          notes: {
            purpose: 'Bank account verification'
          }
        },
        {
          headers: {
            'Authorization': `Basic ${this.auth}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const validation = validationResponse.data;

      // Check validation status
      if (validation.status === 'completed') {
        return {
          success: true,
          verified: true,
          data: {
            accountNumber: validation.fund_account.bank_account.account_number,
            ifscCode: validation.fund_account.bank_account.ifsc,
            accountHolderName: validation.fund_account.bank_account.name,
            bankName: validation.fund_account.bank_account.bank_name,
            validationId: validation.id
          },
          message: 'Bank account verified successfully'
        };
      }

      return {
        success: false,
        verified: false,
        message: `Verification ${validation.status}`,
        data: validation
      };

    } catch (error) {
      console.error('Razorpay verification error:', error);
      return {
        success: false,
        verified: false,
        message: error.response?.data?.error?.description || 'Verification failed',
        error: error.message
      };
    }
  }
}

// ============================================
// 3. SIGNZY API INTEGRATION
// ============================================

/**
 * Signzy PAN Verification
 * Docs: https://docs.signzy.com/
 * Pricing: Custom pricing
 */
class SignzyVerification {
  constructor() {
    this.username = process.env.SIGNZY_USERNAME;
    this.password = process.env.SIGNZY_PASSWORD;
    this.baseUrl = 'https://api.signzy.tech/api/v2';
    this.accessToken = null;
  }

  async getAccessToken() {
    if (this.accessToken) return this.accessToken;

    try {
      const response = await axios.post(
        `${this.baseUrl}/patrons/login`,
        {
          username: this.username,
          password: this.password
        }
      );

      this.accessToken = response.data.id;
      return this.accessToken;
    } catch (error) {
      throw new Error('Failed to get Signzy access token');
    }
  }

  async verifyPAN(panNumber, fullName) {
    try {
      const token = await this.getAccessToken();

      const response = await axios.post(
        `${this.baseUrl}/verify/pan`,
        {
          idNumber: panNumber.toUpperCase(),
          name: fullName
        },
        {
          headers: {
            'Authorization': token,
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.data.statusCode === 200) {
        const result = response.data.result;
        
        return {
          success: true,
          verified: result.valid,
          data: {
            panNumber: result.idNumber,
            fullName: result.name,
            status: result.status
          },
          message: result.valid ? 'PAN verified successfully' : 'Invalid PAN'
        };
      }

      return {
        success: false,
        verified: false,
        message: 'PAN verification failed'
      };

    } catch (error) {
      console.error('Signzy PAN verification error:', error);
      return {
        success: false,
        verified: false,
        message: error.response?.data?.message || 'Verification service error',
        error: error.message
      };
    }
  }
}

// ============================================
// 4. UNIFIED VERIFICATION SERVICE
// ============================================

class VerificationService {
  constructor() {
    // Choose your provider
    this.provider = process.env.VERIFICATION_PROVIDER || 'surepass';
    
    switch (this.provider) {
      case 'surepass':
        this.service = new SurepassVerification();
        break;
      case 'razorpay':
        this.bankService = new RazorpayVerification();
        this.panService = new SurepassVerification(); // Use Surepass for PAN
        break;
      case 'signzy':
        this.service = new SignzyVerification();
        break;
      default:
        this.service = new SurepassVerification();
    }
  }

  async verifyPAN(panNumber, fullName) {
    try {
      console.log(`🔍 Verifying PAN: ${panNumber}`);
      
      const service = this.panService || this.service;
      const result = await service.verifyPAN(panNumber, fullName);
      
      console.log('✅ PAN verification result:', result.verified);
      return result;

    } catch (error) {
      console.error('❌ PAN verification error:', error);
      throw error;
    }
  }

  async verifyBankAccount(accountNumber, ifscCode, accountHolderName) {
    try {
      console.log(`🏦 Verifying Bank: ${accountNumber}`);
      
      const service = this.bankService || this.service;
      const result = await service.verifyBankAccount(
        accountNumber, 
        ifscCode, 
        accountHolderName
      );
      
      console.log('✅ Bank verification result:', result.verified);
      return result;

    } catch (error) {
      console.error('❌ Bank verification error:', error);
      throw error;
    }
  }
}

// Export singleton instance
module.exports = new VerificationService();