import React from "react";
import "./FabButton.css";
import PlusIcon from "../icons/PlusIcon";

const FabButton = ({ onClick }) => {
  return (
    <button className="fab-btn-common" onClick={onClick}>
      <PlusIcon />
    </button>
  );
};

export default FabButton;
