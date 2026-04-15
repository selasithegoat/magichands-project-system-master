import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import HelpIcon from "../../components/icons/HelpIcon";
import SearchIcon from "../../components/icons/SearchIcon";
import "./FAQ.css";

const normalizeText = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const toArray = (value) => (Array.isArray(value) ? value : value ? [value] : []);

const getSearchText = (article) =>
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

const getUserAudience = (user) => {
  const departmentText = toArray(user?.department).join(" ");
  const profileText = normalizeText(
    [user?.role, user?.employeeType, departmentText].join(" "),
  );
  const audience = ["all"];

  if (profileText.includes("admin")) audience.push("admin");
  if (profileText.includes("front desk")) audience.push("front-desk");
  if (profileText.includes("stores")) audience.push("stores");
  if (profileText.includes("stock")) audience.push("stores");
  if (profileText.includes("packaging")) audience.push("stores");
  if (profileText.includes("lead")) audience.push("lead");
  if (profileText.includes("production")) audience.push("department");
  if (profileText.includes("graphics")) audience.push("department");
  if (profileText.includes("photography")) audience.push("department");

  return Array.from(new Set(audience));
};

const formatAnswerLines = (answer) =>
  String(answer || "")
    .split("\n")
    .map((line) => line.trimEnd());

const formatDate = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
};

