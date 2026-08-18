import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createDb } from "./db/client.js";
import { addLearningItem, addLearningItemInputShape } from "./tools/addLearningItem.js";
import { searchLearningItems, searchLearningItemsInputShape } from "./tools/searchLearningItems.js";

const db = createDb();

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
    const item = addLearningItem(db, input);
    return {
      content: [{ type: "text", text: JSON.stringify(item) }],
    };
  },
);

server.registerTool(
  "search_learning_items",
  {
    title: "Search Learning Items",
    description: "登録済みのLearningItemを言語・種別で絞り込んで一覧取得する",
    inputSchema: searchLearningItemsInputShape,
  },
  async (input) => {
    const items = searchLearningItems(db, input);
    return {
      content: [{ type: "text", text: JSON.stringify(items) }],
    };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
