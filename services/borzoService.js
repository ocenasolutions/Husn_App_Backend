// server/services/borzoService.js - FIXED COD & PHONE NUMBER
const axios = require('axios');

class BorzoService {
  constructor() {
    this.apiKey = process.env.BORZO_API_KEY;
    this.baseUrl = process.env.BORZO_API_URL; 
    this.isTestMode = process.env.BORZO_TEST_MODE === 'true';

    if (!this.apiKey) {
      console.error('❌ BORZO_API_KEY is not set in environment variables');
    }
  }

  getHeaders() {
    return {
      'X-DV-Auth-Token': this.apiKey,
      'Content-Type': 'application/json',
    };
  }

  formatPhoneNumber(phone) {
    if (!phone) return null;
    
    // Remove all non-digit characters
    const cleaned = phone.replace(/\D/g, '');
    
    // If already has country code (starts with 91 and has 12 digits)
    if (cleaned.startsWith('91') && cleaned.length === 12) {
      return cleaned;
    }
    
    // If 10 digits, add India country code
    if (cleaned.length === 10) {
      return '91' + cleaned;
    }
    
    // If 11 digits starting with 0, remove leading 0 and add country code
    if (cleaned.length === 11 && cleaned.startsWith('0')) {
      return '91' + cleaned.substring(1);
    }
    
    console.warn('⚠️ Unexpected phone format:', phone);
    return cleaned.length === 10 ? '91' + cleaned : cleaned;
  }

  /** Calculate Delivery Price */
  async calculatePrice(params) {
    try {
      const { pickupLat, pickupLng, dropLat, dropLng } = params;

      const requestBody = {
        matter: 'Products',
        points: [
          {
            address: 'Pickup Location',
            latitude: Number(pickupLat),
            longitude: Number(pickupLng),
          },
          {
            address: 'Delivery Location',
            latitude: Number(dropLat),
            longitude: Number(dropLng),
          },
        ],
      };

      console.log('📊 Calculating Borzo delivery price:', requestBody);

      const response = await axios.post(
        `${this.baseUrl}/api/business/1.6/calculate-order`,
        requestBody,
        { headers: this.getHeaders() }
      );

      if (response.data?.is_successful) {
        const order = response.data.order;

        return {
          success: true,
          data: {
            totalPrice: order.payment_amount,
            currency: 'INR',
            distance: order.distance,
            estimatedTime: order.delivery_time,
            priceBreakdown: order,
          },
        };
      }

      throw new Error(response.data.message || 'Price calculation failed');
    } catch (error) {
      console.error('❌ Borzo price calculation error:', error.response?.data || error.message);
      return {
        success: false,
        message: error.response?.data?.message || error.message,
        error: error.response?.data,
      };
    }
  }

