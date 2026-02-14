/**
 * Pharmacy Integration API Routes
 * Express.js routes for handling medicine ordering and delivery
 */

const express = require('express');
const router = express.Router();

// Middleware for authentication (assuming JWT-based auth)
const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  // Verify token and attach user to req
  req.user = { id: 'user-id-from-token' }; // Simplified
  next();
};

// ============================================================================
// 1. PHARMACY DISCOVERY ROUTES
// ============================================================================

/**
 * GET /api/pharmacies/nearby
 * Find nearby pharmacies based on patient location
 */
router.get('/pharmacies/nearby', authMiddleware, async (req, res) => {
  try {
    const { latitude, longitude, radius = 10 } = req.query;

    if (!latitude || !longitude) {
      return res.status(400).json({
        error: 'Missing latitude or longitude',
      });
    }

    // Use PharmacyService to find nearby pharmacies
    const pharmacies = await req.app.locals.pharmacyService.findNearbyPharmacies(
      parseFloat(latitude),
      parseFloat(longitude),
      parseFloat(radius)
    );

    res.json({
      success: true,
      count: pharmacies.length,
      data: pharmacies.map((p) => ({
        id: p.id,
        name: p.name,
        phone: p.phone,
        address: p.address,
        distance: p.distance.toFixed(2),
        latitude: p.latitude,
        longitude: p.longitude,
        operatingHours: p.operatingHours,
        rating: p.averageRating,
      })),
    });
  } catch (error) {
    console.error('Error fetching nearby pharmacies:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/pharmacies/:id
 * Get detailed information about a specific pharmacy
 */
router.get('/pharmacies/:id', authMiddleware, async (req, res) => {
  try {
    const pharmacy = await req.app.locals.pharmacyService.getPharmacy(
      req.params.id
    );

    res.json({
      success: true,
      data: {
        id: pharmacy.id,
        name: pharmacy.name,
        phone: pharmacy.phone,
        whatsapp: pharmacy.whatsapp,
        address: pharmacy.address,
        latitude: pharmacy.latitude,
        longitude: pharmacy.longitude,
        operatingHours: pharmacy.operatingHours,
        codEnabled: pharmacy.codEnabled,
        rating: pharmacy.averageRating,
      },
    });
  } catch (error) {
    console.error('Error fetching pharmacy:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// 2. ORDER CREATION ROUTES
// ============================================================================

/**
 * POST /api/orders
 * Create a new medicine order
 * Body: {
 *   pharmacyId: string,
 *   assessmentId: string,
 *   medicineName: string,
 *   dosage: string,
 *   quantity: number,
 *   price: number,
 *   deliveryFee: number,
 *   deliveryAddress: string,
 *   deliveryDate: date
 * }
 */
router.post('/orders', authMiddleware, async (req, res) => {
  try {
    const {
      pharmacyId,
      assessmentId,
      medicineName,
      dosage,
      quantity,
      price,
      deliveryFee,
      deliveryAddress,
      deliveryDate,
    } = req.body;

    // Validate required fields
    if (!pharmacyId || !medicineName || !quantity || !price) {
      return res.status(400).json({
        error: 'Missing required fields',
      });
    }

    // Get user details
    const user = await req.app.locals.db.users.findUnique({
      where: { id: req.user.id },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Initiate order workflow
    const result = await req.app.locals.orchestrationService.initiateOrderWorkflow(
      {
        userId: req.user.id,
        pharmacyId,
        assessmentId,
        medicineName,
        dosage,
        quantity,
        patientName: user.name,
        patientPhone: user.phone,
        deliveryAddress: deliveryAddress || user.address,
        cityId: user.cityId,
        regionId: user.regionId,
        price,
        deliveryFee,
      }
    );

    res.status(201).json({
      success: true,
      message: 'Order created and pharmacy contacted',
      data: result,
    });
  } catch (error) {
    console.error('Error creating order:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/orders/:id
 * Get order details
 */
router.get('/orders/:id', authMiddleware, async (req, res) => {
  try {
    const order = await req.app.locals.orderService.getOrder(req.params.id);

    // Verify user owns this order
    if (order.userId !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    res.json({
      success: true,
      data: {
        id: order.id,
        medicineName: order.medicineName,
        quantity: order.quantity,
        totalPrice: order.totalPrice,
        status: order.status,
        pharmacyConfirmationStatus: order.pharmacyConfirmationStatus,
        deliveryAddress: order.deliveryAddress,
        alWaseetOrderId: order.alWaseetOrderId,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
      },
    });
  } catch (error) {
    console.error('Error fetching order:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/orders
 * Get user's order history
 */
router.get('/orders', authMiddleware, async (req, res) => {
  try {
    const orders = await req.app.locals.orderService.getUserOrders(req.user.id);

    res.json({
      success: true,
      count: orders.length,
      data: orders.map((order) => ({
        id: order.id,
        medicineName: order.medicineName,
        quantity: order.quantity,
        totalPrice: order.totalPrice,
        status: order.status,
        pharmacyName: order.pharmacy.name,
        createdAt: order.createdAt,
      })),
    });
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// 3. ORDER STATUS & TRACKING ROUTES
// ============================================================================

/**
 * GET /api/orders/:id/status
 * Get real-time order status
 */
router.get('/orders/:id/status', authMiddleware, async (req, res) => {
  try {
    const order = await req.app.locals.orderService.getOrder(req.params.id);

    // Verify user owns this order
    if (order.userId !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // Poll Al-Waseet for latest status
    const statusInfo = await req.app.locals.orchestrationService.pollOrderStatus(
      req.params.id
    );

    res.json({
      success: true,
      data: {
        orderId: req.params.id,
        status: statusInfo.status,
        alWaseetOrderId: order.alWaseetOrderId,
        alWaseetStatus: statusInfo.alWaseetStatus,
        lastUpdated: new Date(),
      },
    });
  } catch (error) {
    console.error('Error fetching order status:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// 4. PHARMACY CONFIRMATION WEBHOOK
// ============================================================================

/**
 * POST /api/webhooks/pharmacy-response
 * Webhook to receive pharmacy responses from WhatsApp
 * This endpoint is called by Twilio when a pharmacy replies
 */
router.post('/webhooks/pharmacy-response', async (req, res) => {
  try {
    const { From, Body, MessageSid } = req.body;

    console.log(`Received message from ${From}: ${Body}`);

    // Find the order associated with this pharmacy
    // (In a real system, you'd have a mapping of pharmacy phone to orders)
    const pharmacy = await req.app.locals.db.pharmacies.findUnique({
      where: { whatsapp: From },
    });

    if (!pharmacy) {
      console.warn(`Unknown pharmacy: ${From}`);
      return res.status(404).json({ error: 'Pharmacy not found' });
    }

    // Find pending order for this pharmacy
    const pendingOrder = await req.app.locals.db.orders.findFirst({
      where: {
        pharmacyId: pharmacy.id,
        pharmacyConfirmationStatus: 'pending',
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!pendingOrder) {
      console.warn(`No pending order for pharmacy: ${pharmacy.name}`);
      return res.status(404).json({ error: 'No pending order found' });
    }

    // Parse pharmacy response
    const parsedResponse = req.app.locals.messagingService.parsePharmacyResponse(
      Body
    );

    console.log(`Parsed response: ${JSON.stringify(parsedResponse)}`);

    if (parsedResponse.status === 'confirmed') {
      // Pharmacy confirmed - proceed with Al-Waseet order
      await req.app.locals.orchestrationService.handlePharmacyConfirmation(
        pendingOrder.id,
        {
          price: parsedResponse.price || pendingOrder.price,
        }
      );

      // Send confirmation message to pharmacy
      await req.app.locals.messagingService.sendPharmacyMessage(
        pharmacy.whatsapp,
        {
          pharmacyName: pharmacy.name,
          message: 'تم استلام تأكيدك. سيتم إرسال سائق الوسيط قريباً.',
        }
      );
    } else if (parsedResponse.status === 'rejected') {
      // Pharmacy rejected - mark order as rejected
      await req.app.locals.orderService.updateOrder(pendingOrder.id, {
        pharmacyConfirmationStatus: 'rejected',
        status: 'pharmacy_rejected',
      });

      // Notify user to select another pharmacy
      // (Send push notification or email)
    } else if (parsedResponse.status === 'custom_price') {
      // Pharmacy provided custom price - ask user for confirmation
      await req.app.locals.orderService.updateOrder(pendingOrder.id, {
        status: 'awaiting_price_confirmation',
        price: parsedResponse.price,
      });

      // Notify user of price change
      // (Send push notification or email)
    }

    res.json({ success: true, message: 'Response processed' });
  } catch (error) {
    console.error('Error processing pharmacy response:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// 5. AL-WASEET REFERENCE DATA ROUTES
// ============================================================================

/**
 * GET /api/reference/cities
 * Get list of cities from Al-Waseet
 */
router.get('/reference/cities', async (req, res) => {
  try {
    const cities = await req.app.locals.alWaseetService.getCities();

    res.json({
      success: true,
      count: cities.length,
      data: cities,
    });
  } catch (error) {
    console.error('Error fetching cities:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/reference/regions/:cityId
 * Get regions for a specific city
 */
router.get('/reference/regions/:cityId', async (req, res) => {
  try {
    const regions = await req.app.locals.alWaseetService.getRegions(
      req.params.cityId
    );

    res.json({
      success: true,
      count: regions.length,
      data: regions,
    });
  } catch (error) {
    console.error('Error fetching regions:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/reference/package-sizes
 * Get available package sizes
 */
router.get('/reference/package-sizes', async (req, res) => {
  try {
    const sizes = await req.app.locals.alWaseetService.getPackageSizes();

    res.json({
      success: true,
      count: sizes.length,
      data: sizes,
    });
  } catch (error) {
    console.error('Error fetching package sizes:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// 6. ERROR HANDLING
// ============================================================================

// 404 handler
router.use((req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    path: req.path,
  });
});

// Error handler
router.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({
    error: 'Internal server error',
    message: error.message,
  });
});

module.exports = router;
