import { expect, test, type Page } from "@playwright/test";

async function mockWorkspace(page: Page) {
  let current = { workspaceId: crypto.randomUUID(), accessToken: crypto.randomUUID(), pageGeneration: crypto.randomUUID() };
  await page.route("**/api/workspaces", async (route) => {
    const body = route.request().postDataJSON() as { action: "create" | "resume"; credentials?: { workspaceId: string; accessToken: string } };
    if (body.action === "resume") {
      if (body.credentials?.workspaceId !== current.workspaceId || body.credentials.accessToken !== current.accessToken) {
        return route.fulfill({ status: 401, json: { error: "Workspace unavailable or expired." } });
      }
      current = { ...current, pageGeneration: crypto.randomUUID() };
    } else {
      current = { workspaceId: crypto.randomUUID(), accessToken: crypto.randomUUID(), pageGeneration: crypto.randomUUID() };
    }
    await route.fulfill({ status: body.action === "create" ? 201 : 200, json: current });
  });
  await page.route("**/api/workspaces/lifecycle", async (route) => route.fulfill({ status: 204 }));
  await page.route("**/api/files", async (route) => route.fulfill({ json: { files: [], maxSizeMb: 10 } }));
  await page.route("**/api/conversations", async (route) => route.fulfill({ json: { conversations: [] } }));
}


test.beforeEach(async ({ page }) => { await mockWorkspace(page); });

const fileId = "11111111-1111-4111-8111-111111111111";
const secondId = "33333333-3333-4333-8333-333333333333";
const chatId = "22222222-2222-4222-8222-222222222222";
const answer = "Ava studied data science at the University of Tehran in 2021 and later built forecasting models, dashboards, and analytics tools for her team [1].";
const files = [{ id: fileId, filename: "field-notes.txt", status: "embedded", error: null, size: 128 }];
const history = { id: chatId, fileId, sourceFilename: "field-notes.txt", sourceRemovedAt: null, title: "Where did Ava study?", selectedModel: "openai:gpt-4.1-mini", updatedAt: new Date().toISOString() };
const citations = [{ chunkId: "chunk-1", label: "Source 1", passage: "Ava studied at the University of Tehran.", pageNumber: 7 }];
const tab = (page: Page) => page.getByRole("button", { name: "Upload and choose documents" });
const drawer = (page: Page) => page.getByRole("dialog", { name: "Your documents" });
const question = (page: Page) => page.getByRole("textbox", { name: "Ask a question about your document" });

async function readyFile(page: Page) {
  await page.route("**/api/files", (route) => route.fulfill({ json: { files, maxSizeMb: 10 } }));
  await page.goto("/");
  await tab(page).click();
  await page.getByRole("button", { name: "Chat with field-notes.txt" }).click();
  await expect(drawer(page)).not.toBeVisible();
  await expect(question(page)).toBeFocused();
}
async function mockAnswer(page: Page) {
  await page.route("**/api/chat/stream", async (route) => {
    const frames = [
      { type: "phase", phase: "generating" }, { type: "delta", text: answer },
      { type: "done", result: { conversationId: chatId, answer, modelId: "openai:gpt-4.1-mini", citations } },
    ];
    await route.fulfill({ contentType: "text/event-stream; charset=utf-8", body: frames.map((frame) =>
      "event: " + frame.type + "\ndata: " + JSON.stringify(frame) + "\n\n").join("") });
  });
}

test("cherry hero is dark, accessible, and preserves the workspace on refresh", async ({ page }, testInfo) => {
  const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "DocLens" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add a document to begin" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "New chat", exact: true })).toBeDisabled();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(page.locator(".workspace-sidebar")).toHaveCSS("width", "280px");
  await expect(page.locator(".main-panel")).toHaveCSS("border-radius", "32px");
  const original = await page.evaluate(() => JSON.parse(sessionStorage.getItem("doclens.workspace.v1")!).workspaceId);
  await page.screenshot({ animations: "disabled", path: testInfo.outputPath("hero-desktop.png") });
  await page.getByRole("button", { name: "Add a document to begin" }).click();
  await expect(drawer(page)).toBeVisible();
  await page.screenshot({ animations: "disabled", path: testInfo.outputPath("drawer-desktop.png") });
  for (let index = 0; index < 6; index++) {
    await page.keyboard.press("Tab");
    expect(await drawer(page).evaluate((element) => element.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(drawer(page)).not.toBeVisible();
  await expect(tab(page)).toBeFocused();
  await page.reload();
  await expect(page.getByRole("button", { name: "Add a document to begin" })).toBeEnabled();
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem("doclens.workspace.v1")!).workspaceId)).toBe(original);
  expect(errors).toEqual([]);
});

