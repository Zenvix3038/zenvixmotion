import http from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || "127.0.0.1";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";
const GOOGLE_SHEET_WEBHOOK = process.env.GOOGLE_SHEET_WEBHOOK || "";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";

const publicDir = path.join(__dirname, "public");
const dataDir = path.join(__dirname, "data");
const uploadsDir = path.join(__dirname, "uploads");
const assetsDir = path.join(__dirname, "store-assets");
const worksFile = path.join(dataDir, "works.json");
const storeFile = path.join(dataDir, "store.json");
const purchasesFile = path.join(dataDir, "purchases.json");
const visitorsFile = path.join(dataDir, "visitors.json");
const chatsFile = path.join(dataDir, "chats.json");
const leadsFile = path.join(dataDir, "leads.csv");

await fs.mkdir(dataDir, { recursive: true });
await fs.mkdir(uploadsDir, { recursive: true });
await fs.mkdir(assetsDir, { recursive: true });
await ensureJson(worksFile, []);
await ensureJson(storeFile, defaultStoreAssets());
await ensureJson(purchasesFile, []);
await ensureJson(visitorsFile, []);
await ensureJson(chatsFile, []);
await ensureFile(leadsFile, "time,name,phone,email,message,page,city,country\n");

const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".pdf": "application/pdf"
};

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith("/api/")) return await handleApi(req, res, url);
    if (url.pathname.startsWith("/uploads/")) {
      const uploadPath = path.normalize(path.join(__dirname, url.pathname));
      if (!uploadPath.startsWith(uploadsDir)) return send(res, 403, "Forbidden");
      return await serveFile(res, uploadPath);
    }
    if (url.pathname === "/admin.html") return send(res, 404, "Not found");

    const requested = url.pathname === "/" ? "/index.html" : url.pathname;
    const filePath = path.normalize(path.join(publicDir, requested));
    if (!filePath.startsWith(publicDir)) return send(res, 403, "Forbidden");
    await serveFile(res, filePath);
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { ok: false, error: "Server error" });
  }
}).listen(PORT, HOST, () => {
  console.log(`Film production website running at http://${HOST}:${PORT}`);
  console.log(`Private admin panel: http://${HOST}:${PORT}/zenvix-control.html`);
});

