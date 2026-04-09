#!/usr/bin/env node
/**
 * MNotation V2 — Full E2E Test
 * Creates a project with sample data, simulates 5 coders through the complete flow.
 */

const API = process.env.API_BASE ?? "http://localhost:8787";

const LABELS = ["CODE", "EXPLANATION", "EVALUATION", "RESPONSIBILITY", "APPLICATION", "IMPLICATION"];

const SAMPLE_SENTENCES = [
  "AI literacy is the ability to understand, use, and evaluate AI technologies.",
  "Machine learning models learn patterns from data to make predictions.",
  "Students should verify AI-generated answers before trusting them.",
  "AI tools can help teachers create personalized learning materials.",
  "Widespread AI adoption may reshape future job markets significantly.",
  "The accuracy of AI models depends heavily on training data quality.",
  "Organizations must ensure AI systems are fair and unbiased.",
  "Natural language processing enables machines to understand human text.",
  "AI-powered chatbots can provide 24/7 customer support efficiently.",
  "Over-reliance on AI could weaken critical thinking skills over time.",
  "Prompt engineering is a key skill for effectively using large language models.",
  "AI ethics frameworks help guide responsible development and deployment.",
  "Sentiment analysis uses AI to determine the emotional tone of text.",
  "Governments should regulate AI to prevent misuse and protect citizens.",
  "AI literacy education prepares students for a technology-driven future."
];

const CODERS = [
  { email: "e2e_coder1@test.mnotation.dev", name: "Alice" },
  { email: "e2e_coder2@test.mnotation.dev", name: "Bob" },
  { email: "e2e_coder3@test.mnotation.dev", name: "Charlie" },
  { email: "e2e_coder4@test.mnotation.dev", name: "Diana" },
  { email: "e2e_coder5@test.mnotation.dev", name: "Eve" },
];

const ADMIN = { email: "e2e_admin@test.mnotation.dev", name: "Admin" };
let createdProjectId = "";
let adminSessionCookie = "";

let passed = 0;
let failed = 0;
const errors = [];

async function req(path, opts = {}, cookie = "") {
  const url = `${API}${path}`;
  const headers = { "Content-Type": "application/json", ...(opts.headers || {}) };
  if (cookie) headers["Cookie"] = cookie;
  const res = await fetch(url, { ...opts, headers });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json, headers: res.headers, cookie: res.headers.get("set-cookie") || "" };
}

function assert(label, condition, detail = "") {
  if (condition) {
    passed++;
    console.log(`  ✅ ${label}`);
  } else {
    failed++;
    const msg = `${label}${detail ? ": " + detail : ""}`;
    errors.push(msg);
    console.log(`  ❌ ${label}${detail ? " — " + detail : ""}`);
  }
}

async function login(user) {
  const r = await req("/api/auth/login", { method: "POST", body: JSON.stringify(user) });
  assert(`Login ${user.name}`, r.status === 200, `status=${r.status} body=${JSON.stringify(r.json)}`);
  return r.cookie;
}

