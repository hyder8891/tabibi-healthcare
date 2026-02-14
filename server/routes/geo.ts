import type { Express, Request, Response } from "express";

// Cache for Place Details API responses
const placeDetailsCache = new Map<string, { data: any; expires: number }>();
const PLACE_DETAILS_CACHE_TTL = 60 * 60 * 1000; // 1 hour

// Cache for Nearby Search results
const nearbySearchCache = new Map<string, { data: any; expires: number }>();
const NEARBY_SEARCH_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get cached Place Details if available and not expired
 */
function getCachedPlaceDetails(placeId: string): any {
  const cached = placeDetailsCache.get(placeId);
  if (cached && cached.expires > Date.now()) {
    return cached.data;
  }
  placeDetailsCache.delete(placeId);
  return null;
}

/**
 * Set Place Details in cache with TTL and LRU size limit
 */
function setCachedPlaceDetails(placeId: string, data: any): void {
  // Limit cache size to prevent memory leaks (simple FIFO eviction)
  if (placeDetailsCache.size > 500) {
    const oldest = placeDetailsCache.keys().next().value;
    if (oldest) placeDetailsCache.delete(oldest);
  }
  placeDetailsCache.set(placeId, { data, expires: Date.now() + PLACE_DETAILS_CACHE_TTL });
}

/**
 * Get nearby search cache key from coordinates and type
 * Rounds to 3 decimal places (approximately 100m precision)
 */
function getNearbySearchCacheKey(latitude: string, longitude: string, type: string): string {
  const lat = parseFloat(latitude);
  const lng = parseFloat(longitude);
  const roundedLat = Math.round(lat * 1000) / 1000;
  const roundedLng = Math.round(lng * 1000) / 1000;
  return `${roundedLat},${roundedLng},${type}`;
}

/**
 * Get cached nearby search results if available and not expired
 */
function getCachedNearbySearch(cacheKey: string): any {
  const cached = nearbySearchCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    return cached.data;
  }
  nearbySearchCache.delete(cacheKey);
  return null;
}

/**
 * Set nearby search results in cache with TTL and LRU size limit
 */
function setCachedNearbySearch(cacheKey: string, data: any): void {
  // Limit cache size to prevent memory leaks (simple FIFO eviction)
  if (nearbySearchCache.size > 100) {
    const oldest = nearbySearchCache.keys().next().value;
    if (oldest) nearbySearchCache.delete(oldest);
  }
  nearbySearchCache.set(cacheKey, { data, expires: Date.now() + NEARBY_SEARCH_CACHE_TTL });
}

