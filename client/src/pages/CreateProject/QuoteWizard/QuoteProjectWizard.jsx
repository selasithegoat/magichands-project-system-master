import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import Spinner from "../../../components/ui/Spinner";
import ConfirmationModal from "../../../components/ui/ConfirmationModal";
import QuoteStep1 from "./QuoteStep1";
import QuoteStep2 from "./QuoteStep2";
import QuoteStep3 from "./QuoteStep3";
import QuoteStep4 from "./QuoteStep4";
import QuoteStep5 from "./QuoteStep5";
import "../WizardLayout.css";
import "./QuoteProjectWizard.css";

const QuoteProjectWizard = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isLoading, setIsLoading] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [leads, setLeads] = useState([]);
  const [currentStep, setCurrentStep] = useState(1);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [createdOrderNumber, setCreatedOrderNumber] = useState("");

  // Form State
  const [formData, setFormData] = useState({
    // Basic Project Fields (Mapped to existing schema)
    projectName: "",
    lead: "", // ID
    leadLabel: "", // Display Name
    orderDate: new Date().toISOString().split("T")[0],
    receivedTime: new Date().toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    }),
    deliveryDate: "",
    client: "", // [NEW]
    briefOverview: "", // [NEW]
    attachments: [], // [NEW] Existing attachments

    // Quote Specific Fields
    quoteDetails: {
      quoteNumber: "",
      quoteDate: new Date().toISOString().split("T")[0],
      emailResponseSent: false,
      projectCoordinatorSignature: "",
      scopeApproved: false,

      checklist: {
        cost: false,
        mockup: false,
        previousSamples: false,
        sampleProduction: false,
        bidSubmission: false,
      },

      departmentalEngagements: false, // Maps to 'departments' check but singular boolean here?
      // Actually user request says "Departmental Engagements (checkbox)".
      // We might just store it as a boolean in quoteDetails for now, or trigger dept selection.
      // Let's keep it simple as a checkbox for the form requirement first.

      productionChecklist: {
        inHouse: false,
        outside: false,
        localOutsourcing: false,
        overseasOutsourcing: false,
      },

      // Uncontrollable Factors (Mapped to main schema array)
      // But form requires "Uncontrollable Factors List (Job Priority List)"
      // We will use the main schema's 'uncontrollableFactors' array for this.

      productionProof: {
        proofreadingDone: false,
        approvedArtworkSent: false,
        pictureVideoTaken: false,
      },

      submission: {
        sentBy: "",
        sentVia: [], // Array of strings
      },

      updates: "", // Free text note
      clientFeedback: "",

      finalUpdate: {
        accepted: false,
        cancelled: false,
      },

      filledBy: "Self", // 'Self' or 'With Colleague'
      leadSignature: "",
      submissionDate: new Date().toISOString().split("T")[0],
    },

    // Arrays for lists
    items: [], // { description, quantity, breakdown, department }
    departments: [], // [NEW]
    uncontrollableFactors: [], // { activity, responsible, status, riskFactors }
    productionRisks: [], // [NEW]

    updates: [], // Project Memo Updates
    projectType: "Quote", // Default for this wizard
    priority: "Normal",
  });

  // Fetch Leads
  useEffect(() => {
    const fetchUsers = async () => {
      // Reusing logic from CreateProjectWizard to get leads
      try {
        const res = await fetch("/api/auth/users");
        if (res.ok) {
          const data = await res.json();
          const formatted = data.map((u) => ({
            value: u._id,
            label:
              `${u.firstName || ""} ${u.lastName || ""} (${u.employeeId || u.email})`.trim(),
          }));
          setLeads(formatted);
        }
      } catch (e) {
        console.error("Failed to fetch users", e);
      }
    };
    fetchUsers();
  }, []);

  // Fetch Project Data if Editing
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const editId = params.get("edit");
    if (editId) {
      setEditingId(editId);
      setIsLoading(true);
      fetch(`/api/projects/${editId}`)
        .then((res) => res.json())
        .then((data) => {
          // Map data to formData
          setFormData((prev) => ({
            ...prev,
            projectName: data.details?.projectName || "",
            lead: data.projectLeadId?._id || data.projectLeadId || "",
            leadLabel: data.details?.lead || "",
            deliveryDate: data.details?.deliveryDate
              ? data.details.deliveryDate.split("T")[0]
              : "",
            quoteDetails: {
              ...prev.quoteDetails,
              ...data.quoteDetails,
              // Ensure dates are formatted for input[type=date]
              quoteDate: data.quoteDetails?.quoteDate
                ? data.quoteDetails.quoteDate.split("T")[0]
                : prev.quoteDetails.quoteDate,
              submissionDate: data.quoteDetails?.submissionDate
                ? data.quoteDetails.submissionDate.split("T")[0]
                : prev.quoteDetails.submissionDate,
            },
            items: data.items || [],
            receivedTime: data.receivedTime || prev.receivedTime,
            client: data.details?.client || "",
            briefOverview: data.details?.briefOverview || "",
            attachments: data.details?.attachments || [],
            // Step 2 & 3 & 4
            departments: data.departments || [],
            uncontrollableFactors: data.uncontrollableFactors || [],
            productionRisks: data.productionRisks || [],
          }));
        })
        .catch((err) => console.error("Failed to fetch project", err))
        .finally(() => setIsLoading(false));
    }
  }, [location.search]);

  const handleUpdateFormData = (updates) => {
    setFormData((prev) => ({ ...prev, ...updates }));
  };

  const handleNext = () => setCurrentStep((prev) => prev + 1);
  const handleBack = () => setCurrentStep((prev) => prev - 1);
  const handleCancelProject = () => setShowCancelModal(true);
  const confirmCancel = () => {
    setShowCancelModal(false);
    navigate("/");
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;

    // Handle nested state updates helper
    if (name.includes(".")) {
      const parts = name.split(".");
      setFormData((prev) => {
        let newData = { ...prev };
        let current = newData;
        for (let i = 0; i < parts.length - 1; i++) {
          current = current[parts[i]];
        }
        current[parts[parts.length - 1]] =
          type === "checkbox" ? checked : value;
        return newData;
      });
    } else {
      setFormData((prev) => ({
        ...prev,
        [name]: type === "checkbox" ? checked : value,
      }));
    }
  };

  const handleCheckboxChange = (section, field) => {
    setFormData((prev) => ({
      ...prev,
      quoteDetails: {
        ...prev.quoteDetails,
        [section]: {
          ...prev.quoteDetails[section],
          [field]: !prev.quoteDetails[section][field],
        },
      },
    }));
  };

  // Items Helpers
  const addItem = () => {
    setFormData((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        { description: "", qty: 1, breakdown: "", department: "" },
      ],
    }));
  };

  const updateItem = (index, field, value) => {
    const newItems = [...formData.items];
    newItems[index][field] = value;
    setFormData((prev) => ({ ...prev, items: newItems }));
  };

  const removeItem = (index) => {
    const newItems = formData.items.filter((_, i) => i !== index);
    setFormData((prev) => ({ ...prev, items: newItems }));
  };

  // Uncontrollable Factors Helpers
  const addFactor = () => {
    setFormData((prev) => ({
      ...prev,
      uncontrollableFactors: [
        ...prev.uncontrollableFactors,
        {
          description: "",
          responsible: { label: "", value: "" },
          status: { label: "Pending", value: "Pending" },
          riskFactors: "",
        },
      ],
      // Note: mapping 'Activity' from form to 'description' in schema
    }));
  };

  const updateFactor = (index, field, value) => {
    const newFactors = [...formData.uncontrollableFactors];
    // Special handling for objects if needed, but simple for now
    if (field === "responsible" || field === "status") {
      newFactors[index][field] = { label: value, value: value };
    } else {
      newFactors[index][field] = value;
    }
    setFormData((prev) => ({ ...prev, uncontrollableFactors: newFactors }));
  };

  const removeFactor = (index) => {
    const newFactors = formData.uncontrollableFactors.filter(
      (_, i) => i !== index,
    );
    setFormData((prev) => ({ ...prev, uncontrollableFactors: newFactors }));
  };

  const handleCreateProject = async () => {
    setIsLoading(true);

    try {
      const payload = {
        ...formData,
        projectType: formData.projectType || "Quote",
        // Initial status for projects created from Quote
        status: editingId
          ? formData.status === "Pending Scope Approval"
            ? "Pending Quote Request"
            : formData.status
          : "Pending Scope Approval",

        // Ensure details object is populated for top-level schema
        details: {
          projectName: formData.projectName,
          client: formData.client,
          lead: formData.leadLabel,
          deliveryDate: formData.deliveryDate,
          briefOverview: formData.briefOverview,
          attachments: formData.attachments,
        },
        projectLeadId: formData.lead,
      };

      const url = editingId ? `/api/projects/${editingId}` : "/api/projects";
      const method = editingId ? "PUT" : "POST";

      const res = await fetch(url, {
        method: method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const data = await res.json();
        setCreatedOrderNumber(
          data.orderId || formData.quoteDetails?.quoteNumber || "New Order",
        );
        setShowSuccessModal(true);
        return { success: true };
      } else {
        const err = await res.json();
        return { success: false, message: err.message };
      }
    } catch (err) {
      console.error(err);
      return { success: false, message: "Error processing request" };
    } finally {
      setIsLoading(false);
    }
  };

  const handleProjectComplete = () => {
    navigate("/");
  };

  if (isLoading) return <Spinner />;

  return (
    <div className="quote-wizard-container">
      {currentStep === 1 && (
        <QuoteStep1
          formData={formData}
          setFormData={handleUpdateFormData}
          onNext={handleNext}
          onCancel={handleCancelProject}
          isEditing={!!editingId}
        />
      )}
      {currentStep === 2 && (
        <QuoteStep2
          formData={formData}
          setFormData={handleUpdateFormData}
          onNext={handleNext}
          onBack={handleBack}
          onCancel={handleCancelProject}
        />
      )}
      {currentStep === 3 && (
        <QuoteStep3
          formData={formData}
          setFormData={handleUpdateFormData}
          onNext={handleNext}
          onBack={handleBack}
          onCancel={handleCancelProject}
        />
      )}
      {currentStep === 4 && (
        <QuoteStep4
          formData={formData}
          setFormData={handleUpdateFormData}
          onNext={handleNext}
          onBack={handleBack}
          onCancel={handleCancelProject}
        />
      )}
      {currentStep === 5 && (
        <QuoteStep5
          formData={formData}
          setFormData={handleUpdateFormData}
          onCreate={handleCreateProject}
          onBack={handleBack}
          onCancel={handleCancelProject}
          onComplete={handleProjectComplete}
        />
      )}

      <ConfirmationModal
        isOpen={showCancelModal}
        title="Cancel Progress?"
        message="Are you sure you want to exit? Your progress in this wizard will be lost."
        onConfirm={confirmCancel}
        onCancel={() => setShowCancelModal(false)}
      />
      <ConfirmationModal
        isOpen={showSuccessModal}
        onClose={handleProjectComplete}
        onConfirm={handleProjectComplete}
        title="Project Created Successfully"
        message={`New project ${createdOrderNumber} has been created and assigned to the Project Lead for scope approval.`}
        confirmText="Back to Dashboard"
        hideCancel={true}
      />
    </div>
  );
};

export default QuoteProjectWizard;
