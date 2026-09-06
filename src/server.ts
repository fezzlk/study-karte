import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { getDb } from "./db/firestore.js";
import { addLearningItem, addLearningItemInputShape, KarteSelectionRequiredError } from "./tools/addLearningItem.js";
import { moveLearningItem, moveLearningItemInputShape } from "./tools/moveLearningItem.js";
import { searchLearningItems, searchLearningItemsInputShape } from "./tools/searchLearningItems.js";
import { getDueReviews, getDueReviewsInputShape } from "./tools/getDueReviews.js";
import { recordReviewResult, recordReviewResultInputShape } from "./tools/recordReviewResult.js";
import { resolveLegacyApiKeyUserId } from "./auth/users.js";
import {
  createKarte,
  createKarteInputShape,
  getDefaultKarteId,
  listKartes,
  mergeKartes,
  mergeKartesInputShape,
  setDefaultKarte,
  setDefaultKarteInputShape,
  updateKarte,
  updateKarteInputShape,
} from "./tools/kartes.js";

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
    description:
      "選択済みの目的別カルテへ単語・表現・文法を登録する。karte_idを省略すると利用者の既定カルテへ登録する。" +
      "既定未設定でkarte_idも不明なら推測せず、list_kartesの結果を含むエラーを返すのでユーザーに選択を求める",
    inputSchema: addLearningItemInputShape,
  },
  async (input) => {
    try {
      const item = await addLearningItem(db, await resolveLegacyApiKeyUserId(db), input);
      return { content: [{ type: "text", text: JSON.stringify(item) }] };
    } catch (error) {
      if (error instanceof KarteSelectionRequiredError) {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: "karte_selection_required", kartes: error.kartes }) }],
        };
      }
      throw error;
    }
  },
);

server.registerTool(
  "move_learning_item",
  {
    title: "Move Learning Item",
    description: "登録済みのLearningItemを別の目的別カルテへ移動する",
    inputSchema: moveLearningItemInputShape,
  },
  async (input) => ({
    content: [{ type: "text", text: JSON.stringify(await moveLearningItem(db, await resolveLegacyApiKeyUserId(db), input)) }],
  }),
);

server.registerTool(
  "update_karte",
  {
    title: "Update Karte",
    description: "カルテの名称変更・説明変更・アーカイブ/復元を行う",
    inputSchema: updateKarteInputShape,
  },
  async (input) => ({
    content: [{ type: "text", text: JSON.stringify(await updateKarte(db, await resolveLegacyApiKeyUserId(db), input)) }],
  }),
);

server.registerTool(
  "merge_kartes",
  {
    title: "Merge Kartes",
    description: "統合元カルテの学習項目を統合先カルテへ移し、統合元カルテを削除する",
    inputSchema: mergeKartesInputShape,
  },
  async (input) => ({
    content: [{ type: "text", text: JSON.stringify(await mergeKartes(db, await resolveLegacyApiKeyUserId(db), input)) }],
  }),
);

server.registerTool(
  "get_default_karte",
  { title: "Get Default Karte", description: "利用者が保存した既定カルテIDを取得する" },
  async () => ({
    content: [{ type: "text", text: JSON.stringify({ karte_id: await getDefaultKarteId(db, await resolveLegacyApiKeyUserId(db)) }) }],
  }),
);

server.registerTool(
  "set_default_karte",
  {
    title: "Set Default Karte",
    description: "以後karte_id省略時に使う既定カルテを保存する",
    inputSchema: setDefaultKarteInputShape,
  },
  async (input) => ({
    content: [{ type: "text", text: JSON.stringify(await setDefaultKarte(db, await resolveLegacyApiKeyUserId(db), input)) }],
  }),
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
