const workGrid = document.querySelector("#workGrid");
const storeGrid = document.querySelector("#storeGrid");
const leadForm = document.querySelector("#leadForm");
const leadStatus = document.querySelector("#leadStatus");
const paymentDialog = document.querySelector("#paymentDialog");
const paymentForm = document.querySelector("#paymentForm");
const paymentTitle = document.querySelector("#paymentTitle");
const paymentMeta = document.querySelector("#paymentMeta");
const paymentProductId = document.querySelector("#paymentProductId");
const paymentStatus = document.querySelector("#paymentStatus");
const chatToggle = document.querySelector("#chatToggle");
const chatBox = document.querySelector("#chatBox");
const chatClose = document.querySelector("#chatClose");
const chatMessages = document.querySelector("#chatMessages");
const chatForm = document.querySelector("#chatForm");
const chatName = document.querySelector("#chatName");
const chatInput = document.querySelector("#chatInput");
let chatId = localStorage.getItem("studioChatId") || "";

drawStudio();
trackVisitor();
loadWorks();
loadStore();
protectMedia();
seedChat();
setInterval(pollChat, 4000);

leadForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(leadForm);
  const payload = Object.fromEntries(form.entries());
  payload.page = location.href;
  await postJson("/api/lead", payload);
  leadStatus.textContent = "Inquiry saved. Studio team can contact you soon.";
  leadForm.reset();
});

chatToggle.addEventListener("click", () => {
  chatBox.hidden = false;
  chatToggle.hidden = true;
});

chatClose.addEventListener("click", () => {
  chatBox.hidden = true;
  chatToggle.hidden = false;
});

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = chatInput.value.trim();
  if (!message) return;
  addBubble(message, "me");
  chatInput.value = "";
  const response = await postJson("/api/chat", {
    chatId,
    name: chatName.value || "Website visitor",
    message
  });
  chatId = response.chatId;
  localStorage.setItem("studioChatId", chatId);
  const ai = await postJson("/api/ai", { message, context: "Website visitor is asking from Zenvix Motion website." });
  addBubble(ai.answer, "ai");
});

paymentForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(paymentForm).entries());
  paymentStatus.textContent = "Payment verifying...";
  const data = await postJson("/api/store/pay", payload);
  if (!data.ok) {
    paymentStatus.textContent = data.error || "Payment failed.";
    return;
  }
  localStorage.setItem(`purchase:${payload.productId}`, data.token);
  paymentStatus.innerHTML = `Payment complete. <a href="/api/store/original/${encodeURIComponent(payload.productId)}?token=${encodeURIComponent(data.token)}">Download original file</a>`;
  await loadStore();
});

document.querySelector(".dialog-close").addEventListener("click", () => {
  paymentDialog.close();
});

async function loadWorks() {
  const works = await fetch("/api/works").then((res) => res.json());
  if (!works.length) {
    workGrid.innerHTML = [
      sampleCard("Brand Film", "Commercial", "Upload your first ad film from admin panel."),
      sampleCard("Event Story", "Live Coverage", "Premium event video and highlight films."),
      sampleCard("Music Video", "Production", "Concept, shoot and post-production showcase.")
    ].join("");
    return;
  }
  workGrid.innerHTML = works.map((work) => {
    const isVideo = work.mediaType.startsWith("video/");
    const media = isVideo
      ? `<video src="${work.mediaUrl}" controls muted playsinline></video>`
      : `<img src="${work.mediaUrl}" alt="${escapeHtml(work.title)}">`;
    return `<article class="work-card">
      <div class="work-media">${media}</div>
      <div class="work-body">
        <p class="work-meta">${escapeHtml(work.category)} / ${escapeHtml(work.year)}</p>
        <h3>${escapeHtml(work.title)}</h3>
        <p>${escapeHtml(work.description || work.client || "Uploaded studio work.")}</p>
      </div>
    </article>`;
  }).join("");
}

function sampleCard(title, category, text) {
  return `<article class="work-card">
    <div class="work-media"><span>${title}</span></div>
    <div class="work-body">
      <p class="work-meta">${category}</p>
      <h3>${title}</h3>
      <p>${text}</p>
    </div>
  </article>`;
}

async function loadStore() {
  const products = await fetch("/api/store").then((res) => res.json());
  storeGrid.innerHTML = products.map((product) => {
    const token = localStorage.getItem(`purchase:${product.id}`);
    const original = token
      ? `<a class="button primary" href="/api/store/original/${encodeURIComponent(product.id)}?token=${encodeURIComponent(token)}">Original Download</a>`
      : `<button class="button primary buy-button" type="button" data-id="${escapeHtml(product.id)}">Pay & Unlock</button>`;
    return `<article class="store-card" data-product-id="${escapeHtml(product.id)}">
      <div class="asset-preview">
        <img src="/api/store/watermark/${encodeURIComponent(product.id)}" alt="${escapeHtml(product.title)} watermarked preview" draggable="false">
        <span class="protect-badge">Protected Preview</span>
      </div>
      <div class="store-body">
        <p class="work-meta">${escapeHtml(product.category)}</p>
        <h3>${escapeHtml(product.title)}</h3>
        <p>${escapeHtml(product.description)}</p>
        <div class="price-row">
          <strong>Rs ${escapeHtml(product.price)}</strong>
          <small>${escapeHtml(product.license)}</small>
        </div>
        <div class="store-actions">
          <a class="button secondary" href="/api/store/watermark/${encodeURIComponent(product.id)}?download=1">Watermark Download</a>
          ${original}
        </div>
      </div>
    </article>`;
  }).join("");

  document.querySelectorAll(".buy-button").forEach((button) => {
    button.addEventListener("click", () => openPayment(products.find((item) => item.id === button.dataset.id)));
  });
}

