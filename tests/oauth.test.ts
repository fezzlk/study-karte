import { describe, expect, it } from "vitest";
import { isAllowedChatGptRedirect } from "../src/auth/oauth.js";

describe("OAuth redirect validation", () => {
  it("accepts only ChatGPT OAuth callbacks", () => {
    expect(isAllowedChatGptRedirect("https://chatgpt.com/aip/g-example_123/oauth/callback")).toBe(true);
    expect(isAllowedChatGptRedirect("https://chat.openai.com/aip/g-example/oauth/callback")).toBe(true);
    expect(isAllowedChatGptRedirect("https://evil.example/aip/g-example/oauth/callback")).toBe(false);
    expect(isAllowedChatGptRedirect("https://chatgpt.com.evil.example/aip/g-example/oauth/callback")).toBe(false);
    expect(isAllowedChatGptRedirect("http://chatgpt.com/aip/g-example/oauth/callback")).toBe(false);
  });
});