const FAQ = ({ user }) => {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [categories, setCategories] = useState(["All"]);
  const [articles, setArticles] = useState([]);
  const [featuredArticleIds, setFeaturedArticleIds] = useState([]);
  const [activeCategory, setActiveCategory] = useState("All");
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedIds, setExpandedIds] = useState(() => new Set());
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState("");
  const [answer, setAnswer] = useState(null);

  const audience = useMemo(() => getUserAudience(user), [user]);

  useEffect(() => {
    let isMounted = true;

    const loadArticles = async () => {
      setLoading(true);
      setLoadError("");
      try {
        const response = await fetch("/api/help/articles", {
          credentials: "include",
          cache: "no-store",
        });

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload?.message || "Unable to load help articles.");
        }

        const payload = await response.json();
        if (!isMounted) return;

        const nextArticles = toArray(payload?.articles);
        setArticles(nextArticles);
        setCategories(toArray(payload?.categories).length ? payload.categories : ["All"]);
        setFeaturedArticleIds(toArray(payload?.featuredArticleIds));
        setExpandedIds(new Set(nextArticles.slice(0, 1).map((article) => article.id)));
      } catch (error) {
        if (!isMounted) return;
        setLoadError(error.message || "Unable to load help articles.");
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadArticles();

    return () => {
      isMounted = false;
    };
  }, []);

  const filteredArticles = useMemo(() => {
    const normalizedSearch = normalizeText(searchTerm);
    const tokens = normalizedSearch.split(" ").filter(Boolean);

    return articles.filter((article) => {
      const categoryMatches =
        activeCategory === "All" || article.category === activeCategory;
      if (!categoryMatches) return false;

      if (!tokens.length) return true;

      const searchText = normalizeText(getSearchText(article));
      return tokens.every((token) => searchText.includes(token));
    });
  }, [activeCategory, articles, searchTerm]);

  const featuredArticles = useMemo(() => {
    const articleMap = new Map(articles.map((article) => [article.id, article]));
    const fromApi = featuredArticleIds
      .map((id) => articleMap.get(id))
      .filter(Boolean);

    if (fromApi.length > 0) return fromApi.slice(0, 4);

    return articles
      .filter((article) => {
        const articleAudience = toArray(article.audience);
        return (
          articleAudience.includes("all") ||
          articleAudience.some((item) => audience.includes(item))
        );
      })
      .slice(0, 4);
  }, [articles, audience, featuredArticleIds]);

  const toggleExpanded = (articleId) => {
    setExpandedIds((previous) => {
      const next = new Set(previous);
      if (next.has(articleId)) {
        next.delete(articleId);
      } else {
        next.add(articleId);
      }
      return next;
    });
  };

  const revealArticle = (articleId) => {
    const target = articles.find((article) => article.id === articleId);
    if (target) {
      setActiveCategory("All");
      setSearchTerm("");
    }
    setExpandedIds((previous) => new Set([...previous, articleId]));
    window.setTimeout(() => {
      document
        .getElementById(`faq-article-${articleId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
  };

  const handleAsk = async (event) => {
    event.preventDefault();
    const trimmedQuestion = question.trim();
    if (trimmedQuestion.length < 3) {
      setAskError("Ask a question with at least 3 characters.");
      return;
    }

    setAsking(true);
    setAskError("");
    setAnswer(null);

    try {
      const response = await fetch("/api/help/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ question: trimmedQuestion }),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload?.message || "Unable to answer that question.");
      }

      setAnswer({
        text: payload?.answer || "",
        source: payload?.source || "fallback",
        relatedArticles: toArray(payload?.relatedArticles),
        projectContexts: toArray(payload?.projectContexts),
        projectLookupNotes: toArray(payload?.projectLookupNotes),
      });
    } catch (error) {
      setAskError(error.message || "Unable to answer that question.");
    } finally {
      setAsking(false);
    }
  };

  const renderRelatedRoutes = (routes = []) => {
    const safeRoutes = toArray(routes).filter((route) => route?.label && route?.path);
    if (safeRoutes.length === 0) return null;

    return (
      <div className="faq-related-routes">
        {safeRoutes.map((route) => (
          <Link key={`${route.label}-${route.path}`} to={route.path}>
            {route.label}
          </Link>
        ))}
      </div>
    );
  };

  const renderArticle = (article) => {
    const isExpanded = expandedIds.has(article.id);

    return (
      <article
        id={`faq-article-${article.id}`}
        key={article.id}
        className="faq-article"
      >
        <button
          type="button"
          className="faq-article-toggle"
          onClick={() => toggleExpanded(article.id)}
          aria-expanded={isExpanded}
        >
          <span>
            <span className="faq-category-pill">{article.category}</span>
            <strong>{article.title}</strong>
          </span>
          <span className="faq-toggle-symbol" aria-hidden="true">
            {isExpanded ? "-" : "+"}
          </span>
        </button>

        {isExpanded && (
          <div className="faq-article-body">
            <p>{article.summary}</p>
            {toArray(article.steps).length > 0 && (
              <ol className="faq-steps">
                {article.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            )}
            {toArray(article.tips).length > 0 && (
              <div className="faq-tips">
                {article.tips.map((tip) => (
                  <span key={tip}>{tip}</span>
                ))}
              </div>
            )}
            {renderRelatedRoutes(article.relatedRoutes)}
          </div>
        )}
      </article>
    );
  };

  return (
    <main className="faq-page">
      <section className="faq-hero">
        <div className="faq-hero-copy">
          <span className="faq-eyebrow">
            <HelpIcon width="18" height="18" />
            Help Center
          </span>
          <h1>FAQ & Tutorials</h1>
          <p>
            Find clear steps for orders, projects, department engagement,
            quotes, mockups, billing, inventory, notifications, and profile
            settings.
          </p>
        </div>

        <form className="faq-ask-panel" onSubmit={handleAsk}>
          <label htmlFor="faq-question">Ask MagicHelp</label>
          <textarea
            id="faq-question"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="Example: Why is #1024 or Q2026-001 still pending?"
            rows="4"
            maxLength={600}
          />
          <div className="faq-ask-actions">
            <span>{question.length}/600</span>
            <button type="submit" disabled={asking}>
              {asking ? "Finding answer..." : "Ask"}
            </button>
          </div>
          {askError && <p className="faq-error">{askError}</p>}
        </form>
      </section>

      {answer && (
        <section className="faq-answer" aria-live="polite">
          <div className="faq-answer-header">
            <span>MagicHelp Answer</span>
            <span className="faq-answer-source">{answer.source}</span>
          </div>
          <div className="faq-answer-text">
            {formatAnswerLines(answer.text).map((line, index) =>
              line ? <p key={`${line}-${index}`}>{line}</p> : <br key={index} />,
            )}
          </div>
          {answer.projectContexts.length > 0 && (
            <div className="faq-project-contexts">
              <span>Project context used</span>
              <div className="faq-project-context-list">
                {answer.projectContexts.map((project) => (
                  <article
                    className="faq-project-context-item"
                    key={project.projectId || project.displayRef}
                  >
                    <div>
                      <strong>
                        {project.displayRef}
                        {project.projectName ? ` - ${project.projectName}` : ""}
                      </strong>
                      <p>
                        {[project.projectType, project.status]
                          .filter(Boolean)
                          .join(" | ")}
                      </p>
                      {project.clientName && <p>Client: {project.clientName}</p>}
                      {project.updatedAt && (
                        <p>Updated {formatDate(project.updatedAt)}</p>
                      )}
                    </div>
                    {toArray(project.blockers).length > 0 && (
                      <ul>
                        {project.blockers.slice(0, 3).map((blocker) => (
                          <li key={`${project.projectId}-${blocker.label}`}>
                            {blocker.label}
                          </li>
                        ))}
                      </ul>
                    )}
                    {project.route && (
                      <Link to={project.route} className="faq-project-link">
                        Open project
                      </Link>
                    )}
                  </article>
                ))}
              </div>
            </div>
          )}
          {answer.projectLookupNotes.length > 0 && (
            <div className="faq-lookup-notes">
              {answer.projectLookupNotes.map((note) => (
                <p key={`${note.reference}-${note.code}`}>{note.message}</p>
              ))}
            </div>
          )}
          {answer.relatedArticles.length > 0 && (
            <div className="faq-answer-related">
              <span>Related tutorials</span>
              <div>
                {answer.relatedArticles.map((article) => (
                  <button
                    type="button"
                    key={article.id}
                    onClick={() => revealArticle(article.id)}
                  >
                    {article.title}
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {featuredArticles.length > 0 && (
        <section className="faq-featured">
          <div className="faq-section-heading">
            <h2>Recommended For You</h2>
            <span>{featuredArticles.length} tutorials</span>
          </div>
          <div className="faq-featured-grid">
            {featuredArticles.map((article) => (
              <button
                type="button"
                className="faq-featured-card"
                key={article.id}
                onClick={() => revealArticle(article.id)}
              >
                <span>{article.category}</span>
                <strong>{article.title}</strong>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="faq-browser">
        <div className="faq-toolbar">
          <div className="faq-search">
            <SearchIcon width="18" height="18" />
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search tutorials..."
            />
          </div>
          <span className="faq-count">
            {filteredArticles.length}{" "}
            {filteredArticles.length === 1 ? "result" : "results"}
          </span>
        </div>

        <div className="faq-categories" role="tablist" aria-label="FAQ categories">
          {categories.map((category) => (
            <button
              type="button"
              role="tab"
              aria-selected={activeCategory === category}
              key={category}
              className={activeCategory === category ? "active" : ""}
              onClick={() => setActiveCategory(category)}
            >
              {category}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="faq-empty">Loading help articles...</div>
        ) : loadError ? (
          <div className="faq-empty error">{loadError}</div>
        ) : filteredArticles.length === 0 ? (
          <div className="faq-empty">No tutorials match your search.</div>
        ) : (
          <div className="faq-article-list">
            {filteredArticles.map((article) => renderArticle(article))}
          </div>
        )}
      </section>
    </main>
  );
};

export default FAQ;
