// server/controllers/orderController.js - COMPLETE WITH ENHANCED GEOCODING
const Order = require('../models/Order');
const Product = require('../models/Product');
const Service = require('../models/Service');
const Notification = require('../models/Notification');
const { getIO } = require('../config/socketConfig');
const axios = require('axios');

// ==================== GEOCODING HELPER FUNCTIONS ====================

// Helper: Try geocoding with Nominatim
async function tryGeocodingWithNominatim(query) {
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
          'User-Agent': 'BeautyServiceApp/1.0 (Service Booking Platform)'
        },
        timeout: 8000
      }
    );

    if (response.data && response.data.length > 0) {
      const result = response.data[0];
      return {
        latitude: parseFloat(result.lat),
        longitude: parseFloat(result.lon),
        fullAddress: result.display_name
      };
    }

    return null;
  } catch (error) {
    console.error('Nominatim API error:', error.message);
    return null;
  }
}

// Helper: Try geocoding using Indian Pincode API
async function tryGeocodeByPincode(pincode) {
  try {
    if (!pincode || !/^\d{6}$/.test(pincode)) {
      return null;
    }

    console.log('📮 Pincode API query:', pincode);

    const response = await axios.get(
      `https://api.postalpincode.in/pincode/${pincode}`,
      { timeout: 5000 }
    );

    if (response.data && 
        response.data[0]?.Status === 'Success' && 
        response.data[0]?.PostOffice?.length > 0) {
      
      const postOffice = response.data[0].PostOffice[0];
      const district = postOffice.District;
      const state = postOffice.State;

      // Now try to geocode the district/state
      const locationQuery = `${district}, ${state}, India`;
      console.log('🔍 Using pincode location for geocoding:', locationQuery);

      return await tryGeocodingWithNominatim(locationQuery);
    }

    return null;
  } catch (error) {
    console.error('Pincode API error:', error.message);
    return null;
  }
}

// Main geocoding function with multiple strategies
async function geocodeAddress(addressObj) {
  try {
    // PRIORITY 1: Check for coordinates at root level (from live location/map picker)
    if (addressObj.latitude && addressObj.longitude) {
      console.log('✅ Using provided coordinates from live/map location:', {
        latitude: addressObj.latitude,
        longitude: addressObj.longitude
      });
      return {
        latitude: parseFloat(addressObj.latitude),
        longitude: parseFloat(addressObj.longitude),
        fullAddress: `${addressObj.street}, ${addressObj.city}, ${addressObj.state} ${addressObj.zipCode}`
      };
    }

    // PRIORITY 2: Check nested coordinates object (legacy support)
    if (addressObj.coordinates?.latitude && addressObj.coordinates?.longitude) {
      console.log('✅ Using provided coordinates from nested object:', {
        latitude: addressObj.coordinates.latitude,
        longitude: addressObj.coordinates.longitude
      });
      return {
        latitude: parseFloat(addressObj.coordinates.latitude),
        longitude: parseFloat(addressObj.coordinates.longitude),
        fullAddress: `${addressObj.street}, ${addressObj.city}, ${addressObj.state} ${addressObj.zipCode}`
      };
    }

    // No coordinates provided, try geocoding strategies
    console.log('🔍 No coordinates provided, attempting to geocode address...');

    // Strategy 1: Try with full detailed address
    let result = await tryGeocodingWithNominatim(
      `${addressObj.street}, ${addressObj.city}, ${addressObj.state}, ${addressObj.zipCode}, India`
    );
    
    if (result) {
      console.log('✅ Geocoded with Strategy 1 (full address):', result);
      return result;
    }

    // Strategy 2: Try with city, state, pincode only
    console.log('⚠️ Strategy 1 failed, trying Strategy 2 (city + pincode)...');
    result = await tryGeocodingWithNominatim(
      `${addressObj.city}, ${addressObj.state}, ${addressObj.zipCode}, India`
    );
    
    if (result) {
      console.log('✅ Geocoded with Strategy 2 (city + pincode):', result);
      return result;
    }

    // Strategy 3: Try with just city and state
    console.log('⚠️ Strategy 2 failed, trying Strategy 3 (city + state)...');
    result = await tryGeocodingWithNominatim(
      `${addressObj.city}, ${addressObj.state}, India`
    );
    
    if (result) {
      console.log('✅ Geocoded with Strategy 3 (city + state):', result);
      return result;
    }

    // Strategy 4: Try Pincode API as fallback
    console.log('⚠️ Strategy 3 failed, trying Strategy 4 (pincode lookup)...');
    result = await tryGeocodeByPincode(addressObj.zipCode);
    
    if (result) {
      console.log('✅ Geocoded with Strategy 4 (pincode lookup):', result);
      return result;
    }

    console.warn('❌ All geocoding strategies failed for address:', addressObj);
    return null;

  } catch (error) {
    console.error('❌ Geocoding error:', error.message);
    return null;
  }
}

// ==================== ORDER CRUD OPERATIONS ====================

// Create a new order
exports.createOrder = async (req, res) => {
  try {
    const { 
      address, 
      paymentMethod, 
      productItems = [],
      serviceItems = [],
      totalAmount,
      status = 'placed'
    } = req.body;

    // Validation
    if (!address || !paymentMethod || !totalAmount) {
      return res.status(400).json({
        success: false,
        message: 'Address, payment method, and total amount are required'
      });
    }

    if (productItems.length === 0 && serviceItems.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one product or service item is required'
      });
    }

    // Determine order type
    let orderType = 'mixed';
    if (productItems.length > 0 && serviceItems.length === 0) {
      orderType = 'product';
    } else if (serviceItems.length > 0 && productItems.length === 0) {
      orderType = 'service';
    }

    // ✅ CRITICAL FIX: Get user phone number - check address first, then user profile
        const userPhone = address.phoneNumber || 
                         address.phone || 
                         req.user.phoneNumber || 
                         req.user.phone || '';

          console.log('📱User phone number for order:', userPhone);
          console.log('📱Phone source:', address.phoneNumber ? 'address' : 'user profile');

if (!userPhone && orderType !== 'service') {
  return res.status(400).json({
    success: false,
    message: 'Phone number is required for product orders. Please add your phone number to your address.'
  });
}


    // Geocode address for service orders
    let addressWithCoords = { ...address };
    if (serviceItems.length > 0) {
      console.log('🗺️ Processing address for service order...');
      console.log('📍 Received address:', {
        street: address.street,
        city: address.city,
        state: address.state,
        zipCode: address.zipCode,
        latitude: address.latitude,
        longitude: address.longitude
      });

      const coords = await geocodeAddress(address);
      
      if (coords) {
        // Ensure coordinates are at root level
        addressWithCoords.latitude = coords.latitude;
        addressWithCoords.longitude = coords.longitude;
        addressWithCoords.fullAddress = coords.fullAddress;
        console.log('✅ Address successfully processed with coordinates:', {
          latitude: coords.latitude,
          longitude: coords.longitude
        });
      } else {
        console.warn('⚠️ Could not geocode address after all strategies');
        console.warn('⚠️ Order will be created WITHOUT location coordinates');
      }
    }

    // ✅ CRITICAL FIX: Add phone number and contact name to address
    addressWithCoords.phoneNumber = userPhone;
    addressWithCoords.contactName = req.user.name || address.contactName || '';

    console.log('📦 Final address with contact info:', {
      street: addressWithCoords.street,
      city: addressWithCoords.city,
      phoneNumber: addressWithCoords.phoneNumber,
      contactName: addressWithCoords.contactName
    });

    // Calculate pricing
