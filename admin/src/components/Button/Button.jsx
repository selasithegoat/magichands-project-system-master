import React from "react";
import "./Button.css";

const Button = ({ children, onClick, icon: Icon, type = "button" }) => {
  return (
    <button type={type} className="btn" onClick={onClick}>
      {children}
      {Icon && <Icon className="btn-icon-right w-4 h-4" />}
    </button>
  );
};

export default Button;
