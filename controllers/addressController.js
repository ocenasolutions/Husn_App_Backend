// server/controllers/addressController.js - COMPLETE WITH ENHANCED GEOCODING
const Address = require('../models/Address');
const axios = require('axios');

// Indian states for autocomplete
const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
  'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
  'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
  'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli',
  'Daman and Diu', 'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry'
];

// ==================== HELPER FUNCTIONS ====================

// Helper function for Nominatim geocoding
async function tryNominatim(query) {
  try {
    console.log('🔍 Nominatim query:', query);
    
    const response = await axios.get(
      'https://nominatim.openstreetmap.org/search',
      {
        params: {
          q: query,
          format: 'json',
          limit: 1,
          countrycodes: 'in',
          addressdetails: 1
        },
        headers: {
          'User-Agent': 'BeautyServiceApp/1.0 (Service Booking)'
        },
        timeout: 8000
      }
    );

    if (response.data && response.data.length > 0) {
      const result = response.data[0];
      return {
        latitude: parseFloat(result.lat),
        longitude: parseFloat(result.lon),
        fullAddress: result.display_name,
        source: 'nominatim'
      };
    }
    return null;
  } catch (error) {
    console.error('Nominatim error:', error.message);
    return null;
  }
}

// Helper function for Pincode API geocoding
async function tryPincodeAPI(pincode, state) {
  try {
    if (!/^\d{6}$/.test(pincode)) return null;

    console.log('📮 Pincode API query:', pincode);

    const response = await axios.get(
      `https://api.postalpincode.in/pincode/${pincode}`,
      { timeout: 5000 }
    );

    if (response.data?.[0]?.Status === 'Success' && 
        response.data[0]?.PostOffice?.length > 0) {
      
      const postOffice = response.data[0].PostOffice[0];
      const district = postOffice.District;
      const postState = postOffice.State;

      // Geocode the district
      const query = `${district}, ${postState}, India`;
      console.log('🔍 Geocoding district from pincode:', query);
      
      const result = await tryNominatim(query);
      
      if (result) {
        result.source = 'pincode-api';
        return result;
      }
    }
    return null;
  } catch (error) {
    console.error('Pincode API error:', error.message);
    return null;
  }
}

// Enhanced geocoding with multiple strategies
async function geocodeAddressHelper(addressObj) {
  const strategies = [
    // Strategy 1: Full address
    async () => {
      if (!addressObj.street || !addressObj.zipCode) return null;
      return await tryNominatim(
        `${addressObj.street}, ${addressObj.city}, ${addressObj.state}, ${addressObj.zipCode}, India`
      );
    },
    // Strategy 2: City + Pincode
    async () => {
      if (!addressObj.zipCode) return null;
      return await tryNominatim(
        `${addressObj.city}, ${addressObj.state}, ${addressObj.zipCode}, India`
      );
    },
    // Strategy 3: City + State
    async () => {
      return await tryNominatim(
        `${addressObj.city}, ${addressObj.state}, India`
      );
    },
    // Strategy 4: Pincode lookup
    async () => {
      if (!addressObj.zipCode) return null;
      return await tryPincodeAPI(addressObj.zipCode, addressObj.state);
    }
  ];

  for (let i = 0; i < strategies.length; i++) {
    console.log(`🔍 Trying geocoding strategy ${i + 1}...`);
    const result = await strategies[i]();
    if (result) {
      console.log(`✅ Geocoding successful with strategy ${i + 1}`);
      return result;
    }
  }

  console.warn('⚠️ All geocoding strategies failed');
  return null;
}

// ==================== EXPORTED CONTROLLER FUNCTIONS ====================

// Get all addresses for user
exports.getAddresses = async (req, res) => {
  try {
    const addresses = await Address.find({ user: req.user._id })
      .sort({ isDefault: -1, createdAt: -1 });

    res.json({
      success: true,
      data: addresses
    });
  } catch (error) {
    console.error('Get addresses error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch addresses'
    });
  }
};