let subtotal = 0;
const deliveryFee = productItems.length > 0 ? 50 : 0;
const serviceFee = 0; // ✅ REMOVED: No service fee for services
    
// Process product items
const processedProductItems = [];
for (const item of productItems) {
  if (!item.productId) {
    return res.status(400).json({
      success: false,
      message: 'Product ID is required for each product item'
    });
  }

  const product = await Product.findById(item.productId);
  if (!product) {
    return res.status(404).json({
      success: false,
      message: `Product not found with ID: ${item.productId}`
    });
  }
  
  processedProductItems.push({
    productId: item.productId,
    quantity: item.quantity,
    price: item.price || product.price
  });
  
  subtotal += (item.price || product.price) * item.quantity;
  
  // Stock notifications
  const newStock = product.stock - item.quantity;
  if (newStock === 0) {
    try {
      await Notification.createOutOfStockNotification(product);
    } catch (notifError) {
      console.error('❌ Failed to create out of stock notification:', notifError);
    }
  } else if (newStock <= 5 && product.stock > 5) {
    try {
      await Notification.createLowStockNotification(product);
    } catch (notifError) {
      console.error('❌ Failed to create low stock notification:', notifError);
    }
  }
}

// Process service items
const processedServiceItems = [];
for (const item of serviceItems) {
  if (!item.serviceId) {
    return res.status(400).json({
      success: false,
      message: 'Service ID is required for each service item'
    });
  }

  const service = await Service.findById(item.serviceId);
  if (!service) {
    return res.status(404).json({
      success: false,
      message: `Service not found with ID: ${item.serviceId}`
    });
  }
  
  processedServiceItems.push({
    serviceId: item.serviceId,
    quantity: item.quantity,
    price: item.price || service.price,
    selectedDate: item.selectedDate,
    selectedTime: item.selectedTime,
    professionalId: item.professionalId || null,
    professionalName: item.professionalName || null
  });
  
  subtotal += (item.price || service.price) * item.quantity;
}

// ✅ UPDATED: Calculate tax and total - NO GST for service-only orders
let tax = 0;
if (productItems.length > 0) {
  // Only calculate tax if there are products
  tax = Math.round(subtotal * 0.18);
}
const calculatedTotal = subtotal + deliveryFee + serviceFee + tax;

// Generate order number
const orderNumber = await Order.generateOrderNumber();

// Create order
const order = new Order({
  user: req.user._id,
  orderNumber: orderNumber,
  type: orderType,
  status,
  serviceItems: processedServiceItems,
  productItems: processedProductItems,
  address: addressWithCoords,
  paymentMethod,
  subtotal,
  deliveryFee,
  serviceFee,
  tax, 
  totalAmount: calculatedTotal,
  courier: productItems.length > 0 ? 'FedEx' : undefined,
});

await order.save();

    // Populate references
    await order.populate([
      { path: 'productItems.productId', model: 'Product' },
      { path: 'serviceItems.serviceId', model: 'Service' },
      { path: 'user', select: 'name email phoneNumber phone' }
    ]);

    // Create notification for admin
    try {
      await Notification.createOrderNotification(order);
      console.log('✅ Order notification created for admin');
    } catch (notifError) {
      console.error('❌ Failed to create order notification:', notifError);
    }

    // Log saved order
    console.log('💾 Saved order address:', {
      orderNumber: order.orderNumber,
      street: order.address.street,
      city: order.address.city,
      phoneNumber: order.address.phoneNumber,
      contactName: order.address.contactName,
      latitude: order.address.latitude,
      longitude: order.address.longitude
    });

    res.status(201).json({
      success: true,
      message: 'Order created successfully',
      data: order,
      geocodingInfo: {
        success: !!(addressWithCoords.latitude && addressWithCoords.longitude),
        message: addressWithCoords.latitude && addressWithCoords.longitude
          ? 'Address geocoded successfully'
          : 'Address could not be geocoded - location tracking may be limited',
        coordinates: addressWithCoords.latitude && addressWithCoords.longitude 
          ? {
              latitude: addressWithCoords.latitude,
              longitude: addressWithCoords.longitude
            }
          : null
      }
    });

  } catch (error) {
    console.error('Create order error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create order',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Get user's orders
exports.getUserOrders = async (req, res) => {
  try {
    const { page = 1, limit = 10, status, type } = req.query;
    const skip = (page - 1) * limit;

    const filter = { user: req.user._id };
    if (status) filter.status = status;
    if (type) filter.type = type;

    const orders = await Order.find(filter)
      .populate([
        { path: 'productItems.productId', model: 'Product' },
        { path: 'serviceItems.serviceId', model: 'Service' }
      ])
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Order.countDocuments(filter);

    res.json({
      success: true,
      data: {
        orders,
        pagination: {
          current: parseInt(page),
          pages: Math.ceil(total / limit),
          total
        }
      }
    });

  } catch (error) {
    console.error('Get user orders error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch orders'
    });
  }
};

// Get single order by ID
exports.getOrderById = async (req, res) => {
  try {
    const { id } = req.params;

    console.log('Fetching order:', id, 'for user:', req.user._id);

    let order = await Order.findOne({ 
      _id: id, 
      user: req.user._id
    }).populate([
      { path: 'productItems.productId', model: 'Product' },
      { path: 'serviceItems.serviceId', model: 'Service' }
    ]);

    if (!order && req.user.role === 'admin') {
      order = await Order.findById(id).populate([
        { path: 'productItems.productId', model: 'Product' },
        { path: 'serviceItems.serviceId', model: 'Service' },
        { path: 'user', select: 'name email phone' }
      ]);
    }

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found or access denied'
      });
    }

    res.json({
      success: true,
      data: order
    });

  } catch (error) {
    console.error('Get order by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch order details',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Get all orders (Admin only)
exports.getAllOrders = async (req, res) => {
  try {
    const { page = 1, limit = 50, status, search } = req.query;
    const skip = (page - 1) * limit;

    let filter = {};
    if (status && status !== 'all') {
      filter.status = status;
    }

    if (search) {
      filter.$or = [
        { orderNumber: { $regex: search, $options: 'i' } },
        { 'address.street': { $regex: search, $options: 'i' } }
      ];
    }

    const orders = await Order.find(filter)
      .populate([
        { path: 'productItems.productId', model: 'Product' },
        { path: 'serviceItems.serviceId', model: 'Service' },
        { path: 'user', select: 'name email phone' }
      ])
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Order.countDocuments(filter);

    res.json({
      success: true,
      data: {
        orders,
        pagination: {
          current: parseInt(page),
          pages: Math.ceil(total / limit),
          total
        }
      }
    });

  } catch (error) {
    console.error('Get all orders error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch orders'
    });
  }
};

// ==================== LOCATION TRACKING ====================

// Update user location
exports.updateUserLocation = async (req, res) => {
  try {
    const { id } = req.params;
    const { latitude, longitude, address } = req.body;

    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        message: 'Latitude and longitude are required'
      });
    }

    const order = await Order.findOne({ 
      _id: id, 
      user: req.user._id 
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found or access denied'
      });
    }

    if (!order.hasServices()) {
      return res.status(400).json({
        success: false,
        message: 'This order does not have services requiring location tracking'
      });
    }

    // Update location using model method
    order.updateUserLocation(latitude, longitude, address);
    await order.save();

    // Emit socket events
    const io = getIO();
    io.to(`order-${id}`).emit('user-location-updated', {
      orderId: id,
      latitude,
      longitude,
      address,
      timestamp: new Date()
    });

    io.to('admin-monitoring').emit('order-location-updated', {
      orderId: id,
      orderNumber: order.orderNumber,
      type: 'user',
      latitude,
      longitude,
      address,
      timestamp: new Date()
    });

    res.json({
      success: true,
      message: 'Location updated successfully',
      data: {
        latitude,
        longitude,
        address
      }
    });

  } catch (error) {
    console.error('Update user location error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update location'
    });
  }
};

