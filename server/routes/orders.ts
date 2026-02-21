import type { Express, Request, Response } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { requireAuth } from "./middleware";

const createOrderSchema = z.object({
  pharmacyName: z.string(),
  pharmacyPhone: z.string().optional(),
  pharmacyAddress: z.string().optional(),
  pharmacyPlaceId: z.string().optional(),
  medicineName: z.string(),
  medicineDosage: z.string().optional(),
  medicineFrequency: z.string().optional(),
  quantity: z.number().default(1),
  deliveryAddress: z.string(),
  patientName: z.string(),
  patientPhone: z.string(),
  notes: z.string().optional(),
});

export function registerOrderRoutes(app: Express): void {
  app.post("/api/orders", requireAuth, async (req: Request, res: Response) => {
    try {
      const validation = createOrderSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: "Invalid order data", details: validation.error.issues.map(i => i.message) });
      }
      const order = await storage.createOrder({
        ...validation.data,
        userId: req.userId!,
        status: "pending",
      });
      await storage.logAuditEvent({
        userId: req.userId!,
        action: "create",
        resourceType: "order",
        resourceId: order.id,
        ipAddress: req.ip,
      });
      return res.status(201).json(order);
    } catch (error) {
      console.error("Create order error:", error instanceof Error ? error.message : "Unknown error");
      return res.status(500).json({ error: "Failed to create order" });
    }
  });

  app.get("/api/orders", requireAuth, async (req: Request, res: Response) => {
    try {
      const orders = await storage.getUserOrders(req.userId!);
      return res.json(orders);
    } catch (error) {
      console.error("Get orders error:", error instanceof Error ? error.message : "Unknown error");
      return res.status(500).json({ error: "Failed to fetch orders" });
    }
  });

  app.get("/api/orders/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const orderId = req.params.id as string;
      const order = await storage.getOrder(orderId);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }
      if (order.userId !== req.userId) {
        return res.status(403).json({ error: "Access denied" });
      }
      return res.json(order);
    } catch (error) {
      console.error("Get order error:", error instanceof Error ? error.message : "Unknown error");
      return res.status(500).json({ error: "Failed to fetch order" });
    }
  });

  const VALID_TRANSITIONS: Record<string, string[]> = {
    pending: ["confirmed", "cancelled"],
    confirmed: ["delivered", "cancelled"],
    delivered: [],
    cancelled: [],
  };

  app.patch("/api/orders/:id/status", requireAuth, async (req: Request, res: Response) => {
    try {
      const orderId = req.params.id as string;
      const { status } = req.body;
      if (!status || typeof status !== "string") {
        return res.status(400).json({ error: "Status is required" });
      }
      const order = await storage.getOrder(orderId);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }
      if (order.userId !== req.userId) {
        return res.status(403).json({ error: "Access denied" });
      }
      const allowed = VALID_TRANSITIONS[order.status] || [];
      if (!allowed.includes(status)) {
        return res.status(400).json({ error: `Cannot transition from '${order.status}' to '${status}'` });
      }
      const updatedOrder = await storage.updateOrder(orderId, { status });
      await storage.logAuditEvent({
        userId: req.userId!,
        action: status,
        resourceType: "order",
        resourceId: orderId,
        ipAddress: req.ip,
      });
      return res.json(updatedOrder);
    } catch (error) {
      console.error("Update order status error:", error instanceof Error ? error.message : "Unknown error");
      return res.status(500).json({ error: "Failed to update order status" });
    }
  });

  app.patch("/api/orders/:id/cancel", requireAuth, async (req: Request, res: Response) => {
    try {
      const orderId = req.params.id as string;
      const order = await storage.getOrder(orderId);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }
      if (order.userId !== req.userId) {
        return res.status(403).json({ error: "Access denied" });
      }
      const allowed = VALID_TRANSITIONS[order.status] || [];
      if (!allowed.includes("cancelled")) {
        return res.status(400).json({ error: `Cannot cancel order with status '${order.status}'` });
      }
      const updatedOrder = await storage.updateOrder(orderId, { status: "cancelled" });
      await storage.logAuditEvent({
        userId: req.userId!,
        action: "cancel",
        resourceType: "order",
        resourceId: orderId,
        ipAddress: req.ip,
      });
      return res.json(updatedOrder);
    } catch (error) {
      console.error("Cancel order error:", error instanceof Error ? error.message : "Unknown error");
      return res.status(500).json({ error: "Failed to cancel order" });
    }
  });
}
