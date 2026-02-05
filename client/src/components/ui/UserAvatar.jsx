import React from "react";

const UserAvatar = () => (
  <div
    style={{
      width: 24,
      height: 24,
      borderRadius: "50%",
      backgroundColor: "#0F172A",
      overflow: "hidden",
      marginRight: 8,
    }}
  >
    <img
      src="https://i.pravatar.cc/100?img=33"
      alt="User"
      style={{ width: "100%", height: "100%", objectFit: "cover" }}
    />
  </div>
);

export default UserAvatar;
