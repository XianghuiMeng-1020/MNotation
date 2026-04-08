import type { Env } from "./types";
import { uid, nowIso } from "./utils";

export async function createNotification(env: Env, input: {
  projectId: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  meta?: Record<string, unknown>;
}) {
  await env.DB.prepare(
    "INSERT INTO notifications(notification_id,project_id,user_id,type,title,body,meta_json,is_read,created_at) VALUES(?,?,?,?,?,?,?,0,?)"
  ).bind(uid("noti_"), input.projectId, input.userId, input.type, input.title, input.body, JSON.stringify(input.meta ?? {}), nowIso()).run();
}

export async function notifyAllMembers(env: Env, projectId: string, type: string, title: string, body: string, meta?: Record<string, unknown>) {
  const members = await env.DB.prepare("SELECT user_id FROM project_members WHERE project_id=?").bind(projectId).all<{ user_id: string }>();
  await Promise.all((members.results ?? []).map((m) =>
    createNotification(env, { projectId, userId: m.user_id, type, title, body, meta })
  ));
}

export async function notifySpecificUsers(env: Env, projectId: string, userIds: string[], type: string, title: string, body: string, meta?: Record<string, unknown>) {
  await Promise.all(userIds.map((userId) =>
    createNotification(env, { projectId, userId, type, title, body, meta })
  ));
}

export async function maybeNotifyLowIrr(env: Env, projectId: string, value: number) {
  const threshold = Number(env.IRR_LOW_THRESHOLD ?? "0.3");
  if (value >= threshold || value <= 0) return;
  await notifyAllMembers(
    env,
    projectId,
    "irr_low",
    "Inter-rater agreement is low",
    "Your team's coding agreement is very low. We recommend pausing to discuss your coding scheme and clarify any ambiguous categories.",
    { threshold }
  );
}

export async function notifyConflictDetected(env: Env, projectId: string, conflictCount: number) {
  if (conflictCount === 0) return;
  await notifyAllMembers(
    env,
    projectId,
    "conflict_detected",
    `${conflictCount} new conflict${conflictCount > 1 ? "s" : ""} detected`,
    `${conflictCount} item${conflictCount > 1 ? "s" : ""} with disagreements ${conflictCount > 1 ? "were" : "was"} found. Visit the Conflict Resolution page to review and resolve them.`,
    { conflict_count: conflictCount }
  );
}

export async function notifyMemberJoined(env: Env, projectId: string, newMemberEmail: string, existingMemberIds: string[]) {
  await notifySpecificUsers(
    env,
    projectId,
    existingMemberIds,
    "member_joined",
    "New team member joined",
    `${newMemberEmail} has joined the project as a coder.`,
    { email: newMemberEmail }
  );
}

export async function notifyNewMessage(env: Env, projectId: string, senderUserId: string, messageType: "chat" | "note", content: string, itemId?: string) {
  const members = await env.DB.prepare("SELECT user_id FROM project_members WHERE project_id=? AND user_id!=?").bind(projectId, senderUserId).all<{ user_id: string }>();
  const preview = content.length > 80 ? content.slice(0, 80) + "…" : content;
  const title = messageType === "note" ? "New item note" : "New team chat message";
  const body = preview;
  await Promise.all((members.results ?? []).map((m) =>
    createNotification(env, { projectId, userId: m.user_id, type: "message", title, body, meta: { item_id: itemId, sender: senderUserId } })
  ));
}

export async function notifyCodingSchemeUpdated(env: Env, projectId: string, updaterUserId: string, version: number) {
  const members = await env.DB.prepare("SELECT user_id FROM project_members WHERE project_id=? AND user_id!=?").bind(projectId, updaterUserId).all<{ user_id: string }>();
  await Promise.all((members.results ?? []).map((m) =>
    createNotification(env, {
      projectId,
      userId: m.user_id,
      type: "scheme_updated",
      title: "Coding scheme updated",
      body: `The coding scheme has been updated to version ${version}. Please review the new codes before continuing to label.`,
      meta: { version, updated_by: updaterUserId }
    })
  ));
}

export async function notifyAlRunComplete(env: Env, projectId: string, runId: string, itemCount: number) {
  await notifyAllMembers(
    env,
    projectId,
    "al_complete",
    "Active learning run complete",
    `Active learning has identified ${itemCount} high-priority items for annotation. Check your new assignments.`,
    { run_id: runId, item_count: itemCount }
  );
}

export async function notifyConflictResolved(env: Env, projectId: string, resolverUserId: string, conflictId: string, resolvedLabel: string) {
  const members = await env.DB.prepare("SELECT user_id FROM project_members WHERE project_id=? AND user_id!=?").bind(projectId, resolverUserId).all<{ user_id: string }>();
  await Promise.all((members.results ?? []).map((m) =>
    createNotification(env, {
      projectId,
      userId: m.user_id,
      type: "conflict_resolved",
      title: "Conflict resolved",
      body: `A labeling conflict has been resolved with the label "${resolvedLabel}".`,
      meta: { conflict_id: conflictId, resolved_label: resolvedLabel, resolver: resolverUserId }
    })
  ));
}