export function registerGeoRoutes(app: Express): void {
  app.get("/api/nearby-facilities", async (req: Request, res: Response) => {
    try {
      const { latitude, longitude, type, pagetoken } = req.query;

      if (!latitude || !longitude) {
        return res.status(400).json({ error: "Latitude and longitude are required" });
      }

      const apiKey = process.env.GOOGLE_MAPS_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: "Google Maps API key not configured" });
      }

      const typeMap: Record<string, string> = {
        pharmacy: "pharmacy",
        lab: "laboratory",
        clinic: "doctor",
        hospital: "hospital",
      };

      const googleType = typeMap[type as string] || "pharmacy";

      // Try to get from cache first (only for initial searches, not paginated)
      let cacheKey: string | null = null;
      let cachedData: any = null;
      
      if (!pagetoken) {
        cacheKey = getNearbySearchCacheKey(latitude as string, longitude as string, type as string);
        cachedData = getCachedNearbySearch(cacheKey);
        if (cachedData) {
          return res.json(cachedData);
        }
      }
      
      let url: string;
      if (pagetoken) {
        url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?pagetoken=${pagetoken}&key=${apiKey}`;
      } else {
        url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${latitude},${longitude}&radius=10000&type=${googleType}&key=${apiKey}`;
      }

      const response = await globalThis.fetch(url);
      const data = await response.json();

      if (data.status === "ZERO_RESULTS") {
        const result = { facilities: [], nextPageToken: null };
        if (cacheKey) setCachedNearbySearch(cacheKey, result);
        return res.json(result);
      }

      if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
        console.error("Google Places API error:", data.status, data.error_message);
        return res.status(500).json({ error: `Google Places API error: ${data.status}` });
      }

      const lat = parseFloat(latitude as string);
      const lng = parseFloat(longitude as string);

      const facilities = (data.results || []).map((place: any, index: number) => {
        const placeLat = place.geometry?.location?.lat || lat;
        const placeLng = place.geometry?.location?.lng || lng;
        
        const R = 6371;
        const dLat = ((placeLat - lat) * Math.PI) / 180;
        const dLon = ((placeLng - lng) * Math.PI) / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos((lat * Math.PI) / 180) * Math.cos((placeLat * Math.PI) / 180) *
          Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const distance = parseFloat((R * c).toFixed(1));

        return {
          id: place.place_id || `facility-${index}`,
          name: place.name || "Unknown",
          type: type || "pharmacy",
          distance,
          rating: place.rating || 0,
          isOpen: place.opening_hours?.open_now ?? true,
          address: place.vicinity || place.formatted_address || "",
          latitude: placeLat,
          longitude: placeLng,
          capabilities: (place.types || []).filter((t: string) => 
            !["point_of_interest", "establishment", "health", "store"].includes(t)
          ).slice(0, 4),
          phone: "",
          internationalPhone: "",
          openHours: place.opening_hours?.open_now ? "Open" : "Closed",
          placeId: place.place_id,
          totalRatings: place.user_ratings_total || 0,
          photos: place.photos ? place.photos.slice(0, 1).map((p: any) => 
            `/api/place-photo/${p.photo_reference}`
          ) : [],
        };
      });

      facilities.sort((a: any, b: any) => a.distance - b.distance);

      const result = {
        facilities,
        nextPageToken: data.next_page_token || null,
      };

      // Cache the result for initial searches (not paginated)
      if (cacheKey) {
        setCachedNearbySearch(cacheKey, result);
      }

      res.json(result);
    } catch (error) {
      console.error("Nearby facilities error:", error instanceof Error ? error.message : "Unknown error");
      res.status(500).json({ error: "Failed to fetch nearby facilities" });
    }
  });

  app.get("/api/place-photo/:photoRef", async (req: Request, res: Response) => {
    try {
      const { photoRef } = req.params;
      const apiKey = process.env.GOOGLE_MAPS_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: "Google Maps API key not configured" });
      }

      const ref = Array.isArray(photoRef) ? photoRef[0] : photoRef;
      const url = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photo_reference=${encodeURIComponent(ref)}&key=${apiKey}`;
      const response = await globalThis.fetch(url);

      if (!response.ok) {
        return res.status(response.status).json({ error: "Failed to fetch photo" });
      }

      const buffer = await response.arrayBuffer();
      const contentType = response.headers.get("content-type") || "image/jpeg";
      res.set("Content-Type", contentType);
      res.set("Cache-Control", "public, max-age=86400");
      res.send(Buffer.from(buffer));
    } catch (error) {
      console.error("Place photo proxy error:", error instanceof Error ? error.message : "Unknown error");
      res.status(500).json({ error: "Failed to fetch photo" });
    }
  });

  app.get("/api/place-details/:placeId", async (req: Request, res: Response) => {
    try {
      const { placeId } = req.params;
      const apiKey = process.env.GOOGLE_MAPS_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: "Google Maps API key not configured" });
      }

      const id = Array.isArray(placeId) ? placeId[0] : placeId;

      // Check cache first
      const cachedDetails = getCachedPlaceDetails(id);
      if (cachedDetails) {
        return res.json(cachedDetails);
      }

      const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(id)}&fields=formatted_phone_number,international_phone_number,opening_hours,website,url&key=${apiKey}`;
      const response = await globalThis.fetch(url);
      const data = await response.json();

      if (data.status !== "OK") {
        return res.status(400).json({ error: `Place details error: ${data.status}` });
      }

      const result = data.result || {};
      const responseData = {
        phone: result.formatted_phone_number || "",
        internationalPhone: result.international_phone_number || "",
        website: result.website || "",
        googleMapsUrl: result.url || "",
        openingHours: result.opening_hours?.weekday_text || [],
        isOpen: result.opening_hours?.open_now ?? null,
      };

      // Cache the response
      setCachedPlaceDetails(id, responseData);

      res.json(responseData);
    } catch (error) {
      console.error("Place details error:", error instanceof Error ? error.message : "Unknown error");
      res.status(500).json({ error: "Failed to fetch place details" });
    }
  });
}
