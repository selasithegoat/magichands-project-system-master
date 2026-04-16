const mongoose = require("mongoose");
const { HELP_ARTICLES, HELP_CATEGORIES } = require("../data/helpArticles");
const HelpFeedback = require("../models/HelpFeedback");
const {
  buildArticleAnswer,
  buildHelpRetrievalText,
  detectHelpIntent,
  getConversationEntries,
  getHelpChunkSearchText,
  getUserHelpContext,
  searchHelpChunks,
  searchHelpArticles,
} = require("../utils/helpSearch");
const {
  getProjectContextSearchText,
  getProjectPromptContext,
  resolveProjectContextsForQuestion,
  searchAccessibleProjectSummaries,
  toPublicProjectContext,
} = require("../utils/helpProjectContext");

const HELP_AI_MODEL =
  process.env.OPENAI_HELP_MODEL || process.env.OPENAI_RISK_MODEL || "gpt-4o-mini";
const HELP_AI_TIMEOUT_MS = Number.isFinite(
  Number.parseInt(process.env.OPENAI_HELP_TIMEOUT_MS, 10),
)
  ? Number.parseInt(process.env.OPENAI_HELP_TIMEOUT_MS, 10)
  : 12000;
const HELP_AI_TEMPERATURE = Number.isFinite(
  Number.parseFloat(process.env.OPENAI_HELP_TEMPERATURE),
)
  ? Number.parseFloat(process.env.OPENAI_HELP_TEMPERATURE)
  : 0.2;
const OLLAMA_HELP_URL =
  process.env.OLLAMA_HELP_URL ||
  process.env.OLLAMA_RISK_URL ||
  "http://localhost:11434/api/generate";
const OLLAMA_HELP_MODEL =
  process.env.OLLAMA_HELP_MODEL || process.env.OLLAMA_RISK_MODEL || "llama3.1:8b";
const OLLAMA_HELP_TIMEOUT_MS = Number.isFinite(
  Number.parseInt(process.env.OLLAMA_HELP_TIMEOUT_MS, 10),
)
  ? Number.parseInt(process.env.OLLAMA_HELP_TIMEOUT_MS, 10)
  : 18000;
const MAX_QUESTION_LENGTH = 600;
const MAX_CONVERSATION_TURNS = 6;

const getFetchClient = async () => {
  if (typeof fetch === "function") return fetch;
  const nodeFetch = await import("node-fetch");
  return nodeFetch.default;
};

const toText = (value) => String(value || "").trim();

const toArray = (value) => (Array.isArray(value) ? value : value ? [value] : []);

