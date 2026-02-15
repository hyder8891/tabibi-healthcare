import type { Express } from "express";
import { createServer, type Server } from "node:http";
import { registerAuthRoutes } from "./routes/auth";
import { registerAiRoutes } from "./routes/ai";
import { registerRppgRoutes } from "./routes/rppg";
import { registerGeoRoutes } from "./routes/geo";
import { registerOrderRoutes } from "./routes/orders";
import { registerAvicennaRoutes } from "./routes/avicenna";
import { seedIraqiKnowledge } from "./seed-iraqi-knowledge";

export async function registerRoutes(app: Express): Promise<Server> {
  registerAuthRoutes(app);
  registerAiRoutes(app);
  registerRppgRoutes(app);
  registerGeoRoutes(app);
  registerOrderRoutes(app);
  registerAvicennaRoutes(app);

  seedIraqiKnowledge().catch(err =>
    console.error("Knowledge seed error:", err instanceof Error ? err.message : "Unknown")
  );

  const httpServer = createServer(app);
  return httpServer;
}
