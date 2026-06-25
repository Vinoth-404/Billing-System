const http = require("http");

const data = JSON.stringify({
  password: "admin123"
});

const options = {
  hostname: "localhost",
  port: 5000,
  path: "/api/settings/verify-password",
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Content-Length": data.length
  }
};

const req = http.request(options, (res) => {
  console.log(`Status Code: ${res.statusCode}`);
  let body = "";
  res.on("data", (chunk) => body += chunk);
  res.on("end", () => {
    console.log("Response Body:", body);
  });
});

req.on("error", (err) => {
  console.error("Error:", err);
});

req.write(data);
req.end();