const createAnswerId = () =>
  `help-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const normalizeReplyTarget = (value = {}) => {
  const text = toText(value?.text || value?.content).slice(0, 220);
  if (!text) return null;

  return {
    role: toText(value?.role).toLowerCase() === "assistant" ? "assistant" : "user",
    text,
  };
};

const buildConversationPromptBlock = (conversation = []) => {
  const entries = getConversationEntries(conversation, MAX_CONVERSATION_TURNS);
  if (!entries.length) return "";

  return [
    "Recent conversation:",
    ...entries.map(
      (entry) => {
        const speaker = entry.role === "assistant" ? "MagicHelp" : "User";
        if (!entry.replyToText) {
          return `${speaker}: ${entry.text}`;
        }

        const replySpeaker = entry.replyToRole === "assistant" ? "MagicHelp" : "User";
        return `${speaker} replying to ${replySpeaker} ("${entry.replyToText}"): ${entry.text}`;
      },
    ),
  ].join("\n");
};

const buildReplyPromptBlock = (replyTo = null) => {
  if (!replyTo?.text) return "";
  return `The latest user question is replying to ${
    replyTo.role === "assistant" ? "MagicHelp" : "their earlier message"
  }: ${replyTo.text}`;
};

const normalizeQuestionForSuggestions = (value) =>
  toText(value).toLowerCase().replace(/\s+/g, " ").trim();

const buildFollowUpSuggestions = ({
  intent = {},
  projectContexts = [],
  question = "",
} = {}) => {
  const projectRef = toText(projectContexts?.[0]?.displayRef);
  const intentSuggestions = toArray(intent?.followUps);
  const contextualSuggestions = projectRef
    ? [
        `What should I check next on ${projectRef}?`,
        `Who needs to act next on ${projectRef}?`,
        `Can you explain that for ${projectRef} step by step?`,
      ]
    : [];
  const genericSuggestions = [
    "Can you break that into steps?",
    "What usually blocks this workflow?",
    "Which page should I open next?",
  ];

  return Array.from(
    new Set(
      [...intentSuggestions, ...contextualSuggestions, ...genericSuggestions]
        .map(toText)
        .filter(
          (item) =>
            item &&
            normalizeQuestionForSuggestions(item) !==
              normalizeQuestionForSuggestions(question),
        ),
    ),
  ).slice(0, 4);
};

const getUniqueRelatedArticles = (chunkMatches = []) => {
  const seen = new Set();
  return toArray(chunkMatches)
    .map((entry) => entry?.article || entry?.chunk?.article)
    .filter((article) => {
      const articleId = toText(article?.id);
      if (!articleId || seen.has(articleId)) return false;
      seen.add(articleId);
      return true;
    });
};

const formatChunkPromptBlock = (entry = {}, index = 0) => {
  const chunk = entry?.chunk || entry;
  const routes = toArray(chunk?.routes || chunk?.articleRoutes)
    .map((route) => [route?.label, route?.path].filter(Boolean).join(" "))
    .filter(Boolean)
    .join(" | ");

  return [
    `Chunk ${index + 1}: ${chunk?.articleTitle || chunk?.title || "Help content"}`,
    `Category: ${chunk?.articleCategory || "General"}`,
    `Type: ${chunk?.label || chunk?.kind || "content"}`,
    `Text: ${toText(chunk?.text) || getHelpChunkSearchText(chunk)}`,
    chunk?.steps?.length ? `Steps: ${chunk.steps.join(" | ")}` : "",
    chunk?.tips?.length ? `Tips: ${chunk.tips.join(" | ")}` : "",
    routes ? `Routes: ${routes}` : "",
  ]
    .filter(Boolean)
    .join("\n");
};

const normalizeLooseText = (value = "") =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const isDirectProjectStatusQuestion = (question = "", intent = {}) => {
  if (intent?.name !== "status") return false;

  const normalized = normalizeLooseText(question);
  if (!normalized) return false;

  return [
    /\bstatus\b/,
    /\bstage\b/,
    /\bcurrent\b/,
    /\bcurrently\b/,
    /\bprogress\b/,
    /\bwhere is\b/,
    /\bwhere s\b/,
    /\bwhat s next\b/,
    /\bwhat is next\b/,
    /\bwhat is happening\b/,
    /\bwhat s happening\b/,
  ].some((pattern) => pattern.test(normalized));
};

const isDirectProjectAssignmentQuestion = (question = "", intent = {}) => {
  if (intent?.name !== "assignment") return false;

  const normalized = normalizeLooseText(question);
  if (!normalized) return false;

  return [
    /\bwho\b/,
    /\bneeds to act\b/,
    /\bwho acts\b/,
    /\bwho next\b/,
    /\bresponsible\b/,
    /\bassigned\b/,
    /\bowner\b/,
    /\blead\b/,
    /\bdepartment\b/,
  ].some((pattern) => pattern.test(normalized));
};

const isDirectProjectNextStepQuestion = (question = "", intent = {}) => {
  const normalized = normalizeLooseText(question);
  if (!normalized) return false;

  if (intent?.name && ["navigation", "permission", "assignment"].includes(intent.name)) {
    return false;
  }

  return [
    /\bwhat should i do next\b/,
    /\bwhat do i do next\b/,
    /\bwhat next\b/,
    /\bnext step\b/,
    /\bwhat should i check next\b/,
    /\bwhat do i check next\b/,
    /\bwhat comes next\b/,
    /\bwhat should happen next\b/,
  ].some((pattern) => pattern.test(normalized));
};

const getFirstDepartmentLabel = (project = {}) =>
  toArray(project?.departments).map(toText).find(Boolean) || "";

const toDepartmentDisplay = (value = "") => {
  const text = toText(value);
  if (!text) return "";
  if (/\bdepartment\b/i.test(text)) return text;
  if (/\bteam\b/i.test(text)) return text.replace(/\bteam\b/i, "department");
  return `${text} department`;
};

const getDefaultProjectOwner = (project = {}) => {
  const departmentLabel = getFirstDepartmentLabel(project);
  if (departmentLabel) {
    return {
      name: toDepartmentDisplay(departmentLabel),
      role: "",
    };
  }

  return {
    name: "Assigned department",
    role: "",
  };
};

const formatActorDisplay = (actor = {}) => {
  const name = toText(actor?.name);
  const role = toText(actor?.role);
  if (!name) return "Assigned department";
  return role ? `${name} (${role})` : name;
};

const normalizeResponsibilityText = (value = "") => {
  const text = toText(value).replace(/\.$/, "");
  if (!text) return "";

  return text.charAt(0).toLowerCase() + text.slice(1);
};

const getProjectActionResponsibility = (project = {}) => {
  const blockers = toArray(project?.blockers);
  const primaryBlocker = blockers[0] || {};
  const blockerLabel = toText(primaryBlocker?.label).toLowerCase();
  const blockerDetail = toText(primaryBlocker?.detail);
  const status = toText(project?.status);
  const defaultOwner = getDefaultProjectOwner(project);

  if (blockerLabel.includes("client mockup approval is pending")) {
    return {
      actor: defaultOwner,
      responsibility:
        "follow up on the client mockup approval and confirm the approved mockup version.",
    };
  }

  if (blockerLabel.includes("sample approval is pending")) {
    return {
      actor: defaultOwner,
      responsibility: "follow up on sample approval before the project moves forward.",
    };
  }

  if (blockerLabel.includes("quote requirements are still pending")) {
    return {
      actor: defaultOwner,
      responsibility: blockerDetail
        ? `complete the remaining quote requirements: ${blockerDetail}.`
        : "complete the remaining quote requirements and prepare the client response.",
    };
  }

  if (
    blockerLabel.includes("payment or authorization is not verified") ||
    blockerLabel.includes("invoice has not been marked as sent")
  ) {
    const billingResponsibility = normalizeResponsibilityText(blockerDetail).replace(
      /^front desk should\s+/i,
      "",
    );

    return {
      actor: {
        name: "Front Desk department",
        role: "",
      },
      responsibility: billingResponsibility
        ? `${billingResponsibility}.`
        : "confirm billing or payment verification before production continues.",
    };
  }

  if (blockerLabel.includes("open challenge")) {
    return {
      actor: defaultOwner,
      responsibility: blockerDetail
        ? `resolve the open challenge: ${blockerDetail}.`
        : "resolve the open challenge and update the project.",
    };
  }

  if (status.includes("Mockup")) {
    return {
      actor: defaultOwner,
      responsibility:
        "review the latest mockup and move the project to the next approval step.",
    };
  }

  if (status.includes("Production")) {
    return {
      actor: defaultOwner,
      responsibility:
        "confirm production readiness and update progress on the project.",
    };
  }

  if (status.includes("Delivery") || status === "Delivered") {
    return {
      actor: defaultOwner,
      responsibility: "complete the delivery handoff and record the update.",
    };
  }

  const nextCheck = toText(toArray(project?.nextChecks)[0]);
  if (nextCheck) {
    return {
      actor: defaultOwner,
      responsibility:
        `${normalizeResponsibilityText(nextCheck)}.`,
    };
  }

  return {
    actor: defaultOwner,
    responsibility: "review the project and handle the next workflow step.",
  };
};

const getProjectNextAction = (project = {}) => {
  const blockers = toArray(project?.blockers);
  const primaryBlocker = blockers[0] || {};
  const blockerLabel = toText(primaryBlocker?.label).toLowerCase();
  const blockerDetail = toText(primaryBlocker?.detail);
  const status = toText(project?.status);

  if (blockerLabel.includes("client mockup approval is pending")) {
    return "follow up on the client mockup approval and confirm the approved mockup version.";
  }

  if (blockerLabel.includes("sample approval is pending")) {
    return "follow up on sample approval before the project moves forward.";
  }

  if (blockerLabel.includes("quote requirements are still pending")) {
    return blockerDetail
      ? `complete the remaining quote requirements: ${blockerDetail}.`
      : "complete the remaining quote requirements and prepare the client response.";
  }

  if (blockerLabel.includes("payment or authorization is not verified")) {
    return "confirm payment or authorization verification before production continues.";
  }

  if (blockerLabel.includes("invoice has not been marked as sent")) {
    return "confirm the invoice has been sent before production continues.";
  }

  if (blockerLabel.includes("open challenge")) {
    return blockerDetail
      ? `resolve the open challenge: ${blockerDetail}.`
      : "resolve the open challenge and update the project.";
  }

  if (status.includes("Mockup")) {
    return "review the latest mockup and move the project to the next approval step.";
  }

  if (status.includes("Production")) {
    return "confirm production readiness and update progress on the project.";
  }

  if (status.includes("Delivery") || status === "Delivered") {
    return "complete the delivery handoff and record the update.";
  }

  const nextCheck = toText(toArray(project?.nextChecks)[0]);
  if (nextCheck) {
    return `${normalizeResponsibilityText(nextCheck)}.`;
  }

  return "open the project timeline and handle the next workflow step.";
};

const formatProjectStatusReason = (project = {}) => {
  const blockers = toArray(project?.blockers);
  const primaryBlocker = blockers[0] || {};
  const blockerLabel = toText(primaryBlocker?.label).toLowerCase();
  const blockerDetail = toText(primaryBlocker?.detail);
  const mockupApprovalStatus = toText(project?.mockupClientApprovalStatus).toLowerCase();
  const sampleApprovalStatus = toText(project?.sampleApprovalStatus).toLowerCase();
  const status = toText(project?.status);

  if (
    blockerLabel.includes("client mockup approval is pending") ||
    (status.includes("Mockup") && mockupApprovalStatus && mockupApprovalStatus !== "approved")
  ) {
    return "Pending Mockup Approval from Client.";
  }

  if (
    blockerLabel.includes("sample approval is pending") ||
    (sampleApprovalStatus && sampleApprovalStatus !== "approved")
  ) {
    return "Pending Sample Approval.";
  }

  if (blockerLabel.includes("quote requirements are still pending")) {
    return blockerDetail
      ? `Pending Quote Requirements: ${blockerDetail}.`
      : "Pending Quote Requirements.";
  }

  if (blockerLabel.includes("payment or authorization is not verified")) {
    return "Pending Payment or Authorization Verification.";
  }

  if (blockerLabel.includes("invoice has not been marked as sent")) {
    return "Invoice has not been marked as sent yet.";
  }

  if (blockerLabel.includes("project is on hold")) {
    return blockerDetail ? `Project on hold: ${blockerDetail}.` : "Project on hold.";
  }

  if (blockerLabel.includes("project is cancelled")) {
    return blockerDetail ? `Project cancelled: ${blockerDetail}.` : "Project cancelled.";
  }

  if (blockerLabel && blockerLabel.includes("open challenge")) {
    return blockerDetail ? `Open Challenge: ${blockerDetail}.` : "There is an open challenge on this project.";
  }

  return "";
};

const buildDirectProjectStatusAnswer = (project = {}) => {
  if (!project) return "";

  const lines = [
    `Answer: ${project.displayRef} is currently ${project.status || "in progress"}${
      project.projectName ? ` for ${project.projectName}` : ""
    }.`,
  ];

  const reason = formatProjectStatusReason(project);
  if (reason) lines.push(reason);

  return shortenHelpAnswer(lines.join("\n"));
};

const buildDirectProjectAssignmentAnswer = (project = {}) => {
  if (!project) return "";

  const { actor, responsibility } = getProjectActionResponsibility(project);
  const actorDisplay = formatActorDisplay(actor);

  return shortenHelpAnswer(
    [
      `Answer: ${actorDisplay} needs to act next on ${project.displayRef}.`,
      `Responsibility: ${responsibility}`,
    ].join("\n"),
  );
};

const buildDirectProjectNextStepAnswer = (project = {}) => {
  if (!project) return "";

  return shortenHelpAnswer(
    `Answer: The next step on ${project.displayRef} is to ${getProjectNextAction(project).replace(/^to\s+/i, "")}`,
  );
};

const buildDirectProjectIntentAnswer = ({ question = "", intent = {}, project = null } = {}) => {
  if (!project) return "";
  if (isDirectProjectNextStepQuestion(question, intent)) {
    return buildDirectProjectNextStepAnswer(project);
  }
  if (isDirectProjectStatusQuestion(question, intent)) {
    return buildDirectProjectStatusAnswer(project);
  }
  if (isDirectProjectAssignmentQuestion(question, intent)) {
    return buildDirectProjectAssignmentAnswer(project);
  }
  return "";
};

const shortenHelpAnswer = (value = "") => {
  const lines = String(value || "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter(
      (line) =>
        !/^(direct answer|why this applies|steps to take now|what to check next|when to escalate):?$/i.test(
          line,
        ),
    );

  if (!lines.length) return "";

  const compactLines = lines.slice(0, 5);
  let text = compactLines.join("\n");
  if (text.length <= 520) return text;

  const shortened = text.slice(0, 517);
  const sentenceCut = Math.max(
    shortened.lastIndexOf(". "),
    shortened.lastIndexOf("\n"),
  );
  return `${shortened
    .slice(0, sentenceCut > 120 ? sentenceCut : 517)
    .trimEnd()}...`;
};

const toPublicArticle = (article) => ({
  id: article.id,
  title: article.title,
  category: article.category,
  audience: article.audience || [],
  departments: article.departments || [],
  keywords: article.keywords || [],
  summary: article.summary,
  steps: article.steps || [],
  tips: article.tips || [],
  relatedRoutes: article.relatedRoutes || [],
});

const buildHelpPrompt = ({
  question,
  chunks = [],
  userContext,
  conversation = [],
  intent = {},
  projectContexts = [],
  projectLookupNotes = [],
  replyTo = null,
}) => {
  const contextBlocks = toArray(chunks)
    .slice(0, 4)
    .map((entry, index) => formatChunkPromptBlock(entry, index));
  const projectContextBlock = getProjectPromptContext(
    projectContexts,
    projectLookupNotes,
  );
  const conversationBlock = buildConversationPromptBlock(conversation);
  const replyBlock = buildReplyPromptBlock(replyTo);

  return [
    "Answer the user's MagicHands system question using only the approved help chunks and authorized project context below.",
    "If authorized project context is present, use it to tailor the status, blockers, and next checks for that specific project.",
    "If a project lookup note says the project could not be found or accessed, do not guess whether the project exists.",
    "If the help chunks and project context do not contain enough information, say that briefly and suggest the closest approved help article.",
    "Do not invent buttons, pages, permissions, or workflow steps.",
    "Do not claim that you changed, approved, submitted, or updated anything.",
    "Keep the answer practical, conversational, and specific to the user's question.",
    "Reply in 2 to 5 short lines.",
    "Start with the direct answer.",
    "For project status, stage, next-step, owner, assignment, or blocker questions, answer in 1 to 2 short lines and do not add numbered steps unless the user explicitly asks for a step-by-step guide.",
    "If action is needed for a how-to question, add at most 3 numbered steps.",
    "Keep it brief and easy to scan.",
    "If the user is replying to a specific earlier message, address that exact point first.",
    "If the user is asking a short follow-up and the earlier conversation gives the missing context, reuse that context.",
    "If the question is still ambiguous, ask one short clarifying question instead of guessing.",
    "Use plain text.",
    "",
    `User role: ${userContext.role || "unknown"}`,
    `Employee type: ${userContext.employeeType || "unknown"}`,
    `Departments: ${(userContext.departments || []).join(", ") || "none"}`,
    `Detected intent: ${intent?.label || "General help"}`,
    intent?.isFollowUp ? "The latest question looks like a follow-up." : "",
    "",
    conversationBlock,
    replyBlock,
    `Question: ${question}`,
    "",
    projectContextBlock,
    "Approved help chunks:",
    contextBlocks.length
      ? contextBlocks.join("\n\n---\n\n")
      : "No matching approved help chunks were found.",
  ].join("\n");
};

const requestOpenAiHelpAnswer = async ({
  question,
  chunks = [],
  userContext,
  conversation = [],
  intent = {},
  projectContexts = [],
  projectLookupNotes = [],
  replyTo = null,
}) => {
  const apiKey = toText(process.env.OPENAI_API_KEY);
  if (!apiKey || (chunks.length === 0 && projectContexts.length === 0)) {
    return "";
  }

  const fetchClient = await getFetchClient();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HELP_AI_TIMEOUT_MS);

  try {
    const response = await fetchClient("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: HELP_AI_MODEL,
        temperature: HELP_AI_TEMPERATURE,
        messages: [
          {
            role: "system",
            content:
              "You are MagicHelp, a concise internal help assistant for the MagicHands project management system. Answer from approved help content and authorized project context only. Be brief and direct.",
          },
          {
            role: "user",
            content: buildHelpPrompt({
              question,
              chunks,
              userContext,
              conversation,
              intent,
              projectContexts,
              projectLookupNotes,
              replyTo,
            }),
          },
        ],
        max_tokens: 260,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI help request failed: ${response.status} ${errorText}`);
    }

    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content;
    if (Array.isArray(content)) {
      return content
        .map((part) =>
          typeof part === "string" ? part : toText(part?.text || part?.value),
        )
        .join("")
        .trim();
    }

    return shortenHelpAnswer(toText(content));
  } finally {
    clearTimeout(timeout);
  }
};

