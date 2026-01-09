const fetch = require("node-fetch"); // Ensure node-fetch is available or use native fetch in newer node

// Use native fetch if node-fetch is not available (Node 18+)
// validation
async function runTest() {
  const baseUrl = "http://localhost:5000/api/auth";
  let cookie = "";

  console.log("--- Starting Profile Update Test ---");

  // 1. Register/Login
  // Using a random ID to ensure fresh test or try login
  const randId = Math.floor(Math.random() * 10000);
  const user = {
    name: "Test User",
    employeeId: `EMP${randId}`,
    password: "password123",
  };

  console.log(`1. Registering user ${user.employeeId}...`);
  let res = await fetch(`${baseUrl}/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(user),
  });

  if (res.status === 400) {
    // Maybe exists, try login
    console.log("User might exist, trying login...");
    res = await fetch(`${baseUrl}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employeeId: user.employeeId,
        password: user.password,
      }),
    });
  }

  if (!res.ok) {
    console.error("Failed to auth:", await res.text());
    return;
  }

  // Get cookie
  const rawCookie = res.headers.get("set-cookie");
  if (rawCookie) {
    cookie = rawCookie.split(";")[0];
    console.log("Auth success, got cookie.");
  } else {
    console.error("No cookie received!");
  }

  // 2. Update Profile
  const profileData = {
    firstName: "Test",
    lastName: "UserUpdated",
    email: "test.user@example.com",
    department: "Engineering",
    employeeType: "Staff",
    contact: "+1234567890",
  };

  console.log("2. Updating Profile...");
  res = await fetch(`${baseUrl}/profile`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
    },
    body: JSON.stringify(profileData),
  });

  const updatedUser = await res.json();
  console.log("Update response:", updatedUser);

  if (
    updatedUser.department === "Engineering" &&
    updatedUser.lastName === "UserUpdated"
  ) {
    console.log("✅ Profile update verified successfully!");
  } else {
    console.error("❌ Profile update failed verification.");
  }
}

runTest();
