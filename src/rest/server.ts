import express, { type NextFunction, type Request, type Response } from "express";
import { getDb } from "../db/firestore.js";
import { addLearningItem } from "../tools/addLearningItem.js";
import { searchLearningItems } from "../tools/searchLearningItems.js";
import { getDueReviews } from "../tools/getDueReviews.js";
import { recordReviewResult } from "../tools/recordReviewResult.js";
import { z } from "zod";
import { createRequireIdentity } from "../auth/requestAuth.js";
import { importLegacyData, LegacyImportError } from "../imports/legacyImport.js";

function queryParams(req: Request): Record<string, unknown> {
  const { language, type, limit } = req.query;
  const params: Record<string, unknown> = {};
  if (language !== undefined) params.language = language;
  if (type !== undefined) params.type = type;
  if (limit !== undefined) params.limit = Number(limit);
  return params;
}

const db = getDb();
const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(
  express.static("public", {
    extensions: ["html"],
    setHeaders: (res) => {
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Referrer-Policy", "same-origin");
    },
  }),
);

app.get("/auth/config", (_req: Request, res: Response) => {
  const apiKey = process.env.FIREBASE_WEB_API_KEY ?? "AIzaSyCwwjsyZvh4FXx4VhiFPi8BEzaOv-RCHBY";
  const appId = process.env.FIREBASE_WEB_APP_ID ?? "1:693814280333:web:81fe4dd39120c58e5ea2c4";
  const projectId = process.env.GCP_PROJECT_ID;
  if (!apiKey || !appId || !projectId) {
    res.status(503).json({ error: "authentication_not_configured" });
    return;
  }
  res.json({ apiKey, appId, projectId, authDomain: `${projectId}.firebaseapp.com` });
});

app.use(createRequireIdentity(db));

app.get("/auth/session", (req: Request, res: Response) => {
  res.json({ user: req.identity?.user, method: req.identity?.method });
});

app.post("/imports/legacy", async (req: Request, res: Response) => {
  if (req.identity?.method !== "firebase") {
    res.status(403).json({ error: "interactive_login_required" });
    return;
  }
  try {
    res.json(await importLegacyData(db, req.identity.userId, req.body));
  } catch (error) {
    handleError(res, error);
  }
});

function handleError(res: Response, error: unknown): void {
  if (error instanceof z.ZodError) {
    res.status(400).json({ error: "invalid_input", details: error.issues });
    return;
  }
  if (error instanceof LegacyImportError) {
    res.status(error.status).json({ error: error.message });
    return;
  }
  const message = error instanceof Error ? error.message : "internal_error";
  const status = message.startsWith("LearningItem not found") ? 404 : 500;
  res.status(status).json({ error: message });
}

app.post("/learning-items", async (req: Request, res: Response) => {
  try {
    const item = await addLearningItem(db, req.identity!.userId, req.body);
    res.status(201).json(item);
  } catch (error) {
    handleError(res, error);
  }
});

app.get("/learning-items", async (req: Request, res: Response) => {
  try {
    const items = await searchLearningItems(
      db,
      req.identity!.userId,
      queryParams(req) as Parameters<typeof searchLearningItems>[2],
    );
    res.json(items);
  } catch (error) {
    handleError(res, error);
  }
});

app.get("/due-reviews", async (req: Request, res: Response) => {
  try {
    const items = await getDueReviews(
      db,
      req.identity!.userId,
      queryParams(req) as Parameters<typeof getDueReviews>[2],
    );
    res.json(items);
  } catch (error) {
    handleError(res, error);
  }
});

app.post("/review-results", async (req: Request, res: Response) => {
  try {
    const event = await recordReviewResult(db, req.identity!.userId, req.body);
    res.status(201).json(event);
  } catch (error) {
    handleError(res, error);
  }
});

const port = Number(process.env.PORT ?? 8081);
app.listen(port, () => {
  console.log(`study-karte REST API listening on :${port}`);
});