const requestOllamaHelpAnswer = async ({
  question,
  chunks = [],
  userContext,
  conversation = [],
  intent = {},
  projectContexts = [],
  projectLookupNotes = [],
  replyTo = null,
}) => {
  if (chunks.length === 0 && projectContexts.length === 0) return "";

  const fetchClient = await getFetchClient();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OLLAMA_HELP_TIMEOUT_MS);

  try {
    const response = await fetchClient(OLLAMA_HELP_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: OLLAMA_HELP_MODEL,
        prompt: buildHelpPrompt({
          question,
          chunks,
          userContext,
          conversation,
          intent,
          projectContexts,
          projectLookupNotes,
          replyTo,
        }),
        stream: false,
        options: {
          temperature: 0.1,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ollama help request failed: ${response.status} ${errorText}`);
    }

    const payload = await response.json();
    return shortenHelpAnswer(toText(payload?.response));
  } finally {
    clearTimeout(timeout);
  }
};

const buildProjectFallbackSection = (projectContexts, projectLookupNotes) => {
  const sections = [];

  if (projectContexts.length > 0) {
    projectContexts.forEach((project) => {
      const blockers = (project.blockers || [])
        .map((blocker) =>
          [blocker.label, blocker.detail].filter(Boolean).join(": "),
        )
        .join("\n- ");
      const nextChecks = (project.nextChecks || [])
        .map((check, index) => `${index + 1}. ${check}`)
        .join("\n");

      sections.push(
        [
          `${project.displayRef} is currently ${project.status || "in the system"}${
            project.projectName ? ` for ${project.projectName}` : ""
          }.`,
          project.clientName ? `Client: ${project.clientName}.` : "",
          project.projectType ? `Project type: ${project.projectType}.` : "",
          blockers
            ? `Likely blockers:\n- ${blockers}`
            : "I did not find an obvious blocker in the project snapshot.",
          nextChecks ? `Recommended checks:\n${nextChecks}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
      );
    });
  }

  if (projectLookupNotes.length > 0) {
    sections.push(projectLookupNotes.map((note) => note.message).join("\n"));
  }

  return sections.join("\n\n");
};