async function handleApi(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/works") {
    return sendJson(res, 200, await readJson(worksFile));
  }

  if (req.method === "GET" && url.pathname === "/api/store") {
    const products = await readJson(storeFile);
    return sendJson(res, 200, products.map(publicProduct));
  }

  if (req.method === "GET" && url.pathname.startsWith("/api/store/watermark/")) {
    const id = url.pathname.split("/").pop();
    const product = await findProduct(id);
    if (!product) return send(res, 404, "Not found");
    return await sendWatermarkedAsset(res, product, url.searchParams.get("download") === "1");
  }

  if (req.method === "POST" && url.pathname === "/api/store/pay") {
    const payload = await readBodyJson(req);
    const product = await findProduct(payload.productId);
    if (!product) return sendJson(res, 404, { ok: false, error: "Asset not found" });
    const purchase = {
      id: crypto.randomUUID(),
      productId: product.id,
      token: crypto.randomBytes(24).toString("hex"),
      time: new Date().toISOString(),
      name: clean(payload.name),
      phone: clean(payload.phone),
      email: clean(payload.email),
      amount: product.price,
      status: "paid-demo"
    };
    await appendJson(purchasesFile, purchase);
    await sendToSheet("asset_purchase", {
      name: purchase.name,
      phone: purchase.phone,
      email: purchase.email,
      message: `${product.title} - ${product.price}`
    });
    return sendJson(res, 200, { ok: true, purchaseId: purchase.id, token: purchase.token });
  }

  if (req.method === "GET" && url.pathname.startsWith("/api/store/original/")) {
    const id = url.pathname.split("/").pop();
    const token = url.searchParams.get("token") || "";
    const product = await findProduct(id);
    const purchases = await readJson(purchasesFile);
    const paid = purchases.some((item) => item.productId === id && item.token === token);
    if (!product || !paid) return sendJson(res, 402, { ok: false, error: "Payment required" });
    if (product.sample) return sendTextDownload(res, `${safeName(product.title)}.txt`, demoOriginal(product));
    const originalPath = path.normalize(path.join(assetsDir, product.fileName || ""));
    if (!originalPath.startsWith(assetsDir)) return send(res, 403, "Forbidden");
    return await serveDownload(res, originalPath, product.originalName || product.fileName || "asset");
  }

  if (req.method === "POST" && url.pathname === "/api/track") {
    const payload = await readBodyJson(req);
    const visitor = {
      id: crypto.randomUUID(),
      time: new Date().toISOString(),
      ip: req.headers["x-forwarded-for"] || req.socket.remoteAddress || "",
      userAgent: req.headers["user-agent"] || "",
      referer: req.headers.referer || "",
      ...payload
    };
    await appendJson(visitorsFile, visitor);
    await sendToSheet("visitor", visitor);
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === "POST" && url.pathname === "/api/lead") {
    const payload = await readBodyJson(req);
    const lead = {
      time: new Date().toISOString(),
      name: clean(payload.name),
      phone: clean(payload.phone),
      email: clean(payload.email),
      message: clean(payload.message),
      page: clean(payload.page),
      city: clean(payload.city),
      country: clean(payload.country)
    };
    await fs.appendFile(leadsFile, csvLine(lead));
    await sendToSheet("lead", lead);
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === "POST" && url.pathname === "/api/chat") {
    const payload = await readBodyJson(req);
    const chats = await readJson(chatsFile);
    const chatId = payload.chatId || crypto.randomUUID();
    let thread = chats.find((item) => item.id === chatId);
    if (!thread) {
      thread = { id: chatId, createdAt: new Date().toISOString(), status: "open", messages: [] };
      chats.push(thread);
    }
    thread.updatedAt = new Date().toISOString();
    thread.name = clean(payload.name || thread.name || "Website visitor");
    thread.messages.push({
      id: crypto.randomUUID(),
      from: "visitor",
      text: clean(payload.message),
      time: new Date().toISOString()
    });
    await fs.writeFile(chatsFile, JSON.stringify(chats, null, 2));
    await sendToSheet("chat", { chatId, name: thread.name, message: payload.message });
    return sendJson(res, 200, { ok: true, chatId, thread });
  }

  if (req.method === "GET" && url.pathname === "/api/chat") {
    const chatId = url.searchParams.get("chatId");
    const chats = await readJson(chatsFile);
    return sendJson(res, 200, chats.find((item) => item.id === chatId) || null);
  }

  if (req.method === "POST" && url.pathname === "/api/ai") {
    const payload = await readBodyJson(req);
    const answer = await aiReply(clean(payload.message), clean(payload.context));
    return sendJson(res, 200, { ok: true, answer });
  }

  if (!isAdmin(req)) return sendJson(res, 401, { ok: false, error: "Admin password required" });

  if (req.method === "GET" && url.pathname === "/api/admin/visitors") {
    return sendJson(res, 200, await readJson(visitorsFile));
  }

  if (req.method === "GET" && url.pathname === "/api/admin/chats") {
    return sendJson(res, 200, await readJson(chatsFile));
  }

  if (req.method === "POST" && url.pathname === "/api/admin/reply") {
    const payload = await readBodyJson(req);
    const chats = await readJson(chatsFile);
    const thread = chats.find((item) => item.id === payload.chatId);
    if (!thread) return sendJson(res, 404, { ok: false, error: "Chat not found" });
    thread.updatedAt = new Date().toISOString();
    thread.messages.push({
      id: crypto.randomUUID(),
      from: "studio",
      text: clean(payload.message),
      time: new Date().toISOString()
    });
    await fs.writeFile(chatsFile, JSON.stringify(chats, null, 2));
    return sendJson(res, 200, { ok: true, thread });
  }

  if (req.method === "POST" && url.pathname === "/api/admin/upload") {
    const upload = await parseMultipart(req);
    const now = Date.now();
    const original = safeName(upload.files.media?.filename || "work.bin");
    const savedName = `${now}-${original}`;
    const savedPath = path.join(uploadsDir, savedName);
    await fs.writeFile(savedPath, upload.files.media?.data || "");
    const work = {
      id: crypto.randomUUID(),
      title: clean(upload.fields.title || "Untitled work"),
      category: clean(upload.fields.category || "Film"),
      description: clean(upload.fields.description || ""),
      client: clean(upload.fields.client || ""),
      year: clean(upload.fields.year || new Date().getFullYear()),
      mediaUrl: `/uploads/${savedName}`,
      mediaType: upload.files.media?.contentType || "application/octet-stream",
      createdAt: new Date().toISOString()
    };
    await appendJson(worksFile, work);
    return sendJson(res, 200, { ok: true, work });
  }

  if (req.method === "POST" && url.pathname === "/api/admin/store-upload") {
    const upload = await parseMultipart(req);
    const now = Date.now();
    const original = safeName(upload.files.asset?.filename || "asset.bin");
    const savedName = `${now}-${original}`;
    const savedPath = path.join(assetsDir, savedName);
    await fs.writeFile(savedPath, upload.files.asset?.data || "");
    const product = {
      id: crypto.randomUUID(),
      title: clean(upload.fields.title || "Untitled asset"),
      category: clean(upload.fields.category || "Production Asset"),
      description: clean(upload.fields.description || ""),
      price: clean(upload.fields.price || "499"),
      license: clean(upload.fields.license || "Personal / commercial use"),
      fileName: savedName,
      originalName: original,
      mediaType: upload.files.asset?.contentType || "application/octet-stream",
      createdAt: new Date().toISOString()
    };
    await appendJson(storeFile, product);
    return sendJson(res, 200, { ok: true, product: publicProduct(product) });
  }

  sendJson(res, 404, { ok: false, error: "Not found" });
}

