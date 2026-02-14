/**
 * Al-Waseet Integration Service
 * Complete backend implementation for integrating Al-Waseet delivery API
 * with the Mydoc pharmacy ordering system
 */

const axios = require('axios');
const crypto = require('crypto');

// ============================================================================
// 1. AL-WASEET SERVICE - Core API Integration
// ============================================================================

class AlWaseetService {
  constructor(config = {}) {
    this.baseURL = config.baseURL || 'https://api.alwaseet-iq.net/v1/merchant';
    this.username = config.username;
    this.password = config.password;
    this.token = null;
    this.tokenExpiry = null;
    this.cache = {
      cities: null,
      packageSizes: null,
    };
  }

  /**
   * Authenticate with Al-Waseet and obtain token
   * @returns {Promise<string>} Authentication token
   */
  async authenticate() {
    try {
      console.log('Authenticating with Al-Waseet...');
      
      const response = await axios.post(`${this.baseURL}/login`, {
        username: this.username,
        password: this.password,
      });

      if (!response.data.status) {
        throw new Error(`Authentication failed: ${response.data.msg}`);
      }

      this.token = response.data.data.token;
      // Token typically valid for 24 hours, set expiry to 23 hours for safety
      this.tokenExpiry = new Date(Date.now() + 23 * 60 * 60 * 1000);

      console.log('✓ Authentication successful');
      return this.token;
    } catch (error) {
      console.error('Authentication error:', error.message);
      throw error;
    }
  }

  /**
   * Ensure token is valid, refresh if needed
   * @returns {Promise<string>} Valid token
   */
  async ensureToken() {
    if (!this.token || (this.tokenExpiry && new Date() > this.tokenExpiry)) {
      await this.authenticate();
    }
    return this.token;
  }

  /**
   * Get list of available cities
   * @returns {Promise<Array>} List of cities [{id, city_name}]
   */
  async getCities() {
    try {
      // Return cached cities if available
      if (this.cache.cities) {
        console.log('✓ Returning cached cities');
        return this.cache.cities;
      }

      console.log('Fetching cities from Al-Waseet...');
      
      const response = await axios.get(`${this.baseURL}/citys`);

      if (!response.data.status) {
        throw new Error(`Failed to fetch cities: ${response.data.msg}`);
      }

      this.cache.cities = response.data.data;
      console.log(`✓ Fetched ${this.cache.cities.length} cities`);
      return this.cache.cities;
    } catch (error) {
      console.error('Error fetching cities:', error.message);
      throw error;
    }
  }

  /**
   * Get regions for a specific city
   * @param {number} cityId - City ID from getCities()
   * @returns {Promise<Array>} List of regions [{id, region_name}]
   */
  async getRegions(cityId) {
    try {
      console.log(`Fetching regions for city ${cityId}...`);
      
      const response = await axios.get(
        `${this.baseURL}/regions?city_id=${cityId}`
      );

      if (!response.data.status) {
        throw new Error(`Failed to fetch regions: ${response.data.msg}`);
      }

      console.log(`✓ Fetched ${response.data.data.length} regions`);
      return response.data.data;
    } catch (error) {
      console.error('Error fetching regions:', error.message);
      throw error;
    }
  }

  /**
   * Get available package sizes
   * @returns {Promise<Array>} List of package sizes [{id, size}]
   */
  async getPackageSizes() {
    try {
      // Return cached package sizes if available
      if (this.cache.packageSizes) {
        console.log('✓ Returning cached package sizes');
        return this.cache.packageSizes;
      }

      console.log('Fetching package sizes from Al-Waseet...');
      
      const response = await axios.get(`${this.baseURL}/package-sizes`);

      if (!response.data.status) {
        throw new Error(`Failed to fetch package sizes: ${response.data.msg}`);
      }

      this.cache.packageSizes = response.data.data;
      console.log(`✓ Fetched ${this.cache.packageSizes.length} package sizes`);
      return this.cache.packageSizes;
    } catch (error) {
      console.error('Error fetching package sizes:', error.message);
      throw error;
    }
  }