const buildFallbackHelpAnswer = (
  chunkMatches,
  projectContexts = [],
  projectLookupNotes = [],
  intent = {},
  question = "",
) => {
  const primaryProject = projectContexts[0] || null;
  const primaryChunk = chunkMatches[0]?.chunk || null;
  const primaryBlockers = toArray(primaryProject?.blockers)
    .map((blocker) =>
      [toText(blocker?.label), toText(blocker?.detail)].filter(Boolean).join(": "),
    )
    .filter(Boolean);
  const primaryChecks = toArray(primaryProject?.nextChecks).filter(Boolean);
  const chunkSteps = toArray(primaryChunk?.steps).filter(Boolean);
  const chunkTips = toArray(primaryChunk?.tips).filter(Boolean);
  const chunkText = toText(primaryChunk?.text);
  const lines = [];

  const directProjectAnswer = buildDirectProjectIntentAnswer({
    question,
    intent,
    project: primaryProject,
  });
  if (directProjectAnswer) {
    return directProjectAnswer;
  }

  if (!chunkMatches.length || chunkMatches[0].score < 4) {
    if (primaryProject) {
      lines.push(
        `${primaryProject.displayRef} is currently ${primaryProject.status || "in progress"}${
          primaryProject.projectName ? ` for ${primaryProject.projectName}` : ""
        }.`,
      );
      if (primaryBlockers.length > 0) {
        lines.push(
          `The clearest blocker I found is ${primaryBlockers[0]}.`,
        );
      } else {
        lines.push(
          "I could not find an exact approved tutorial, but I can use the project snapshot to guide the next checks.",
        );
      }
      if (primaryChecks.length > 0) {
        primaryChecks.slice(0, 4).forEach((check, index) => {
          lines.push(`${index + 1}. ${check}`);
        });
      }
    } else {
      lines.push(
        "I could not find an approved tutorial for that exact question yet.",
      );
      if (projectLookupNotes[0]?.message) lines.push(projectLookupNotes[0].message);
    }

    return shortenHelpAnswer(lines.join("\n"));
  }

  if (primaryProject && primaryBlockers.length > 0 && intent?.name === "blocker") {
    lines.push(
      `${primaryProject.displayRef} is ${primaryProject.status || "pending"} because ${primaryBlockers[0]}.`,
    );
  } else if (primaryProject && intent?.name === "status") {
    lines.push(
      `${primaryProject.displayRef} is currently ${primaryProject.status || "in progress"}${
        primaryProject.projectName ? ` for ${primaryProject.projectName}` : ""
      }.`,
    );
  } else if (chunkText) {
    lines.push(chunkText);
  } else {
    lines.push(buildArticleAnswer(primaryChunk?.article));
  }

  const steps = chunkSteps.length > 0 ? chunkSteps : primaryChecks;
  if (steps.length > 0) {
    steps.slice(0, 3).forEach((step, index) => {
      lines.push(`${index + 1}. ${step}`);
    });
  } else if (chunkTips.length > 0) {
    lines.push(chunkTips[0]);
  }

  if (primaryProject && primaryChecks.length > 0 && steps.length === 0) {
    primaryChecks.slice(0, 2).forEach((check, index) => {
      lines.push(`${index + 1}. ${check}`);
    });
  }

  return shortenHelpAnswer(lines.join("\n"));
};

