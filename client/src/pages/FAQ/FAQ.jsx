import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import HelpIcon from "../../components/icons/HelpIcon";
import SearchIcon from "../../components/icons/SearchIcon";
import usePersistedState from "../../hooks/usePersistedState";
import "./FAQ.css";

const MAX_QUESTION_LENGTH = 600;
const MAX_CONVERSATION_TURNS = 8;
const QUICK_QUESTIONS = [
  "What should I do next?",
  "Who needs to act next?",
  "Why is this pending?",
  "What is blocking production?",
];
const TROUBLESHOOTERS = [
  ["production-blocked", "Production blocked", "Why is this project blocked from production?", "Projects"],
  ["quote-blocked", "Quote blocked", "What is blocking this quote request?", "Quotes"],
  ["mockup-pending", "Mockup pending", "Why is the mockup still pending?", "Mockups"],
  ["project-not-visible", "Project not visible", "Why can I not see a project in my portal?", "Getting Started"],
  ["engagement-issue", "Engagement issue", "Why can I not acknowledge or complete my department engagement?", "Engagement"],
];
const WHATS_NEW = [
  ["Project-aware MagicHelp", "Ask with #1024 or attach a project to get status-specific guidance."],
  ["Quote support", "Use quote references like Q2026-001 for requirement, mockup, cost, and decision help."],
  ["Answer feedback", "Mark answers as helpful, not helpful, or still confusing so tutorials can improve."],
];
const SYNONYM_GROUPS = [
  ["artwork", "mockup", "graphics", "design"],
  ["payment", "billing", "invoice", "authorization", "po"],
  ["job", "project", "order"],
  ["assigned", "assignment", "lead", "assistant"],
  ["department", "engagement", "acknowledge", "acknowledgement"],
  ["quote", "cost", "bid", "sample", "requirements"],
  ["alert", "notification", "reminder"],
  ["warehouse", "stock", "stores", "packaging", "inventory"],
  ["blocked", "stuck", "pending", "cannot", "can't"],
];

const normalizeText = (value) =>
  String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const toArray = (value) => (Array.isArray(value) ? value : value ? [value] : []);
const unique = (items = []) => Array.from(new Set(items.filter(Boolean)));
const getArticleText = (article) =>
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
const getTokens = (term) => {
  const tokens = normalizeText(term).split(" ").filter((token) => token.length >= 2);
  return unique([
    ...tokens,
    ...tokens.flatMap((token) =>
      SYNONYM_GROUPS.find((group) => group.includes(token)) || [],
    ),
  ]);
};
const getAudience = (user) => {
  const text = normalizeText(
    [user?.role, user?.position, user?.employeeType, ...toArray(user?.department)].join(" "),
  );
  const audience = ["all"];
  if (text.includes("admin") || text.includes("administration")) audience.push("admin");
  if (text.includes("front desk")) audience.push("front-desk");
  if (text.includes("stores") || text.includes("stock") || text.includes("packaging")) {
    audience.push("stores");
  }
  if (text.includes("lead") || text.includes("leader")) audience.push("lead");
  if (text.includes("production") || text.includes("graphics") || text.includes("photography")) {
    audience.push("department");
  }
  return unique(audience);
};
const getRoleLabel = (user) => {
  const departments = toArray(user?.department);
  return (
    departments.find((dept) =>
      ["Front Desk", "Stores", "Graphics/Design", "Photography", "Production", "Administration"].includes(dept),
    ) ||
    departments[0] ||
    user?.position ||
    "Your role"
  );
};
const articleScore = (article, audience) =>
  (toArray(article.audience).includes("all") ? 1 : 0) +
  audience.reduce((score, item) => score + (toArray(article.audience).includes(item) ? 4 : 0), 0);