// Validate pincode and get location details
exports.validatePincode = async (req, res) => {
  try {
    const { pincode } = req.params;

    if (!/^\d{6}$/.test(pincode)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid pincode format. Must be 6 digits.'
      });
    }

    const response = await axios.get(`https://api.postalpincode.in/pincode/${pincode}`);
    
    if (response.data && response.data[0]?.Status === 'Success') {
      const postOffices = response.data[0].PostOffice;
      
      if (postOffices && postOffices.length > 0) {
        const firstOffice = postOffices[0];
        
        return res.json({
          success: true,
          data: {
            pincode: pincode,
            city: firstOffice.District,
            state: firstOffice.State,
            region: firstOffice.Region,
            postOffices: postOffices.map(po => ({
              name: po.Name,
              type: po.BranchType
            }))
          }
        });
      }
    }

    return res.status(404).json({
      success: false,
      message: 'Invalid pincode. No location found.'
    });

  } catch (error) {
    console.error('Validate pincode error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to validate pincode'
    });
  }
};

// Get state suggestions
exports.getStateSuggestions = async (req, res) => {
  try {
    const { query } = req.query;
    
    if (!query || query.length < 2) {
      return res.json({
        success: true,
        data: INDIAN_STATES.slice(0, 10)
      });
    }

    const filtered = INDIAN_STATES.filter(state => 
      state.toLowerCase().includes(query.toLowerCase())
    );

    res.json({
      success: true,
      data: filtered
    });
  } catch (error) {
    console.error('Get state suggestions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get state suggestions'
    });
  }
};

// Get city suggestions based on state
exports.getCitySuggestions = async (req, res) => {
  try {
    const { query, state } = req.query;
    
    const SAMPLE_CITIES = [
      'Mumbai', 'Delhi', 'Bangalore', 'Hyderabad', 'Ahmedabad', 'Chennai',
      'Kolkata', 'Surat', 'Pune', 'Jaipur', 'Lucknow', 'Kanpur', 'Nagpur',
      'Indore', 'Thane', 'Bhopal', 'Visakhapatnam', 'Pimpri-Chinchwad',
      'Patna', 'Vadodara', 'Ghaziabad', 'Ludhiana', 'Agra', 'Nashik',
      'Faridabad', 'Meerut', 'Rajkot', 'Kalyan-Dombivali', 'Vasai-Virar',
      'Varanasi', 'Srinagar', 'Aurangabad', 'Dhanbad', 'Amritsar', 'Navi Mumbai',
      'Allahabad', 'Ranchi', 'Howrah', 'Coimbatore', 'Jabalpur', 'Gwalior',
      'Mohali', 'Sahibzada Ajit Singh Nagar', 'Chandigarh', 'Panchkula'
    ];

    if (!query || query.length < 2) {
      return res.json({
        success: true,
        data: SAMPLE_CITIES.slice(0, 10)
      });
    }

    const filtered = SAMPLE_CITIES.filter(city => 
      city.toLowerCase().includes(query.toLowerCase())
    );

    res.json({
      success: true,
      data: filtered
    });
  } catch (error) {
    console.error('Get city suggestions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get city suggestions'
    });
  }
};

