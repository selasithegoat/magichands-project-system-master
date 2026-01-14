// @desc    Update entire project details (e.g. from Step 1-5 Wizard)
// @route   PUT /api/projects/:id
// @access  Private
const updateProject = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      orderId,
      orderDate,
      receivedTime,
      lead,
      projectName,
      deliveryDate,
      deliveryTime,
      deliveryLocation,
      contactType,
      supplySource,
      departments,
      items,
      uncontrollableFactors,
      productionRisks,
      status,
      currentStep,
    } = req.body;

    const project = await Project.findById(id);

    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    // Helper to extract value if object
    const getValue = (field) => (field && field.value ? field.value : field);

    // Update fields
    if (orderId) project.orderId = orderId;
    if (orderDate) project.orderDate = orderDate;
    if (receivedTime) project.receivedTime = getValue(receivedTime);
    if (lead) project.details.lead = lead?.label || lead?.value || lead;
    if (projectName) project.details.projectName = projectName;
    if (deliveryDate) project.details.deliveryDate = deliveryDate;
    if (deliveryTime) project.details.deliveryTime = getValue(deliveryTime);
    if (deliveryLocation) project.details.deliveryLocation = deliveryLocation;
    if (contactType) project.details.contactType = getValue(contactType);
    if (supplySource) project.details.supplySource = getValue(supplySource);

    // Arrays replacement (assuming full sync from wizard state)
    if (departments) project.departments = departments;
    if (items) project.items = items;
    if (uncontrollableFactors)
      project.uncontrollableFactors = uncontrollableFactors;
    if (productionRisks) project.productionRisks = productionRisks;

    if (currentStep) project.currentStep = currentStep;

    // Status update logic: If accepting ("Pending Scope Approval" -> "Order Confirmed")
    // or specifically passed status
    if (status) {
      // If current status is Pending Scope Approval and we are saving, maybe move to next?
      // For now, respect passed status. Use "Order Confirmed" if this is the "Accept" action.
      project.status = status;
    } else if (project.status === "Pending Scope Approval") {
      // If simply saving/updating from wizard without explicit status, assume moving to active
      project.status = "Order Confirmed";
    }

    const updatedProject = await project.save();

    await logActivity(
      updatedProject._id,
      req.user.id,
      "update",
      `Updated project details for #${
        updatedProject.orderId || updatedProject._id
      }`
    );

    res.json(updatedProject);
  } catch (error) {
    console.error("Error updating project:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};
