import type { Express } from "express";
import { createServer, type Server } from "node:http";
import { registerAuthRoutes } from "./routes/auth";
import { registerAiRoutes } from "./routes/ai";
import { registerRppgRoutes } from "./routes/rppg";
import { registerGeoRoutes } from "./routes/geo";
import { registerOrderRoutes } from "./routes/orders";

export async function registerRoutes(app: Express): Promise<Server> {
  registerAuthRoutes(app);
  registerAiRoutes(app);
  registerRppgRoutes(app);
  registerGeoRoutes(app);
  registerOrderRoutes(app);

  const httpServer = createServer(app);
  return httpServer;
}