// Reverse geocode coordinates to address
exports.reverseGeocode = async (req, res) => {
  try {
    const { latitude, longitude } = req.query;

    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        message: 'Latitude and longitude are required'
      });
    }

    const response = await axios.get(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&addressdetails=1`,
      {
        headers: {
          'User-Agent': 'BeautyApp/1.0'
        }
      }
    );

    if (response.data) {
      const address = response.data.address;
      
      return res.json({
        success: true,
        data: {
          fullAddress: response.data.display_name,
          street: address.road || address.neighbourhood || '',
          city: address.city || address.town || address.village || address.state_district || '',
          state: address.state || '',
          pincode: address.postcode || '',
          country: address.country || '',
          landmark: address.suburb || address.locality || ''
        }
      });
    }

    return res.status(404).json({
      success: false,
      message: 'Unable to fetch address for these coordinates'
    });

  } catch (error) {
    console.error('Reverse geocode error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get address from location'
    });
  }
};

// NEW: Enhanced geocoding endpoint
exports.geocodeAddressEndpoint = async (req, res) => {
  try {
    const { street, city, state, zipCode } = req.body;

    if (!city || !state) {
      return res.status(400).json({
        success: false,
        message: 'City and state are required for geocoding'
      });
    }

    console.log('🗺️ Geocoding address:', { street, city, state, zipCode });

    const result = await geocodeAddressHelper({
      street,
      city,
      state,
      zipCode
    });

    if (result) {
      return res.json({
        success: true,
        data: result,
        message: 'Address geocoded successfully'
      });
    }

    // All strategies failed
    return res.json({
      success: false,
      message: 'Could not geocode address. Location can be added manually or shared during service.',
      data: null
    });

  } catch (error) {
    console.error('Geocode address error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to geocode address'
    });
  }
};

// Add new address
exports.addAddress = async (req, res) => {
  try {
    const {
      fullName,
      phoneNumber,
      address,
      landmark,
      city,
      state,
      pincode,
      addressType = 'Other',
      isDefault = false
    } = req.body;

    if (!fullName || !phoneNumber || !address || !city || !state || !pincode) {
      return res.status(400).json({
        success: false,
        message: 'All required fields must be provided'
      });
    }

    if (!/^\d{6}$/.test(pincode)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid pincode format. Must be 6 digits.'
      });
    }

    const cleanPhone = phoneNumber.replace(/\D/g, '');
    if (!/^\d{10}$/.test(cleanPhone)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid phone number. Must be 10 digits.'
      });
    }

    const existingAddressCount = await Address.countDocuments({ user: req.user._id });
    const shouldBeDefault = existingAddressCount === 0 || isDefault;

    if (shouldBeDefault) {
      await Address.updateMany(
        { user: req.user._id },
        { isDefault: false }
      );
    }

    const newAddress = new Address({
      user: req.user._id,
      fullName,
      phoneNumber: cleanPhone,
      address,
      landmark,
      city,
      state,
      pincode,
      addressType,
      isDefault: shouldBeDefault
    });

    await newAddress.save();

    res.json({
      success: true,
      message: 'Address added successfully',
      data: newAddress
    });
  } catch (error) {
    console.error('Add address error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add address'
    });
  }
};

// Update address
exports.updateAddress = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      fullName,
      phoneNumber,
      address,
      landmark,
      city,
      state,
      pincode,
      addressType,
      isDefault
    } = req.body;

    const existingAddress = await Address.findOne({ _id: id, user: req.user._id });
    if (!existingAddress) {
      return res.status(404).json({
        success: false,
        message: 'Address not found'
      });
    }

    if (pincode && !/^\d{6}$/.test(pincode)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid pincode format'
      });
    }

    if (phoneNumber) {
      const cleanPhone = phoneNumber.replace(/\D/g, '');
      if (!/^\d{10}$/.test(cleanPhone)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid phone number'
        });
      }
    }

    if (isDefault) {
      await Address.updateMany(
        { user: req.user._id, _id: { $ne: id } },
        { isDefault: false }
      );
    }

    const updatedAddress = await Address.findByIdAndUpdate(
      id,
      {
        fullName: fullName || existingAddress.fullName,
        phoneNumber: phoneNumber ? phoneNumber.replace(/\D/g, '') : existingAddress.phoneNumber,
        address: address || existingAddress.address,
        landmark: landmark !== undefined ? landmark : existingAddress.landmark,
        city: city || existingAddress.city,
        state: state || existingAddress.state,
        pincode: pincode || existingAddress.pincode,
        addressType: addressType || existingAddress.addressType,
        isDefault: isDefault !== undefined ? isDefault : existingAddress.isDefault
      },
      { new: true }
    );

    res.json({
      success: true,
      message: 'Address updated successfully',
      data: updatedAddress
    });
  } catch (error) {
    console.error('Update address error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update address'
    });
  }
};

// Delete address
exports.deleteAddress = async (req, res) => {
  try {
    const { id } = req.params;

    const address = await Address.findOne({ _id: id, user: req.user._id });
    if (!address) {
      return res.status(404).json({
        success: false,
        message: 'Address not found'
      });
    }

    await Address.findByIdAndDelete(id);

    if (address.isDefault) {
      const firstAddress = await Address.findOne({ user: req.user._id });
      if (firstAddress) {
        firstAddress.isDefault = true;
        await firstAddress.save();
      }
    }

    res.json({
      success: true,
      message: 'Address deleted successfully'
    });
  } catch (error) {
    console.error('Delete address error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete address'
    });
  }
};

// Set default address
exports.setDefaultAddress = async (req, res) => {
  try {
    const { id } = req.params;

    const address = await Address.findOne({ _id: id, user: req.user._id });
    if (!address) {
      return res.status(404).json({
        success: false,
        message: 'Address not found'
      });
    }

    await Address.updateMany(
      { user: req.user._id },
      { isDefault: false }
    );

    address.isDefault = true;
    await address.save();

    res.json({
      success: true,
      message: 'Default address updated successfully',
      data: address
    });
  } catch (error) {
    console.error('Set default address error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to set default address'
    });
  }
};

// Export helper for use in other controllers
exports.geocodeAddressHelper = geocodeAddressHelper;