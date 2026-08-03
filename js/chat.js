// ============================================================
// Smart Support Assistant — keyword-matched Q&A chat widget
// ============================================================

let chatFaqs = [];
let chatOpen = false;
let chatWelcome = "Namaste! Main aapki madad ke liye hoon. Neeche se koi sawaal chuniye ya apna sawaal type kariye.";

async function loadChatData() {
  const [faqRes, settingsRes] = await Promise.all([
    supabaseClient.from("chat_faqs").select("*").eq("is_active", true).order("display_order"),
    supabaseClient.from("company_settings").select("chat_welcome_message, whatsapp_number, whatsapp_support_timing").eq("id", 1).single(),
  ]);

  chatFaqs = faqRes.data || [];
  if (settingsRes.data?.chat_welcome_message) chatWelcome = settingsRes.data.chat_welcome_message;
  window.__chatSettings = settingsRes.data || {};
}

function buildChatWidget() {
  if (document.getElementById("chat-widget")) return;

  const launcher = document.createElement("button");
  launcher.id = "chat-launcher";
  launcher.className = "chat-launcher";
  launcher.setAttribute("aria-label", "Open support assistant");
  launcher.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5a8.4 8.4 0 0 1-.9-3.8 8.4 8.4 0 0 1 8.4-9 8.4 8.4 0 0 1 8.6 8.3z"/>
    </svg>`;

  const panel = document.createElement("div");
  panel.id = "chat-widget";
  panel.className = "chat-widget";
  panel.innerHTML = `
    <div class="chat-header">
      <div>
        <strong>Support Assistant</strong>
        <span id="chat-timing"></span>
      </div>
      <button type="button" id="chat-close" aria-label="Close">&times;</button>
    </div>
    <div class="chat-body" id="chat-body"></div>
    <div class="chat-suggestions" id="chat-suggestions"></div>
    <form class="chat-input-row" id="chat-form">
      <input type="text" id="chat-input" placeholder="Apna sawaal likhiye..." autocomplete="off">
      <button type="submit" class="btn btn-brass btn-sm">Send</button>
    </form>`;

  document.body.appendChild(launcher);
  document.body.appendChild(panel);

  launcher.addEventListener("click", toggleChat);
  document.getElementById("chat-close").addEventListener("click", toggleChat);
  document.getElementById("chat-form").addEventListener("submit", handleChatSubmit);
}

function toggleChat() {
  chatOpen = !chatOpen;
  const panel = document.getElementById("chat-widget");
  panel.classList.toggle("open", chatOpen);

  if (chatOpen && !panel.dataset.started) {
    panel.dataset.started = "1";
    addChatMessage(chatWelcome, "bot");
    renderSuggestions();
    const timing = window.__chatSettings?.whatsapp_support_timing;
    if (timing) document.getElementById("chat-timing").textContent = timing;
  }
}

function addChatMessage(text, who) {
  const body = document.getElementById("chat-body");
  const div = document.createElement("div");
  div.className = `chat-msg chat-${who}`;
  div.innerHTML = text.replace(/\n/g, "<br>");
  body.appendChild(div);
  body.scrollTop = body.scrollHeight;
}

function renderSuggestions() {
  const box = document.getElementById("chat-suggestions");
  box.innerHTML = chatFaqs.slice(0, 5).map(f =>
    `<button type="button" class="chat-chip" data-faq="${f.id}">${f.question}</button>`
  ).join("");

  box.querySelectorAll("[data-faq]").forEach(btn => {
    btn.addEventListener("click", () => {
      const faq = chatFaqs.find(f => f.id === btn.dataset.faq);
      if (!faq) return;
      addChatMessage(faq.question, "user");
      setTimeout(() => answerFromFaq(faq), 300);
    });
  });
}

function answerFromFaq(faq) {
  addChatMessage(faq.answer, "bot");
  supabaseClient.from("chat_faqs").update({ hit_count: (faq.hit_count || 0) + 1 }).eq("id", faq.id);
}

// Simple keyword scoring — no external AI call needed
function findBestAnswer(query) {
  const q = query.toLowerCase().trim();
  if (!q) return null;

  const words = q.split(/\s+/).filter(w => w.length > 2);
  let best = null, bestScore = 0;

  chatFaqs.forEach(faq => {
    let score = 0;
    const haystack = `${faq.question} ${faq.keywords || ""}`.toLowerCase();

    words.forEach(w => {
      if (haystack.includes(w)) score += 2;
      // partial match on longer words
      if (w.length > 4 && haystack.includes(w.slice(0, 4))) score += 1;
    });

    if (score > bestScore) { bestScore = score; best = faq; }
  });

  return bestScore >= 2 ? best : null;
}

function handleChatSubmit(e) {
  e.preventDefault();
  const input = document.getElementById("chat-input");
  const query = input.value.trim();
  if (!query) return;

  addChatMessage(query, "user");
  input.value = "";

  setTimeout(() => {
    const faq = findBestAnswer(query);
    if (faq) {
      answerFromFaq(faq);
    } else {
      const wa = (window.__chatSettings?.whatsapp_number || "").replace(/[^0-9]/g, "");
      const waLink = wa
        ? ` <a href="https://wa.me/${wa}?text=${encodeURIComponent(query)}" target="_blank" rel="noopener">WhatsApp par poochhiye</a>`
        : "";
      addChatMessage(
        `Is sawaal ka jawaab mere paas nahi hai. Aap <a href="help.html">Help Center</a> dekhiye${waLink ? " ya" + waLink : ""}.`,
        "bot"
      );
    }
  }, 400);
}

document.addEventListener("DOMContentLoaded", async () => {
  if (typeof supabaseClient === "undefined") return;
  await loadChatData();
  if (chatFaqs.length) buildChatWidget();
});
