const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const root = __dirname;
const envPath = path.join(root, ".env");
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

function readEnvFile() {
  const values = {};
  const contents = fs.readFileSync(envPath, "utf8");
  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    const [, name, rawValue] = match;
    values[name] = rawValue.replace(/^(['"])(.*)\1$/, "$2");
  }
  return values;
}

function getSupabaseConfig() {
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = readEnvFile();
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_ANON_KEY in .env");
  }
  const projectUrl = new URL(SUPABASE_URL);
  if (projectUrl.protocol !== "https:") {
    throw new Error("SUPABASE_URL must use HTTPS.");
  }
  projectUrl.pathname = "/";
  projectUrl.search = "";
  projectUrl.hash = "";

  try {
    const payload = SUPABASE_ANON_KEY.split(".")[1];
    if (payload && JSON.parse(Buffer.from(payload, "base64url").toString("utf8")).role === "service_role") {
      throw new Error("Do not use a service_role key in this client app.");
    }
  } catch (error) {
    if (error.message === "Do not use a service_role key in this client app.") throw error;
  }

  return { url: projectUrl.toString(), anonKey: SUPABASE_ANON_KEY };
}

const server = http.createServer((request, response) => {
  const pathname = new URL(request.url, "http://localhost").pathname;

  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" }).end("Method not allowed");
    return;
  }

  if (pathname === "/api/config") {
    try {
      response.writeHead(200, {
        "Cache-Control": "no-store",
        "Content-Type": "application/json; charset=utf-8",
        "X-Content-Type-Options": "nosniff"
      });
      response.end(request.method === "HEAD" ? undefined : JSON.stringify(getSupabaseConfig()));
    } catch (error) {
      console.error(error.message);
      response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: "Supabase configuration is unavailable. Check your local .env file." }));
    }
    return;
  }

  const relativePath = pathname === "/" ? "index.html" : decodeURIComponent(pathname.slice(1));
  if (relativePath.split(/[\\/]/).some((part) => part.startsWith("."))) {
    response.writeHead(404).end("Not found");
    return;
  }
  const filePath = path.resolve(root, relativePath);
  if (!filePath.startsWith(`${root}${path.sep}`)) {
    response.writeHead(404).end("Not found");
    return;
  }

  fs.stat(filePath, (statError, stats) => {
    if (statError || !stats.isFile()) {
      response.writeHead(404).end("Not found");
      return;
    }
    response.writeHead(200, {
      "Content-Length": stats.size,
      "Content-Type": mimeTypes[path.extname(filePath)] || "application/octet-stream",
      "X-Content-Type-Options": "nosniff"
    });
    if (request.method === "HEAD") {
      response.end();
      return;
    }
    fs.createReadStream(filePath).pipe(response);
  });
});

const port = Number(process.env.PORT || 3000);
server.listen(port, "127.0.0.1", () => {
  console.log(`Little Bank running at http://127.0.0.1:${port}`);
});
