import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { getDb } from "./db/firestore.js";
import { addLearningItem, addLearningItemInputShape } from "./tools/addLearningItem.js";
import { searchLearningItems, searchLearningItemsInputShape } from "./tools/searchLearningItems.js";
import { getDueReviews, getDueReviewsInputShape } from "./tools/getDueReviews.js";
import { recordReviewResult, recordReviewResultInputShape } from "./tools/recordReviewResult.js";
import { resolveLegacyApiKeyUserId } from "./auth/users.js";
import { createKarte, createKarteInputShape, listKartes } from "./tools/kartes.js";

const db = getDb();

const server = new McpServer({
  name: "study-karte",
  version: "0.1.0",
});

server.registerTool(
  "create_karte",
  { title: "Create Karte", description: "目的別の学習カルテを作成する", inputSchema: createKarteInputShape },
  async (input) => ({ content: [{ type: "text", text: JSON.stringify(await createKarte(db, await resolveLegacyApiKeyUserId(db), input)) }] }),
);

server.registerTool(
  "list_kartes",
  { title: "List Kartes", description: "登録先をユーザーに選んでもらうため、目的別カルテを一覧取得する" },
  async () => ({ content: [{ type: "text", text: JSON.stringify(await listKartes(db, await resolveLegacyApiKeyUserId(db))) }] }),
);

server.registerTool(
  "add_learning_item",
  {
    title: "Add Learning Item",
    description: "選択済みの目的別カルテへ単語・表現・文法を登録する。karte_idが不明なら先にlist_kartesを使い、ユーザーに選択を求める",
    inputSchema: addLearningItemInputShape,
  },
  async (input) => {
    const item = await addLearningItem(db, await resolveLegacyApiKeyUserId(db), input);
    return {
      content: [{ type: "text", text: JSON.stringify(item) }],
    };
  },
);

server.registerTool(
  "get_due_reviews",
  {
    title: "Get Due Reviews",
    description: "現在復習すべきLearningItemを期限順に取得する。目的が指定された会話ではkarte_idで絞り込む",
    inputSchema: getDueReviewsInputShape,
  },
  async (input) => ({
    content: [{ type: "text", text: JSON.stringify(await getDueReviews(db, await resolveLegacyApiKeyUserId(db), input)) }],
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
    content: [{ type: "text", text: JSON.stringify(await recordReviewResult(db, await resolveLegacyApiKeyUserId(db), input)) }],
  }),
);

server.registerTool(
  "search_learning_items",
  {
    title: "Search Learning Items",
    description: "登録済みのLearningItemをカルテ・言語・種別で絞り込んで一覧取得する",
    inputSchema: searchLearningItemsInputShape,
  },
  async (input) => {
    const items = await searchLearningItems(db, await resolveLegacyApiKeyUserId(db), input);
    return {
      content: [{ type: "text", text: JSON.stringify(items) }],
    };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