const formatDate = (value) => {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(date);
};
const formatAnswerLines = (answer) => String(answer || "").split("\n").map((line) => line.trimEnd());
const truncatePreviewText = (value, maxLength = 180) => {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trim()}...`;
};
const projectRef = (project) => String(project?.displayRef || project?.orderId || project?.quoteNumber || "").trim();
const withProject = (question, project) => {
  const nextQuestion = String(question || "").trim();
  const reference = projectRef(project);
  if (!reference || !nextQuestion) return nextQuestion;
  return nextQuestion.includes(reference) ? nextQuestion : `${nextQuestion} (${reference})`;
};
const createConversationTurnId = (prefix = "turn") =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const normalizeIntent = (value) => ({
  name: String(value?.name || "").trim(),
  label: String(value?.label || "").trim(),
  isFollowUp: Boolean(value?.isFollowUp),
});
const normalizeAnswerSourceLabel = (value) => {
  const source = String(value || "").trim().toLowerCase();
  if (source === "openai") return "AI";
  if (source === "ollama") return "Local AI";
  if (source === "fallback") return "Approved help";
  return source ? source : "Help";
};
const normalizeHelpCapabilities = (value) => ({
  projectSearch: Boolean(value?.projectSearch),
  feedback: Boolean(value?.feedback),
  projectAwareAnswers: Boolean(value?.projectAwareAnswers),
  conversation: Boolean(value?.conversation),
  followUpSuggestions: Boolean(value?.followUpSuggestions),
});
const normalizeReplyTarget = (value) => {
  const text = truncatePreviewText(value?.text || value?.content || "");
  if (!text) return null;
  const role = String(value?.role || "").trim().toLowerCase() === "assistant" ? "assistant" : "user";
  return {
    turnId: String(value?.turnId || value?.id || "").trim(),
    role,
    label: role === "assistant" ? "MagicHelp" : "You",
    text,
  };
};
const createReplyTarget = (turn) =>
  normalizeReplyTarget({
    turnId: turn?.id,
    role: turn?.role,
    text: turn?.text,
  });
const formatOrderReference = (value) => {
  const reference = String(value || "").trim();
  if (!reference) return "";
  if (reference.startsWith("#") || /^q/i.test(reference)) return reference;
  return `#${reference}`;
};
const getProjectDisplayRef = (project) => {
  const quoteNumber = String(project?.quoteDetails?.quoteNumber || project?.quoteNumber || "").trim();
  if (quoteNumber) return quoteNumber;
  return formatOrderReference(project?.orderId || project?.orderRef?.orderNumber || project?.displayRef);
};
const getProjectName = (project) =>
  String(
    project?.projectName ||
      project?.details?.projectName ||
      project?.details?.projectNameRaw ||
      project?.details?.projectIndicator ||
      "",
  ).trim();
const toProjectPickerResult = (project) => ({
  projectId: String(project?._id || project?.projectId || "").trim(),
  displayRef: getProjectDisplayRef(project),
  projectName: getProjectName(project),
  status: String(project?.status || "").trim(),
  projectType: String(project?.projectType || "").trim(),
  clientName: String(project?.clientName || project?.details?.client || "").trim(),
});
const toSelectedProjectFromContext = (project) => ({
  projectId: String(project?.projectId || "").trim(),
  displayRef: String(project?.displayRef || "").trim(),
  projectName: String(project?.projectName || "").trim(),
  status: String(project?.status || "").trim(),
  projectType: String(project?.projectType || "").trim(),
  clientName: String(project?.clientName || "").trim(),
});
const toConversationPayload = (conversation) =>
  toArray(conversation)
    .slice(-6)
    .map((turn) => ({
      role: turn?.role === "assistant" ? "assistant" : "user",
      text: String(turn?.text || "").slice(0, 420),
      source: String(turn?.source || "").slice(0, 40),
      replyTo: normalizeReplyTarget(turn?.replyTo),
    }))
    .filter((turn) => turn.text);
const getProjectPickerSearchText = (project) =>
  normalizeText(
    [
      project.displayRef,
      project.projectName,
      project.status,
      project.projectType,
      project.clientName,
    ].join(" "),
  );
const searchProjectsFromPortal = async (query, signal) => {
  const response = await fetch("/api/projects?mode=report", {
    credentials: "include",
    cache: "no-store",
    signal,
  });
  const payload = await response.json().catch(() => []);
  if (!response.ok) {
    throw new Error(payload?.message || "Unable to search projects.");
  }

  const tokens = getTokens(query);
  const projects = (Array.isArray(payload) ? payload : toArray(payload?.projects))
    .map(toProjectPickerResult)
    .filter((project) => project.projectId && project.displayRef);

  return projects
    .filter((project) => {
      if (!tokens.length) return true;
      const text = getProjectPickerSearchText(project);
      return tokens.every((token) => text.includes(token));
    })
    .slice(0, 8);
};
const highlight = (text, term) => {
  const tokens = normalizeText(term).split(" ").filter((token) => token.length >= 2).slice(0, 5);
  if (!tokens.length) return text;
  const pattern = tokens.map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  return String(text || "").split(new RegExp(`(${pattern})`, "gi")).map((part, index) =>
    tokens.some((token) => part.toLowerCase() === token.toLowerCase()) ? (
      <mark key={`${part}-${index}`}>{part}</mark>
    ) : (
      <React.Fragment key={`${part}-${index}`}>{part}</React.Fragment>
    ),
  );
};