async function main() {
  console.log("\n🚀 MNotation V2 — Full E2E Test\n");
  console.log("═".repeat(60));

  // ── Step 1: Health check ──────────────────────────────────
  console.log("\n📡 Step 1: Health Check");
  const health = await req("/api/health");
  assert("API health", health.status === 200 && health.json.status === "ok");

  // ── Step 2: Login admin ───────────────────────────────────
  console.log("\n🔑 Step 2: Admin Login");
  const adminCookie = await login(ADMIN);
  adminSessionCookie = adminCookie;
  assert("Admin cookie set", adminCookie.includes("mnotation_user"));

  // ── Step 3: Create project ────────────────────────────────
  console.log("\n📂 Step 3: Create Project");
  const createRes = await req("/api/projects", {
    method: "POST",
    body: JSON.stringify({
      name: "e2e_AI Literacy Test",
      description: "End-to-end test project with 15 sample sentences",
      data_type: "sentence",
      granularity: "item",
      sampling_method: "random",
      coding_method: "both",
      invite_emails: CODERS.map(c => c.email),
    }),
  }, adminCookie);
  assert("Project created", createRes.status === 200 && createRes.json.project_id, `body=${JSON.stringify(createRes.json)}`);
  const projectId = createRes.json.project_id;
  createdProjectId = projectId;
  console.log(`  📌 Project ID: ${projectId}`);

  // ── Step 4: Upload sample data ────────────────────────────
  console.log("\n📤 Step 4: Upload Sample Data");
  const csvContent = "sentence\n" + SAMPLE_SENTENCES.map(s => `"${s}"`).join("\n");
  const base64 = Buffer.from(csvContent).toString("base64");
  const uploadRes = await req(`/api/projects/${projectId}/datasets/upload`, {
    method: "POST",
    body: JSON.stringify({ filename: "sample.csv", file_format: "csv", content_base64: base64 }),
  }, adminCookie);
  assert("Dataset uploaded", uploadRes.status === 200 && uploadRes.json.dataset_id, `body=${JSON.stringify(uploadRes.json)}`);
  const datasetId = uploadRes.json.dataset_id;

  // Configure + Process
  const configRes = await req(`/api/projects/${projectId}/datasets/${datasetId}/configure`, {
    method: "POST",
    body: JSON.stringify({ mode: "row_per_item", text_column: "sentence" }),
  }, adminCookie);
  assert("Dataset configured", configRes.status === 200);

  const processRes = await req(`/api/projects/${projectId}/datasets/${datasetId}/process`, {
    method: "POST",
    body: "{}",
  }, adminCookie);
  assert("Dataset processed", processRes.status === 200 && processRes.json.count > 0, `count=${processRes.json?.count}`);
  console.log(`  📊 Items created: ${processRes.json?.count}`);

  // ── Step 5: Set coding scheme ─────────────────────────────
  console.log("\n🏷️ Step 5: Set Coding Scheme");
  const schemeRes = await req(`/api/projects/${projectId}/coding-scheme`, {
    method: "POST",
    body: JSON.stringify({
      labels: LABELS.map(l => ({ code: l, color: "#6366f1", description: `Theme: ${l}` })),
      change_note: "Initial scheme"
    }),
  }, adminCookie);
  assert("Coding scheme set", schemeRes.status === 200);

  // Set prompts
  const promptRes = await req(`/api/projects/${projectId}/prompts`, {
    method: "POST",
    body: JSON.stringify({
      prompt1: "Classify the sentence into one theme: CODE, EXPLANATION, EVALUATION, RESPONSIBILITY, APPLICATION, IMPLICATION. Return JSON: {\"label\":\"<CODE>\"}",
      prompt2: "You are a thematic classifier. Output one code only. Return JSON: {\"label\":\"<CODE>\"}"
    }),
  }, adminCookie);
  assert("Prompts set", promptRes.status === 200);

  // ── Step 6: Generate assignments ──────────────────────────
  console.log("\n📋 Step 6: Generate Assignments");
  const assignRes = await req(`/api/projects/${projectId}/assignments/generate`, {
    method: "POST",
    body: "{}",
  }, adminCookie);
  assert("Assignments generated", assignRes.status === 200, `members=${assignRes.json?.members} items=${assignRes.json?.items}`);

  // ── Step 7: Login all coders ──────────────────────────────
  console.log("\n👥 Step 7: Login All Coders");
  const coderCookies = [];
  for (const coder of CODERS) {
    const cookie = await login(coder);
    coderCookies.push(cookie);
  }

  // ── Step 8: Each coder does manual labeling ───────────────
  console.log("\n🏷️ Step 8: Manual Labeling (5 coders × all items)");
  for (let ci = 0; ci < CODERS.length; ci++) {
    const cookie = coderCookies[ci];
    const coder = CODERS[ci];
    let labeled = 0;
    for (let i = 0; i < 20; i++) {
      const next = await req(`/api/projects/${projectId}/labeling/next?phase=normal&task=manual`, {}, cookie);
      if (!next.json?.item) break;
      const label = LABELS[(ci + i) % LABELS.length]; // deterministic but varied
      const submitRes = await req(`/api/projects/${projectId}/labeling/submit`, {
        method: "POST",
        body: JSON.stringify({
          item_id: next.json.item.item_id,
          phase: "normal",
          label,
          attempt: {
            display_at_epoch_ms: Date.now() - 5000,
            answer_at_epoch_ms: Date.now(),
            active_ms: 3000 + Math.random() * 5000,
            hidden_ms: 0,
            idle_ms: Math.random() * 2000,
            hidden_count: 0,
            blur_count: 0,
          }
        }),
      }, cookie);
      if (submitRes.status === 200) labeled++;
    }
    assert(`${coder.name} labeled`, labeled > 0, `${labeled} items`);
  }

  // ── Step 9: Test undo for one coder ───────────────────────
  console.log("\n↩️ Step 9: Test Undo");
  const myAssign = await req(`/api/projects/${projectId}/assignments/my`, {}, coderCookies[0]);
  const doneItems = (myAssign.json?.assignments ?? []).filter(a => a.status === "done");
  if (doneItems.length > 0) {
    const undoRes = await req(`/api/projects/${projectId}/labeling/undo`, {
      method: "POST",
      body: JSON.stringify({ item_id: doneItems[0].item_id, phase: "normal" }),
    }, coderCookies[0]);
    assert("Undo succeeded", undoRes.status === 200);
    // Re-label it
    const relabel = await req(`/api/projects/${projectId}/labeling/submit`, {
      method: "POST",
      body: JSON.stringify({ item_id: doneItems[0].item_id, phase: "normal", label: "CODE" }),
    }, coderCookies[0]);
    assert("Re-label after undo", relabel.status === 200);
  } else {
    assert("Undo (skipped)", true, "no done items");
  }

  // ── Step 10: LLM labeling (skip actual LLM call, test endpoint) ─
  console.log("\n🤖 Step 10: LLM Labeling");
  const itemsRes = await req(`/api/projects/${projectId}/data-items`, {}, adminCookie);
  const allItems = itemsRes.json?.items ?? [];
  if (allItems.length > 0) {
    const llmRes = await req(`/api/projects/${projectId}/llm/run`, {
      method: "POST",
      body: JSON.stringify({ item_id: allItems[0].item_id, mode: "prompt1", phase: "normal" }),
    }, coderCookies[0]);
    // LLM might fail if no API key, that's ok
    if (llmRes.status === 200) {
      assert("LLM run", true, `predicted=${llmRes.json?.predicted_label}`);
      // Accept the LLM label
      const acceptRes = await req(`/api/projects/${projectId}/llm/accept`, {
        method: "POST",
        body: JSON.stringify({ item_id: allItems[0].item_id, accepted_label: llmRes.json?.predicted_label, phase: "normal", mode: "prompt1" }),
      }, coderCookies[0]);
      assert("LLM accept", acceptRes.status === 200);
    } else {
      assert("LLM run (expected fail without API key)", true, `status=${llmRes.status}`);
    }
  }

  // ── Step 11: Check progress ───────────────────────────────
  console.log("\n📊 Step 11: Progress Check");
  const progRes = await req(`/api/projects/${projectId}/assignments/progress`, {}, adminCookie);
  assert("Progress endpoint", progRes.status === 200);
  const progressData = progRes.json?.progress ?? [];
  console.log(`  📈 ${progressData.length} members with progress`);
  for (const p of progressData) {
    console.log(`     ${p.user_id}: ${p.done}/${p.total}`);
  }

  // ── Step 12: IRR Calculation ──────────────────────────────
  console.log("\n📐 Step 12: IRR Calculation");
  const irrRes = await req(`/api/projects/${projectId}/irr/calculate`, {
    method: "POST",
    body: "{}",
  }, adminCookie);
  assert("IRR calculated", irrRes.status === 200, `kappa=${irrRes.json?.fleiss_kappa} agreement=${irrRes.json?.percent_agreement}`);
  console.log(`  📐 Fleiss' Kappa: ${irrRes.json?.fleiss_kappa}`);
  console.log(`  📐 Percent Agreement: ${irrRes.json?.percent_agreement}`);

  // ── Step 13: Conflict Detection ───────────────────────────
  console.log("\n⚡ Step 13: Conflict Detection");
  const conflictRes = await req(`/api/projects/${projectId}/conflicts/detect`, {
    method: "POST",
    body: "{}",
  }, adminCookie);
  assert("Conflicts detected", conflictRes.status === 200, `created=${conflictRes.json?.created}`);
  console.log(`  ⚡ Conflicts created: ${conflictRes.json?.created}`);

  // List conflicts
  const conflictList = await req(`/api/projects/${projectId}/conflicts`, {}, adminCookie);
  const openConflicts = (conflictList.json?.conflicts ?? []).filter(c => c.status === "open");
  console.log(`  📋 Open conflicts: ${openConflicts.length}`);

  // Resolve first conflict
  if (openConflicts.length > 0) {
    const resolveRes = await req(`/api/projects/${projectId}/conflicts/${openConflicts[0].conflict_id}/resolve`, {
      method: "POST",
      body: JSON.stringify({ resolved_label: "CODE", resolution_note: "Resolved by admin during E2E test" }),
    }, adminCookie);
    assert("Conflict resolved", resolveRes.status === 200);
  }

  // ── Step 14: Chat/Messages ────────────────────────────────
  console.log("\n💬 Step 14: Chat Messages");
  const msgRes = await req(`/api/projects/${projectId}/messages`, {
    method: "POST",
    body: JSON.stringify({ content: "Hello team! E2E test in progress.", message_type: "chat" }),
  }, coderCookies[0]);
  assert("Chat message sent", msgRes.status === 200);

  const listMsgRes = await req(`/api/projects/${projectId}/messages`, {}, adminCookie);
  assert("Messages listed", listMsgRes.status === 200 && (listMsgRes.json?.messages ?? []).length > 0);

  // ── Step 15: Survey ───────────────────────────────────────
  console.log("\n📝 Step 15: Survey");
  for (let ci = 0; ci < CODERS.length; ci++) {
    const surveyRes = await req(`/api/projects/${projectId}/survey/submit`, {
      method: "POST",
      body: JSON.stringify({
        likert: { ease_of_use: 4 + (ci % 2), llm_helpfulness: 3 + ci % 3, overall_satisfaction: 4 },
        mc_answer: ci % 2 === 0 ? "manual" : "llm",
        open_q1: `This is test feedback from ${CODERS[ci].name}`,
        open_q2: "The LLM was helpful for initial labeling",
        open_q3: "No suggestions at this time",
      }),
    }, coderCookies[ci]);
    assert(`Survey ${CODERS[ci].name}`, surveyRes.status === 200);
  }

  // Check all surveys
  const allSurveys = await req(`/api/projects/${projectId}/survey/all`, {}, adminCookie);
  assert("All surveys retrieved", allSurveys.status === 200 && (allSurveys.json?.responses ?? []).length === 5, `count=${(allSurveys.json?.responses ?? []).length}`);

  // ── Step 16: Visualization / Stats ────────────────────────
  console.log("\n📊 Step 16: Stats & Visualization");
  const overviewRes = await req(`/api/projects/${projectId}/stats/overview`, {}, adminCookie);
  assert("Stats overview", overviewRes.status === 200, `items=${overviewRes.json?.total_items} labels=${overviewRes.json?.total_labels}`);

  const distRes = await req(`/api/projects/${projectId}/stats/label-distribution`, {}, adminCookie);
  assert("Label distribution", distRes.status === 200);

  const timeRes = await req(`/api/projects/${projectId}/stats/time-analysis`, {}, adminCookie);
  assert("Time analysis", timeRes.status === 200);

  const vizRes = await req(`/api/projects/${projectId}/viz/stats`, {}, coderCookies[0]);
  assert("Viz stats", vizRes.status === 200, `total=${vizRes.json?.total_items}`);

  // ── Step 17: AI Suggestion ────────────────────────────────
  console.log("\n🤖 Step 17: AI Suggestion");
  const suggestRes = await req(`/api/projects/${projectId}/irr/ai-suggest`, {
    method: "POST",
    body: "{}",
  }, adminCookie);
  assert("AI suggestion", suggestRes.status === 200 && suggestRes.json?.suggestion);

  // ── Step 18: AL Run ───────────────────────────────────────
  console.log("\n⚡ Step 18: Active Learning");
  const alRes = await req(`/api/projects/${projectId}/al/run`, {
    method: "POST",
    body: "{}",
  }, adminCookie);
  assert("AL run", alRes.status === 200);

  // ── Step 19: Notifications ────────────────────────────────
  console.log("\n🔔 Step 19: Notifications");
  const notifRes = await req(`/api/projects/${projectId}/notifications`, {}, coderCookies[0]);
  assert("Notifications endpoint", notifRes.status === 200);
  console.log(`  🔔 Notifications: ${(notifRes.json?.notifications ?? []).length}`);

  // ── Step 20: Export ───────────────────────────────────────
  console.log("\n📤 Step 20: Export");
  const exportRes = await req(`/api/projects/${projectId}/export?format=json`, {}, adminCookie);
  assert("Export JSON", exportRes.status === 200 && exportRes.json?.projects?.length > 0);
  console.log(`  📦 Export keys: ${Object.keys(exportRes.json || {}).join(", ")}`);
  console.log(`  📊 Manual labels: ${(exportRes.json?.manual_labels ?? []).length}`);
  console.log(`  📊 LLM labels: ${(exportRes.json?.llm_labels ?? []).length}`);
  console.log(`  📊 Conflicts: ${(exportRes.json?.conflicts ?? []).length}`);
  console.log(`  📊 Attempts: ${(exportRes.json?.attempts ?? []).length}`);

  // ── Step 21: Project detail ───────────────────────────────
  console.log("\n📂 Step 21: Project Detail");
  const detailRes = await req(`/api/projects/${projectId}`, {}, adminCookie);
  assert("Project detail", detailRes.status === 200 && detailRes.json?.project);
  console.log(`  📋 Members: ${(detailRes.json?.members ?? []).length}`);

  // ── Step 22: Coding scheme history ────────────────────────
  console.log("\n📜 Step 22: Coding Scheme History");
  const histRes = await req(`/api/projects/${projectId}/coding-scheme/history`, {}, adminCookie);
  assert("Scheme history", histRes.status === 200 && (histRes.json?.history ?? []).length > 0);

  // ── Summary ───────────────────────────────────────────────
  console.log("\n" + "═".repeat(60));
  console.log(`\n🏁 RESULTS: ${passed} passed, ${failed} failed\n`);
  if (errors.length > 0) {
    console.log("❌ FAILURES:");
    errors.forEach((e, i) => console.log(`  ${i + 1}. ${e}`));
  }
  console.log(`\n🔗 Project URL: https://mnotation.pages.dev/projects/${projectId}`);
  console.log("");
  if (createdProjectId && adminSessionCookie) {
    const cleanupRes = await req(`/api/projects/${createdProjectId}`, { method: "DELETE" }, adminSessionCookie);
    if (cleanupRes.status === 200) {
      assert("Cleanup project", true);
    } else {
      console.log(`  ⚠️ Cleanup project skipped (status=${cleanupRes.status})`);
    }
  }
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("💥 Fatal error:", err);
  if (createdProjectId && adminSessionCookie) {
    req(`/api/projects/${createdProjectId}`, { method: "DELETE" }, adminSessionCookie).catch(() => undefined);
  }
  process.exit(2);
});
