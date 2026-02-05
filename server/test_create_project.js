// Node 18+ has built-in fetch
const BASE_URL = "http://localhost:5000/api";
let cookie = "";

async function register() {
  console.log("\nRegistering new user...");
  // Ensure unique email and employeeId
  const timestamp = Date.now();
  const email = `test${timestamp}@example.com`;
  const employeeId = `EMP${timestamp}`;

  const res = await fetch(`${BASE_URL}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Test User",
      email,
      employeeId, // REQUIRED field
      password: "password123",
    }),
  });

  if (res.ok) {
    const rawCookies = res.headers.get("set-cookie");
    if (rawCookies) {
      cookie = rawCookies.split(";")[0];
      console.log(`Registered and logged in as ${email} (ID: ${employeeId})`);
      return true;
    }
  } else {
    // If user exists, try login (should not happen with timestamp)
    if (res.status === 400) {
      console.log("Registration failed with 400. Response:", await res.text());
      return false;
    }
    console.log("Registration failed:", await res.text());
    return false;
  }
}

async function createProject() {
  console.log("\nCreating Project...");
  const projectData = {
    orderDate: new Date(),
    receivedTime: "10:00",
    lead: "sarah",
    projectName: "Test Project " + Date.now(),
    deliveryDate: new Date(),
    deliveryTime: "14:00",
    deliveryLocation: "Warehouse A",
    contactType: "MH",
    supplySource: "in-house",
    departments: ["graphics", "uv-printing"], // Step 2
    items: [
      { description: "Test Item 1", breakdown: "Room A", qty: 10 },
      { description: "Test Item 2", breakdown: "Room B", qty: 5 },
    ], // Step 3
    uncontrollableFactors: [
      {
        description: "Weather delay",
        responsible: { label: "Sarah", value: "sarah" },
        status: { label: "Identified", value: "identified" },
      },
    ],
    productionRisks: [
      {
        description: "Material shortage",
        preventive: "Stock up early",
      },
    ],
  };

  const res = await fetch(`${BASE_URL}/projects`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
    },
    body: JSON.stringify(projectData),
  });

  const data = await res.json();
  if (res.ok) {
    console.log("Project created successfully!", data);
  } else {
    console.log("Failed to create project:", data);
  }
}

async function getUsers() {
  console.log("\nFetching Users...");
  const res = await fetch(`${BASE_URL}/auth/users`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
    },
  });

  if (res.ok) {
    const users = await res.json();
    console.log(`Fetched ${users.length} users successfully.`);
    console.log("Sample user:", users[0]);
  } else {
    console.log("Failed to fetch users:", await res.text());
  }
}

(async () => {
  if (await register()) {
    await createProject();
    await getUsers();
  }
})();