  /**
   * Create a new delivery order
   * @param {Object} orderData - Order details
   * @returns {Promise<Object>} Order confirmation with QR code
   */
  async createOrder(orderData) {
    try {
      const token = await this.ensureToken();
      
      console.log('Creating order with Al-Waseet...');

      // Validate required fields
      const requiredFields = [
        'client_name',
        'client_mobile',
        'city_id',
        'region_id',
        'location',
        'type_name',
        'items_number',
        'price',
        'package_size',
        'replacement',
      ];

      for (const field of requiredFields) {
        if (!orderData[field]) {
          throw new Error(`Missing required field: ${field}`);
        }
      }

      // Validate phone format
      if (!/^\+964\d{10}$/.test(orderData.client_mobile)) {
        throw new Error(
          'Invalid phone format. Must be +9647XXXXXXXXX (Iraq format)'
        );
      }

      const response = await axios.post(
        `${this.baseURL}/create-order?token=${token}`,
        orderData
      );

      if (!response.data.status) {
        throw new Error(`Order creation failed: ${response.data.msg}`);
      }

      console.log('✓ Order created successfully');
      return response.data.data;
    } catch (error) {
      console.error('Error creating order:', error.message);
      throw error;
    }
  }

  /**
   * Edit an existing order (before dispatch)
   * @param {string} orderId - Order ID to edit
   * @param {Object} updateData - Fields to update
   * @returns {Promise<Object>} Updated order data
   */
  async editOrder(orderId, updateData) {
    try {
      const token = await this.ensureToken();
      
      console.log(`Editing order ${orderId}...`);

      const response = await axios.post(
        `${this.baseURL}/edit-order?token=${token}`,
        {
          order_id: orderId,
          ...updateData,
        }
      );

      if (!response.data.status) {
        throw new Error(`Order edit failed: ${response.data.msg}`);
      }

      console.log('✓ Order updated successfully');
      return response.data.data;
    } catch (error) {
      console.error('Error editing order:', error.message);
      throw error;
    }
  }

  /**
   * Get order status
   * @param {string} orderId - Order ID
   * @returns {Promise<Object>} Order status and details
   */
  async getOrderStatus(orderId) {
    try {
      const token = await this.ensureToken();
      
      console.log(`Fetching status for order ${orderId}...`);

      const response = await axios.get(
        `${this.baseURL}/retrieve-orders?token=${token}&order_id=${orderId}`
      );

      if (!response.data.status) {
        throw new Error(`Failed to fetch order status: ${response.data.msg}`);
      }

      return response.data.data;
    } catch (error) {
      console.error('Error fetching order status:', error.message);
      throw error;
    }
  }

  /**
   * Get all possible order statuses
   * @returns {Promise<Array>} List of available statuses
   */
  async getOrderStatuses() {
    try {
      const token = await this.ensureToken();
      
      console.log('Fetching available order statuses...');

      const response = await axios.get(
        `${this.baseURL}/get-orders-statuses?token=${token}`
      );

      if (!response.data.status) {
        throw new Error(`Failed to fetch statuses: ${response.data.msg}`);
      }

      console.log(`✓ Fetched ${response.data.data.length} statuses`);
      return response.data.data;
    } catch (error) {
      console.error('Error fetching order statuses:', error.message);
      throw error;
    }
  }
}

// ============================================================================
// 2. MESSAGING SERVICE - WhatsApp Integration via Twilio
// ============================================================================

class MessagingService {
  constructor(twilioConfig = {}) {
    this.accountSid = twilioConfig.accountSid;
    this.authToken = twilioConfig.authToken;
    this.whatsappNumber = twilioConfig.whatsappNumber; // e.g., 'whatsapp:+1234567890'
    this.baseURL = 'https://api.twilio.com/2010-04-01';
  }

