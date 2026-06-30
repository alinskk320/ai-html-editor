const { execSync } = require("child_process");

const port = Number(process.env.PORT || 6199);

try {
  const output = execSync(`lsof -ti tcp:${port}`, {
    stdio: ["ignore", "pipe", "ignore"]
  })
    .toString("utf8")
    .trim();

  if (!output) {
    console.log(`No process found on port ${port}.`);
    process.exit(0);
  }

  const pids = Array.from(new Set(output.split(/\s+/).filter(Boolean)));
  pids.forEach((pid) => {
    process.kill(Number(pid), "SIGTERM");
  });

  console.log(`Stopped process on port ${port}: ${pids.join(", ")}`);
} catch (error) {
  console.log(`No process found on port ${port}.`);
}