const FAQ = ({ user }) => {
  const location = useLocation();
  const questionRef = useRef(null);
  const chatWindowRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [categories, setCategories] = useState(["All"]);
  const [articles, setArticles] = useState([]);
  const [featuredArticleIds, setFeaturedArticleIds] = useState([]);
  const [activeCategory, setActiveCategory] = usePersistedState(
    "client-faq-active-category",
    "All",
  );
  const [searchTerm, setSearchTerm] = usePersistedState(
    "client-faq-search-term",
    "",
  );
  const [expandedIds, setExpandedIds] = useState(() => new Set());
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState("");
  const [answer, setAnswer] = useState(null);
  const [selectedProject, setSelectedProject] = useState(null);
  const [projectQuery, setProjectQuery] = useState("");
  const [projectResults, setProjectResults] = useState([]);
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);
  const [projectSearching, setProjectSearching] = useState(false);
  const [projectSearchError, setProjectSearchError] = useState("");
  const [feedbackRating, setFeedbackRating] = useState("");
  const [feedbackNote, setFeedbackNote] = useState("");
  const [feedbackStatus, setFeedbackStatus] = useState("");
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [conversation, setConversation] = useState([]);
  const [helpCapabilities, setHelpCapabilities] = useState(() =>
    normalizeHelpCapabilities(),
  );
  const [replyTarget, setReplyTarget] = useState(null);

  const audience = useMemo(() => getAudience(user), [user]);
  const roleLabel = useMemo(() => getRoleLabel(user), [user]);
  const roleArticles = useMemo(
    () =>
      [...articles]
        .map((article) => ({ article, score: articleScore(article, audience) }))
        .filter((entry) => entry.score > 1)
        .sort((a, b) => b.score - a.score || a.article.title.localeCompare(b.article.title))
        .slice(0, 5)
        .map((entry) => entry.article),
    [articles, audience],
  );
  const featuredArticles = useMemo(() => {
    const articleMap = new Map(articles.map((article) => [article.id, article]));
    const apiFeatured = featuredArticleIds.map((id) => articleMap.get(id)).filter(Boolean);
    return unique([...apiFeatured, ...roleArticles, ...articles]).slice(0, 4);
  }, [articles, featuredArticleIds, roleArticles]);
  const filteredArticles = useMemo(() => {
    const tokens = getTokens(searchTerm);
    return articles.filter((article) => {
      if (activeCategory !== "All" && article.category !== activeCategory) return false;
      if (!tokens.length) return true;
      const text = normalizeText(getArticleText(article));
      return tokens.every((token) => text.includes(token));
    });
  }, [activeCategory, articles, searchTerm]);
  const answerRoutes = useMemo(() => {
    if (!answer) return [];
    const seen = new Set();
    return answer.relatedArticles
      .flatMap((article) => toArray(article.relatedRoutes))
      .filter((route) => {
        if (!route?.label || !route?.path) return false;
        const key = `${route.label}-${route.path}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }, [answer]);
  const questionSuggestions = useMemo(() => {
    const answerSuggestions = toArray(answer?.followUpSuggestions).filter(Boolean);
    return unique(answerSuggestions.length ? answerSuggestions : QUICK_QUESTIONS).slice(0, 5);
  }, [answer]);

  useEffect(() => {
    let mounted = true;
    const loadArticles = async () => {
      setLoading(true);
      setLoadError("");
      try {
        const response = await fetch("/api/help/articles", { credentials: "include", cache: "no-store" });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload?.message || "Unable to load help articles.");
        if (!mounted) return;
        const nextArticles = toArray(payload?.articles);
        setHelpCapabilities(normalizeHelpCapabilities(payload?.capabilities));
        setArticles(nextArticles);
        setCategories(toArray(payload?.categories).length ? payload.categories : ["All"]);
        setFeaturedArticleIds(toArray(payload?.featuredArticleIds));
        setExpandedIds(new Set(nextArticles.slice(0, 1).map((article) => article.id)));
      } catch (error) {
        if (mounted) setLoadError(error.message || "Unable to load help articles.");
      } finally {
        if (mounted) setLoading(false);
      }
    };
    loadArticles();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!categories.length || categories.includes(activeCategory)) {
      return;
    }
    setActiveCategory("All");
  }, [activeCategory, categories, setActiveCategory]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const topic = TROUBLESHOOTERS.find((item) => item[0] === params.get("topic"));
    const nextQuestion = params.get("q") || topic?.[2] || "";
    const nextCategory = params.get("category") || topic?.[3] || "";
    const projectId = params.get("projectId") || "";
    if (nextQuestion) setQuestion(nextQuestion.slice(0, MAX_QUESTION_LENGTH));
    if (nextCategory) setActiveCategory(nextCategory);
    if (projectId) setProjectQuery(projectId);
  }, [location.search]);

  useEffect(() => {
    if (!projectPickerOpen && !projectQuery) return undefined;
    let active = true;
    const controller = new AbortController();
    const timerId = window.setTimeout(async () => {
      if (!active) return;
      setProjectSearching(true);
      setProjectSearchError("");
      try {
        let projects = [];
        let shouldUseFallback = !helpCapabilities.projectSearch;
        if (helpCapabilities.projectSearch) {
          const response = await fetch(`/api/help/projects?query=${encodeURIComponent(projectQuery)}&limit=8`, {
            credentials: "include",
            cache: "no-store",
            signal: controller.signal,
          });
          const payload = await response.json().catch(() => ({}));
          if (response.ok) {
            projects = toArray(payload?.projects);
          } else if (response.status === 404) {
            shouldUseFallback = true;
          } else {
            throw new Error(payload?.message || "Unable to search projects.");
          }
        }
        if (shouldUseFallback) {
          projects = await searchProjectsFromPortal(projectQuery, controller.signal);
        }
        if (!active) return;
        setProjectResults(projects);
        const projectId = new URLSearchParams(location.search).get("projectId");
        const match = projectId ? projects.find((project) => project.projectId === projectId) : null;
        if (match && !selectedProject) {
          setSelectedProject(match);
          setProjectQuery([match.displayRef, match.projectName].filter(Boolean).join(" - "));
        }
      } catch (error) {
        if (active && error.name !== "AbortError") {
          setProjectSearchError(error.message || "Unable to search projects.");
        }
      } finally {
        if (active) setProjectSearching(false);
      }
    }, 220);
    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(timerId);
    };
  }, [helpCapabilities.projectSearch, location.search, projectPickerOpen, projectQuery, selectedProject]);

  useEffect(() => {
    if (!chatWindowRef.current) return;
    chatWindowRef.current.scrollTop = chatWindowRef.current.scrollHeight;
  }, [conversation, answer]);

  const focusQuestion = () => window.setTimeout(() => questionRef.current?.focus(), 30);
  const prefillQuestion = (nextQuestion, includeProject = true) => {
    setQuestion((includeProject ? withProject(nextQuestion, selectedProject) : nextQuestion).slice(0, MAX_QUESTION_LENGTH));
    setAskError("");
    focusQuestion();
  };
  const revealArticle = (articleId) => {
    setActiveCategory("All");
    setSearchTerm("");
    setExpandedIds((previous) => new Set([...previous, articleId]));
    window.setTimeout(() => document.getElementById(`faq-article-${articleId}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
  };
  const selectProject = (project) => {
    setSelectedProject(project);
    setProjectQuery([project.displayRef, project.projectName].filter(Boolean).join(" - "));
    setProjectPickerOpen(false);
    if (!question.trim()) setQuestion(withProject("What should I do next?", project));
  };
  const clearSelectedProject = () => {
    setSelectedProject(null);
    setProjectQuery("");
    setProjectResults([]);
  };
  const resetFeedback = () => {
    setFeedbackRating("");
    setFeedbackNote("");
    setFeedbackStatus("");
    setFeedbackSubmitting(false);
  };
  const clearConversation = () => {
    setConversation([]);
    setAnswer(null);
    setAskError("");
    setReplyTarget(null);
    resetFeedback();
  };
  const startReply = (turn) => {
    const nextReplyTarget = createReplyTarget(turn);
    if (!nextReplyTarget) return;
    setReplyTarget(nextReplyTarget);
    setAskError("");
    focusQuestion();
  };
  const handleAsk = async (event) => {
    event.preventDefault();
    const trimmedQuestion = question.trim();
    const currentReplyTarget = normalizeReplyTarget(replyTarget);
    if (trimmedQuestion.length < 3) {
      setAskError("Ask a question with at least 3 characters.");
      return;
    }
    setAsking(true);
    setAskError("");
    resetFeedback();
    try {
      const response = await fetch("/api/help/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          question: trimmedQuestion,
          projectIds: selectedProject?.projectId ? [selectedProject.projectId] : [],
          conversation: toConversationPayload(conversation),
          replyTo: currentReplyTarget,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.message || "Unable to answer that question.");
      const nextAnswer = {
        answerId: payload?.answerId || "",
        question: trimmedQuestion,
        text: payload?.answer || "",
        source: payload?.source || "fallback",
        sourceLabel: normalizeAnswerSourceLabel(payload?.source),
        intent: normalizeIntent(payload?.intent),
        followUpSuggestions: toArray(payload?.followUpSuggestions),
        relatedArticles: toArray(payload?.relatedArticles),
        projectContexts: toArray(payload?.projectContexts),
        projectLookupNotes: toArray(payload?.projectLookupNotes),
      };
      setAnswer(nextAnswer);
      setConversation((previous) =>
        [
          ...previous,
          {
            id: createConversationTurnId("user"),
            role: "user",
            text: trimmedQuestion,
            replyTo: currentReplyTarget,
          },
          {
            id: createConversationTurnId("assistant"),
            role: "assistant",
            text: nextAnswer.text,
            source: nextAnswer.source,
            sourceLabel: nextAnswer.sourceLabel,
            intent: nextAnswer.intent,
            projectContexts: nextAnswer.projectContexts,
          },
        ].slice(-MAX_CONVERSATION_TURNS),
      );
      if (!selectedProject && nextAnswer.projectContexts[0]?.projectId) {
        const contextProject = toSelectedProjectFromContext(nextAnswer.projectContexts[0]);
        setSelectedProject(contextProject);
        setProjectQuery([contextProject.displayRef, contextProject.projectName].filter(Boolean).join(" - "));
      }
      setQuestion("");
      setReplyTarget(null);
    } catch (error) {
      setAskError(error.message || "Unable to answer that question.");
    } finally {
      setAsking(false);
    }
  };
  const submitFeedback = async (rating) => {
    if (!answer || feedbackSubmitting) return;
    setFeedbackRating(rating);
    if (!helpCapabilities.feedback) {
      setFeedbackStatus("Feedback saving is not available on this server yet.");
      return;
    }
    setFeedbackSubmitting(true);
    setFeedbackStatus("");
    try {
      const response = await fetch("/api/help/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          rating,
          note: feedbackNote,
          answerId: answer.answerId,
          question: answer.question,
          answerPreview: answer.text,
          source: answer.source,
          relatedArticleIds: answer.relatedArticles.map((article) => article.id),
          projectIds: answer.projectContexts.map((project) => project.projectId),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 404) {
        setFeedbackStatus("Feedback saving is not available on this server yet.");
        return;
      }
      if (!response.ok) throw new Error(payload?.message || "Unable to save feedback.");
      setFeedbackStatus(payload?.message || "Thanks for the feedback.");
    } catch (error) {
      setFeedbackStatus(error.message || "Unable to save feedback.");
    } finally {
      setFeedbackSubmitting(false);
    }
  };
  const toggleExpanded = (articleId) => {
    setExpandedIds((previous) => {
      const next = new Set(previous);
      if (next.has(articleId)) next.delete(articleId);
      else next.add(articleId);
      return next;
    });
  };
  const renderRoutes = (routes) => {
    const safeRoutes = toArray(routes).filter((route) => route?.label && route?.path);
    if (!safeRoutes.length) return null;
    return (
      <div className="faq-related-routes">
        {safeRoutes.map((route) => (
          <Link key={`${route.label}-${route.path}`} to={route.path}>{route.label}</Link>
        ))}
      </div>
    );
  };
  const renderArticle = (article) => {
    const isExpanded = expandedIds.has(article.id);
    return (
      <article id={`faq-article-${article.id}`} key={article.id} className="faq-article">
        <button type="button" className="faq-article-toggle" onClick={() => toggleExpanded(article.id)} aria-expanded={isExpanded}>
          <span>
            <span className="faq-category-pill">{article.category}</span>
            <strong>{highlight(article.title, searchTerm)}</strong>
          </span>
          <span className="faq-toggle-symbol" aria-hidden="true">{isExpanded ? "-" : "+"}</span>
        </button>
        {isExpanded && (
          <div className="faq-article-body">
            <p>{highlight(article.summary, searchTerm)}</p>
            {toArray(article.steps).length > 0 && (
              <ol className="faq-steps">{article.steps.map((step) => <li key={step}>{highlight(step, searchTerm)}</li>)}</ol>
            )}
            {toArray(article.tips).length > 0 && (
              <div className="faq-tips">{article.tips.map((tip) => <span key={tip}>{highlight(tip, searchTerm)}</span>)}</div>
            )}
            {renderRoutes(article.relatedRoutes)}
          </div>
        )}
      </article>
    );
  };

  return (
    <main className="faq-page">
      <section className="faq-hero">
        <div className="faq-hero-copy">
          <span className="faq-eyebrow"><HelpIcon width="18" height="18" />Help Center</span>
          <h1>FAQ & Tutorials</h1>
          <p>Ask MagicHelp, attach a project, or browse role-aware tutorials for orders, quotes, engagement, mockups, billing, inventory, and updates.</p>
          <div className="faq-role-strip"><span>{roleLabel}</span><strong>{roleArticles.length} role-matched tutorials</strong></div>
        </div>

        <form className="faq-ask-panel" onSubmit={handleAsk}>
          <div className="faq-ask-heading">
            <label htmlFor="faq-question">MagicHelp Chat</label>
            <div className="faq-ask-controls">
              {conversation.length > 0 && <button type="button" className="faq-project-picker-toggle" onClick={clearConversation}>New chat</button>}
              <button type="button" className="faq-project-picker-toggle" onClick={() => setProjectPickerOpen((value) => !value)}>Attach project</button>
            </div>
          </div>
          {selectedProject && (
            <div className="faq-selected-project">
              <div><strong>{selectedProject.displayRef}</strong><span>{selectedProject.projectName || selectedProject.status}</span></div>
              <button type="button" onClick={clearSelectedProject}>Remove</button>
            </div>
          )}
          {projectPickerOpen && (
            <div className="faq-project-picker">
              <div className="faq-project-search">
                <SearchIcon width="16" height="16" />
                <input type="search" value={projectQuery} onChange={(event) => setProjectQuery(event.target.value)} placeholder="Search order ID, quote ID, project, or client" />
              </div>
              <div className="faq-project-results">
                {projectSearching ? <span>Searching projects...</span> : projectSearchError ? <span className="faq-error">{projectSearchError}</span> : projectResults.length === 0 ? <span>No accessible projects found.</span> : projectResults.map((project) => (
                  <button type="button" key={project.projectId} onClick={() => selectProject(project)}>
                    <strong>{project.displayRef}</strong>
                    <span>{[project.projectName, project.status].filter(Boolean).join(" | ")}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {conversation.length > 0 && (
            <div className="faq-chat-inline" aria-live="polite">
              <div className="faq-chat-inline-header">
                <span>Conversation</span>
                <span>{conversation.length} turn{conversation.length === 1 ? "" : "s"}</span>
              </div>
              <div className="faq-chat-list" ref={chatWindowRef}>
                {conversation.map((turn) => (
                  <article key={turn.id} id={`faq-turn-${turn.id}`} className={`faq-chat-turn ${turn.role}`}>
                    <div className="faq-chat-meta">
                      <strong>{turn.role === "assistant" ? "MagicHelp" : "You"}</strong>
                      <div className="faq-chat-meta-actions">
                        {turn.role === "assistant" && (
                          <>
                            {turn.intent?.label && <span className="faq-chat-intent">{turn.intent.label}</span>}
                            {turn.sourceLabel && <span className="faq-chat-source">{turn.sourceLabel}</span>}
                          </>
                        )}
                        {turn.role === "assistant" && (
                          <button
                            type="button"
                            className={`faq-chat-reply-button ${replyTarget?.turnId === turn.id ? "active" : ""}`}
                            onClick={() => startReply(turn)}
                          >
                            {replyTarget?.turnId === turn.id ? "Replying" : "Reply"}
                          </button>
                        )}
                      </div>
                    </div>
                    {turn.replyTo && (
                      <div className="faq-chat-quote">
                        <span>Replying to {turn.replyTo.label || (turn.replyTo.role === "assistant" ? "MagicHelp" : "You")}</span>
                        <p>{turn.replyTo.text}</p>
                      </div>
                    )}
                    <div className="faq-chat-text">
                      {formatAnswerLines(turn.text).map((line, index) => line ? <p key={`${turn.id}-${index}`}>{line}</p> : <br key={`${turn.id}-break-${index}`} />)}
                    </div>
                    {turn.role === "assistant" && toArray(turn.projectContexts).length > 0 && (
                      <div className="faq-chat-projects">
                        {turn.projectContexts.slice(0, 3).map((project) => <span key={`${turn.id}-${project.projectId || project.displayRef}`}>{project.displayRef}</span>)}
                      </div>
                    )}
                  </article>
                ))}
              </div>
            </div>
          )}
          {answer && (
            <>
              {answer.projectContexts.length > 0 && (
                <div className="faq-project-contexts">
                  <span>Project context used</span>
                  <div className="faq-project-context-list">
                    {answer.projectContexts.map((project) => (
                      <article className="faq-project-context-item" key={project.projectId || project.displayRef}>
                        <div>
                          <strong>{project.displayRef}{project.projectName ? ` - ${project.projectName}` : ""}</strong>
                          <p>{[project.projectType, project.status].filter(Boolean).join(" | ")}</p>
                          {project.clientName && <p>Client: {project.clientName}</p>}
                          {project.updatedAt && <p>Updated {formatDate(project.updatedAt)}</p>}
                        </div>
                        {toArray(project.blockers).length > 0 && <ul>{project.blockers.slice(0, 3).map((blocker) => <li key={`${project.projectId}-${blocker.label}`}>{blocker.label}</li>)}</ul>}
                        {project.route && <Link to={project.route} className="faq-project-link">Open project</Link>}
                      </article>
                    ))}
                  </div>
                </div>
              )}
              {answer.projectLookupNotes.length > 0 && <div className="faq-lookup-notes">{answer.projectLookupNotes.map((note) => <p key={`${note.reference}-${note.code}`}>{note.message}</p>)}</div>}
            </>
          )}
          {replyTarget && (
            <div className="faq-replying-to">
              <div className="faq-replying-to-header">
                <span>Replying to {replyTarget.label}</span>
                <button type="button" onClick={() => setReplyTarget(null)}>Cancel</button>
              </div>
              <p>{replyTarget.text}</p>
            </div>
          )}
          <textarea id="faq-question" ref={questionRef} value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Example: Why is #1024 or Q2026-001 still pending?" rows="3" maxLength={MAX_QUESTION_LENGTH} />
          <div className="faq-quick-questions">
            {questionSuggestions.map((item) => <button type="button" key={item} onClick={() => prefillQuestion(item)}>{item}</button>)}
          </div>
          <p className="faq-ask-hint">{conversation.length > 0 ? "MagicHelp keeps the last few turns so follow-up questions can stay specific." : "Use # for regular orders, Q for quote requests, or attach a project before asking."}</p>
          <div className="faq-ask-actions">
            <span>{question.length}/{MAX_QUESTION_LENGTH}</span>
            <button type="submit" disabled={asking}>{asking ? "Finding answer..." : "Ask"}</button>
          </div>
          {askError && <p className="faq-error">{askError}</p>}
          {answer && (
            <>
              <div className="faq-answer-actions">
                <span>Useful next steps</span>
                <div>
                  {answer.projectContexts[0]?.route && <Link to={answer.projectContexts[0].route}>Open project</Link>}
                  {answerRoutes.map((route) => <Link key={`${route.label}-${route.path}`} to={route.path}>{route.label}</Link>)}
                  <button type="button" onClick={() => prefillQuestion(answer.followUpSuggestions?.[0] || "Who needs to act next?")}>Ask follow-up</button>
                </div>
              </div>
              {toArray(answer.followUpSuggestions).length > 0 && (
                <div className="faq-answer-related">
                  <span>Suggested follow-up questions</span>
                  <div>{answer.followUpSuggestions.map((item) => <button type="button" key={item} onClick={() => prefillQuestion(item)}>{item}</button>)}</div>
                </div>
              )}
              {answer.relatedArticles.length > 0 && (
                <div className="faq-answer-related">
                  <span>Related tutorials</span>
                  <div>{answer.relatedArticles.map((article) => <button type="button" key={article.id} onClick={() => revealArticle(article.id)}>{article.title}</button>)}</div>
                </div>
              )}
              <div className="faq-feedback">
                <span>Was this helpful?</span>
                <div className="faq-feedback-buttons">
                  {[
                    ["helpful", "Helpful"],
                    ["not_helpful", "Not helpful"],
                    ["still_confused", "Still confused"],
                  ].map(([rating, label]) => (
                    <button type="button" key={rating} className={feedbackRating === rating ? "active" : ""} disabled={feedbackSubmitting} onClick={() => submitFeedback(rating)}>{label}</button>
                  ))}
                </div>
                {feedbackRating && feedbackRating !== "helpful" && (
                  <div className="faq-feedback-note">
                    <textarea value={feedbackNote} onChange={(event) => setFeedbackNote(event.target.value)} rows="3" maxLength="700" placeholder="What were you trying to do?" />
                    <button type="button" disabled={feedbackSubmitting} onClick={() => submitFeedback(feedbackRating)}>Send note</button>
                  </div>
                )}
                {feedbackStatus && <p>{feedbackStatus}</p>}
              </div>
            </>
          )}
        </form>
      </section>

      <section className="faq-guided">
        <div className="faq-section-heading"><h2>Guided Checks</h2><span>{TROUBLESHOOTERS.length} common issues</span></div>
        <div className="faq-guided-grid">
          {TROUBLESHOOTERS.map(([id, label, nextQuestion, category]) => (
            <button type="button" key={id} onClick={() => { setActiveCategory(category); prefillQuestion(nextQuestion); }}>
              <strong>{label}</strong><span>{nextQuestion}</span>
            </button>
          ))}
        </div>
      </section>

      {featuredArticles.length > 0 && (
        <section className="faq-featured">
          <div className="faq-section-heading"><h2>Recommended For You</h2><span>{featuredArticles.length} tutorials</span></div>
          <div className="faq-featured-grid">{featuredArticles.map((article) => <button type="button" className="faq-featured-card" key={article.id} onClick={() => revealArticle(article.id)}><span>{article.category}</span><strong>{article.title}</strong></button>)}</div>
        </section>
      )}

      <section className="faq-whats-new">
        <div className="faq-section-heading"><h2>What&apos;s New</h2><span>Help updates</span></div>
        <div className="faq-whats-new-grid">{WHATS_NEW.map(([title, text]) => <article key={title}><strong>{title}</strong><p>{text}</p></article>)}</div>
      </section>

      <section className="faq-browser">
        <div className="faq-toolbar">
          <div className="faq-search"><SearchIcon width="18" height="18" /><input type="search" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search tutorials by issue, page, or workflow..." /></div>
          <span className="faq-count">{filteredArticles.length} {filteredArticles.length === 1 ? "result" : "results"}</span>
        </div>
        <div className="faq-categories" role="tablist" aria-label="FAQ categories">
          {categories.map((category) => <button type="button" role="tab" aria-selected={activeCategory === category} key={category} className={activeCategory === category ? "active" : ""} onClick={() => setActiveCategory(category)}>{category}</button>)}
        </div>
        {loading ? <div className="faq-empty">Loading help articles...</div> : loadError ? <div className="faq-empty error">{loadError}</div> : filteredArticles.length === 0 ? (
          <div className="faq-empty"><p>No tutorials match your search.</p><button type="button" onClick={() => prefillQuestion(searchTerm || "I need help", false)}>Ask MagicHelp</button></div>
        ) : <div className="faq-article-list">{filteredArticles.map((article) => renderArticle(article))}</div>}
      </section>
    </main>
  );
};

export default FAQ;