  /**
   * Send WhatsApp message to pharmacy
   * @param {string} pharmacyPhone - Pharmacy WhatsApp number (e.g., +964XXXXXXXXXX)
   * @param {Object} messageData - Message content and order details
   * @returns {Promise<Object>} Message delivery confirmation
   */
  async sendPharmacyMessage(pharmacyPhone, messageData) {
    try {
      console.log(`Sending WhatsApp message to pharmacy ${pharmacyPhone}...`);

      // Format message body
      const messageBody = this.formatPharmacyMessage(messageData);

      const auth = Buffer.from(
        `${this.accountSid}:${this.authToken}`
      ).toString('base64');

      const response = await axios.post(
        `${this.baseURL}/Accounts/${this.accountSid}/Messages.json`,
        {
          From: this.whatsappNumber,
          To: `whatsapp:${pharmacyPhone}`,
          Body: messageBody,
        },
        {
          headers: {
            Authorization: `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      console.log('✓ WhatsApp message sent successfully');
      return {
        messageSid: response.data.sid,
        status: response.data.status,
        sentAt: new Date(),
      };
    } catch (error) {
      console.error('Error sending WhatsApp message:', error.message);
      throw error;
    }
  }

  /**
   * Format message for pharmacy
   * @param {Object} messageData - Order and patient data
   * @returns {string} Formatted message
   */
  formatPharmacyMessage(messageData) {
    const {
      pharmacyName,
      medicineName,
      dosage,
      quantity,
      patientName,
      patientPhone,
      deliveryAddress,
      orderId,
    } = messageData;

    return `
السلام عليكم ورحمة الله وبركاته

طلب دواء جديد من تطبيق Mydoc

اسم الدواء: ${medicineName}
الجرعة: ${dosage}
الكمية: ${quantity}

بيانات المريض:
الاسم: ${patientName}
الهاتف: ${patientPhone}
العنوان: ${deliveryAddress}

سيتم التوصيل عن طريق شركة الوسيط (الدفع عند الاستلام)

يرجى تأكيد توفر الدواء:
- اكتب "نعم" للتأكيد
- اكتب "لا" إذا لم يكن متوفراً
- أو أرسل السعر المخصص

رقم الطلب: ${orderId}

شكراً لتعاونكم
    `.trim();
  }

  /**
   * Parse pharmacy response from WhatsApp
   * @param {string} responseText - Pharmacy's response message
   * @returns {Object} Parsed response {status, price}
   */
  parsePharmacyResponse(responseText) {
    const text = responseText.toLowerCase().trim();

    if (text.includes('نعم') || text === 'yes') {
      return { status: 'confirmed', price: null };
    } else if (text.includes('لا') || text === 'no') {
      return { status: 'rejected', price: null };
    } else if (!isNaN(text)) {
      // Assume it's a custom price
      return { status: 'custom_price', price: parseFloat(text) };
    }

    return { status: 'unclear', price: null };
  }
}

// ============================================================================
// 3. ORDER SERVICE - Order Lifecycle Management
// ============================================================================

class OrderService {
  constructor(database) {
    this.db = database; // Assume this is a database connection (e.g., Prisma, Sequelize)
  }

  /**
   * Create a new order record
   * @param {Object} orderData - Order details
   * @returns {Promise<Object>} Created order
   */
  async createOrder(orderData) {
    try {
      console.log('Creating order record in database...');

      const order = await this.db.orders.create({
        data: {
          userId: orderData.userId,
          pharmacyId: orderData.pharmacyId,
          assessmentId: orderData.assessmentId,
          medicineName: orderData.medicineName,
          quantity: orderData.quantity,
          price: orderData.price,
          deliveryFee: orderData.deliveryFee || 0,
          totalPrice: orderData.price + (orderData.deliveryFee || 0),
          status: 'pending_pharmacy_confirmation',
          pharmacyConfirmationStatus: 'pending',
          paymentMethod: 'cod',
          deliveryAddress: orderData.deliveryAddress,
          deliveryDate: orderData.deliveryDate,
        },
      });

      console.log(`✓ Order created: ${order.id}`);
      return order;
    } catch (error) {
      console.error('Error creating order:', error.message);
      throw error;
    }
  }

  /**
   * Update order status
   * @param {string} orderId - Order ID
   * @param {Object} updates - Status and other updates
   * @returns {Promise<Object>} Updated order
   */
  async updateOrder(orderId, updates) {
    try {
      console.log(`Updating order ${orderId}...`);

      const order = await this.db.orders.update({
        where: { id: orderId },
        data: updates,
      });

      console.log('✓ Order updated');
      return order;
    } catch (error) {
      console.error('Error updating order:', error.message);
      throw error;
    }
  }

  /**
   * Get order by ID
   * @param {string} orderId - Order ID
   * @returns {Promise<Object>} Order details
   */
  async getOrder(orderId) {
    try {
      const order = await this.db.orders.findUnique({
        where: { id: orderId },
        include: {
          user: true,
          pharmacy: true,
          assessment: true,
        },
      });

      if (!order) {
        throw new Error(`Order not found: ${orderId}`);
      }

      return order;
    } catch (error) {
      console.error('Error fetching order:', error.message);
      throw error;
    }
  }

  /**
   * Get user's order history
   * @param {string} userId - User ID
   * @returns {Promise<Array>} List of orders
   */
  async getUserOrders(userId) {
    try {
      const orders = await this.db.orders.findMany({
        where: { userId },
        include: {
          pharmacy: true,
          assessment: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      return orders;
    } catch (error) {
      console.error('Error fetching user orders:', error.message);
      throw error;
    }
  }
}

// ============================================================================
// 4. PHARMACY SERVICE - Pharmacy Management
// ============================================================================

class PharmacyService {
  constructor(database) {
    this.db = database;
  }

  /**
   * Register a new pharmacy
   * @param {Object} pharmacyData - Pharmacy details
   * @returns {Promise<Object>} Created pharmacy
   */
  async registerPharmacy(pharmacyData) {
    try {
      console.log('Registering pharmacy...');

      const pharmacy = await this.db.pharmacies.create({
        data: {
          name: pharmacyData.name,
          phone: pharmacyData.phone,
          whatsapp: pharmacyData.whatsapp,
          address: pharmacyData.address,
          cityId: pharmacyData.cityId,
          regionId: pharmacyData.regionId,
          latitude: pharmacyData.latitude,
          longitude: pharmacyData.longitude,
          operatingHours: pharmacyData.operatingHours || {},
          deliveryZones: pharmacyData.deliveryZones || [],
          codEnabled: true,
        },
      });

      console.log(`✓ Pharmacy registered: ${pharmacy.id}`);
      return pharmacy;
    } catch (error) {
      console.error('Error registering pharmacy:', error.message);
      throw error;
    }
  }

  /**
   * Store Al-Waseet credentials for a pharmacy
   * @param {string} pharmacyId - Pharmacy ID
   * @param {Object} credentials - Al-Waseet login credentials
   * @returns {Promise<Object>} Stored credentials
   */
  async storeAlWaseetCredentials(pharmacyId, credentials) {
    try {
      console.log(`Storing Al-Waseet credentials for pharmacy ${pharmacyId}...`);

      // Encrypt password before storing
      const encryptedPassword = this.encryptPassword(credentials.password);

      const storedCredentials = await this.db.pharmacy_alwaseet_credentials.create(
        {
          data: {
            pharmacyId,
            merchantUsername: credentials.username,
            merchantPassword: encryptedPassword,
          },
        }
      );

      console.log('✓ Credentials stored securely');
      return storedCredentials;
    } catch (error) {
      console.error('Error storing credentials:', error.message);
      throw error;
    }
  }

  /**
   * Get pharmacy by ID
   * @param {string} pharmacyId - Pharmacy ID
   * @returns {Promise<Object>} Pharmacy details
   */
  async getPharmacy(pharmacyId) {
    try {
      const pharmacy = await this.db.pharmacies.findUnique({
        where: { id: pharmacyId },
      });

      if (!pharmacy) {
        throw new Error(`Pharmacy not found: ${pharmacyId}`);
      }

      return pharmacy;
    } catch (error) {
      console.error('Error fetching pharmacy:', error.message);
      throw error;
    }
  }

  /**
   * Find pharmacies near coordinates
   * @param {number} latitude - Patient latitude
   * @param {number} longitude - Patient longitude
   * @param {number} radiusKm - Search radius in kilometers
   * @returns {Promise<Array>} Nearby pharmacies
   */
  async findNearbyPharmacies(latitude, longitude, radiusKm = 10) {
    try {
      console.log(
        `Finding pharmacies within ${radiusKm}km of ${latitude}, ${longitude}...`
      );

      // Simple distance calculation (Haversine formula)
      const pharmacies = await this.db.pharmacies.findMany({
        where: {
          codEnabled: true,
        },
      });

      // Filter by distance
      const nearby = pharmacies
        .map((pharmacy) => ({
          ...pharmacy,
          distance: this.calculateDistance(
            latitude,
            longitude,
            pharmacy.latitude,
            pharmacy.longitude
          ),
        }))
        .filter((pharmacy) => pharmacy.distance <= radiusKm)
        .sort((a, b) => a.distance - b.distance);

      console.log(`✓ Found ${nearby.length} nearby pharmacies`);
      return nearby;
    } catch (error) {
      console.error('Error finding nearby pharmacies:', error.message);
      throw error;
    }
  }

  /**
   * Calculate distance between two coordinates (Haversine formula)
   * @param {number} lat1 - Latitude 1
   * @param {number} lon1 - Longitude 1
   * @param {number} lat2 - Latitude 2
   * @param {number} lon2 - Longitude 2
   * @returns {number} Distance in kilometers
   */
  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * Encrypt password (use a proper encryption library in production)
   * @param {string} password - Plain text password
   * @returns {string} Encrypted password
   */
  encryptPassword(password) {
    // In production, use a proper encryption library like 'bcrypt' or 'crypto'
    const cipher = crypto.createCipher('aes-256-cbc', process.env.ENCRYPTION_KEY);
    let encrypted = cipher.update(password, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return encrypted;
  }
}

// ============================================================================
// 5. COMPLETE ORDER WORKFLOW - Orchestration
// ============================================================================

class OrderOrchestrationService {
  constructor(alWaseetService, messagingService, orderService, pharmacyService) {
    this.alWaseet = alWaseetService;
    this.messaging = messagingService;
    this.orders = orderService;
    this.pharmacies = pharmacyService;
  }

  /**
   * Complete workflow: Create order and contact pharmacy
   * @param {Object} workflowData - All necessary data for the workflow
   * @returns {Promise<Object>} Order with tracking info
   */
  async initiateOrderWorkflow(workflowData) {
    try {
      console.log('Starting order workflow...');

      const {
        userId,
        pharmacyId,
        assessmentId,
        medicineName,
        dosage,
        quantity,
        patientName,
        patientPhone,
        deliveryAddress,
        cityId,
        regionId,
        price,
        deliveryFee,
      } = workflowData;

      // Step 1: Create order record in database
      console.log('\n[Step 1] Creating order record...');
      const order = await this.orders.createOrder({
        userId,
        pharmacyId,
        assessmentId,
        medicineName,
        quantity,
        price,
        deliveryFee,
        deliveryAddress,
        deliveryDate: new Date(),
      });

      // Step 2: Get pharmacy details
      console.log('\n[Step 2] Fetching pharmacy details...');
      const pharmacy = await this.pharmacies.getPharmacy(pharmacyId);

      // Step 3: Send message to pharmacy
      console.log('\n[Step 3] Sending message to pharmacy...');
      await this.messaging.sendPharmacyMessage(pharmacy.whatsapp, {
        pharmacyName: pharmacy.name,
        medicineName,
        dosage,
        quantity,
        patientName,
        patientPhone,
        deliveryAddress,
        orderId: order.id,
      });

      // Step 4: Update order status to "awaiting confirmation"
      console.log('\n[Step 4] Updating order status...');
      await this.orders.updateOrder(order.id, {
        status: 'awaiting_pharmacy_confirmation',
      });

      console.log('\n✓ Order workflow initiated successfully');
      return {
        orderId: order.id,
        status: 'awaiting_pharmacy_confirmation',
        message: 'Message sent to pharmacy. Awaiting confirmation.',
      };
    } catch (error) {
      console.error('Error in order workflow:', error.message);
      throw error;
    }
  }

  /**
   * Handle pharmacy confirmation and create Al-Waseet order
   * @param {string} orderId - Order ID
   * @param {Object} confirmationData - Pharmacy confirmation details
   * @returns {Promise<Object>} Al-Waseet order confirmation
   */
  async handlePharmacyConfirmation(orderId, confirmationData) {
    try {
      console.log(`Handling pharmacy confirmation for order ${orderId}...`);

      // Step 1: Get order details
      console.log('\n[Step 1] Fetching order details...');
      const order = await this.orders.getOrder(orderId);

      // Step 2: Update order with pharmacy confirmation
      console.log('\n[Step 2] Updating order with confirmation...');
      await this.orders.updateOrder(orderId, {
        pharmacyConfirmationStatus: 'confirmed',
        price: confirmationData.price || order.price,
      });

      // Step 3: Create Al-Waseet order
      console.log('\n[Step 3] Creating Al-Waseet delivery order...');
      const alWaseetOrder = await this.alWaseet.createOrder({
        client_name: order.user.name,
        client_mobile: order.user.phone,
        city_id: order.pharmacy.cityId,
        region_id: order.pharmacy.regionId,
        location: order.deliveryAddress,
        type_name: `Medicine - ${order.medicineName}`,
        items_number: order.quantity,
        price: order.totalPrice,
        package_size: 1, // Small package for medicine
        merchant_notes: `Pharmacy: ${order.pharmacy.name}, Order ID: ${orderId}`,
        replacement: 0,
      });

      // Step 4: Update order with Al-Waseet tracking info
      console.log('\n[Step 4] Updating order with Al-Waseet info...');
      await this.orders.updateOrder(orderId, {
        alWaseetOrderId: alWaseetOrder.order_id,
        status: 'confirmed',
      });

      console.log('\n✓ Pharmacy confirmation processed successfully');
      return {
        orderId,
        alWaseetOrderId: alWaseetOrder.order_id,
        status: 'confirmed',
        qrCode: alWaseetOrder.qr_link,
        message: 'Order confirmed and sent to Al-Waseet for delivery',
      };
    } catch (error) {
      console.error('Error handling pharmacy confirmation:', error.message);
      throw error;
    }
  }

  /**
   * Poll Al-Waseet for order status updates
   * @param {string} orderId - Order ID
   * @returns {Promise<Object>} Current order status
   */
  async pollOrderStatus(orderId) {
    try {
      console.log(`Polling status for order ${orderId}...`);

      const order = await this.orders.getOrder(orderId);

      if (!order.alWaseetOrderId) {
        throw new Error('Order not yet sent to Al-Waseet');
      }

      // Get status from Al-Waseet
      const alWaseetStatus = await this.alWaseet.getOrderStatus(
        order.alWaseetOrderId
      );

      // Map Al-Waseet status to app status
      const statusMap = {
        pending: 'pending',
        confirmed: 'confirmed',
        in_transit: 'in_transit',
        delivered: 'delivered',
        cancelled: 'cancelled',
      };

      const appStatus = statusMap[alWaseetStatus.status] || alWaseetStatus.status;

      // Update order status in database
      await this.orders.updateOrder(orderId, {
        status: appStatus,
      });

      console.log(`✓ Order status: ${appStatus}`);
      return {
        orderId,
        status: appStatus,
        alWaseetStatus: alWaseetStatus,
      };
    } catch (error) {
      console.error('Error polling order status:', error.message);
      throw error;
    }
  }
}

// ============================================================================
// EXPORT SERVICES
// ============================================================================

module.exports = {
  AlWaseetService,
  MessagingService,
  OrderService,
  PharmacyService,
  OrderOrchestrationService,
};