async function serveFile(res, filePath) {
  try {
    const stat = await fs.stat(filePath);
    if (stat.isDirectory()) return send(res, 403, "Forbidden");
    res.writeHead(200, { "content-type": mime[path.extname(filePath).toLowerCase()] || "application/octet-stream" });
    const data = await fs.readFile(filePath);
    res.end(data);
  } catch {
    send(res, 404, "Not found");
  }
}

async function serveDownload(res, filePath, fileName) {
  try {
    const stat = await fs.stat(filePath);
    if (stat.isDirectory()) return send(res, 403, "Forbidden");
    res.writeHead(200, {
      "content-type": mime[path.extname(filePath).toLowerCase()] || "application/octet-stream",
      "content-disposition": `attachment; filename="${safeName(fileName)}"`,
      "cache-control": "private, no-store"
    });
    res.end(await fs.readFile(filePath));
  } catch {
    send(res, 404, "Not found");
  }
}

async function sendWatermarkedAsset(res, product, download = false) {
  const filePath = product.fileName ? path.normalize(path.join(assetsDir, product.fileName)) : "";
  const canEmbed = filePath.startsWith(assetsDir) && product.mediaType?.startsWith("image/");
  let image = "";
  if (canEmbed) {
    try {
      const bytes = await fs.readFile(filePath);
      image = `<image href="data:${product.mediaType};base64,${bytes.toString("base64")}" x="0" y="0" width="1200" height="760" preserveAspectRatio="xMidYMid slice" opacity="0.52"/>`;
    } catch {
      image = "";
    }
  }
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="760" viewBox="0 0 1200 760">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#101316"/>
      <stop offset="0.54" stop-color="#1c2f2d"/>
      <stop offset="1" stop-color="#281719"/>
    </linearGradient>
    <pattern id="mark" width="320" height="160" patternUnits="userSpaceOnUse" patternTransform="rotate(-24)">
      <text x="20" y="82" fill="rgba(255,255,255,0.2)" font-family="Arial" font-size="30" font-weight="800">ZENVIX MOTION</text>
    </pattern>
  </defs>
  <rect width="1200" height="760" fill="url(#bg)"/>
  ${image}
  <rect width="1200" height="760" fill="url(#mark)"/>
  <rect x="60" y="560" width="1080" height="140" rx="8" fill="rgba(6,8,10,0.74)"/>
  <text x="92" y="620" fill="#f4efe7" font-family="Arial" font-size="42" font-weight="800">${escapeXml(product.title)}</text>
  <text x="92" y="664" fill="#d7ad53" font-family="Arial" font-size="24">Watermarked preview - pay to unlock original download</text>
  <text x="92" y="694" fill="#aab5b6" font-family="Arial" font-size="18">${escapeXml(product.category)} / Rs ${escapeXml(product.price)}</text>
</svg>`;
  res.writeHead(200, {
    "content-type": "image/svg+xml; charset=utf-8",
    "content-disposition": `${download ? "attachment" : "inline"}; filename="${safeName(product.title)}-watermarked.svg"`,
    "cache-control": "no-store"
  });
  res.end(svg);
}

function sendTextDownload(res, fileName, text) {
  res.writeHead(200, {
    "content-type": "text/plain; charset=utf-8",
    "content-disposition": `attachment; filename="${safeName(fileName)}"`,
    "cache-control": "private, no-store"
  });
  res.end(text);
}

async function sendToSheet(type, payload) {
  if (!GOOGLE_SHEET_WEBHOOK) return;
  try {
    await fetch(GOOGLE_SHEET_WEBHOOK, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type, ...payload })
    });
  } catch (error) {
    console.warn("Google Sheet webhook failed:", error.message);
  }
}

async function aiReply(message, context = "") {
  if (OPENAI_API_KEY) {
    try {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          authorization: `Bearer ${OPENAI_API_KEY}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
          input: [
            {
              role: "system",
              content: "You are Achachan, a warm senior film-production advisor for Zenvix Motion, a premium Indian film production company. Reply briefly, ask for project details, and guide visitors toward booking a call."
            },
            { role: "user", content: `${context}\n\nVisitor: ${message}` }
          ]
        })
      });
      const data = await response.json();
      const text = data.output_text || data.output?.[0]?.content?.[0]?.text;
      if (text) return text;
    } catch (error) {
      console.warn("AI reply failed:", error.message);
    }
  }
  const lower = message.toLowerCase();
  if (lower.includes("price") || lower.includes("rate") || lower.includes("budget")) {
    return "Nalla question. Budget project scale, shoot days, location, crew, edit/VFX needs enna details anusarichaanu. Phone number share cheythal studio team exact estimate ayakkam.";
  }
  if (lower.includes("wedding") || lower.includes("event")) {
    return "Wedding/event production cheyyam. Date, venue, guest size, highlight film/full film venam enn paranjal package suggest cheyyam.";
  }
  if (lower.includes("ad") || lower.includes("brand") || lower.includes("commercial")) {
    return "Brand film/commercialinu concept, script, shoot, edit, sound, color ellam handle cheyyam. Product/service nameum target audienceum share cheyyamo?";
  }
  return "Namaskaram, njan Achachan AI assistant aanu. Film, ad, music video, event coverage, post-production ellam discuss cheyyam. Project type, date, location, budget range paranjal njan next step guide cheyyam.";
}

