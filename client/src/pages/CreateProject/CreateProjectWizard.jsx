import React, { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import Step1 from "./Step1";
import Step2 from "./Step2";
import Step3 from "./Step3";
import Step4 from "./Step4";
import Step5 from "./Step5";
import ConfirmationModal from "../../components/ui/ConfirmationModal";

const CreateProjectWizard = ({ onProjectCreate }) => {
  const navigate = useNavigate();
  const location = useLocation(); // Get location for query params

  const DEFAULT_FORM_STATE = {
    currentStep: 1,
    formData: {
      orderDate: new Date().toISOString().split("T")[0],
      receivedTime: "10:00",
      lead: null,
      projectName: "",
      briefOverview: "", // [New]
      deliveryDate: new Date().toISOString().split("T")[0],
      deliveryTime: "14:00",
      deliveryLocation: "",
      contactType: "MH",
      supplySource: "in-house",
      departments: [], // Step 2
      items: [], // Step 3
      uncontrollableFactors: [], // Step 4
      productionRisks: [], // Step 4
      status: "Order Confirmed", // Default for new, overwritten if editing
    },
  };

  // Load initial state from localStorage or default
  const getInitialState = () => {
    const saved = localStorage.getItem("projectWizardData");
    if (saved) {
      return JSON.parse(saved);
    }
    return DEFAULT_FORM_STATE;
  };

  const initialState = getInitialState();
  const [currentStep, setCurrentStep] = useState(initialState.currentStep);
  const [formData, setFormData] = useState(initialState.formData);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [editingId, setEditingId] = useState(null); // Track if editing
  const [isLoading, setIsLoading] = useState(false); // Loading state for fetch
  const [leads, setLeads] = useState([]); // [NEW] Values for Steps
  const [isLoadingLeads, setIsLoadingLeads] = useState(false);

  // Fetch Users for leads
  React.useEffect(() => {
    const fetchUsers = async () => {
      setIsLoadingLeads(true);
      try {
        const res = await fetch("/api/auth/users");
        if (res.ok) {
          const data = await res.json();
          const formatted = data.map((u) => ({
            value: u._id,
            label: `${u.firstName || ""} ${u.lastName || ""} (${
              u.employeeId || u.email
            })`.trim(),
          }));
          setLeads(formatted);
        }
      } catch (e) {
        console.error("Failed to fetch users", e);
      } finally {
        setIsLoadingLeads(false);
      }
    };
    fetchUsers();
  }, []);

  // Check for edit mode on mount
  React.useEffect(() => {
    // [NEW] Handle Project Type & Priority from Landing Page
    if (location.state?.projectType) {
      setFormData((prev) => ({
        ...prev,
        projectType: location.state.projectType,
        priority: location.state.priority || prev.priority || "Normal",
      }));
    }

    const params = new URLSearchParams(location.search);
    const editId = params.get("edit");

    if (editId) {
      setEditingId(editId);
      setIsLoading(true);
      // Fetch project data
      fetch(`/api/projects/${editId}`)
        .then((res) => {
          if (res.ok) return res.json();
          throw new Error("Failed to fetch project");
        })
        .then((data) => {
          console.log("Wizard: Fetched Project Data", data);
          console.log(
            "Wizard: Attachments from DB:",
            data.details?.attachments,
          );

          // Map API data to Wizard Form Data
          // Note: API data structure matches schema (project.details.* etc)
          // Wizard expects flat structure for some fields (orderDate, etc) and 'details' fields spread?
          // Looking at CreateProjectWizard initial state vs. Project Model:
          // Wizard: orderDate, receivedTime, lead, projectName, deliveryDate...
          // Project Model: orderDate, receivedTime, details: { lead, projectName, deliveryDate... }
          // Need to flatten details.

          const mappedData = {
            ...formData, // Keep defaults or existing
            orderId: data.orderId, // If we want to show it? Wizard Step 1 shows 'Order #1024-B' hardcoded or from state? Step 1 renders hardcoded currently? I should check Step 1 props.
            // Step 1 expects: orderDate, receivedTime, lead, projectName, deliveryDate, deliveryTime, deliveryLocation, contactType, supplySource
            orderDate: data.orderDate ? data.orderDate.split("T")[0] : "",
            receivedTime: data.receivedTime
              ? data.receivedTime.includes("T")
                ? new Date(data.receivedTime).toLocaleTimeString("en-GB", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : data.receivedTime
              : "",
            // Use projectLeadId for the lead select value (matches option value)
            lead: data.projectLeadId || null,

            projectName: data.details?.projectName || "",
            leadLabel:
              data.projectLeadId && typeof data.projectLeadId === "object"
                ? (
                    (data.projectLeadId.firstName || "") +
                    " " +
                    (data.projectLeadId.lastName || "")
                  ).trim() ||
                  data.projectLeadId.employeeId ||
                  data.projectLeadId.email ||
                  "Assigned Lead"
                : "Assigned Lead",
            projectLead: data.projectLeadId,
            client: data.details?.client || "", // [NEW] Map client name
            deliveryLocation: data.details?.deliveryLocation || "", // [NEW] Map delivery location
            briefOverview: data.details?.briefOverview || "", // [NEW] Map brief overview
            sampleImage: data.details?.sampleImage || "", // [NEW] Map sample image
            attachments: data.details?.attachments || [], // [NEW] Map attachments
            // Step 2 & 3 & 4
            departments: data.departments || [],
            items:
              data.items?.map((i) => ({
                ...i,
                id: i._id || i.id || Math.random().toString(36).substr(2, 9),
              })) || [],
            uncontrollableFactors: data.uncontrollableFactors || [],
            productionRisks: data.productionRisks || [],

            // If status was Pending Scope Approval, we usually want to change it on submit?
            // Keep track of current status
            status: data.status,
          };

          // If we could map lead name to object, great. If not, simple string might fail Select.
          // Assuming Admin sent { value, label } to backend during assignment?
          // Admin assignment sent: lead: { value, label } but backend details.lead stores STRING.
          // Project.js: details.lead type: String.
          // So backend lost the ID reference in 'details.lead' but KEPT it in 'projectLeadId'.
          // CreateProjectWizard Step 1 fetches users!
          // Step 1 can handle pre-selected ID if we pass it?
          // Step 1 uses `formData.lead`.
          // If we pass `projectLeadId` as `lead`, does Step 1 Select work?
          // React Select usually needs the object { value, label } to display correctly.
          // Step 1 loads options. If value is just ID, it might not show label.
          // We'll see.

          setFormData(mappedData);
        })
        .catch((err) => console.error(err))
        .finally(() => setIsLoading(false));
    }
  }, [location.search]); // eslint-disable-next-line

  // Save to localStorage whenever state changes
  React.useEffect(() => {
    localStorage.setItem(
      "projectWizardData",
      JSON.stringify({ currentStep, formData }),
    );
  }, [currentStep, formData]);

  const handleUpdateFormData = (updates) => {
    setFormData((prev) => ({ ...prev, ...updates }));
  };

  const handleNext = () => {
    setCurrentStep((prev) => prev + 1);
  };

  const handleBack = () => {
    setCurrentStep((prev) => prev - 1);
  };

  const handleCancelProject = () => {
    setShowCancelModal(true);
  };

  const confirmCancel = () => {
    localStorage.removeItem("projectWizardData"); // Clear draft
    setShowCancelModal(false);
    navigate("/"); // Go back to dashboard
  };

  const handleCreateProject = async () => {
    try {
      const url = editingId ? `/api/projects/${editingId}` : "/api/projects";
      const method = editingId ? "PUT" : "POST";

      // Use FormData for File Upload
      const payload = new FormData();

      // Append all JSON fields
      Object.keys(formData).forEach((key) => {
        if (key === "files") return; // Handle files separately
        // attachments sent as JSON string if present (existing files)

        const value = formData[key];
        if (Array.isArray(value) || typeof value === "object") {
          if (value) payload.append(key, JSON.stringify(value));
        } else {
          if (value !== null && value !== undefined) payload.append(key, value);
        }
      });

      // Special handling for Status if editing
      if (editingId && formData.status === "Pending Scope Approval") {
        payload.delete("status"); // Remove old status
        payload.append("status", "Order Confirmed");
      }

      // Append Files to 'attachments' field
      if (formData.files && formData.files.length > 0) {
        formData.files.forEach((file) => {
          payload.append("attachments", file);
        });
      }

      const res = await fetch(url, {
        method: method,
        credentials: "include",
        body: payload, // [MODIFIED] No Content-Type header
      });

      if (res.ok) {
        return { success: true };
      } else {
        const err = await res.json();
        return { success: false, message: err.message };
      }
    } catch (error) {
      console.error("Create Project Error:", error);
      return {
        success: false,
        message: "Something went wrong. Please try again.",
      };
    }
  };

  const handleProjectComplete = () => {
    localStorage.removeItem("projectWizardData");
    // Explicitly reset state to ensure next usage is clean
    setFormData(DEFAULT_FORM_STATE.formData);
    setCurrentStep(1);
    if (onProjectCreate) onProjectCreate(); // Refresh global count
    navigate("/");
  };

  if (isLoading)
    return <div style={{ padding: "2rem" }}>Loading project data...</div>;

  const isEmergency =
    formData.priority === "Urgent" || formData.projectType === "Emergency";

  return (
    <div className={`wizard-container ${isEmergency ? "emergency-theme" : ""}`}>
      {isEmergency && (
        <div
          className="emergency-banner"
          style={{
            background: "#fee2e2",
            color: "#991b1b",
            padding: "0.75rem",
            textAlign: "center",
            fontWeight: "bold",
            borderBottom: "1px solid #fca5a5",
          }}
        >
          🔥 EMERGENCY PROJECT - URGENT PRIORITY
        </div>
      )}
      {currentStep === 1 && (
        <Step1
          formData={formData}
          setFormData={handleUpdateFormData}
          onNext={handleNext}
          onCancel={handleCancelProject}
          leads={leads}
          isLoadingLeads={isLoadingLeads}
          isEditing={!!editingId}
        />
      )}
      {currentStep === 2 && (
        <Step2
          formData={formData}
          setFormData={handleUpdateFormData}
          onNext={handleNext}
          onBack={handleBack}
          onCancel={handleCancelProject}
        />
      )}
      {currentStep === 3 && (
        <Step3
          formData={formData}
          setFormData={handleUpdateFormData}
          onNext={handleNext}
          onBack={handleBack}
          onCancel={handleCancelProject}
        />
      )}
      {currentStep === 4 && (
        <Step4
          formData={formData}
          setFormData={handleUpdateFormData}
          onNext={handleNext}
          onBack={handleBack}
          onCancel={handleCancelProject}
        />
      )}
      {currentStep === 5 && (
        <Step5
          formData={formData}
          onCreate={handleCreateProject}
          onBack={handleBack}
          onCancel={handleCancelProject}
          onComplete={handleProjectComplete}
        />
      )}

      <ConfirmationModal
        isOpen={showCancelModal}
        title="Cancel Project?"
        message="Are you sure you want to cancel? All progress will be lost."
        onConfirm={confirmCancel}
        onCancel={() => setShowCancelModal(false)}
      />

      <style
        dangerouslySetInnerHTML={{
          __html: `
        .wizard-container.emergency-theme .step-header h2,
        .wizard-container.emergency-theme .section-title {
          color: #dc2626 !important;
        }
        .wizard-container.emergency-theme .next-btn,
        .wizard-container.emergency-theme .submit-btn,
        .wizard-container.emergency-theme .btn-primary {
          background-color: #dc2626 !important;
        }
        .wizard-container.emergency-theme .next-btn:hover,
        .wizard-container.emergency-theme .submit-btn:hover,
        .wizard-container.emergency-theme .btn-primary:hover {
          background-color: #b91c1c !important;
        }
        .wizard-container.emergency-theme .progress-bar-fill {
          background-color: #dc2626 !important;
        }
        .wizard-container.emergency-theme .card-option.selected {
          border-color: #dc2626 !important;
          background-color: #fef2f2 !important;
        }
      `,
        }}
      />
    </div>
  );
};

export default CreateProjectWizard;