// Update professional location
exports.updateProfessionalLocation = async (req, res) => {
  try {
    const { id } = req.params;
    const { latitude, longitude } = req.body;

    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        message: 'Latitude and longitude are required'
      });
    }

    const order = await Order.findById(id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // ✅ Verify using email instead of ID
    const userEmail = req.user.email.toLowerCase();
    const isAssignedProfessional = order.serviceItems.some(
      item => item.professionalEmail === userEmail
    );

    if (!isAssignedProfessional && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'You are not assigned to this order'
      });
    }

    // Update location using model method
    order.updateProfessionalLocation(latitude, longitude);
    await order.save();

    // Emit socket events
    const io = getIO();
    io.to(`order-${id}`).emit('professional-location-updated', {
      orderId: id,
      latitude,
      longitude,
      timestamp: new Date()
    });

    io.to('admin-monitoring').emit('order-location-updated', {
      orderId: id,
      orderNumber: order.orderNumber,
      type: 'professional',
      latitude,
      longitude,
      timestamp: new Date()
    });

    res.json({
      success: true,
      message: 'Location updated successfully',
      data: {
        latitude,
        longitude
      }
    });

  } catch (error) {
    console.error('Update professional location error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update location'
    });
  }
};

// Get order with location (accessible by user, professional, admin)
exports.getOrderWithLocation = async (req, res) => {
  try {
    const { id } = req.params;

    let order = await Order.findById(id).populate([
      { path: 'productItems.productId', model: 'Product' },
      { path: 'serviceItems.serviceId', model: 'Service' },
      { path: 'user', select: 'name email phone' }
    ]);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Check access permissions
    const isUser = order.user._id.toString() === req.user._id.toString();
    const isProfessional = order.serviceItems.some(
      item => item.professionalId === req.user._id.toString()
    );
    const isAdmin = req.user.role === 'admin';

    if (!isUser && !isProfessional && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    res.json({
      success: true,
      data: order
    });

  } catch (error) {
    console.error('Get order with location error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch order details'
    });
  }
};


function calculateETA(distanceKm) {
  // Average speed: 20 km/h in city traffic
  const avgSpeedKmPerHour = 20;
  const timeInMinutes = (distanceKm / avgSpeedKmPerHour) * 60;
  
  // Round to nearest 5 minutes and add buffer
  const roundedTime = Math.ceil(timeInMinutes / 5) * 5;
  const bufferTime = 10; // Add 10 min buffer
  
  const minETA = roundedTime;
  const maxETA = roundedTime + bufferTime;
  
  // Determine range bucket
  if (maxETA <= 20) return { min: 15, max: 20, text: '15-20 minutes' };
  if (maxETA <= 30) return { min: 20, max: 30, text: '20-30 minutes' };
  if (maxETA <= 40) return { min: 30, max: 40, text: '30-40 minutes' };
  if (maxETA <= 50) return { min: 40, max: 50, text: '40-50 minutes' };
  return { min: 50, max: 60, text: '50-60 minutes' };
}

// Helper function to calculate distance using Haversine formula
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c; // Distance in km
}

// UPDATED: Start professional journey with ETA calculation
exports.startProfessionalJourney = async (req, res) => {
  try {
    const { id } = req.params;
    const { latitude, longitude } = req.body;

    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        message: 'Professional location is required to start journey'
      });
    }

    const order = await Order.findById(id).populate([
      { path: 'user', select: 'name email phone' }
    ]);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // ✅ Verify access using email
    const userEmail = req.user.email.toLowerCase();
    const isAssignedProfessional = order.serviceItems.some(
      item => item.professionalEmail === userEmail
    );

    if (!isAssignedProfessional && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'You are not assigned to this order'
      });
    }

    // Calculate distance and ETA
    let eta = { min: 20, max: 30, text: '20-30 minutes' };
    let distance = null;

    if (order.address?.latitude && order.address?.longitude) {
      distance = calculateDistance(
        parseFloat(latitude),
        parseFloat(longitude),
        parseFloat(order.address.latitude),
        parseFloat(order.address.longitude)
      );
      
      eta = calculateETA(distance);
      console.log('🗺️ Journey ETA calculated:', {
        distance: distance.toFixed(2) + ' km',
        eta: eta.text
      });
    }

    order.updateProfessionalLocation(latitude, longitude);
    order.startLiveTracking();
    order.estimatedServiceTime = new Date(Date.now() + eta.max * 60 * 1000);

    await order.save();

    const io = getIO();
    
    io.to(`order-${id}`).emit('professional-journey-started', {
      orderId: id,
      orderNumber: order.orderNumber,
      professionalLocation: { latitude, longitude },
      eta: eta,
      distance: distance ? distance.toFixed(2) : null,
      estimatedArrival: order.estimatedServiceTime,
      timestamp: new Date()
    });

    io.to('admin-monitoring').emit('professional-journey-started', {
      orderId: id,
      orderNumber: order.orderNumber,
      professionalLocation: { latitude, longitude },
      eta: eta,
      distance: distance ? distance.toFixed(2) : null,
      timestamp: new Date()
    });

    res.json({
      success: true,
      message: 'Journey started successfully. Location tracking is now active.',
      data: {
        latitude,
        longitude,
        isLiveLocationActive: order.isLiveLocationActive,
        eta: eta,
        distance: distance ? distance.toFixed(2) + ' km' : null,
        estimatedArrival: order.estimatedServiceTime
      }
    });

  } catch (error) {
    console.error('❌ Start professional journey error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to start journey'
    });
  }
};

// Get all active orders with locations (Admin only)
exports.getActiveOrdersWithLocation = async (req, res) => {
  try {
    const activeOrders = await Order.find({
      isLiveLocationActive: true,
      status: { $in: ['confirmed', 'in_progress', 'out_for_delivery'] }
    })
    .populate([
      { path: 'productItems.productId', model: 'Product' },
      { path: 'serviceItems.serviceId', model: 'Service' },
      { path: 'user', select: 'name email phone' }
    ])
    .sort({ liveLocationStartedAt: -1 });

    res.json({
      success: true,
      data: activeOrders,
      count: activeOrders.length
    });

  } catch (error) {
    console.error('Get active orders error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch active orders'
    });
  }
};

