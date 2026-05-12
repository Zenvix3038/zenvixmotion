const loginPanel = document.querySelector("#loginPanel");
const adminPanel = document.querySelector("#adminPanel");
const password = document.querySelector("#password");
const loginButton = document.querySelector("#loginButton");
const uploadForm = document.querySelector("#uploadForm");
const uploadStatus = document.querySelector("#uploadStatus");
const storeUploadForm = document.querySelector("#storeUploadForm");
const storeUploadStatus = document.querySelector("#storeUploadStatus");
const visitorList = document.querySelector("#visitorList");
const adminChats = document.querySelector("#adminChats");
const replyForm = document.querySelector("#replyForm");
const replyChatId = document.querySelector("#replyChatId");
const replyText = document.querySelector("#replyText");

let adminPassword = localStorage.getItem("studioAdminPassword") || "";
if (adminPassword) {
  password.value = adminPassword;
  openAdmin();
}

loginButton.addEventListener("click", openAdmin);

uploadForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const response = await fetch("/api/admin/upload", {
    method: "POST",
    headers: { "x-admin-password": adminPassword },
    body: new FormData(uploadForm)
  });
  const data = await response.json();
  uploadStatus.textContent = data.ok ? "Work uploaded to website." : data.error;
  if (data.ok) uploadForm.reset();
});

storeUploadForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const response = await fetch("/api/admin/store-upload", {
    method: "POST",
    headers: { "x-admin-password": adminPassword },
    body: new FormData(storeUploadForm)
  });
  const data = await response.json();
  storeUploadStatus.textContent = data.ok ? "Store asset added. Buyers will get original only after payment." : data.error;
  if (data.ok) storeUploadForm.reset();
});

replyForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = await adminPost("/api/admin/reply", {
    chatId: replyChatId.value.trim(),
    message: replyText.value.trim()
  });
  if (data.ok) {
    replyText.value = "";
    await refreshAdmin();
  }
});

async function openAdmin() {
  adminPassword = password.value;
  localStorage.setItem("studioAdminPassword", adminPassword);
  loginPanel.hidden = true;
  adminPanel.hidden = false;
  await refreshAdmin();
  setInterval(refreshAdmin, 5000);
}

async function refreshAdmin() {
  const [visitors, chats] = await Promise.all([
    adminGet("/api/admin/visitors"),
    adminGet("/api/admin/chats")
  ]);
  renderVisitors(visitors);
  renderChats(chats);
}

function renderVisitors(visitors = []) {
  visitorList.innerHTML = visitors.slice().reverse().slice(0, 30).map((item) => `
    <div class="data-row">
      <strong>${new Date(item.time).toLocaleString()}</strong><br>
      ${escapeHtml(item.page || "")}<br>
      ${escapeHtml(item.timezone || "")} / ${escapeHtml(item.screen || "")}
    </div>
  `).join("") || "<p>No visitors yet.</p>";
}

function renderChats(chats = []) {
  adminChats.innerHTML = chats.slice().reverse().map((chat) => `
    <div class="data-row">
      <strong>${escapeHtml(chat.name || "Visitor")}</strong>
      <small> ${chat.id}</small>
      ${(chat.messages || []).map((message) => `<p><b>${message.from}:</b> ${escapeHtml(message.text)}</p>`).join("")}
    </div>
  `).join("") || "<p>No chats yet.</p>";
}

async function adminGet(url) {
  const response = await fetch(url, { headers: { "x-admin-password": adminPassword } });
  return response.json();
}

async function adminPost(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-admin-password": adminPassword
    },
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