async function readBodyJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

async function parseMultipart(req) {
  const contentType = req.headers["content-type"] || "";
  const boundary = contentType.match(/boundary=(.+)$/)?.[1];
  if (!boundary) return { fields: {}, files: {} };
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const buffer = Buffer.concat(chunks);
  const parts = buffer.toString("binary").split(`--${boundary}`).slice(1, -1);
  const fields = {};
  const files = {};
  for (const part of parts) {
    const [rawHeaders, rawBody] = part.split("\r\n\r\n");
    if (!rawBody) continue;
    const name = rawHeaders.match(/name="([^"]+)"/)?.[1];
    const filename = rawHeaders.match(/filename="([^"]*)"/)?.[1];
    const contentTypeMatch = rawHeaders.match(/Content-Type:\s*([^\r\n]+)/i)?.[1];
    const body = Buffer.from(rawBody.replace(/\r\n$/, ""), "binary");
    if (filename) files[name] = { filename, contentType: contentTypeMatch, data: body };
    else fields[name] = body.toString("utf8").trim();
  }
  return { fields, files };
}

async function ensureJson(file, fallback) {
  try {
    await fs.access(file);
  } catch {
    await fs.writeFile(file, JSON.stringify(fallback, null, 2));
  }
}

async function ensureFile(file, fallback) {
  try {
    await fs.access(file);
  } catch {
    await fs.writeFile(file, fallback);
  }
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

async function appendJson(file, item) {
  const data = await readJson(file);
  data.push(item);
  await fs.writeFile(file, JSON.stringify(data, null, 2));
}

function sendJson(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function send(res, status, body) {
  res.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
  res.end(body);
}

function isAdmin(req) {
  return req.headers["x-admin-password"] === ADMIN_PASSWORD;
}

function clean(value = "") {
  return String(value).replace(/\s+/g, " ").trim().slice(0, 2000);
}

function safeName(value) {
  return path.basename(value).replace(/[^a-zA-Z0-9._-]/g, "-");
}

function publicProduct(product) {
  return {
    id: product.id,
    title: product.title,
    category: product.category,
    description: product.description,
    price: product.price,
    license: product.license,
    mediaType: product.mediaType,
    sample: Boolean(product.sample)
  };
}

async function findProduct(id) {
  const products = await readJson(storeFile);
  return products.find((product) => product.id === id);
}

function defaultStoreAssets() {
  return [
    {
      id: "cinematic-lut-pack",
      title: "Cinematic LUT Pack",
      category: "Color Grading",
      description: "Premium warm teal film look for ads, wedding films and music videos.",
      price: "999",
      license: "Commercial use for one buyer",
      mediaType: "application/zip",
      sample: true
    },
    {
      id: "production-call-sheet",
      title: "Production Call Sheet Template",
      category: "Production Template",
      description: "Clean call sheet template for shoot day planning, crew timing and location notes.",
      price: "299",
      license: "Personal / studio use",
      mediaType: "application/pdf",
      sample: true
    },
    {
      id: "film-title-sound-pack",
      title: "Film Title Sound Pack",
      category: "Audio",
      description: "Short cinematic risers, hits and soft transitions for title openings.",
      price: "799",
      license: "Commercial use for one buyer",
      mediaType: "audio/mpeg",
      sample: true
    }
  ];
}

function demoOriginal(product) {
  return `Zenvix Motion Original Asset\n\nAsset: ${product.title}\nCategory: ${product.category}\nLicense: ${product.license}\n\nThis is the unlocked original demo file. Upload real assets from the admin store panel to sell actual files.`;
}

function escapeXml(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&apos;"
  }[char]));
}

function csvLine(lead) {
  return ["time", "name", "phone", "email", "message", "page", "city", "country"]
    .map((key) => `"${String(lead[key] || "").replace(/"/g, '""')}"`)
    .join(",") + "\n";
}