// Start live tracking (Admin only)
exports.startLiveTracking = async (req, res) => {
  try {
    const { id } = req.params;

    const order = await Order.findById(id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    if (!order.hasServices()) {
      return res.status(400).json({
        success: false,
        message: 'This order does not have services'
      });
    }

    if (!order.hasProfessionalAssigned()) {
      return res.status(400).json({
        success: false,
        message: 'Professional must be assigned before starting tracking'
      });
    }

    if (order.status !== 'confirmed') {
      return res.status(400).json({
        success: false,
        message: 'Order must be confirmed to start tracking'
      });
    }

    order.startLiveTracking();
    await order.save();

    // Notify user via socket
    const io = getIO();
    io.to(`order-${id}`).emit('tracking-started', {
      orderId: id,
      message: 'Live location tracking has started',
      timestamp: new Date()
    });

    res.json({
      success: true,
      message: 'Live tracking started successfully',
      data: order
    });

  } catch (error) {
    console.error('Start live tracking error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to start live tracking'
    });
  }
};

// Stop live tracking (Admin only)
exports.stopLiveTracking = async (req, res) => {
  try {
    const { id } = req.params;

    const order = await Order.findById(id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    order.stopLiveTracking();
    await order.save();

    // Notify via socket
    const io = getIO();
    io.to(`order-${id}`).emit('tracking-stopped', {
      orderId: id,
      message: 'Live location tracking has stopped',
      timestamp: new Date()
    });

    res.json({
      success: true,
      message: 'Live tracking stopped successfully',
      data: order
    });

  } catch (error) {
    console.error('Stop live tracking error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to stop live tracking'
    });
  }
};

// ==================== ADMIN OPERATIONS ====================

// Update order status (Admin)
exports.updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = [
      'placed', 'confirmed', 'preparing', 'shipped', 
      'out_for_delivery', 'delivered', 'completed', 
      'cancelled', 'in_progress'
    ];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status'
      });
    }

    const order = await Order.findById(id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    const now = new Date();
    switch (status) {
      case 'confirmed':
        order.confirmedAt = now;
        break;
      case 'shipped':
        order.shippedAt = now;
        break;
      case 'out_for_delivery':
      case 'in_progress':
        order.outForDeliveryAt = now;
        break;
      case 'delivered':
        order.deliveredAt = now;
        order.paymentStatus = 'completed';
        break;
      case 'completed':
        order.completedAt = now;
        order.deliveredAt = now;
        order.paymentStatus = 'completed';
        break;
      case 'cancelled':
        order.cancelledAt = now;
        break;
    }

    order.status = status;
    await order.save();

    await order.populate([
      { path: 'productItems.productId', model: 'Product' },
      { path: 'serviceItems.serviceId', model: 'Service' },
      { path: 'user', select: 'name email phone' }
    ]);

    res.json({
      success: true,
      message: 'Order status updated successfully',
      data: order
    });

  } catch (error) {
    console.error('Update order status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update order status'
    });
  }
};

// Set delivery date (Admin)
exports.setDeliveryDate = async (req, res) => {
  try {
    const { id } = req.params;
    const { estimatedDelivery } = req.body;

    if (!estimatedDelivery) {
      return res.status(400).json({
        success: false,
        message: 'Estimated delivery date is required'
      });
    }

    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    order.estimatedDelivery = new Date(estimatedDelivery);
    await order.save();

    res.json({
      success: true,
      message: 'Delivery date set successfully',
      data: order
    });

  } catch (error) {
    console.error('Set delivery date error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to set delivery date'
    });
  }
};

// Cancel order
// Fixed cancelOrder function in orderController.js

