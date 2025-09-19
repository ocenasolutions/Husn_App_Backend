// server/controllers/addressController.js
const Address = require('../models/Address');

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

    // Validate pincode format (should be 6 digits)
    if (!/^\d{6}$/.test(pincode)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid pincode format'
      });
    }

    // If this is the first address or marked as default, make it default
    const existingAddressCount = await Address.countDocuments({ user: req.user._id });
    const shouldBeDefault = existingAddressCount === 0 || isDefault;

    // If setting as default, unset other default addresses
    if (shouldBeDefault) {
      await Address.updateMany(
        { user: req.user._id },
        { isDefault: false }
      );
    }

    const newAddress = new Address({
      user: req.user._id,
      fullName,
      phoneNumber,
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

    // If setting as default, unset other default addresses
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
        phoneNumber: phoneNumber || existingAddress.phoneNumber,
        address: address || existingAddress.address,
        landmark: landmark || existingAddress.landmark,
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

    // If deleted address was default, make another address default if any exists
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

    // Unset all other default addresses
    await Address.updateMany(
      { user: req.user._id },
      { isDefault: false }
    );

    // Set this address as default
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