test("mobile bottom sheet and tablet rail fit without horizontal overflow", async ({ page }, testInfo) => {
  for (const width of [1024, 768, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    await expect(tab(page)).toBeEnabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    await page.keyboard.press("Control+u");
    await expect(drawer(page)).toBeVisible();
    const box = await drawer(page).boundingBox();
    if (width === 390) { expect(box!.width).toBe(390); expect(box!.height).toBeCloseTo(844 * .62, 0); }
    else { expect(box!.width).toBeGreaterThanOrEqual(380); await expect(page.locator(".workspace-sidebar")).toHaveCSS("width", "72px"); }
    await page.screenshot({ animations: "disabled", path: testInfo.outputPath("drawer-" + width + ".png") });
    await page.keyboard.press("Escape"); await expect(drawer(page)).not.toBeVisible();
    if (width === 390) {
      await page.getByRole("button", { name: "Open chat history" }).click();
      await expect(page.getByRole("dialog", { name: "Chat history" })).toBeVisible();
      await page.keyboard.press("Escape");
    }
  }
});

test("bursted frames dissolve progressively then expose source passages and actions", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await mockAnswer(page); await readyFile(page);
  await page.getByLabel("Chat model").selectOption("anthropic:claude-haiku-4-5-20251001");
  await question(page).fill("Where did Ava study?");
  const request = page.waitForRequest("**/api/chat/stream");
  await page.getByRole("button", { name: "Send question" }).click();
  expect((await request).postDataJSON().modelId).toBe("anthropic:claude-haiku-4-5-20251001");
  const partial = await page.waitForFunction((length) => {
    const text = document.querySelector('[data-testid="streaming-answer"]')?.textContent ?? "";
    return text.length > 0 && text.length < length ? text : false;
  }, answer.length);
  expect((await partial.jsonValue() as string).length).toBeLessThan(answer.length);
  await expect(page.getByTestId("streaming-answer").locator(".answer-token-dissolve").first()).toHaveCSS("animation-name", "answer-token-dissolve");
  await expect(page.getByText(answer, { exact: true })).toBeVisible();
  await expect(page.locator(".main-brand h1")).toHaveCSS("font-size", "19px");
  await page.getByRole("button", { name: "p. 7", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Source 1" })).toContainText(citations[0].passage);
  await page.screenshot({ animations: "disabled", path: testInfo.outputPath("chat-source-desktop.png") });
  await page.keyboard.press("Escape");
  await page.locator(".answer-message").hover();
  await expect(page.getByRole("button", { name: "Copy answer" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Regenerate answer" })).toBeEnabled();
  await page.setViewportSize({ width: 390, height: 844 });
  await question(page).fill("Another question");
  const sendBox = await page.getByRole("button", { name: "Send question" }).boundingBox();
  expect(sendBox!.width).toBeGreaterThanOrEqual(44);
  expect(sendBox!.height).toBeGreaterThanOrEqual(44);
  await question(page).fill("");
  await page.screenshot({ animations: "disabled", path: testInfo.outputPath("chat-mobile.png") });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});

test("stop interrupts the visible stream without an error", async ({ page }) => {
  await mockAnswer(page); await readyFile(page);
  await question(page).fill("Where did Ava study?");
  await page.getByRole("button", { name: "Send question" }).click();
  await expect(page.getByTestId("streaming-answer")).toBeVisible();
  await page.getByRole("button", { name: "Stop answer" }).click();
  await expect(page.getByTestId("streaming-answer")).not.toBeVisible();
  // Ignore the empty Next.js route-announcement alert outside the workspace.
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
  await expect(question(page)).toBeEnabled();
});

test("multiple uploads validate files and expose reading and ready states", async ({ page }) => {
  let uploads = 0; let completedUploads = 0; let release: (() => void) | undefined;
  const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/files", async (route) => {
    if (route.request().method() === "POST") {
      uploads++; await held; completedUploads++;
      return route.fulfill({ status: 201, json: { file: { id: fileId } } });
    }
    // Intercepted XHR has no native upload progress; model server processing until completion.
    return route.fulfill({ json: { files: uploads ? [{ ...files[0], status: completedUploads === uploads ? "embedded" : "pending" }] : [], maxSizeMb: 10 } });
  });
  await page.goto("/"); await tab(page).click();
  await drawer(page).getByLabel("Choose documents to upload").setInputFiles([
    { name: "wrong.png", mimeType: "image/png", buffer: Buffer.from("image") },
    { name: "field-notes.txt", mimeType: "text/plain", buffer: Buffer.from("Synthetic note") },
    { name: "more.md", mimeType: "text/markdown", buffer: Buffer.from("# More synthetic notes") },
  ]);
  await expect(drawer(page).getByText("This file type isn't supported. Use PDF, DOCX, TXT or MD.")).toBeVisible();
  await expect(drawer(page).getByText("Reading the document…").first()).toBeVisible();
  release!();
  await expect.poll(() => uploads).toBe(2);
  await expect(drawer(page).getByRole("status")).toContainText("2 documents ready");
  await expect(drawer(page).getByRole("button", { name: "Chat with field-notes.txt" })).toBeEnabled();
  await drawer(page).getByRole("button", { name: "Remove wrong.png" }).click();
  await expect(drawer(page).getByText("wrong.png")).not.toBeVisible();
});

test("window file drop opens the drawer and uploads the document", async ({ page }) => {
  let uploaded = false;
  await page.route("**/api/files", async (route) => {
    if (route.request().method() === "POST") { uploaded = true; return route.fulfill({ status: 201, json: { file: { id: fileId } } }); }
    return route.fulfill({ json: { files: uploaded ? files : [], maxSizeMb: 10 } });
  });
  await page.goto("/"); await expect(tab(page)).toBeEnabled();
  const data = await page.evaluateHandle(() => {
    const transfer = new DataTransfer(); transfer.items.add(new File(["A grounded note."], "field-notes.txt", { type: "text/plain" })); return transfer;
  });
  await page.locator("body").dispatchEvent("dragenter", { dataTransfer: data });
  await expect(drawer(page)).toBeVisible();
  await expect(page.getByTestId("upload-dropzone")).toHaveClass(/is-dragging/);
  await page.getByTestId("upload-dropzone").dispatchEvent("drop", { dataTransfer: data });
  await expect(drawer(page).getByRole("button", { name: "Chat with field-notes.txt" })).toBeEnabled();
  expect(uploaded).toBe(true);
});

test("document menus rename and delete while keeping the conversation read-only", async ({ page }) => {
  let filename = "field-notes.txt"; let removed = false;
  const getChat = () => ({ ...history, sourceFilename: filename, fileId: removed ? null : fileId, sourceRemovedAt: removed ? new Date().toISOString() : null });
  await page.route("**/api/files", (route) => route.fulfill({ json: { files: removed ? [] : [{ ...files[0], filename }], maxSizeMb: 10 } }));
  await page.route("**/api/files/" + fileId, async (route) => {
    if (route.request().method() === "PATCH") filename = route.request().postDataJSON().filename;
    if (route.request().method() === "DELETE") removed = true;
    await route.fulfill({ json: { ok: true } });
  });
  await page.route("**/api/conversations", (route) => route.fulfill({ json: { conversations: [getChat()] } }));
  await page.route("**/api/conversations/" + chatId, (route) => route.fulfill({ json: { conversation: getChat(), messages: [
    { id: "q", role: "user", content: history.title, citations: [] },
    { id: "a", role: "assistant", content: answer, citations: removed ? [{ ...citations[0], passage: undefined, sourceUnavailable: true }] : citations },
  ] } }));
  await page.goto("/"); await expect(page.getByText(answer, { exact: true })).toBeVisible();
  await tab(page).click();
  const row = drawer(page).getByRole("listitem").filter({ hasText: filename });
  await row.hover(); await row.getByRole("button", { name: "Actions for field-notes.txt" }).click();
  await page.getByRole("menuitem", { name: "Rename" }).click();
  await page.getByRole("textbox", { name: "New name" }).fill("renamed.txt");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(drawer(page).getByText("renamed.txt", { exact: true })).toBeVisible();
  await drawer(page).getByRole("listitem").hover();
  await page.getByRole("button", { name: "Actions for renamed.txt" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await drawer(page).getByRole("button", { name: "Cancel", exact: true }).click();
  expect(removed).toBe(false);
  await page.getByRole("button", { name: "Actions for renamed.txt" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await drawer(page).getByRole("button", { name: "Delete", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "This document was removed. Chats about it are read-only." })).toBeDisabled();
  await page.getByRole("button", { name: "p. 7", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Source 1" })).toContainText("The source file was removed");
  await page.keyboard.press("Escape"); await page.reload();
  await expect(page.getByRole("button", { name: "This document was removed. Chats about it are read-only." })).toBeVisible();
});

test("switching documents confirms a new thread and preserves selection on refresh", async ({ page }) => {
  await page.route("**/api/files", (route) => route.fulfill({ json: { files: [...files, { ...files[0], id: secondId, filename: "second.txt" }], maxSizeMb: 10 } }));
  await mockAnswer(page);
  await page.goto("/"); await tab(page).click(); await page.getByRole("button", { name: "Chat with field-notes.txt" }).click();
  await question(page).fill("Where did Ava study?"); await page.getByRole("button", { name: "Send question" }).click();
  await expect(page.getByText(answer, { exact: true })).toBeVisible();
  await tab(page).click(); await page.getByRole("button", { name: "Chat with second.txt" }).click();
  await expect(drawer(page).getByText("Start a new chat with this document?")).toBeVisible();
  await drawer(page).getByRole("button", { name: "Start chat" }).click();
  await expect(page.getByText(answer, { exact: true })).not.toBeVisible();
  await expect(question(page)).toHaveAttribute("placeholder", "Ask about second.txt");
  await page.reload(); await expect(question(page)).toHaveAttribute("placeholder", "Ask about second.txt");
});

test("Persian text and reduced motion remain readable", async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/api/files", (route) => route.fulfill({ json: { files, maxSizeMb: 10 } }));
  await page.route("**/api/conversations", (route) => route.fulfill({ json: { conversations: [history] } }));
  await page.route("**/api/conversations/" + chatId, (route) => route.fulfill({ json: { conversation: history, messages: [
    { id: "q", role: "user", content: "نتیجه چیست؟", citations: [] },
    { id: "a", role: "assistant", content: "پاسخ مستند در متن آمده است [1].", citations },
  ] } }));
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto("/");
  await expect(page.locator(".answer-message .message-bubble")).toHaveCSS("direction", "rtl");
  await expect(page.locator(".question-message .message-bubble")).toHaveCSS("direction", "rtl");
  await expect(page.locator(".answer-message")).toHaveCSS("animation-duration", "0.12s");
  await page.screenshot({ animations: "disabled", path: testInfo.outputPath("persian-mobile.png") });
  await tab(page).click(); await expect(drawer(page)).toHaveCSS("animation-name", "fade-in");
});

test("liveness responds without provider keys or a database request", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.ok()).toBe(true);
  expect(await response.json()).toEqual({ status: "ok", service: "doclens" });
});

test("each browser tab receives an isolated anonymous workspace", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => page.evaluate(() => Boolean(sessionStorage.getItem("doclens.workspace.v1")))).toBe(true);
  const firstTabWorkspaceId = await page.evaluate(
    () => (JSON.parse(sessionStorage.getItem("doclens.workspace.v1") ?? "{}") as { workspaceId: string }).workspaceId,
  );
  const copiedSession = await page.evaluate(() => sessionStorage.getItem("doclens.workspace.v1"));
  const otherTab = await page.context().newPage();
  await mockWorkspace(otherTab);
  await otherTab.addInitScript((stored) => sessionStorage.setItem("doclens.workspace.v1", stored), copiedSession!);
  await otherTab.goto("/");
  await expect.poll(() => otherTab.evaluate(
    () => (JSON.parse(sessionStorage.getItem("doclens.workspace.v1") ?? "{}") as { workspaceId?: string }).workspaceId,
  ), { timeout: 30_000 }).not.toBe(firstTabWorkspaceId);
  await expect(otherTab.getByRole("heading", { name: "DocLens" })).toBeVisible();
  await otherTab.close();
});

test("page departure sends a close hint and a fresh tab gets a new workspace", async ({ page }) => {
  const closeHints: Array<{ action: string; pageGeneration: string }> = [];
  await page.route("**/api/workspaces/lifecycle", async (route) => {
    closeHints.push(route.request().postDataJSON() as { action: string; pageGeneration: string });
    await route.fulfill({ status: 204 });
  });
  await page.goto("/");
  await expect(tab(page)).toBeEnabled();
  const original = await page.evaluate(() => JSON.parse(sessionStorage.getItem("doclens.workspace.v1") ?? "{}") as {
    workspaceId: string; pageGeneration: string;
  });
  await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
  await expect.poll(() => closeHints.some((hint) => hint.action === "close" && hint.pageGeneration === original.pageGeneration)).toBe(true);
  await page.close();

  const freshTab = await page.context().newPage();
  await mockWorkspace(freshTab);
  await freshTab.goto("/");
  await expect(tab(freshTab)).toBeEnabled();
  const freshId = await freshTab.evaluate(() => (JSON.parse(sessionStorage.getItem("doclens.workspace.v1") ?? "{}") as { workspaceId: string }).workspaceId);
  expect(freshId).not.toBe(original.workspaceId);
  await freshTab.close();
});
test("expired saved workspace stays ended instead of silently creating a new one", async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem("doclens.workspace.v1", JSON.stringify({
    workspaceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    accessToken: "expired-token",
    pageGeneration: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  })));
  let createCalls = 0;
  await page.route("**/api/workspaces", async (route) => {
    const body = route.request().postDataJSON() as { action: string };
    if (body.action === "create") createCalls += 1;
    await route.fulfill({ status: 401, json: { error: "Workspace unavailable or expired." } });
  });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "This workspace has ended. Reload to start again." })).toBeVisible();
  expect(createCalls).toBe(0);
  expect(await page.evaluate(() => sessionStorage.getItem("doclens.workspace.v1"))).toBeNull();
});
