import Modal from "../ui/Modal";
import "./QuickActionModal.css";

const QuickActionModal = ({ isOpen, onClose, actions }) => (
  <Modal
    isOpen={isOpen}
    title="Quick Actions"
    subtitle="Run common inventory workflows without leaving the dashboard."
    primaryText="Start action"
    secondaryText="Close"
    onConfirm={onClose}
    onClose={onClose}
  >
    <div className="quick-actions">
      {actions.map((action) => (
        <div key={action.title} className="quick-action-card">
          <h4>{action.title}</h4>
          <p>{action.description}</p>
          <button type="button" className="ghost-button">
            Open
          </button>
        </div>
      ))}
    </div>
  </Modal>
);

export default QuickActionModal;