const getHelpArticles = async (req, res) => {
  const userContext = getUserHelpContext(req.user);
  const featuredMatches = searchHelpArticles(HELP_ARTICLES, "", userContext, {
    limit: 6,
    minScore: 1,
  });

    return res.json({
      capabilities: {
        projectSearch: true,
        feedback: true,
        projectAwareAnswers: true,
        conversation: true,
        followUpSuggestions: true,
        hybridRetrieval: true,
      },
    categories: HELP_CATEGORIES,
    articles: HELP_ARTICLES.map(toPublicArticle),
    featuredArticleIds: featuredMatches.map((entry) => entry.article.id),
  });
};

const askHelpQuestion = async (req, res) => {
  try {
    const question = toText(req.body?.question).slice(0, MAX_QUESTION_LENGTH);
    const conversation = getConversationEntries(
      req.body?.conversation,
      MAX_CONVERSATION_TURNS,
    );
    const replyTo = normalizeReplyTarget(req.body?.replyTo);

    if (question.length < 3) {
      return res.status(400).json({
        message: "Ask a question with at least 3 characters.",
      });
    }

    const userContext = getUserHelpContext(req.user);
    const intent = detectHelpIntent({ question, conversation, replyTo });
    const selectedProjectIds = toArray(req.body?.projectIds)
      .map(toText)
      .filter(Boolean)
      .slice(0, 3);
    const {
      projectContexts,
      projectLookupNotes,
    } = await resolveProjectContextsForQuestion({
      question,
      user: req.user,
      projectIds: selectedProjectIds,
    });
    const projectSearchText = getProjectContextSearchText(projectContexts);
    const contextualQuestion = buildHelpRetrievalText({
      question,
      conversation,
      intent,
      projectSearchText,
      replyText: replyTo?.text || "",
    });
    const articleMatches = searchHelpArticles(
      HELP_ARTICLES,
      contextualQuestion,
      userContext,
      {
        limit: 5,
        minScore: projectContexts.length ? 1 : 2,
        intent,
      },
    );
    const chunkMatches = searchHelpChunks(
      HELP_ARTICLES,
      contextualQuestion,
      userContext,
      {
        limit: 6,
        minScore: projectContexts.length ? 1 : 2,
        maxPerArticle: 2,
        intent,
      },
    );
    const relatedArticles = getUniqueRelatedArticles(
      chunkMatches.length > 0 ? chunkMatches : articleMatches,
    ).map((article) => toPublicArticle(article));
    const contextChunks = chunkMatches.map((entry) => entry.chunk);

    let answer = "";
    let source = "fallback";

    const directProjectAnswer = buildDirectProjectIntentAnswer({
      question,
      intent,
      project: projectContexts[0] || null,
    });

    if (directProjectAnswer) {
      answer = directProjectAnswer;
      source = "project-context";
    }

    if (
      !answer &&
      (
        projectContexts.length > 0 ||
        (contextChunks.length > 0 && chunkMatches[0].score >= 4)
      )
    ) {
      try {
        answer = await requestOpenAiHelpAnswer({
          question,
          chunks: contextChunks,
          userContext,
          conversation,
          intent,
          projectContexts,
          projectLookupNotes,
          replyTo,
        });
        if (answer) source = "openai";
      } catch (error) {
        console.error("OpenAI help answer failed, trying Ollama backup:", error);
      }

      if (!answer) {
        try {
          answer = await requestOllamaHelpAnswer({
            question,
            chunks: contextChunks,
            userContext,
            conversation,
            intent,
            projectContexts,
            projectLookupNotes,
            replyTo,
          });
          if (answer) source = "ollama";
        } catch (error) {
          console.error("Ollama help answer failed, using fallback:", error);
        }
      }
    }

    if (!answer) {
      answer = buildFallbackHelpAnswer(
        chunkMatches,
        projectContexts,
        projectLookupNotes,
        intent,
        question,
      );
      source = "fallback";
    }

    const followUpSuggestions = buildFollowUpSuggestions({
      intent,
      projectContexts,
      question,
    });

    return res.json({
      answerId: createAnswerId(),
      answer,
      source,
      retrieval: {
        mode: chunkMatches.length > 0 ? "hybrid-chunks" : "article-fallback",
      },
      intent: {
        name: intent.name,
        label: intent.label,
        isFollowUp: Boolean(intent.isFollowUp),
      },
      followUpSuggestions,
      relatedArticles,
      projectContexts: projectContexts.map(toPublicProjectContext),
      projectLookupNotes,
    });
  } catch (error) {
    console.error("Error answering help question:", error);
    return res.status(500).json({ message: "Server Error" });
  }
};