exports.cancelOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const order = await Order.findOne({ 
      _id: id, 
      user: req.user._id
    }).populate([
      { path: 'productItems.productId', model: 'Product' },
      { path: 'serviceItems.serviceId', model: 'Service' }
    ]);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    if (['delivered', 'completed', 'cancelled'].includes(order.status)) {
      return res.status(400).json({
        success: false,
        message: 'Cannot cancel this order'
      });
    }

    // Check if order has services
    if (!order.serviceItems || order.serviceItems.length === 0) {
      // Simple cancellation for product-only orders
      order.status = 'cancelled';
      order.cancelledAt = new Date();
      if (reason) order.cancellationReason = reason;
      await order.save();
      
      return res.json({
        success: true,
        message: 'Order cancelled successfully',
        data: { order }
      });
    }

    // Service order cancellation logic
    const now = new Date();
    let isLateCancellation = false;
    let penaltyAmount = 0;
    let refundAmount = 0;
    const serviceTotalAmount = order.serviceItems.reduce(
      (sum, item) => sum + (item.price * item.quantity), 0
    );

    // Check cancellation timing for each service
    for (const serviceItem of order.serviceItems) {
      if (serviceItem.selectedDate && serviceItem.selectedTime) {
        const [hours, minutes] = serviceItem.selectedTime.split(':');
        const serviceDateTime = new Date(serviceItem.selectedDate);
        serviceDateTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);
        
        const timeDifference = serviceDateTime - now;
        const hoursDifference = timeDifference / (1000 * 60 * 60);
        
        // Late cancellation: within 2 hours of service time
        if (hoursDifference > 0 && hoursDifference <= 2) {
          isLateCancellation = true;
          const itemTotal = serviceItem.price * serviceItem.quantity;
          penaltyAmount += itemTotal * 0.5; // 50% penalty
          refundAmount += itemTotal * 0.5; // 50% refund
        } else if (hoursDifference > 2) {
          // Early cancellation: more than 2 hours before service
          const itemTotal = serviceItem.price * serviceItem.quantity;
          refundAmount += itemTotal; // 100% refund
        }
      }
    }

    const Wallet = require('../models/Wallet');
    const walletController = require('./walletController');
    let wallet = await Wallet.findOne({ userId: req.user._id });
    
    if (!wallet) {
      wallet = await walletController.createWallet(req.user._id);
    }

    // Process based on payment method
    const paymentMethod = order.paymentMethod;
    let transactionDetails = [];

    // ========== WALLET PAYMENT SCENARIO ==========
    if (paymentMethod === 'wallet') {
      if (isLateCancellation) {
        // Late cancellation: Refund 50%, keep 50% as penalty
        if (refundAmount > 0) {
          await wallet.addTransaction({
            type: 'refund',
            amount: refundAmount,
            description: `Late cancellation refund (50%) for order ${order.orderNumber}`,
            referenceType: 'order',
            referenceId: order._id.toString(),
            metadata: {
              reason: 'late_cancellation_refund',
              penaltyAmount: penaltyAmount,
              refundPercentage: 50
            }
          });
          
          transactionDetails.push({
            type: 'refund',
            amount: refundAmount,
            description: '50% refunded to wallet'
          });
        }
        
        order.cancellationPenalty = penaltyAmount;
        order.cancellationPenaltyPaid = true;
        order.cancellationPenaltyApplied = true;
      } else {
        // Early cancellation: Full refund (100%)
        if (serviceTotalAmount > 0) {
          await wallet.addTransaction({
            type: 'refund',
            amount: serviceTotalAmount,
            description: `Full refund for cancelled order ${order.orderNumber}`,
            referenceType: 'order',
            referenceId: order._id.toString(),
            metadata: {
              reason: 'early_cancellation_refund',
              refundPercentage: 100
            }
          });
          
          transactionDetails.push({
            type: 'refund',
            amount: serviceTotalAmount,
            description: '100% refunded to wallet'
          });
          
          refundAmount = serviceTotalAmount;
        }
      }
    }
    
    // ========== COD PAYMENT SCENARIO ==========
    else if (paymentMethod === 'cod') {
      if (isLateCancellation) {
        // Late cancellation: Deduct 50% penalty from wallet
        if (wallet.balance >= penaltyAmount) {
          // User has enough balance - deduct penalty
          await wallet.addTransaction({
            type: 'debit',
            amount: penaltyAmount,
            description: `Late cancellation penalty (50%) for order ${order.orderNumber}`,
            referenceType: 'order',
            referenceId: order._id.toString(),
            metadata: {
              reason: 'late_cancellation_penalty_cod',
              originalAmount: serviceTotalAmount
            }
          });
          
          order.cancellationPenalty = penaltyAmount;
          order.cancellationPenaltyPaid = true;
          
          transactionDetails.push({
            type: 'penalty',
            amount: penaltyAmount,
            description: '50% penalty deducted from wallet'
          });
        } else {
          // User doesn't have enough balance - create debt
          const availableBalance = wallet.balance;
          const debtAmount = penaltyAmount - availableBalance;
          
          // Deduct available balance first
          if (availableBalance > 0) {
            await wallet.addTransaction({
              type: 'debit',
              amount: availableBalance,
              description: `Partial cancellation penalty for order ${order.orderNumber}`,
              referenceType: 'order',
              referenceId: order._id.toString(),
              metadata: {
                reason: 'late_cancellation_penalty_partial',
                totalPenalty: penaltyAmount,
                remainingDebt: debtAmount
              }
            });
          }
          
          // Create debt (negative balance)
          wallet.balance = -debtAmount;
          wallet.transactions.push({
            type: 'debit',
            amount: debtAmount,
            description: `Cancellation penalty debt for order ${order.orderNumber}`,
            referenceType: 'order',
            referenceId: order._id.toString(),
            balanceBefore: 0,
            balanceAfter: -debtAmount,
            status: 'completed',
            metadata: {
              reason: 'late_cancellation_debt',
              mustPayBeforeNextService: true
            }
          });
          
          await wallet.save();
          
          order.cancellationPenalty = penaltyAmount;
          order.cancellationPenaltyPaid = false;
          order.cancellationDebtAmount = debtAmount;
          
          transactionDetails.push({
            type: 'debt',
            amount: debtAmount,
            description: `Debt created: ₹${debtAmount.toFixed(2)} (insufficient wallet balance)`
          });
        }
        
        order.cancellationPenaltyApplied = true;
      }
      // Early cancellation with COD: No penalty, no refund needed
    }
    
    // ========== ONLINE/UPI PAYMENT SCENARIO ==========
    else if (paymentMethod === 'online') {
      if (isLateCancellation) {
        // Late cancellation: Refund 50% to wallet
        if (refundAmount > 0) {
          await wallet.addTransaction({
            type: 'refund',
            amount: refundAmount,
            description: `Late cancellation refund (50%) for order ${order.orderNumber}`,
            referenceType: 'order',
            referenceId: order._id.toString(),
            metadata: {
              reason: 'late_cancellation_refund_online',
              penaltyAmount: penaltyAmount,
              refundPercentage: 50
            }
          });
          
          transactionDetails.push({
            type: 'refund',
            amount: refundAmount,
            description: '50% refunded to wallet'
          });
        }
        
        order.cancellationPenalty = penaltyAmount;
        order.cancellationPenaltyPaid = true;
        order.cancellationPenaltyApplied = true;
      } else {
        // Early cancellation: Full refund (100%) to wallet
        if (serviceTotalAmount > 0) {
          await wallet.addTransaction({
            type: 'refund',
            amount: serviceTotalAmount,
            description: `Full refund for cancelled order ${order.orderNumber}`,
            referenceType: 'order',
            referenceId: order._id.toString(),
            metadata: {
              reason: 'early_cancellation_refund_online',
              refundPercentage: 100
            }
          });
          
          transactionDetails.push({
            type: 'refund',
            amount: serviceTotalAmount,
            description: '100% refunded to wallet'
          });
          
          refundAmount = serviceTotalAmount;
        }
      }
    }

    // Update order status
    order.status = 'cancelled';
    order.cancelledAt = new Date();
    if (reason) order.cancellationReason = reason;
    
    await order.save();

    // Emit socket event
    const io = require('../config/socketConfig').getIO();
    io.to('admin-monitoring').emit('order-cancelled', {
      orderId: order._id,
      orderNumber: order.orderNumber,
      userId: req.user._id,
      isLateCancellation,
      penaltyAmount,
      refundAmount,
      paymentMethod,
      timestamp: new Date()
    });

    // Build response message
    let message = '';
    if (isLateCancellation) {
      if (paymentMethod === 'cod') {
        if (order.cancellationDebtAmount > 0) {
          message = `Order cancelled. A cancellation fee of ₹${penaltyAmount.toFixed(2)} has been charged. You have an outstanding balance of ₹${order.cancellationDebtAmount.toFixed(2)}. Please clear this before booking new services.`;
        } else {
          message = `Order cancelled. A cancellation fee of ₹${penaltyAmount.toFixed(2)} has been deducted from your wallet.`;
        }
      } else {
        message = `Order cancelled. Due to late cancellation (within 2 hours), a 50% penalty of ₹${penaltyAmount.toFixed(2)} was charged. The remaining ₹${refundAmount.toFixed(2)} has been refunded to your wallet.`;
      }
    } else {
      if (paymentMethod === 'cod') {
        message = 'Order cancelled successfully. No charges applied.';
      } else {
        message = `Order cancelled successfully. Full amount of ₹${refundAmount.toFixed(2)} has been refunded to your wallet.`;
      }
    }

    res.json({
      success: true,
      message,
      data: {
        order,
        cancellationDetails: {
          isLateCancellation,
          penaltyApplied: isLateCancellation,
          penaltyAmount,
          refundAmount,
          paymentMethod,
          debtCreated: order.cancellationDebtAmount > 0,
          debtAmount: order.cancellationDebtAmount || 0,
          transactions: transactionDetails
        }
      }
    });

  } catch (error) {
    console.error('Cancel order error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel order: ' + error.message
    });
  }
};

// Verify customer OTP
exports.verifyCustomerOtp = async (req, res) => {
  try {
    const { id } = req.params;
    const { otp } = req.body;

    if (!otp || otp.length !== 6) {
      return res.status(400).json({
        success: false,
        message: 'Valid 6-digit OTP is required'
      });
    }

    const order = await Order.findOne({ 
      _id: id, 
      user: req.user._id 
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    if (!order.hasServices()) {
      return res.status(400).json({
        success: false,
        message: 'This order does not have any services'
      });
    }

    if (!order.serviceOtp) {
      return res.status(400).json({
        success: false,
        message: 'No OTP generated for this order'
      });
    }

    if (order.serviceOtp !== otp) {
      return res.status(400).json({
        success: false,
        message: 'Invalid OTP. Please check and try again.'
      });
    }

    if (order.serviceOtpVerified) {
      return res.json({
        success: true,
        message: 'OTP already verified',
        data: { verified: true, verifiedAt: order.serviceStartedAt }
      });
    }

    res.json({
      success: true,
      message: 'OTP verified successfully',
      data: { 
        verified: true,
        otp: order.serviceOtp,
        orderNumber: order.orderNumber
      }
    });

  } catch (error) {
    console.error('Verify customer OTP error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify OTP'
    });
  }
};

// Get all active orders with locations (Admin only)
exports.getActiveOrdersWithLocation = async (req, res) => {
  try {
    const activeOrders = await Order.find({
      isLiveLocationActive: true,
      status: { $in: ['confirmed', 'in_progress', 'out_for_delivery'] }
    })
    .populate([
      { path: 'productItems.productId', model: 'Product' },
      { path: 'serviceItems.serviceId', model: 'Service' },
      { path: 'user', select: 'name email phone' }
    ])
    .sort({ liveLocationStartedAt: -1 });

    res.json({
      success: true,
      data: activeOrders,
      count: activeOrders.length
    });

  } catch (error) {
    console.error('Get active orders error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch active orders'
    });
  }
};

