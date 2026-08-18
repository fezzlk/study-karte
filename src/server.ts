import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createDb } from "./db/client.js";
import { addLearningItem, addLearningItemInputShape } from "./tools/addLearningItem.js";

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

const transport = new StdioServerTransport();
await server.connect(transport);