  /** Create Delivery Order */
  async createDelivery(orderDetails) {
    try {
      const {
        orderNumber,
        pickupAddress,
        pickupLat,
        pickupLng,
        pickupPhone,
        pickupContact,
        dropAddress,
        dropLat,
        dropLng,
        dropPhone,
        dropContact,
        itemDescription,
        totalAmount,
        paymentMethod,
      } = orderDetails;

      // ✅ Format phone numbers with country code
      const formattedPickupPhone = this.formatPhoneNumber(pickupPhone);
      const formattedDropPhone = this.formatPhoneNumber(dropPhone);

      console.log('📱 Phone number formatting:', {
        original: { pickup: pickupPhone, drop: dropPhone },
        formatted: { pickup: formattedPickupPhone, drop: formattedDropPhone }
      });

      // ✅ Validate formatted phone numbers
      if (!formattedPickupPhone || formattedPickupPhone.length < 10) {
        throw new Error('Invalid pickup phone number');
      }
      if (!formattedDropPhone || formattedDropPhone.length < 10) {
        throw new Error('Invalid drop phone number');
      }

      // ✅ CRITICAL FIX: Build delivery point with correct COD fields
      const deliveryPoint = {
        address: dropAddress,
        latitude: Number(dropLat),
        longitude: Number(dropLng),
        contact_person: {
          phone: formattedDropPhone,
          name: dropContact,
        },
        client_order_id: orderNumber,
      };

      // ✅ FIXED: Use correct COD field names per Borzo API docs
      if (paymentMethod === 'cod') {
        deliveryPoint.is_cod_cash_voucher_required = true; // ✅ Correct field name
        deliveryPoint.taking_amount = Number(totalAmount).toFixed(2); // ✅ Correct field name
      }

      const requestBody = {
        type: 'standard',
        matter: itemDescription || 'Product delivery',
        vehicle_type_id: 8, // Motorbike
        points: [
          // Pickup point
          {
            address: pickupAddress,
            latitude: Number(pickupLat),
            longitude: Number(pickupLng),
            contact_person: {
              phone: formattedPickupPhone,
              name: pickupContact || 'Store',
            },
          },
          // Delivery point with COD
          deliveryPoint
        ],
      };

      console.log('🚀 Creating Borzo delivery with formatted data:', JSON.stringify(requestBody, null, 2));

      const response = await axios.post(
        `${this.baseUrl}/api/business/1.6/create-order`,
        requestBody,
        { headers: this.getHeaders() }
      );

      console.log('📦 Borzo API Response:', JSON.stringify(response.data, null, 2));

      if (response.data?.is_successful) {
        const order = response.data.order;

        return {
          success: true,
          data: {
            borzoOrderId: order.order_id,
            orderName: order.order_name,
            status: order.status,
            trackingUrl: order.points?.[1]?.tracking_url || order.tracking_url,
            deliveryFee: order.payment_amount,
            courier: order.courier || null,
            estimatedPickupTime: order.points?.[0]?.required_start_datetime,
            estimatedDeliveryTime: order.points?.[1]?.required_finish_datetime,
            codAmount: paymentMethod === 'cod' ? order.points?.[1]?.taking_amount : 0,
          },
        };
      }

      // Handle validation errors
      if (response.data?.parameter_errors) {
        console.error('❌ Borzo parameter errors:', JSON.stringify(response.data.parameter_errors, null, 2));
      }

      throw new Error(response.data.message || 'Delivery creation failed');
    } catch (error) {
      console.error('❌ Borzo delivery creation error:', error.response?.data || error.message);
      
      // Enhanced error logging
      if (error.response?.data?.parameter_errors) {
        console.error('📋 Detailed parameter errors:', JSON.stringify(error.response.data.parameter_errors, null, 2));
      }

      return {
        success: false,
        message: error.response?.data?.message || error.message,
        error: error.response?.data,
        parameterErrors: error.response?.data?.parameter_errors,
      };
    }
  }

  /** Get Order Status */
  async getOrderStatus(borzoOrderId) {
    try {
      const response = await axios.get(
        `${this.baseUrl}/api/business/1.6/orders/${borzoOrderId}`,
        { headers: this.getHeaders() }
      );

      if (response.data?.is_successful) {
        const order = response.data.order;

        return {
          success: true,
          data: {
            borzoOrderId: order.order_id,
            status: order.status,
            statusDescription: order.status_description,
            courier: order.courier,
            trackingUrl: order.points?.[1]?.tracking_url,
            estimatedDeliveryTime: order.points?.[1]?.estimated_arrival_datetime,
            actualDeliveryTime: order.points?.[1]?.courier_visit_datetime,
          },
        };
      }

      throw new Error('Failed to get order status');
    } catch (error) {
      console.error('❌ Get order status error:', error.response?.data || error.message);
      return {
        success: false,
        message: error.message,
      };
    }
  }

  /** Cancel Delivery */
  async cancelDelivery(borzoOrderId) {
    try {
      const response = await axios.post(
        `${this.baseUrl}/api/business/1.6/cancel-order`,
        { order_id: borzoOrderId },
        { headers: this.getHeaders() }
      );

      if (response.data?.is_successful) {
        return {
          success: true,
          message: 'Delivery cancelled successfully',
        };
      }

      throw new Error(response.data.message || 'Cancellation failed');
    } catch (error) {
      console.error('❌ Cancel delivery error:', error.response?.data || error.message);
      return {
        success: false,
        message: error.response?.data?.message || error.message,
      };
    }
  }

  /** Get Courier Location */
  async getCourierLocation(borzoOrderId) {
    try {
      const response = await axios.get(
        `${this.baseUrl}/api/business/1.6/courier?order_id=${borzoOrderId}`,
        { headers: this.getHeaders() }
      );

      if (response.data?.is_successful && response.data.courier) {
        const courier = response.data.courier;

        return {
          success: true,
          data: {
            name: courier.name,
            phone: courier.phone,
            photo: courier.photo_url,
            latitude: courier.latitude,
            longitude: courier.longitude,
          },
        };
      }

      return {
        success: false,
        message: 'Courier location not available',
      };
    } catch (error) {
      console.error('❌ Get courier location error:', error.response?.data || error.message);
      return {
        success: false,
        message: error.message,
      };
    }
  }
}

module.exports = new BorzoService();