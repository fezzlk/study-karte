import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { getDb } from "./db/firestore.js";
import { addLearningItem, addLearningItemInputShape } from "./tools/addLearningItem.js";
import { searchLearningItems, searchLearningItemsInputShape } from "./tools/searchLearningItems.js";
import { getDueReviews, getDueReviewsInputShape } from "./tools/getDueReviews.js";
import { recordReviewResult, recordReviewResultInputShape } from "./tools/recordReviewResult.js";

const db = getDb();

const server = new McpServer({
  name: "study-karte",
  version: "0.1.0",
});

server.registerTool(
  "add_learning_item",
  {
    title: "Add Learning Item",
    description: "新しく覚えたい単語・表現・文法をLearningItemとして登録する",
    inputSchema: addLearningItemInputShape,
  },
  async (input) => {
    const item = await addLearningItem(db, input);
    return {
      content: [{ type: "text", text: JSON.stringify(item) }],
    };
  },
);

server.registerTool(
  "get_due_reviews",
  {
    title: "Get Due Reviews",
    description: "現在復習すべきLearningItemを期限順に取得する",
    inputSchema: getDueReviewsInputShape,
  },
  async (input) => ({
    content: [{ type: "text", text: JSON.stringify(await getDueReviews(db, input)) }],
  }),
);

server.registerTool(
  "record_review_result",
  {
    title: "Record Review Result",
    description: "復習結果を保存し、習熟度と次回復習日を更新する",
    inputSchema: recordReviewResultInputShape,
  },
  async (input) => ({
    content: [{ type: "text", text: JSON.stringify(await recordReviewResult(db, input)) }],
  }),
);

server.registerTool(
  "search_learning_items",
  {
    title: "Search Learning Items",
    description: "登録済みのLearningItemを言語・種別で絞り込んで一覧取得する",
    inputSchema: searchLearningItemsInputShape,
  },
  async (input) => {
    const items = await searchLearningItems(db, input);
    return {
      content: [{ type: "text", text: JSON.stringify(items) }],
    };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
