// testPanAPI.js - Direct test script for PAN API
// Run this file: node testPanAPI.js

const axios = require('axios');

const RAPIDAPI_KEY = 'fdfdcf7d0fmsh505e1fa506cb0b2p1039adjsn99169794db2f';

// Test 1: Original PAN from your curl example
async function testPAN1() {
  console.log('\n=================================');
  console.log('TEST 1: Testing PAN DANPS6580M');
  console.log('=================================');

  try {
    const options = {
      method: 'POST',
      url: 'https://pan-card-verification-at-lowest-price.p.rapidapi.com/verification/marketing/pan',
      headers: {
        'x-rapidapi-key': RAPIDAPI_KEY,
        'x-rapidapi-host': 'pan-card-verification-at-lowest-price.p.rapidapi.com',
        'Content-Type': 'application/json'
      },
      data: {
        PAN: 'DANPS6580M'
      }
    };

    console.log('📤 Sending request...');
    const response = await axios.request(options);
    
    console.log('✅ SUCCESS!');
    console.log('Status:', response.status);
    console.log('Response:', JSON.stringify(response.data, null, 2));
    
    return response.data;
  } catch (error) {
    console.log('❌ ERROR!');
    console.log('Status:', error.response?.status);
    console.log('Status Text:', error.response?.statusText);
    console.log('Error Data:', JSON.stringify(error.response?.data, null, 2));
    console.log('Error Message:', error.message);
    
    return null;
  }
}

// Test 2: Test with a different format (just in case)
async function testPAN2() {
  console.log('\n=================================');
  console.log('TEST 2: Testing with different data format');
  console.log('=================================');

  try {
    const options = {
      method: 'POST',
      url: 'https://pan-card-verification-at-lowest-price.p.rapidapi.com/verification/marketing/pan',
      headers: {
        'x-rapidapi-key': RAPIDAPI_KEY,
        'x-rapidapi-host': 'pan-card-verification-at-lowest-price.p.rapidapi.com',
        'Content-Type': 'application/json'
      },
      data: {
        pan: 'DANPS6580M',  // lowercase 'pan'
        consent: 'Y',
        reason: 'For onboarding'
      }
    };

    console.log('📤 Sending request...');
    const response = await axios.request(options);
    
    console.log('✅ SUCCESS!');
    console.log('Status:', response.status);
    console.log('Response:', JSON.stringify(response.data, null, 2));
    
    return response.data;
  } catch (error) {
    console.log('❌ ERROR!');
    console.log('Status:', error.response?.status);
    console.log('Error Data:', JSON.stringify(error.response?.data, null, 2));
    
    return null;
  }
}

// Test 3: Check API subscription status
async function checkSubscription() {
  console.log('\n=================================');
  console.log('TEST 3: Checking API Subscription');
  console.log('=================================');

  try {
    // Try a simple GET request to see if subscription is active
    const response = await axios.get(
      'https://pan-card-verification-at-lowest-price.p.rapidapi.com/',
      {
        headers: {
          'x-rapidapi-key': RAPIDAPI_KEY,
          'x-rapidapi-host': 'pan-card-verification-at-lowest-price.p.rapidapi.com'
        }
      }
    );

    console.log('✅ API is accessible');
    console.log('Response:', response.data);
  } catch (error) {
    if (error.response?.status === 404) {
      console.log('ℹ️ API endpoint requires specific path (expected)');
    } else if (error.response?.status === 403) {
      console.log('⚠️ API subscription might not be active or key is invalid');
      console.log('Please check: https://rapidapi.com/suneetk92/api/pan-card-verification-at-lowest-price');
    } else {
      console.log('Error:', error.message);
    }
  }
}

// Test IFSC API
async function testIFSC() {
  console.log('\n=================================');
  console.log('TEST 4: Testing IFSC API');
  console.log('=================================');

  try {
    const options = {
      method: 'POST',
      url: 'https://banksindia.p.rapidapi.com/v1/bank/ifsc-micr/india',
      headers: {
        'Content-Type': 'application/json',
        'x-rapidapi-host': 'banksindia.p.rapidapi.com',
        'x-rapidapi-key': RAPIDAPI_KEY
      },
      data: {
        search: 'SBIN0001234'
      }
    };

    console.log('📤 Sending request...');
    const response = await axios.request(options);
    
    console.log('✅ SUCCESS!');
    console.log('Status:', response.status);
    console.log('Response:', JSON.stringify(response.data, null, 2));
    
    return response.data;
  } catch (error) {
    console.log('❌ ERROR!');
    console.log('Status:', error.response?.status);
    console.log('Error Data:', JSON.stringify(error.response?.data, null, 2));
    
    return null;
  }
}

// Run all tests
async function runAllTests() {
  console.log('\n🧪 Starting API Tests...\n');
  
  await checkSubscription();
  await testPAN1();
  await testPAN2();
  await testIFSC();
  
  console.log('\n✅ All tests completed!\n');
  console.log('📋 Next Steps:');
  console.log('1. If you see 403 errors, subscribe to the API at RapidAPI');
  console.log('2. If you see 400 errors, check the error message for required format');
  console.log('3. If IFSC works but PAN doesn\'t, you may need a different PAN API');
  console.log('\n');
}

// Run the tests
runAllTests();