// Start live location tracking
exports.startLiveTracking = async (req, res) => {
  try {
    const { id } = req.params;

    const order = await Order.findById(id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    if (!order.hasServices()) {
      return res.status(400).json({
        success: false,
        message: 'This order does not have services'
      });
    }

    if (!order.hasProfessionalAssigned()) {
      return res.status(400).json({
        success: false,
        message: 'Professional must be assigned before starting tracking'
      });
    }

    if (order.status !== 'confirmed') {
      return res.status(400).json({
        success: false,
        message: 'Order must be confirmed to start tracking'
      });
    }

    order.isLiveLocationActive = true;
    order.liveLocationStartedAt = new Date();
    await order.save();

    // Notify user via socket
    const io = getIO();
    io.to(`order-${id}`).emit('tracking-started', {
      orderId: id,
      message: 'Live location tracking has started',
      timestamp: new Date()
    });

    res.json({
      success: true,
      message: 'Live tracking started successfully',
      data: order
    });

  } catch (error) {
    console.error('Start live tracking error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to start live tracking'
    });
  }
};

// Stop live location tracking
exports.stopLiveTracking = async (req, res) => {
  try {
    const { id } = req.params;

    const order = await Order.findById(id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    order.isLiveLocationActive = false;
    await order.save();

    // Notify via socket
    const io = getIO();
    io.to(`order-${id}`).emit('tracking-stopped', {
      orderId: id,
      message: 'Live location tracking has stopped',
      timestamp: new Date()
    });

    res.json({
      success: true,
      message: 'Live tracking stopped successfully',
      data: order
    });

  } catch (error) {
    console.error('Stop live tracking error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to stop live tracking'
    });
  }
};

exports.startService = async (req, res) => {
  try {
    const { id } = req.params;
    const { otp } = req.body;

    console.log('🎬 Start service request:', { 
      orderId: id, 
      otp,
      userEmail: req.user.email,
      userRole: req.user.role 
    });

    if (!otp || otp.length !== 6) {
      return res.status(400).json({
        success: false,
        message: 'Valid 6-digit OTP is required'
      });
    }

    const order = await Order.findById(id);
    
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // ✅ Verify using email
    const userEmail = req.user.email.toLowerCase();
    const isAdmin = req.user.role === 'admin';
    const isAssignedProfessional = order.serviceItems.some(
      item => item.professionalEmail === userEmail
    );

    if (!isAdmin && !isAssignedProfessional) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to start this service'
      });
    }

    console.log('✅ Authorization check passed:', {
      isAdmin,
      isAssignedProfessional
    });

    if (!order.hasServices()) {
      return res.status(400).json({
        success: false,
        message: 'This order does not have any services'
      });
    }

    if (!order.serviceOtp) {
      return res.status(400).json({
        success: false,
        message: 'No OTP generated for this order'
      });
    }

    if (order.serviceOtp !== otp) {
      return res.status(400).json({
        success: false,
        message: 'Invalid OTP. Please check and try again.'
      });
    }

    if (order.serviceOtpVerified) {
      return res.json({
        success: true,
        message: 'Service already started',
        data: { 
          verified: true, 
          startedAt: order.serviceStartedAt 
        }
      });
    }

    order.serviceOtpVerified = true;
    order.serviceStartedAt = new Date();
    order.status = 'in_progress';
    
    await order.save();

    await order.populate([
      { path: 'productItems.productId', model: 'Product' },
      { path: 'serviceItems.serviceId', model: 'Service' },
      { path: 'user', select: 'name email phone' }
    ]);

    const io = getIO();
    io.to(`order-${id}`).emit('service-started', {
      orderId: id,
      orderNumber: order.orderNumber,
      startedAt: order.serviceStartedAt,
      startedBy: isAdmin ? 'admin' : 'professional',
      timestamp: new Date()
    });

    if (!isAdmin) {
      io.to('admin-monitoring').emit('service-started-by-professional', {
        orderId: id,
        orderNumber: order.orderNumber,
        professionalEmail: userEmail,
        professionalName: req.user.name,
        timestamp: new Date()
      });
    }

    console.log('✅ Service started successfully:', {
      orderNumber: order.orderNumber,
      startedBy: isAdmin ? 'admin' : 'professional'
    });

    res.json({
      success: true,
      message: 'Service started successfully',
      data: order
    });

  } catch (error) {
    console.error('❌ Start service error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to start service: ' + error.message
    });
  }
};

// Assign professional to service (Admin only)
exports.assignProfessionalToService = async (req, res) => {
  try {
    const { id } = req.params;
    const { serviceItemId, professionalEmail, professionalName, professionalPhone } = req.body;

    console.log('Assign professional request:', {
      orderId: id,
      serviceItemId,
      professionalEmail,
      professionalName
    });

    // ✅ Validate using email
    if (!serviceItemId || !professionalEmail || !professionalName) {
      return res.status(400).json({
        success: false,
        message: 'Service item ID, professional email, and professional name are required'
      });
    }

    // ✅ Verify professional exists with this email
    const Professional = require('../models/Professional');
    const professional = await Professional.findOne({ 
      email: professionalEmail.toLowerCase() 
    });

    if (!professional) {
      return res.status(404).json({
        success: false,
        message: 'Professional not found with this email'
      });
    }

    if (!professional.isActive || professional.status !== 'active') {
      return res.status(400).json({
        success: false,
        message: 'Professional is not active'
      });
    }

    const order = await Order.findById(id);
    if (!order) {
      console.log('Order not found:', id);
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    console.log('Order found, service items count:', order.serviceItems.length);

    // Find the specific service item
    const serviceItem = order.serviceItems.find(
      item => item._id.toString() === serviceItemId
    );

    if (!serviceItem) {
      console.log('Service item not found:', serviceItemId);
      return res.status(404).json({
        success: false,
        message: 'Service item not found in this order'
      });
    }

    // ✅ Check if reassigning
    const isReassignment = serviceItem.professionalEmail && 
                          serviceItem.professionalEmail !== professionalEmail.toLowerCase();
    const previousProfessional = serviceItem.professionalName;

    console.log(isReassignment ? 'Reassigning professional...' : 'Assigning professional...');

    // ✅ Assign/Reassign using email
    serviceItem.professionalEmail = professionalEmail.toLowerCase();
    serviceItem.professionalName = professionalName;
    if (professionalPhone) {
      serviceItem.professionalPhone = professionalPhone;
    }

    // Auto-start live tracking if order is confirmed
    if (order.status === 'confirmed') {
      order.isLiveLocationActive = true;
      if (!order.liveLocationStartedAt) {
        order.liveLocationStartedAt = new Date();
      }
    }

    await order.save();

    console.log(isReassignment ? 'Professional reassigned successfully' : 'Professional assigned successfully');

    // Populate for response
    await order.populate([
      { path: 'productItems.productId', model: 'Product' },
      { path: 'serviceItems.serviceId', model: 'Service' },
      { path: 'user', select: 'name email phone' }
    ]);

    // Emit socket event
    const io = getIO();
    io.to(`order-${id}`).emit('professional-assigned-notification', {
      orderId: id,
      professionalName,
      professionalEmail,
      isReassignment,
      previousProfessional,
      trackingStarted: order.isLiveLocationActive,
      timestamp: new Date()
    });

    res.json({
      success: true,
      message: isReassignment 
        ? `Professional reassigned from ${previousProfessional} to ${professionalName}` 
        : `Professional ${professionalName} assigned successfully`,
      data: order,
      isReassignment
    });

  } catch (error) {
    console.error('Assign professional to service error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to assign professional: ' + error.message
    });
  }
};

