# Al-Waseet API Integration Study - Edit an Order Endpoint

## Overview
This document provides a comprehensive analysis of the Al-Waseet Merchant API, specifically focusing on the **Edit an Order** endpoint and related integration requirements.

**API Documentation:** https://al-waseet.com/apis-main/index#Edit-an-Order  
**Postman Collection:** https://documenter.getpostman.com/view/5889333/2sA3QpCtuw  
**API Base URL:** https://api.alwaseet-iq.net/v1/merchant/

---

## API Rate Limiting
- **Limit:** 30 requests per 30 seconds per user
- **Response:** JSON error response if limit exceeded

---

## 1. Authentication Flow

### Login Endpoint
**Purpose:** Obtain authentication token for all subsequent API calls

| Property | Value |
|----------|-------|
| **URL** | https://api.alwaseet-iq.net/v1/merchant/login |
| **Method** | POST |
| **Content-Type** | multipart/form-data |

**Required Parameters:**
- `username` (string): Merchant's username
- `password` (string): Merchant's password

**Important Notes:**
- Login token resets after password change
- Merchant account login returns merchant token
- Merchant user account login returns merchant user token
- Invoice APIs require merchant token (not merchant user token)

**Success Response:**
```json
{
  "status": true,
  "errNum": "S000",
  "msg": "ok",
  "data": {
    "token": "@@d71480ycdmp9...."
  }
}
```

**Error Response:**
```json
{
  "status": false,
  "errNum": "999",
  "msg": "error message"
}
```

---

## 2. Supplementary Data APIs (Required Before Order Operations)

### 2.1 Cities API
**Purpose:** Get list of available cities

| Property | Value |
|----------|-------|
| **URL** | https://api.alwaseet-iq.net/v1/merchant/citys |
| **Method** | GET |
| **Content-Type** | multipart/form-data |

**Response Format:**
```json
{
  "status": true,
  "errNum": "S000",
  "msg": "ok",
  "data": [
    {
      "id": "1",
      "city_name": "Baghdad"
    }
  ]
}
```

### 2.2 Regions API
**Purpose:** Get regions for a specific city

| Property | Value |
|----------|-------|
| **URL** | https://api.alwaseet-iq.net/v1/merchant/regions?city_id=ID |
| **Method** | GET |
| **Content-Type** | multipart/form-data |

**Required Query Parameters:**
- `city_id` (int): City ID from Cities API

**Response Format:**
```json
{
  "status": true,
  "errNum": "S000",
  "msg": "ok",
  "data": [
    {
      "id": "1",
      "region_name": "Region Name"
    }
  ]
}
```

### 2.3 Package Sizes API
**Purpose:** Get available package sizes

| Property | Value |
|----------|-------|
| **URL** | https://api.alwaseet-iq.net/v1/merchant/package-sizes |
| **Method** | GET |
| **Content-Type** | multipart/form-data |

**Response Format:**
```json
{
  "status": true,
  "errNum": "S000",
  "msg": "ok",
  "data": [
    {
      "id": "1",
      "size": "Small"
    }
  ]
}
```

---

## 3. Edit an Order Endpoint (Main Focus)

### Endpoint Details

| Property | Value |
|----------|-------|
| **URL** | https://api.alwaseet-iq.net/v1/merchant/edit-order?token=loginToken |
| **Method** | POST |
| **Content-Type** | multipart/form-data |
| **Purpose** | Modify an existing order while it's still at merchant possession |

### Required Parameters (in request body)

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `order_id` | string | Yes | The ID of the order to be edited |
| `replacement` | 0 or 1 | Yes | Indicates if the order is a replacement |
| `client_name` | string | No | Name of the client |
| `client_mobile` | string | No | Client's mobile in format "+9647000000000" |
| `city_id` | int | No | ID of client's city (from Cities API) |
| `region_id` | int | No | ID of client's region (from Regions API) |
| `location` | string | No | Description of client's location |
| `type_name` | string | No | Description of goods type in order |
| `items_number` | int | No | Number of items in order |
| `price` | int | No | Total price of order |
| `package_size` | int | No | Size of package (from Package Sizes API) |
| `merchant_notes` | string | No | Notes or instructions about order |

### Authentication
- Token must be included in URL query parameter: `?token=loginToken`
- Token obtained from Login Endpoint

### Success Response
```json
{
  "status": true,
  "errNum": "S000",
  "msg": "Order updated successfully",
  "data": {
    "order_id": "string",
    "status": "updated"
  }
}
```

### Error Response
```json
{
  "status": false,
  "errNum": "error_code",
  "msg": "error message"
}
```

---

## 4. Integration Implementation Guide

### Step 1: Authentication
```
1. Call Login Endpoint with username and password
2. Extract and store the token from response
3. Use token for all subsequent API calls
```

