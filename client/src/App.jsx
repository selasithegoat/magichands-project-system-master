import React, { useState } from "react";
import Step1 from "./pages/CreateProject/Step1";
import Login from "./pages/Login/Login";
import Step2 from "./pages/CreateProject/Step2";
import Step3 from "./pages/CreateProject/Step3";
import Step4 from "./pages/CreateProject/Step4";
import Dashboard from "./pages/Dashboard/Dashboard";
import Step5 from "./pages/CreateProject/Step5";
import ProjectDetail from "./pages/ProjectDetail/ProjectDetail";
import ProjectHistory from "./pages/ProjectHistory/ProjectHistory";
import OngoingProjects from "./pages/OngoingProjects/OngoingProjects";
import Profile from "./pages/Profile/Profile";
import ConfirmationModal from "./components/ui/ConfirmationModal";

import Layout from "./components/layout/Layout";

function App() {
  const [view, setView] = useState("login"); // 'login', 'dashboard', 'create', 'detail', 'history', 'projects'
  const [currentStep, setCurrentStep] = useState(1);
  const [isLoading, setIsLoading] = useState(true);

  // Check for active session on load
  React.useEffect(() => {
    const checkSession = async () => {
      try {
        const res = await fetch("http://localhost:5000/api/auth/me", {
          credentials: "include", // Send cookie
        });

        if (res.ok) {
          // Session valid
          setView("dashboard");
        }
      } catch (err) {
        // Not authorized, stay on login
        console.log("No active session");
      } finally {
        setIsLoading(false);
      }
    };
    checkSession();
  }, []);

  const handleNext = () => {
    setCurrentStep((prev) => prev + 1);
  };

  const handleBack = () => {
    setCurrentStep((prev) => prev - 1);
  };

  const [showCancelModal, setShowCancelModal] = useState(false);

  const handleCancelProject = () => {
    setShowCancelModal(true);
  };

  const confirmCancel = () => {
    setShowCancelModal(false);
    setView("dashboard");
    setCurrentStep(1); // Reset form
  };

  const toggleView = () => {
    // Simple cycler for demo purposes: Dashboard -> Detail -> Create -> Dashboard
    setView((prev) => {
      if (prev === "dashboard") return "detail";
      if (prev === "detail") return "create";
      return "dashboard";
    });
  };

  // Simplified navigation handlers
  const navigateToDashboard = () => {
    setView("dashboard");
    setCurrentStep(1);
  };
  const navigateToProjectDetail = () => setView("detail");
  const navigateToProjectsTab = () => setView("projects");
  const navigateToHistory = () => setView("history");
  const navigateToProfile = () => setView("profile");
  const navigateToCreate = () => {
    setView("create");
    setCurrentStep(1);
  };

  const handleLogout = async () => {
    try {
      await fetch("http://localhost:5000/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
      // Regardless of server response (even if cookie missing), clear client state
      setView("login");
    } catch (error) {
      console.error("Logout failed", error);
      // Still force logout on client
      setView("login");
    }
  };

  if (isLoading) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100vh",
        }}
      >
        Loading...
      </div>
    );
  }

  return (
    <>
      <div
        style={{
          position: "fixed",
          bottom: "10px",
          right: "10px",
          zIndex: 9999,
        }}
      >
        <button
          onClick={toggleView}
          style={{
            padding: "0.5rem 1rem",
            background: "#333",
            color: "#fff",
            borderRadius: "4px",
          }}
        >
          Switch View (
          {view === "dashboard"
            ? "Show Detail"
            : view === "detail"
            ? "Show Create"
            : "Show Dashboard"}
          )
        </button>
      </div>

      {view === "login" ? (
        <Login onLogin={navigateToDashboard} />
      ) : (
        <Layout
          activeView={view} // Pass the current view state
          onNavigateDashboard={navigateToDashboard}
          onNavigateProject={navigateToProjectsTab} // Navbar "Projects" goes to empty tab
          onNavigateHistory={navigateToHistory}
          onNavigateProfile={navigateToProfile}
          onCreateProject={navigateToCreate}
        >
          {view === "dashboard" ? (
            <Dashboard
              onNavigateProject={navigateToProjectDetail} // Cards go to Detail
              onCreateProject={navigateToCreate}
              onSeeAllProjects={navigateToProjectsTab}
            />
          ) : view === "detail" ? (
            <ProjectDetail />
          ) : view === "history" ? (
            <ProjectHistory onBack={navigateToDashboard} />
          ) : view === "projects" ? (
            <OngoingProjects
              onNavigateDetail={navigateToProjectDetail}
              onBack={navigateToDashboard}
            />
          ) : view === "profile" ? (
            <Profile onSignOut={handleLogout} />
          ) : (
            <>
              {currentStep === 1 && (
                <Step1 onNext={handleNext} onCancel={handleCancelProject} />
              )}
              {currentStep === 2 && (
                <Step2
                  onNext={handleNext}
                  onBack={handleBack}
                  onCancel={handleCancelProject}
                />
              )}
              {currentStep === 3 && (
                <Step3
                  onNext={handleNext}
                  onBack={handleBack}
                  onCancel={handleCancelProject}
                />
              )}
              {currentStep === 4 && (
                <Step4
                  onNext={handleNext}
                  onBack={handleBack}
                  onCancel={handleCancelProject}
                />
              )}
              {currentStep === 5 && (
                <Step5 onBack={handleBack} onCancel={handleCancelProject} />
              )}
            </>
          )}
        </Layout>
      )}

      <ConfirmationModal
        isOpen={showCancelModal}
        title="Cancel Project?"
        message="Are you sure you want to cancel? All progress will be lost."
        onConfirm={confirmCancel}
        onCancel={() => setShowCancelModal(false)}
      />
    </>
  );
}

export default App;