const getHelpProjects = async (req, res) => {
  try {
    const query = toText(req.query?.query).slice(0, 90);
    const limit = Number.parseInt(req.query?.limit, 10);
    const projects = await searchAccessibleProjectSummaries({
      query,
      user: req.user,
      limit: Number.isFinite(limit) ? limit : 8,
    });

    return res.json({ projects });
  } catch (error) {
    console.error("Error searching help projects:", error);
    return res.status(500).json({ message: "Server Error" });
  }
};

const submitHelpFeedback = async (req, res) => {
  try {
    const rating = toText(req.body?.rating);
    if (!["helpful", "not_helpful", "still_confused"].includes(rating)) {
      return res.status(400).json({ message: "Choose a valid feedback rating." });
    }

    const projectIds = toArray(req.body?.projectIds)
      .map(toText)
      .filter((id) => id && mongoose.Types.ObjectId.isValid(id))
      .slice(0, 6);

    await HelpFeedback.create({
      user: req.user._id || req.user.id,
      rating,
      question: toText(req.body?.question).slice(0, 700),
      answerPreview: toText(req.body?.answerPreview).slice(0, 1000),
      note: toText(req.body?.note).slice(0, 700),
      source: toText(req.body?.source).slice(0, 40),
      answerId: toText(req.body?.answerId).slice(0, 80),
      relatedArticleIds: toArray(req.body?.relatedArticleIds)
        .map(toText)
        .filter(Boolean)
        .slice(0, 10),
      projectIds,
      userDepartments: toArray(req.user?.department).map(toText).filter(Boolean),
    });

    return res.status(201).json({ message: "Thanks for the feedback." });
  } catch (error) {
    console.error("Error saving help feedback:", error);
    return res.status(500).json({ message: "Server Error" });
  }
};

module.exports = {
  getHelpArticles,
  askHelpQuestion,
  getHelpProjects,
  submitHelpFeedback,
};
