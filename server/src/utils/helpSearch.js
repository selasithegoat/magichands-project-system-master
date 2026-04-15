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

const scoreArticle = (article = {}, query = "", userContext = {}) => {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return articleAudienceScore(article, userContext);

  const queryTokens = tokenize(normalizedQuery);
  const titleText = normalizeText(article.title);
  const categoryText = normalizeText(article.category);
  const keywordText = normalizeText(toArray(article.keywords).join(" "));
  const summaryText = normalizeText(article.summary);
  const searchText = normalizeText(getArticleSearchText(article));
  let score = articleAudienceScore(article, userContext);

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

  return toArray(articles)
    .map((article) => ({
      article,
      score: scoreArticle(article, query, userContext),
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
  normalizeText,
  tokenize,
  getArticleSearchText,
  getUserHelpContext,
  searchHelpArticles,
  buildArticleAnswer,
};
