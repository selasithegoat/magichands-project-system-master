const normalizeText = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const tokenize = (value) =>
  normalizeText(value)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);

const toArray = (value) => (Array.isArray(value) ? value : value ? [value] : []);

const unique = (items = []) => Array.from(new Set(items.filter(Boolean)));

const HELP_INTENT_DEFINITIONS = {
  blocker: {
    label: "Blocker or pending reason",
    patterns: [
      /\b(block|blocked|blocking|stuck|waiting|delay|issue|problem)\b/i,
      /\bwhy\b.{0,30}\b(pending|blocked|stuck|waiting)\b/i,
      /\bwhat\b.{0,20}\b(blocking|holding)\b/i,
      /\bon hold\b/i,
    ],
    queryTerms: [
      "blocker",
      "pending",
      "approval",
      "issue",
      "hold",
      "delay",
      "stuck",
    ],
    articleHints: [
      "blocked",
      "pending",
      "approval",
      "engagement",
      "hold",
      "sample",
      "mockup",
      "invoice",
    ],
    followUps: [
      "What should I do next?",
      "Who needs to act next?",
      "What exactly is blocking this?",
    ],
  },
  status: {
    label: "Status or progress",
    patterns: [
      /\bstatus\b/i,
      /\bwhere\b.{0,20}\b(project|order|quote|job)\b/i,
      /\b(update|progress|stage|state|currently)\b/i,
      /\bwhat\b.{0,20}\b(next|happening)\b/i,
    ],
    queryTerms: [
      "status",
      "progress",
      "current step",
      "next action",
      "workflow",
    ],
    articleHints: ["status", "project", "workflow", "engagement", "updates"],
    followUps: [
      "Who needs to act next?",
      "What should I check next?",
      "Why is this still pending?",
    ],
  },
  how_to: {
    label: "How-to or workflow",
    patterns: [
      /^\s*how\b/i,
      /\b(steps|process|workflow|tutorial|guide)\b/i,
      /\b(create|submit|send|approve|attach|upload|update|edit|complete)\b/i,
    ],
    queryTerms: [
      "steps",
      "workflow",
      "tutorial",
      "how to",
      "process",
    ],
    articleHints: ["steps", "guide", "submit", "create", "update", "tutorial"],
    followUps: [
      "Can you walk me through it step by step?",
      "What do I check after that?",
      "What usually goes wrong here?",
    ],
  },
  assignment: {
    label: "Ownership or assignment",
    patterns: [
      /\bwho\b.{0,24}\b(next|responsible|assigned|owns|owner|acts)\b/i,
      /\b(assign|assignment|lead|assistant lead|department)\b/i,
    ],
    queryTerms: [
      "lead",
      "assistant lead",
      "department",
      "assignment",
      "responsible",
    ],
    articleHints: ["lead", "assistant", "department", "engagement", "assignment"],
    followUps: [
      "How do I follow up with the assigned team?",
      "What should the assigned team do next?",
      "Why was this assigned there?",
    ],
  },
  navigation: {
    label: "Navigation or page location",
    patterns: [
      /\bwhere\b/i,
      /\b(find|locate|open|page|screen|menu|tab|route)\b/i,
      /\bhow do i get to\b/i,
    ],
    queryTerms: ["where", "page", "screen", "menu", "route", "open"],
    articleHints: ["page", "portal", "profile", "dashboard", "orders", "quotes"],
    followUps: [
      "What can I do on that page?",
      "Why can I not see that page?",
      "What comes after I open it?",
    ],
  },
  permission: {
    label: "Access or visibility",
    patterns: [
      /\b(can t|cannot|can not|unable|not allowed|permission|access)\b/i,
      /\b(not visible|can t see|cannot see|missing)\b/i,
    ],
    queryTerms: [
      "permission",
      "access",
      "role",
      "visible",
      "authorization",
    ],
    articleHints: ["access", "permission", "role", "front desk", "admin", "visible"],
    followUps: [
      "Who can access this?",
      "What role needs to update it?",
      "What should I do if I still cannot see it?",
    ],
  },
  billing: {
    label: "Billing or payment",
    patterns: [
      /\b(invoice|payment|billing|authorization|po|purchase order|receipt)\b/i,
    ],
    queryTerms: [
      "invoice",
      "payment",
      "authorization",
      "billing",
      "po",
    ],
    articleHints: ["invoice", "payment", "billing", "authorization", "po"],
    followUps: [
      "Is payment blocking this project?",
      "What billing step comes next?",
      "Who confirms payment in the system?",
    ],
  },
  quote: {
    label: "Quote workflow",
    patterns: [
      /\bquote\b/i,
      /\bmockup\b/i,
      /\bbid\b/i,
      /\bcost\b/i,
      /\brequirements?\b/i,
      /\bq[-_ ]?\d/i,
    ],
    queryTerms: [
      "quote",
      "mockup",
      "cost",
      "bid",
      "requirements",
      "sample",
    ],
    articleHints: ["quote", "mockup", "cost", "bid", "requirements", "sample"],
    followUps: [
      "What is blocking this quote?",
      "Which quote requirement is still pending?",
      "What should I send to the client next?",
    ],
  },
  general: {
    label: "General help",
    patterns: [],
    queryTerms: [],
    articleHints: [],
    followUps: [
      "What should I do next?",
      "Can you give me the steps?",
      "Which page should I open?",
    ],
  },
};

