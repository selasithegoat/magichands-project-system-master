const mongoose = require("mongoose");
const { HELP_ARTICLES, HELP_CATEGORIES } = require("../data/helpArticles");
const HelpFeedback = require("../models/HelpFeedback");
const {
  buildArticleAnswer,
  buildHelpRetrievalText,
  detectHelpIntent,
  getConversationEntries,
  getUserHelpContext,
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

const buildConversationPromptBlock = (conversation = []) => {
  const entries = getConversationEntries(conversation, MAX_CONVERSATION_TURNS);
  if (!entries.length) return "";

  return [
    "Recent conversation:",
    ...entries.map(
      (entry) =>
        `${entry.role === "assistant" ? "MagicHelp" : "User"}: ${entry.text}`,
    ),
  ].join("\n");
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
  articles,
  userContext,
  conversation = [],
  intent = {},
  projectContexts = [],
  projectLookupNotes = [],
}) => {
  const contextBlocks = articles.map((article, index) => {
    const steps = (article.steps || [])
      .map((step, stepIndex) => `${stepIndex + 1}. ${step}`)
      .join("\n");
    const tips = (article.tips || []).map((tip) => `- ${tip}`).join("\n");

    return [
      `Article ${index + 1}: ${article.title}`,
      `Category: ${article.category}`,
      `Summary: ${article.summary}`,
      steps ? `Steps:\n${steps}` : "",
      tips ? `Tips:\n${tips}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  });
  const projectContextBlock = getProjectPromptContext(
    projectContexts,
    projectLookupNotes,
  );
  const conversationBlock = buildConversationPromptBlock(conversation);

  return [
    "Answer the user's MagicHands system question using only the approved help articles and authorized project context below.",
    "If authorized project context is present, use it to tailor the status, blockers, and next checks for that specific project.",
    "If a project lookup note says the project could not be found or accessed, do not guess whether the project exists.",
    "If the help articles and project context do not contain enough information, say you could not find an approved tutorial for that exact question and suggest the closest article.",
    "Do not invent buttons, pages, permissions, or workflow steps.",
    "Do not claim that you changed, approved, submitted, or updated anything.",
    "Keep the answer practical, conversational, and specific to the user's question.",
    "Use this structure when it fits: Direct answer, Why this applies, Steps to take now, What to check next, When to escalate.",
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
    `Question: ${question}`,
    "",
    projectContextBlock,
    "Approved help articles:",
    contextBlocks.length
      ? contextBlocks.join("\n\n---\n\n")
      : "No matching approved help articles were found.",
  ].join("\n");
};

const requestOpenAiHelpAnswer = async ({
  question,
  articles = [],
  userContext,
  conversation = [],
  intent = {},
  projectContexts = [],
  projectLookupNotes = [],
}) => {
  const apiKey = toText(process.env.OPENAI_API_KEY);
  if (!apiKey || (articles.length === 0 && projectContexts.length === 0)) {
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
              "You are MagicHelp, a concise internal help assistant for the MagicHands project management system. You only answer from approved help content and authorized project context.",
          },
          {
            role: "user",
            content: buildHelpPrompt({
              question,
              articles,
              userContext,
              conversation,
              intent,
              projectContexts,
              projectLookupNotes,
            }),
          },
        ],
        max_tokens: 700,
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

    return toText(content);
  } finally {
    clearTimeout(timeout);
  }
};

const requestOllamaHelpAnswer = async ({
  question,
  articles = [],
  userContext,
  conversation = [],
  intent = {},
  projectContexts = [],
  projectLookupNotes = [],
}) => {
  if (articles.length === 0 && projectContexts.length === 0) return "";

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
          articles,
          userContext,
          conversation,
          intent,
          projectContexts,
          projectLookupNotes,
        }),
        stream: false,
        options: {
          temperature: 0.2,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ollama help request failed: ${response.status} ${errorText}`);
    }

    const payload = await response.json();
    return toText(payload?.response);
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
  matches,
  projectContexts = [],
  projectLookupNotes = [],
  intent = {},
) => {
  const projectSection = buildProjectFallbackSection(projectContexts, projectLookupNotes);
  const primaryProject = projectContexts[0] || null;
  const primaryArticle = matches[0]?.article || null;
  const primaryBlockers = toArray(primaryProject?.blockers)
    .map((blocker) =>
      [toText(blocker?.label), toText(blocker?.detail)].filter(Boolean).join(": "),
    )
    .filter(Boolean);
  const primaryChecks = toArray(primaryProject?.nextChecks).filter(Boolean);
  const articleSteps = toArray(primaryArticle?.steps).filter(Boolean);
  const articleTips = toArray(primaryArticle?.tips).filter(Boolean);
  const lines = [];

  if (!matches.length || matches[0].score < 4) {
    lines.push("Direct answer:");
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
        lines.push("I did not find an approved tutorial that exactly matches your question, but I can use the project snapshot to guide the next checks.");
      }
      if (primaryChecks.length > 0) {
        lines.push("");
        lines.push("What to check next:");
        primaryChecks.slice(0, 4).forEach((check, index) => {
          lines.push(`${index + 1}. ${check}`);
        });
      }
    } else {
      lines.push(
        "I could not find an approved tutorial for that exact question yet.",
      );
      lines.push(
        "Try searching with a workflow keyword such as order, quote, mockup, engagement, reminder, billing, inventory, or profile.",
      );
    }

    if (projectSection) {
      lines.push("");
      lines.push(projectSection);
    }

    return lines.join("\n");
  }

  lines.push("Direct answer:");
  lines.push(primaryArticle?.summary || buildArticleAnswer(primaryArticle));

  if (primaryProject) {
    lines.push("");
    lines.push("Why this applies:");
    lines.push(
      `${primaryProject.displayRef} is currently ${primaryProject.status || "in the system"}${
        primaryProject.projectName ? ` for ${primaryProject.projectName}` : ""
      }.`,
    );
    if (primaryBlockers.length > 0) {
      lines.push(`Current blocker: ${primaryBlockers[0]}.`);
    }
  }

  if (articleSteps.length > 0 || primaryChecks.length > 0) {
    lines.push("");
    lines.push("Steps to take now:");
    const steps = articleSteps.length > 0 ? articleSteps : primaryChecks;
    steps.slice(0, 5).forEach((step, index) => {
      lines.push(`${index + 1}. ${step}`);
    });
  }

  if (articleTips.length > 0 || primaryChecks.length > 0) {
    lines.push("");
    lines.push("What to check next:");
    const checks = articleTips.length > 0 ? articleTips : primaryChecks;
    checks.slice(0, 4).forEach((check, index) => {
      lines.push(`${index + 1}. ${check}`);
    });
  }

  if (projectSection) {
    lines.push("");
    lines.push(projectSection);
  }

  if (intent?.followUps?.length) {
    lines.push("");
    lines.push("You can also ask:");
    toArray(intent.followUps)
      .slice(0, 3)
      .forEach((followUp) => {
        lines.push(`- ${followUp}`);
      });
  }

  return lines.join("\n");
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

    if (question.length < 3) {
      return res.status(400).json({
        message: "Ask a question with at least 3 characters.",
      });
    }

    const userContext = getUserHelpContext(req.user);
    const intent = detectHelpIntent({ question, conversation });
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
    });
    const matches = searchHelpArticles(
      HELP_ARTICLES,
      contextualQuestion,
      userContext,
      {
        limit: 5,
        minScore: projectContexts.length ? 1 : 2,
        intent,
      },
    );
    const relatedArticles = matches.map((entry) => toPublicArticle(entry.article));
    const contextArticles = matches.map((entry) => entry.article);

    let answer = "";
    let source = "fallback";

    if (
      projectContexts.length > 0 ||
      (contextArticles.length > 0 && matches[0].score >= 4)
    ) {
      try {
        answer = await requestOpenAiHelpAnswer({
          question,
          articles: contextArticles,
          userContext,
          conversation,
          intent,
          projectContexts,
          projectLookupNotes,
        });
        if (answer) source = "openai";
      } catch (error) {
        console.error("OpenAI help answer failed, trying Ollama backup:", error);
      }

      if (!answer) {
        try {
          answer = await requestOllamaHelpAnswer({
            question,
            articles: contextArticles,
            userContext,
            conversation,
            intent,
            projectContexts,
            projectLookupNotes,
          });
          if (answer) source = "ollama";
        } catch (error) {
          console.error("Ollama help answer failed, using fallback:", error);
        }
      }
    }

    if (!answer) {
        answer = buildFallbackHelpAnswer(
          matches,
          projectContexts,
          projectLookupNotes,
          intent,
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