### Step 2: Fetch Reference Data (Cache These)
```
1. Fetch cities list from Cities API
2. Fetch regions for selected city from Regions API
3. Fetch package sizes from Package Sizes API
4. Store in app database or cache for quick access
```

### Step 3: Edit Order
```
1. Prepare order data with required and optional parameters
2. Call Edit Order endpoint with token in URL
3. Handle success/error responses appropriately
4. Update app's order status based on response
```

---

## 5. Security Best Practices

### For Backend Integration (Recommended)
- **Store API credentials on server-side only**
- **Never expose token in client-side code**
- **Implement backend proxy for all API calls**
- **Validate and sanitize all input data**
- **Use HTTPS for all communications**

### Token Management
- Tokens reset when merchant password changes
- Implement token refresh mechanism
- Store tokens securely (encrypted)
- Set token expiration policies

---

## 6. Error Handling

### Common Error Codes
| Error Code | Meaning |
|-----------|---------|
| S000 | Success |
| 999 | Generic error (check msg field) |
| Rate limit exceeded | 30 requests per 30 seconds exceeded |

### Response Handling Strategy
```
1. Check "status" field (true/false)
2. If false, read "errNum" and "msg" for error details
3. Implement retry logic for rate limiting
4. Log all errors for debugging
5. Provide user-friendly error messages
```

---

## 7. Implementation Checklist

- [ ] Set up backend API proxy
- [ ] Implement secure credential storage
- [ ] Create authentication service
- [ ] Cache reference data (cities, regions, package sizes)
- [ ] Implement Edit Order function
- [ ] Add error handling and logging
- [ ] Test with sample data
- [ ] Implement rate limiting handling
- [ ] Add input validation
- [ ] Set up monitoring and alerts
- [ ] Document API integration in codebase
- [ ] Create API integration tests

---

## 8. Sample Integration Code Structure

### Node.js/Express Example
```javascript
// Backend service for Al-Waseet API
const axios = require('axios');

class AlWaseetService {
  constructor(username, password) {
    this.username = username;
    this.password = password;
    this.token = null;
    this.baseURL = 'https://api.alwaseet-iq.net/v1/merchant';
  }

  // Authenticate and get token
  async authenticate() {
    try {
      const response = await axios.post(`${this.baseURL}/login`, {
        username: this.username,
        password: this.password
      });
      if (response.data.status) {
        this.token = response.data.data.token;
        return this.token;
      }
      throw new Error(response.data.msg);
    } catch (error) {
      console.error('Authentication failed:', error);
      throw error;
    }
  }

  // Edit an order
  async editOrder(orderId, orderData) {
    if (!this.token) {
      await this.authenticate();
    }
    
    try {
      const response = await axios.post(
        `${this.baseURL}/edit-order?token=${this.token}`,
        {
          order_id: orderId,
          ...orderData
        }
      );
      return response.data;
    } catch (error) {
      console.error('Edit order failed:', error);
      throw error;
    }
  }

  // Get cities
  async getCities() {
    try {
      const response = await axios.get(`${this.baseURL}/citys`);
      return response.data.data;
    } catch (error) {
      console.error('Get cities failed:', error);
      throw error;
    }
  }

  // Get regions for city
  async getRegions(cityId) {
    try {
      const response = await axios.get(
        `${this.baseURL}/regions?city_id=${cityId}`
      );
      return response.data.data;
    } catch (error) {
      console.error('Get regions failed:', error);
      throw error;
    }
  }

  // Get package sizes
  async getPackageSizes() {
    try {
      const response = await axios.get(`${this.baseURL}/package-sizes`);
      return response.data.data;
    } catch (error) {
      console.error('Get package sizes failed:', error);
      throw error;
    }
  }
}

module.exports = AlWaseetService;
```

---

## 9. Important Considerations

1. **Mobile Number Format:** Must be "+9647000000000" (Iraq country code + 10 digits)
2. **Rate Limiting:** Implement backoff strategy for rate limit errors
3. **Token Expiration:** Monitor and refresh tokens as needed
4. **Data Caching:** Cache cities, regions, and package sizes to reduce API calls
5. **Error Logging:** Log all API errors for debugging and monitoring
6. **Input Validation:** Validate all inputs before sending to API
7. **Merchant vs User Token:** Ensure correct token type is used

---

## 10. Additional Resources

- **Postman Collection:** https://documenter.getpostman.com/view/5889333/2sA3QpCtuw
- **Main Documentation:** https://al-waseet.com/apis-main/index
- **API Base URL:** https://api.alwaseet-iq.net/v1/merchant/

---

## Document Information
- **Created:** February 14, 2026
- **API Version:** V2.3 (Updated 2025/1/18)
- **Last Updated:** February 14, 2026
