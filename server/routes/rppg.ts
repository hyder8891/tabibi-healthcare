import type { Express, Request, Response } from "express";
import { z } from "zod";
import { Worker } from "worker_threads";
import path from "path";
import { requireAuth } from "./middleware";

const rppgSchema = z.object({
  signals: z.array(z.object({
    r: z.number(),
    g: z.number(),
    b: z.number(),
  })).min(30).max(1000),
  fps: z.number().min(1).max(60).optional(),
});

function processInWorker(signals: Array<{r: number, g: number, b: number}>, fps?: number): Promise<any> {
  return new Promise((resolve, reject) => {
    const workerPath = path.resolve(__dirname, "../rppg-worker.js");
    const worker = new Worker(workerPath, {
      workerData: { signals, fps },
    });

    const timeout = setTimeout(() => {
      worker.terminate();
      reject(new Error("Processing timeout"));
    }, 10000);

    worker.on("message", (result) => {
      clearTimeout(timeout);
      resolve(result);
    });

    worker.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    worker.on("exit", (code) => {
      if (code !== 0) {
        clearTimeout(timeout);
        reject(new Error(`Worker exited with code ${code}`));
      }
    });
  });
}

export function registerRppgRoutes(app: Express): void {
  app.post("/api/process-rppg", requireAuth, async (req: Request, res: Response) => {
    try {
      const validation = rppgSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          error: "At least 30 RGB signal samples are required (10+ seconds of data)" 
        });
      }

      const result = await processInWorker(validation.data.signals, validation.data.fps);
      res.json(result);
    } catch (error) {
      console.error("rPPG processing error:", error instanceof Error ? error.message : "Unknown error");
      if (error instanceof Error && error.message === "Processing timeout") {
        res.status(504).json({ error: "Processing took too long, please try again" });
      } else {
        res.status(500).json({ error: "Failed to process heart rate data" });
      }
    }
  });
}
