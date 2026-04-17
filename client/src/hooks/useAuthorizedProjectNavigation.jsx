import React from "react";
import { useNavigate } from "react-router-dom";
import ProjectRouteChoiceDialog from "../components/ui/ProjectRouteChoiceDialog";
import { resolveProjectNavigation } from "../utils/projectAccessRouting";

const DEFAULT_ROUTE_CHOICE_TITLE = "Choose Authorized Page";
const DEFAULT_ROUTE_CHOICE_MESSAGE =
  "Project Details is reserved for the assigned lead. Choose an authorized page to continue.";

const useAuthorizedProjectNavigation = (user) => {
  const navigate = useNavigate();
  const [routeChoice, setRouteChoice] = React.useState(null);

  const closeProjectRouteChoice = React.useCallback(() => {
    setRouteChoice(null);
  }, []);

  const navigateToProject = React.useCallback(
    (project, options = {}) => {
      const {
        detailSearch = "",
        fallbackPath = "/client",
        replace = false,
        onBeforeNavigate,
        allowGenericEngaged = false,
        title = DEFAULT_ROUTE_CHOICE_TITLE,
        message = DEFAULT_ROUTE_CHOICE_MESSAGE,
      } = options;

      const resolution = resolveProjectNavigation({
        user,
        project,
        detailSearch,
        fallbackPath,
        allowGenericEngaged,
      });

      if (resolution.mode === "single" && resolution.option?.path) {
        onBeforeNavigate?.(resolution.option);
        navigate(resolution.option.path, { replace });
        return resolution;
      }

      if (resolution.mode === "choice") {
        setRouteChoice({
          title,
          message,
          options: resolution.options,
          replace,
          onBeforeNavigate,
        });
        return resolution;
      }

      if (resolution.option?.path) {
        onBeforeNavigate?.(resolution.option);
        navigate(resolution.option.path, { replace });
      }

      return resolution;
    },
    [navigate, user],
  );

  const handleSelectRoute = React.useCallback(
    (option) => {
      if (!option?.path) {
        setRouteChoice(null);
        return;
      }

      const pendingChoice = routeChoice;
      pendingChoice?.onBeforeNavigate?.(option);
      setRouteChoice(null);
      navigate(option.path, { replace: Boolean(pendingChoice?.replace) });
    },
    [navigate, routeChoice],
  );

  const projectRouteChoiceDialog = (
    <ProjectRouteChoiceDialog
      isOpen={Boolean(routeChoice)}
      title={routeChoice?.title || DEFAULT_ROUTE_CHOICE_TITLE}
      message={routeChoice?.message || DEFAULT_ROUTE_CHOICE_MESSAGE}
      options={routeChoice?.options || []}
      onSelect={handleSelectRoute}
      onClose={closeProjectRouteChoice}
    />
  );

  return {
    navigateToProject,
    projectRouteChoiceDialog,
    isProjectRouteChoiceOpen: Boolean(routeChoice),
    closeProjectRouteChoice,
  };
};

export default useAuthorizedProjectNavigation;
