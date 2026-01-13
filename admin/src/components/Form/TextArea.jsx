import React from "react";
import "./FormElements.css"; // Shared styles

const TextArea = ({ label, placeholder, value, onChange }) => {
  return (
    <div className="form-group">
      {label && <label className="form-label">{label}</label>}
      <textarea
        className="form-control textarea-control"
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        rows={4}
      />
    </div>
  );
};

export default TextArea;
