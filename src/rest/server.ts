import express, { type NextFunction, type Request, type Response } from "express";
import { getDb } from "../db/firestore.js";
import { addLearningItem } from "../tools/addLearningItem.js";
import { searchLearningItems } from "../tools/searchLearningItems.js";
import { getDueReviews } from "../tools/getDueReviews.js";
import { recordReviewResult } from "../tools/recordReviewResult.js";
import { z } from "zod";

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
app.use(express.json());
app.use(
  express.static("public", {
    extensions: ["html"],
    setHeaders: (res) => {
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Referrer-Policy", "same-origin");
    },
  }),
);

function requireApiKey(req: Request, res: Response, next: NextFunction): void {
  const expected = process.env.STUDY_KARTE_API_KEY;
  if (!expected || req.header("x-api-key") !== expected) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  next();
}

app.use(requireApiKey);

function handleError(res: Response, error: unknown): void {
  if (error instanceof z.ZodError) {
    res.status(400).json({ error: "invalid_input", details: error.issues });
    return;
  }
  const message = error instanceof Error ? error.message : "internal_error";
  const status = message.startsWith("LearningItem not found") ? 404 : 500;
  res.status(status).json({ error: message });
}

app.post("/learning-items", async (req: Request, res: Response) => {
  try {
    const item = await addLearningItem(db, req.body);
    res.status(201).json(item);
  } catch (error) {
    handleError(res, error);
  }
});

app.get("/learning-items", async (req: Request, res: Response) => {
  try {
    const items = await searchLearningItems(db, queryParams(req) as Parameters<typeof searchLearningItems>[1]);
    res.json(items);
  } catch (error) {
    handleError(res, error);
  }
});

app.get("/due-reviews", async (req: Request, res: Response) => {
  try {
    const items = await getDueReviews(db, queryParams(req) as Parameters<typeof getDueReviews>[1]);
    res.json(items);
  } catch (error) {
    handleError(res, error);
  }
});

app.post("/review-results", async (req: Request, res: Response) => {
  try {
    const event = await recordReviewResult(db, req.body);
    res.status(201).json(event);
  } catch (error) {
    handleError(res, error);
  }
});

const port = Number(process.env.PORT ?? 8081);
app.listen(port, () => {
  console.log(`study-karte REST API listening on :${port}`);
});