// Get professional's assigned orders
exports.getProfessionalOrders = async (req, res) => {
  try {
    const { page = 1, limit = 50, status } = req.query;
    const skip = (page - 1) * limit;

    const professionalEmail = req.professional.email.toLowerCase();

    console.log('🔍 Fetching orders for professional:', {
      name: req.professional.name,
      email: professionalEmail,
      id: req.professional._id
    });

    // ✅ Build filter - only service orders with this professional's email
    let filter = {
      type: { $in: ['service', 'mixed'] },
      'serviceItems.professionalEmail': professionalEmail
    };

    if (status && status !== 'all') {
      filter.status = status;
    }

    console.log('🔍 Query filter:', JSON.stringify(filter, null, 2));

    const orders = await Order.find(filter)
      .populate([
        { path: 'productItems.productId', model: 'Product' },
        { path: 'serviceItems.serviceId', model: 'Service' },
        { path: 'user', select: 'name email phone' }
      ])
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Order.countDocuments(filter);

    console.log(`✅ Found ${orders.length} orders for professional ${professionalEmail}`);

    // ✅ CRITICAL FIX: Filter EACH order to show ONLY service items assigned to this professional
    // AND remove orders that have NO assigned services after filtering
    const filteredOrders = orders
      .map(order => {
        const orderObj = order.toObject();
        
        // Filter service items to only show items assigned to this professional
        orderObj.serviceItems = orderObj.serviceItems.filter(
          item => item.professionalEmail?.toLowerCase() === professionalEmail
        );
        
        return orderObj;
      })
      .filter(order => {
        // ✅ CRITICAL: Only include orders that have at least one service item
        // assigned to this professional AFTER filtering
        return order.serviceItems && order.serviceItems.length > 0;
      });

    console.log(`✅ After filtering: ${filteredOrders.length} orders with services assigned to ${professionalEmail}`);
    
    // ✅ Log sample for debugging
    if (filteredOrders.length > 0) {
      console.log('📦 Sample filtered order:', {
        orderNumber: filteredOrders[0].orderNumber,
        serviceItemsCount: filteredOrders[0].serviceItems.length,
        assignedServices: filteredOrders[0].serviceItems.map(si => ({
          serviceName: si.serviceId?.name,
          professionalEmail: si.professionalEmail
        }))
      });
    }

    res.json({
      success: true,
      data: {
        orders: filteredOrders,
        pagination: {
          current: parseInt(page),
          pages: Math.ceil(total / limit),
          total: filteredOrders.length // ✅ Use filtered count, not total
        }
      }
    });

  } catch (error) {
    console.error('❌ Get professional orders error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch your assigned orders',
      error: error.message
    });
  }
};

// Get single order for professional (only if assigned)
exports.getProfessionalOrderById = async (req, res) => {
  try {
    const { id } = req.params;
    const professionalEmail = req.user.email.toLowerCase();

    console.log('📋 Professional requesting order:', {
      orderId: id,
      professionalEmail
    });

    const order = await Order.findById(id)
      .populate([
        { path: 'productItems.productId', model: 'Product' },
        { path: 'serviceItems.serviceId', model: 'Service' },
        { path: 'user', select: 'name email phone' }
      ]);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Verify professional is assigned to this order
    const isAssigned = order.serviceItems.some(
      item => item.professionalEmail === professionalEmail
    );

    if (!isAssigned) {
      return res.status(403).json({
        success: false,
        message: 'You are not assigned to this order'
      });
    }

    console.log('✅ Professional authorized for order:', order.orderNumber);

    res.json({
      success: true,
      data: order
    });

  } catch (error) {
    console.error('❌ Get professional order error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch order details'
    });
  }
};

