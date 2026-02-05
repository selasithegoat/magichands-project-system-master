import React from "react";
import Spinner from "./Spinner";

const LoadingFallback = () => {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        height: "100vh",
        width: "100%",
      }}
    >
      <Spinner />
    </div>
  );
};

export default LoadingFallback;