const FOLLOW_UP_ONLY_PATTERNS = [
  /^(why|how|what next|what should i do next|who next|who needs to act next)\??$/i,
  /\b(this|that|it|there)\b/i,
];

const getArticleSearchText = (article = {}) =>
  [
    article.title,
    article.category,
    article.summary,
    ...toArray(article.keywords),
    ...toArray(article.audience),
    ...toArray(article.departments),
    ...toArray(article.steps),
    ...toArray(article.tips),
  ].join(" ");

const truncateText = (value = "", maxLength = 220) => {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trim()}...`;
};

const getConversationEntries = (conversation = [], limit = 6) =>
  toArray(conversation)
    .map((entry) => ({
      role: normalizeText(entry?.role) === "assistant" ? "assistant" : "user",
      text: truncateText(entry?.text || entry?.content || "", 420),
    }))
    .filter((entry) => entry.text)
    .slice(-limit);

const getConversationSearchText = (conversation = [], limit = 4) =>
  getConversationEntries(conversation, limit)
    .filter((entry) => entry.role === "user")
    .map((entry) => entry.text)
    .join(" ");

const isLikelyFollowUpQuestion = (question = "") => {
  const text = String(question || "").trim();
  if (!text) return false;
  const normalized = normalizeText(text);
  if (normalized.split(" ").length <= 4) return true;
  return FOLLOW_UP_ONLY_PATTERNS.some((pattern) => pattern.test(normalized));
};

const scoreIntentMatch = (intentName, combinedText, questionText) => {
  const definition =
    HELP_INTENT_DEFINITIONS[intentName] || HELP_INTENT_DEFINITIONS.general;
  let score = 0;

  definition.patterns.forEach((pattern) => {
    if (pattern.test(questionText)) score += 6;
    else if (pattern.test(combinedText)) score += 3;
  });

  definition.queryTerms.forEach((term) => {
    const normalizedTerm = normalizeText(term);
    if (!normalizedTerm) return;
    if (questionText.includes(normalizedTerm)) score += 4;
    else if (combinedText.includes(normalizedTerm)) score += 2;
  });

  return score;
};

const detectHelpIntent = ({ question = "", conversation = [] } = {}) => {
  const questionText = normalizeText(question);
  const combinedText = normalizeText(
    [question, getConversationSearchText(conversation)].join(" "),
  );
  const followUp = isLikelyFollowUpQuestion(question);

  const scores = Object.keys(HELP_INTENT_DEFINITIONS)
    .filter((intentName) => intentName !== "general")
    .map((intentName) => ({
      name: intentName,
      score: scoreIntentMatch(intentName, combinedText, questionText),
    }));

  if (/\b#?[a-z0-9._/-]+\b/.test(questionText) && questionText.includes("pending")) {
    const statusEntry = scores.find((entry) => entry.name === "status");
    if (statusEntry) statusEntry.score += 2;
    const blockerEntry = scores.find((entry) => entry.name === "blocker");
    if (blockerEntry) blockerEntry.score += 3;
  }

  const top = scores.sort((a, b) => b.score - a.score)[0];
  const name = top && top.score > 0 ? top.name : "general";
  const definition = HELP_INTENT_DEFINITIONS[name] || HELP_INTENT_DEFINITIONS.general;

  return {
    name,
    label: definition.label,
    score: top?.score || 0,
    isFollowUp: followUp,
    queryTerms: definition.queryTerms || [],
    articleHints: definition.articleHints || [],
    followUps: definition.followUps || HELP_INTENT_DEFINITIONS.general.followUps,
  };
};

const buildHelpRetrievalText = ({
  question = "",
  conversation = [],
  intent = {},
  projectSearchText = "",
} = {}) =>
  unique([
    question,
    getConversationSearchText(conversation, 4),
    projectSearchText,
    ...toArray(intent?.queryTerms),
    ...toArray(intent?.articleHints),
  ])
    .filter(Boolean)
    .join(" ");

const getUserHelpContext = (user = {}) => {
  const departments = toArray(user?.department)
    .map((item) => String(item || "").trim())
    .filter(Boolean);
  const departmentText = departments.join(" ");
  const role = String(user?.role || "").trim();
  const employeeType = String(user?.employeeType || "").trim();
  const normalizedContext = normalizeText(
    [role, employeeType, departmentText].join(" "),
  );

  const audience = [];
  if (normalizedContext.includes("admin")) audience.push("admin");
  if (normalizedContext.includes("front desk")) audience.push("front-desk");
  if (normalizedContext.includes("stores")) audience.push("stores");
  if (normalizedContext.includes("stock")) audience.push("stores");
  if (normalizedContext.includes("packaging")) audience.push("stores");
  if (normalizedContext.includes("production")) audience.push("department");
  if (normalizedContext.includes("graphics")) audience.push("department");
  if (normalizedContext.includes("photography")) audience.push("department");
  if (normalizedContext.includes("lead")) audience.push("lead");

  return {
    role,
    employeeType,
    departments,
    audience: unique(["all", ...audience]),
  };
};

const articleAudienceScore = (article = {}, userContext = {}) => {
  const articleAudience = toArray(article.audience).map(normalizeText);
  const userAudience = toArray(userContext.audience).map(normalizeText);
  const articleDepartments = toArray(article.departments).map(normalizeText);
  const userDepartments = toArray(userContext.departments).map(normalizeText);

  let score = 0;
  if (articleAudience.includes("all")) score += 1;
  for (const target of userAudience) {
    if (articleAudience.includes(target)) score += 2;
  }
  for (const department of userDepartments) {
    if (articleDepartments.includes(department)) score += 2;
  }

  return score;
};

const getIntentArticleBoost = (article = {}, intent = {}) => {
  const articleText = normalizeText(getArticleSearchText(article));
  const categoryText = normalizeText(article.category);
  let score = 0;

  toArray(intent?.articleHints).forEach((hint) => {
    const normalizedHint = normalizeText(hint);
    if (!normalizedHint) return;
    if (categoryText.includes(normalizedHint)) score += 5;
    if (articleText.includes(normalizedHint)) score += 3;
  });

  if (intent?.name === "how_to" && toArray(article.steps).length > 0) score += 4;
  if (intent?.name === "navigation" && toArray(article.relatedRoutes).length > 0) {
    score += 4;
  }
  if (intent?.name === "quote" && /quote|mockup|cost|bid/.test(articleText)) {
    score += 4;
  }
  if (intent?.name === "billing" && /invoice|payment|billing|authorization/.test(articleText)) {
    score += 4;
  }

  return score;
};

const scoreArticle = (article = {}, query = "", userContext = {}, intent = {}) => {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) {
    return (
      articleAudienceScore(article, userContext) +
      getIntentArticleBoost(article, intent)
    );
  }

  const queryTokens = tokenize(normalizedQuery);
  const titleText = normalizeText(article.title);
  const categoryText = normalizeText(article.category);
  const keywordText = normalizeText(toArray(article.keywords).join(" "));
  const summaryText = normalizeText(article.summary);
  const searchText = normalizeText(getArticleSearchText(article));
  let score =
    articleAudienceScore(article, userContext) +
    getIntentArticleBoost(article, intent);

  if (titleText.includes(normalizedQuery)) score += 18;
  if (keywordText.includes(normalizedQuery)) score += 14;
  if (summaryText.includes(normalizedQuery)) score += 8;
  if (categoryText.includes(normalizedQuery)) score += 5;

  for (const token of queryTokens) {
    if (titleText.includes(token)) score += 5;
    if (keywordText.includes(token)) score += 4;
    if (summaryText.includes(token)) score += 2;
    if (searchText.includes(token)) score += 1;
  }

  return score;
};

const searchHelpArticles = (
  articles = [],
  query = "",
  userContext = {},
  options = {},
) => {
  const limit = Number.isFinite(Number(options.limit))
    ? Math.max(1, Number(options.limit))
    : 6;
  const minScore = Number.isFinite(Number(options.minScore))
    ? Number(options.minScore)
    : 1;
  const intent =
    typeof options.intent === "string"
      ? detectHelpIntent({ question: options.intent })
      : options.intent || HELP_INTENT_DEFINITIONS.general;

  return toArray(articles)
    .map((article) => ({
      article,
      score: scoreArticle(article, query, userContext, intent),
    }))
    .filter((entry) => entry.score >= minScore)
    .sort((a, b) => b.score - a.score || a.article.title.localeCompare(b.article.title))
    .slice(0, limit);
};

const buildArticleAnswer = (article = {}) => {
  const steps = toArray(article.steps);
  const tips = toArray(article.tips);
  const stepText = steps.length
    ? `\n\nSteps:\n${steps.map((step, index) => `${index + 1}. ${step}`).join("\n")}`
    : "";
  const tipText = tips.length
    ? `\n\nTips:\n${tips.map((tip) => `- ${tip}`).join("\n")}`
    : "";

  return `${article.summary || ""}${stepText}${tipText}`.trim();
};

module.exports = {
  buildHelpRetrievalText,
  normalizeText,
  tokenize,
  getArticleSearchText,
  getUserHelpContext,
  getConversationEntries,
  getConversationSearchText,
  detectHelpIntent,
  isLikelyFollowUpQuestion,
  searchHelpArticles,
  buildArticleAnswer,
};