exports.updateOrderStatusByProfessional = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    console.log('🔄 Professional status update request:', {
      orderId: id,
      newStatus: status,
      professionalEmail: req.user.email
    });

    // Valid statuses a professional can set
    const validStatuses = ['confirmed', 'in_progress', 'completed', 'cancelled'];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Professionals can only set: confirmed, in_progress, completed, or cancelled'
      });
    }

    const order = await Order.findById(id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // ✅ Verify professional is assigned to this order
    const professionalEmail = req.user.email.toLowerCase();
    const isAssignedProfessional = order.serviceItems.some(
      item => item.professionalEmail === professionalEmail
    );

    if (!isAssignedProfessional) {
      return res.status(403).json({
        success: false,
        message: 'You are not assigned to this order'
      });
    }

    console.log('✅ Professional authorized for order:', order.orderNumber);

    // Validate status transitions
    const currentStatus = order.status?.toLowerCase();
    
    // Define allowed transitions for professionals
    const allowedTransitions = {
      'placed': ['confirmed', 'cancelled'],
      'pending': ['confirmed', 'cancelled'],
      'confirmed': ['in_progress', 'cancelled'],
      'in_progress': ['completed'],
      'out_for_delivery': ['completed']
    };

    if (!allowedTransitions[currentStatus]?.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot change status from ${currentStatus} to ${status}`
      });
    }

    // Update status and timestamps
    const now = new Date();
    const oldStatus = order.status;
    order.status = status;

    switch (status) {
      case 'confirmed':
        order.confirmedAt = now;
        console.log('📋 Order confirmed by professional');
        break;
      case 'in_progress':
        order.outForDeliveryAt = now;
        console.log('🚀 Service in progress');
        break;
      case 'completed':
        order.completedAt = now;
        order.deliveredAt = now;
        order.paymentStatus = 'completed';
        console.log('✅ Service completed');
        break;
      case 'cancelled':
        order.cancelledAt = now;
        order.cancellationReason = 'Cancelled by professional';
        console.log('❌ Service cancelled by professional');
        break;
    }

    await order.save();

    await order.populate([
      { path: 'productItems.productId', model: 'Product' },
      { path: 'serviceItems.serviceId', model: 'Service' },
      { path: 'user', select: 'name email phone' }
    ]);

    // Emit socket event for real-time updates
    const io = getIO();
    io.to(`order-${id}`).emit('order-status-updated', {
      orderId: id,
      orderNumber: order.orderNumber,
      oldStatus,
      newStatus: status,
      updatedBy: 'professional',
      professionalName: req.user.name,
      timestamp: now
    });

    io.to('admin-monitoring').emit('professional-updated-order', {
      orderId: id,
      orderNumber: order.orderNumber,
      professionalEmail: req.user.email,
      professionalName: req.user.name,
      oldStatus,
      newStatus: status,
      timestamp: now
    });

    console.log('✅ Order status updated successfully:', {
      orderNumber: order.orderNumber,
      from: oldStatus,
      to: status
    });

    res.json({
      success: true,
      message: `Order status updated to ${status}`,
      data: order
    });

  } catch (error) {
    console.error('❌ Update order status by professional error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update order status: ' + error.message
    });
  }
};

exports.requestRefund = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason, refundType, description } = req.body;

    if (!reason) {
      return res.status(400).json({
        success: false,
        message: 'Refund reason is required'
      });
    }

    const order = await Order.findOne({ 
      _id: id, 
      user: req.user._id 
    }).populate([
      { path: 'productItems.productId', model: 'Product' },
      { path: 'serviceItems.serviceId', model: 'Service' }
    ]);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Check if order is eligible for refund
    if (!['delivered', 'completed', 'cancelled'].includes(order.status)) {
      return res.status(400).json({
        success: false,
        message: 'Order is not eligible for refund. Only delivered or cancelled orders can be refunded.'
      });
    }

    if (order.refundStatus && order.refundStatus !== 'rejected') {
      return res.status(400).json({
        success: false,
        message: 'Refund already requested or processed'
      });
    }

    // Check refund eligibility time (within 7 days for products, 24 hours for services)
    const eligibilityPeriod = order.type === 'service' ? 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
    const completionDate = order.deliveredAt || order.completedAt || order.cancelledAt;
    const timeSinceCompletion = Date.now() - new Date(completionDate).getTime();

    if (timeSinceCompletion > eligibilityPeriod) {
      const periodText = order.type === 'service' ? '24 hours' : '7 days';
      return res.status(400).json({
        success: false,
        message: `Refund request period has expired. Refunds must be requested within ${periodText} of ${order.type === 'service' ? 'service completion' : 'delivery'}.`
      });
    }

    // Update order with refund request
    order.refundStatus = 'requested';
    order.refundReason = reason;
    order.refundType = refundType || 'wallet'; // wallet, original_payment
    order.refundDescription = description;
    order.refundRequestedAt = new Date();
    order.refundAmount = order.totalAmount;

    await order.save();

    // Create notification for admin
    await Notification.createRefundRequestNotification(order);

    // Emit socket event
    const io = getIO();
    io.to('admin-monitoring').emit('refund-requested', {
      orderId: order._id,
      orderNumber: order.orderNumber,
      amount: order.totalAmount,
      reason,
      timestamp: new Date()
    });

    res.json({
      success: true,
      message: 'Refund request submitted successfully. We will process it within 24-48 hours.',
      data: order
    });

  } catch (error) {
    console.error('Request refund error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to request refund'
    });
  }
};

// Process refund (Admin)
exports.processRefund = async (req, res) => {
  try {
    const { id } = req.params;
    const { action, adminNotes } = req.body; // action: 'approve' or 'reject'

    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid action. Must be "approve" or "reject"'
      });
    }

    const order = await Order.findById(id).populate([
      { path: 'productItems.productId', model: 'Product' },
      { path: 'serviceItems.serviceId', model: 'Service' },
      { path: 'user', select: 'name email phone' }
    ]);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    if (order.refundStatus !== 'requested') {
      return res.status(400).json({
        success: false,
        message: 'No pending refund request for this order'
      });
    }

    if (action === 'approve') {
      // Process refund to wallet
      const walletController = require('./walletController');
      
      try {
        await walletController.refundToWallet(
          order.user._id,
          order.refundAmount || order.totalAmount,
          `Refund for order ${order.orderNumber}`,
          order._id.toString()
        );

        order.refundStatus = 'completed';
        order.refundCompletedAt = new Date();
        order.refundProcessedBy = req.user._id;
        order.refundAdminNotes = adminNotes;
        order.paymentStatus = 'refunded';

        // Create notification for user
        await Notification.createRefundCompletedNotification(order);

        // Emit socket event
        const io = getIO();
        io.to(`user-${order.user._id}`).emit('refund-completed', {
          orderId: order._id,
          orderNumber: order.orderNumber,
          amount: order.refundAmount || order.totalAmount,
          timestamp: new Date()
        });

        await order.save();

        res.json({
          success: true,
          message: 'Refund processed successfully. Amount credited to user wallet.',
          data: order
        });

      } catch (refundError) {
        console.error('Wallet refund error:', refundError);
        return res.status(500).json({
          success: false,
          message: 'Failed to process refund to wallet: ' + refundError.message
        });
      }

    } else if (action === 'reject') {
      order.refundStatus = 'rejected';
      order.refundRejectedAt = new Date();
      order.refundProcessedBy = req.user._id;
      order.refundAdminNotes = adminNotes || 'Refund request rejected';

      await order.save();

      // Create notification for user
      await Notification.createRefundRejectedNotification(order);

      // Emit socket event
      const io = getIO();
      io.to(`user-${order.user._id}`).emit('refund-rejected', {
        orderId: order._id,
        orderNumber: order.orderNumber,
        reason: adminNotes,
        timestamp: new Date()
      });

      res.json({
        success: true,
        message: 'Refund request rejected',
        data: order
      });
    }

  } catch (error) {
    console.error('Process refund error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process refund'
    });
  }
};

// Get refund details
exports.getRefundDetails = async (req, res) => {
  try {
    const { id } = req.params;

    const order = await Order.findOne({
      _id: id,
      user: req.user._id
    }).populate([
      { path: 'productItems.productId', model: 'Product' },
      { path: 'serviceItems.serviceId', model: 'Service' }
    ]);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    if (!order.refundStatus) {
      return res.status(404).json({
        success: false,
        message: 'No refund information available for this order'
      });
    }

    res.json({
      success: true,
      data: {
        orderId: order._id,
        orderNumber: order.orderNumber,
        refundStatus: order.refundStatus,
        refundAmount: order.refundAmount || order.totalAmount,
        refundReason: order.refundReason,
        refundDescription: order.refundDescription,
        refundType: order.refundType,
        refundRequestedAt: order.refundRequestedAt,
        refundCompletedAt: order.refundCompletedAt,
        refundRejectedAt: order.refundRejectedAt,
        refundAdminNotes: order.refundAdminNotes
      }
    });

  } catch (error) {
    console.error('Get refund details error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch refund details'
    });
  }
};

// Get all refund requests (Admin)
exports.getAllRefundRequests = async (req, res) => {
  try {
    const { page = 1, limit = 50, status } = req.query;
    const skip = (page - 1) * limit;

    let filter = {
      refundStatus: { $exists: true, $ne: null }
    };

    if (status && status !== 'all') {
      filter.refundStatus = status;
    }

    const orders = await Order.find(filter)
      .populate([
        { path: 'productItems.productId', model: 'Product' },
        { path: 'serviceItems.serviceId', model: 'Service' },
        { path: 'user', select: 'name email phone' }
      ])
      .sort({ refundRequestedAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Order.countDocuments(filter);

    res.json({
      success: true,
      data: {
        orders,
        pagination: {
          current: parseInt(page),
          pages: Math.ceil(total / limit),
          total
        }
      }
    });

  } catch (error) {
    console.error('Get all refund requests error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch refund requests'
    });
  }
};