function openPayment(product) {
  if (!product) return;
  paymentForm.reset();
  paymentStatus.textContent = "Demo payment mode. Connect Razorpay/Stripe on deployment for real payment.";
  paymentTitle.textContent = product.title;
  paymentMeta.textContent = `Rs ${product.price} / ${product.license}`;
  paymentProductId.value = product.id;
  paymentDialog.showModal();
}

function protectMedia() {
  document.addEventListener("contextmenu", (event) => {
    if (event.target.closest(".protected-media, .asset-preview")) event.preventDefault();
  });
  document.addEventListener("dragstart", (event) => {
    if (event.target.closest(".protected-media, .asset-preview")) event.preventDefault();
  });
  document.addEventListener("keydown", async (event) => {
    const key = event.key.toLowerCase();
    const blocked = key === "printscrn" || (event.ctrlKey || event.metaKey) && ["s", "p", "u"].includes(key);
    if (!blocked) return;
    event.preventDefault();
    showProtectionNotice();
    try {
      await navigator.clipboard.writeText("Zenvix Motion protected preview");
    } catch {
      // Clipboard access is browser-controlled; protection notice still appears.
    }
  });
}

function showProtectionNotice() {
  let notice = document.querySelector(".protection-notice");
  if (!notice) {
    notice = document.createElement("div");
    notice.className = "protection-notice";
    document.body.appendChild(notice);
  }
  notice.textContent = "Screenshot/download protection active. Original file unlocks after payment.";
  notice.classList.add("show");
  setTimeout(() => notice.classList.remove("show"), 2200);
}

async function trackVisitor() {
  const payload = {
    page: location.href,
    title: document.title,
    language: navigator.language,
    screen: `${screen.width}x${screen.height}`,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
  };
  await postJson("/api/track", payload);
}

function seedChat() {
  addBubble("Namaskaram, njan Achachan AI aanu. Project type paranjal production package guide cheyyam.", "ai");
}

async function pollChat() {
  if (!chatId) return;
  const thread = await fetch(`/api/chat?chatId=${encodeURIComponent(chatId)}`).then((res) => res.json());
  if (!thread) return;
  const studioMessages = thread.messages.filter((item) => item.from === "studio");
  const known = new Set([...chatMessages.querySelectorAll("[data-id]")].map((item) => item.dataset.id));
  studioMessages.forEach((item) => {
    if (!known.has(item.id)) addBubble(item.text, "ai", item.id);
  });
}

function addBubble(text, type = "", id = "") {
  const bubble = document.createElement("div");
  bubble.className = `bubble ${type}`;
  if (id) bubble.dataset.id = id;
  bubble.textContent = text;
  chatMessages.appendChild(bubble);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  return response.json();
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[char]));
}

function drawStudio() {
  const canvas = document.querySelector("#studioCanvas");
  const ctx = canvas.getContext("2d");
  const resize = () => {
    canvas.width = canvas.offsetWidth * devicePixelRatio;
    canvas.height = canvas.offsetHeight * devicePixelRatio;
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  };
  resize();
  addEventListener("resize", resize);

  let frame = 0;
  const render = () => {
    const w = canvas.offsetWidth;
    const h = canvas.offsetHeight;
    frame += 1;
    ctx.clearRect(0, 0, w, h);
    const bg = ctx.createLinearGradient(0, 0, w, h);
    bg.addColorStop(0, "#08090b");
    bg.addColorStop(0.45, "#152020");
    bg.addColorStop(1, "#170e11");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    drawBeam(ctx, w * 0.72, h * 0.08, w * 0.38, h * 0.75, 260, "rgba(215,173,83,0.20)");
    drawBeam(ctx, w * 0.92, h * 0.18, w * 0.54, h * 0.62, 220, "rgba(85,198,189,0.16)");

    ctx.fillStyle = "rgba(255,255,255,0.08)";
    for (let i = 0; i < 80; i += 1) {
      const x = (i * 97 + frame * 0.35) % w;
      const y = (i * 53) % h;
      ctx.fillRect(x, y, 1.2, 1.2);
    }

    const baseY = h * 0.72;
    ctx.fillStyle = "#08090b";
    ctx.fillRect(0, baseY, w, h - baseY);

    ctx.strokeStyle = "rgba(255,255,255,0.16)";
    ctx.lineWidth = 2;
    for (let i = 0; i < 9; i += 1) {
      ctx.beginPath();
      ctx.moveTo(w * 0.2 + i * w * 0.08, baseY);
      ctx.lineTo(w * 0.04 + i * w * 0.13, h);
      ctx.stroke();
    }

    ctx.fillStyle = "#11171a";
    ctx.fillRect(w * 0.62, h * 0.46, 96, 58);
    ctx.fillStyle = "#050607";
    ctx.fillRect(w * 0.7, h * 0.49, 48, 22);
    ctx.strokeStyle = "#d7ad53";
    ctx.strokeRect(w * 0.625, h * 0.465, 86, 48);
    ctx.strokeStyle = "rgba(244,239,231,0.42)";
    ctx.beginPath();
    ctx.moveTo(w * 0.66, h * 0.55);
    ctx.lineTo(w * 0.62, h * 0.74);
    ctx.moveTo(w * 0.69, h * 0.55);
    ctx.lineTo(w * 0.72, h * 0.74);
    ctx.stroke();

    requestAnimationFrame(render);
  };
  render();
}

function drawBeam(ctx, x, y, tx, ty, radius, color) {
  const gradient = ctx.createRadialGradient(tx, ty, 0, tx, ty, radius);
  gradient.addColorStop(0, color);
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(tx - radius, ty + radius);
  ctx.lineTo(tx + radius, ty + radius);
  ctx.closePath();
  ctx.fill();
}
