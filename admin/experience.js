// ============================================================
// Customer Experience admin — languages, translations,
// chat assistant, help center, onboarding, feedback
// ============================================================

let expLanguages = [];
let expCurrentLang = "en";
let feedbackCache = [];
let feedbackFilter = "pending";

function xTitle(s) { return (s || "").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()); }

// ------------------------------------------------------------
// Languages
// ------------------------------------------------------------
async function loadLanguagesAdmin() {
  const { data } = await supabaseClient.from("languages").select("*").order("display_order");
  expLanguages = data || [];

  const tbody = document.getElementById("languages-body");
  if (tbody) {
    tbody.innerHTML = expLanguages.length ? expLanguages.map(l => `
      <tr>
        <td><code>${l.code}</code></td>
        <td>${l.name}${l.is_default ? ' <span class="status-badge status-approved">Default</span>' : ""}</td>
        <td>${l.is_active ? "Active" : "Hidden"}</td>
        <td>${l.is_default ? "—" : `
          <button class="btn btn-outline btn-sm" onclick="toggleLanguage('${l.code}', ${!l.is_active})">${l.is_active ? "Hide" : "Show"}</button>
          <button class="btn btn-outline btn-sm" onclick="deleteLanguage('${l.code}')">Delete</button>`}
        </td>
      </tr>`).join("") : `<tr><td colspan="4">No languages.</td></tr>`;
  }

  const select = document.getElementById("translation-lang");
  if (select) {
    select.innerHTML = expLanguages.map(l => `<option value="${l.code}">${l.name}</option>`).join("");
    select.value = expCurrentLang;
  }
}

async function handleLanguageCreate(e) {
  e.preventDefault();
  const f = e.target;
  const msg = document.getElementById("language-msg");
  const { error } = await supabaseClient.from("languages").insert({
    code: f.code.value.trim().toLowerCase(),
    name: f.name.value.trim(),
    display_order: expLanguages.length + 1,
  });
  msg.textContent = error
    ? (error.code === "23505" ? "This language code already exists." : error.message)
    : "Language added — now fill in its translations.";
  msg.className = "form-msg " + (error ? "error" : "ok");
  if (!error) { f.reset(); loadLanguagesAdmin(); }
}

async function toggleLanguage(code, state) {
  await supabaseClient.from("languages").update({ is_active: state }).eq("code", code);
  loadLanguagesAdmin();
}
async function deleteLanguage(code) {
  if (!confirm("Delete this language and all of its translations?")) return;
  await supabaseClient.from("languages").delete().eq("code", code);
  loadLanguagesAdmin();
}

// ------------------------------------------------------------
// Translations
// ------------------------------------------------------------
async function loadTranslationsAdmin() {
  const lang = document.getElementById("translation-lang")?.value || expCurrentLang;
  const category = document.getElementById("translation-category")?.value || "";
  expCurrentLang = lang;

  let query = supabaseClient.from("translations").select("*").eq("lang_code", lang).order("category").order("translation_key");
  if (category) query = query.eq("category", category);

  const { data } = await query;
  const tbody = document.getElementById("translations-body");
  if (!tbody) return;

  if (!data || data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4">No translations for this language/category. Add one below.</td></tr>`;
    return;
  }

  tbody.innerHTML = data.map(t => `
    <tr>
      <td><code>${t.translation_key}</code></td>
      <td>${xTitle(t.category)}</td>
      <td><input type="text" value="${(t.value || "").replace(/"/g, "&quot;")}" id="tr-${t.id}" style="width:100%;padding:6px 9px;border:1px solid var(--line);border-radius:4px"></td>
      <td>
        <button class="btn btn-outline btn-sm" onclick="saveTranslation('${t.id}')">Save</button>
        <button class="btn btn-outline btn-sm" onclick="deleteTranslation('${t.id}')">Delete</button>
      </td>
    </tr>`).join("");
}

async function saveTranslation(id) {
  const value = document.getElementById("tr-" + id).value;
  const { error } = await supabaseClient.from("translations")
    .update({ value, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) { alert(error.message); return; }
  if (typeof logActivity === "function") logActivity("Translation updated", id);
  alert("सेव हो गया।");
}

async function deleteTranslation(id) {
  if (!confirm("Delete this translation?")) return;
  await supabaseClient.from("translations").delete().eq("id", id);
  loadTranslationsAdmin();
}

async function handleTranslationCreate(e) {
  e.preventDefault();
  const f = e.target;
  const msg = document.getElementById("translation-msg");
  const lang = document.getElementById("translation-lang").value;

  const { error } = await supabaseClient.from("translations").insert({
    translation_key: f.translation_key.value.trim(),
    lang_code: lang,
    value: f.value.value.trim(),
    category: f.category.value,
  });
  msg.textContent = error
    ? (error.code === "23505" ? "A translation for this key already exists in this language." : error.message)
    : "ट्रांसलेशन जुड़ गया।";
  msg.className = "form-msg " + (error ? "error" : "ok");
  if (!error) { f.reset(); loadTranslationsAdmin(); }
}

// ------------------------------------------------------------
// Chat assistant
// ------------------------------------------------------------
async function loadChatSettings() {
  const { data } = await supabaseClient.from("company_settings").select("chat_welcome_message").eq("id", 1).single();
  const f = document.getElementById("chat-settings-form");
  if (f && data) f.chat_welcome_message.value = data.chat_welcome_message || "";
}

async function handleChatSettingsSave(e) {
  e.preventDefault();
  const msg = document.getElementById("chat-settings-msg");
  const { error } = await supabaseClient.from("company_settings")
    .update({ chat_welcome_message: e.target.chat_welcome_message.value.trim(), updated_at: new Date().toISOString() })
    .eq("id", 1);
  msg.textContent = error ? error.message : "वेलकम मैसेज सेव हो गया।";
  msg.className = "form-msg " + (error ? "error" : "ok");
}

async function loadChatFaqsAdmin() {
  const { data } = await supabaseClient.from("chat_faqs").select("*").order("display_order");
  const tbody = document.getElementById("chat-faqs-body");
  if (!tbody) return;

  if (!data || data.length === 0) { tbody.innerHTML = `<tr><td colspan="5">No Q&As yet.</td></tr>`; return; }

  tbody.innerHTML = data.map(f => `
    <tr>
      <td>${f.question}<br><small style="color:var(--text-muted)">${(f.answer || "").slice(0, 70)}…</small></td>
      <td><small>${f.keywords || "—"}</small></td>
      <td>${f.hit_count || 0}</td>
      <td>${f.is_active ? "Active" : "Hidden"}</td>
      <td>
        <button class="btn btn-outline btn-sm" onclick="toggleChatFaq('${f.id}', ${!f.is_active})">${f.is_active ? "Hide" : "Show"}</button>
        <button class="btn btn-outline btn-sm" onclick="deleteChatFaq('${f.id}')">Delete</button>
      </td>
    </tr>`).join("");
}

async function handleChatFaqCreate(e) {
  e.preventDefault();
  const f = e.target;
  const msg = document.getElementById("chat-faq-msg");
  const { error } = await supabaseClient.from("chat_faqs").insert({
    question: f.question.value.trim(),
    answer: f.answer.value.trim(),
    keywords: f.keywords.value.trim() || null,
    display_order: parseInt(f.display_order.value || 0, 10),
  });
  msg.textContent = error ? error.message : "सवाल-जवाब जुड़ गया — चैट असिस्टेंट में दिखेगा।";
  msg.className = "form-msg " + (error ? "error" : "ok");
  if (!error) { f.reset(); loadChatFaqsAdmin(); }
}

async function toggleChatFaq(id, state) {
  await supabaseClient.from("chat_faqs").update({ is_active: state }).eq("id", id);
  loadChatFaqsAdmin();
}
async function deleteChatFaq(id) {
  if (!confirm("Delete this Q&A?")) return;
  await supabaseClient.from("chat_faqs").delete().eq("id", id);
  loadChatFaqsAdmin();
}

// ------------------------------------------------------------
// Help center articles
// ------------------------------------------------------------
async function loadHelpArticlesAdmin() {
  const { data } = await supabaseClient.from("help_articles").select("*").order("category").order("display_order");
  const tbody = document.getElementById("help-articles-body");
  if (!tbody) return;

  if (!data || data.length === 0) { tbody.innerHTML = `<tr><td colspan="4">No articles yet.</td></tr>`; return; }

  tbody.innerHTML = data.map(a => `
    <tr>
      <td>${xTitle(a.category)}</td>
      <td>${a.title}</td>
      <td>${a.is_active ? "Active" : "Hidden"}</td>
      <td>
        <button class="btn btn-outline btn-sm" onclick="toggleHelpArticle('${a.id}', ${!a.is_active})">${a.is_active ? "Hide" : "Show"}</button>
        <button class="btn btn-outline btn-sm" onclick="deleteHelpArticle('${a.id}')">Delete</button>
      </td>
    </tr>`).join("");
}

async function handleHelpArticleCreate(e) {
  e.preventDefault();
  const f = e.target;
  const msg = document.getElementById("help-article-msg");
  const { error } = await supabaseClient.from("help_articles").insert({
    category: f.category.value,
    title: f.title.value.trim(),
    content: f.content.value,
    display_order: parseInt(f.display_order.value || 0, 10),
  });
  msg.textContent = error ? error.message : "आर्टिकल जुड़ गया — हेल्प सेंटर में दिखेगा।";
  msg.className = "form-msg " + (error ? "error" : "ok");
  if (!error) { f.reset(); loadHelpArticlesAdmin(); }
}

async function toggleHelpArticle(id, state) {
  await supabaseClient.from("help_articles").update({ is_active: state }).eq("id", id);
  loadHelpArticlesAdmin();
}
async function deleteHelpArticle(id) {
  if (!confirm("Delete this article?")) return;
  await supabaseClient.from("help_articles").delete().eq("id", id);
  loadHelpArticlesAdmin();
}

// ------------------------------------------------------------
// Onboarding steps
// ------------------------------------------------------------
async function loadOnboardingAdmin() {
  const { data } = await supabaseClient.from("onboarding_steps").select("*").order("step_number");
  const tbody = document.getElementById("onboarding-body");
  if (!tbody) return;

  if (!data || data.length === 0) { tbody.innerHTML = `<tr><td colspan="4">No steps yet.</td></tr>`; return; }

  tbody.innerHTML = data.map(s => `
    <tr>
      <td>${s.step_number}</td>
      <td>${s.title}</td>
      <td><small>${(s.description || "").slice(0, 80)}…</small></td>
      <td><button class="btn btn-outline btn-sm" onclick="deleteOnboardingStep('${s.id}')">Delete</button></td>
    </tr>`).join("");
}

async function handleOnboardingCreate(e) {
  e.preventDefault();
  const f = e.target;
  const msg = document.getElementById("onboarding-msg");
  const { error } = await supabaseClient.from("onboarding_steps").insert({
    step_number: parseInt(f.step_number.value, 10),
    title: f.title.value.trim(),
    description: f.description.value.trim(),
  });
  msg.textContent = error ? error.message : "स्टेप जुड़ गया।";
  msg.className = "form-msg " + (error ? "error" : "ok");
  if (!error) { f.reset(); loadOnboardingAdmin(); }
}

async function deleteOnboardingStep(id) {
  if (!confirm("Delete this step?")) return;
  await supabaseClient.from("onboarding_steps").delete().eq("id", id);
  loadOnboardingAdmin();
}

// ------------------------------------------------------------
// Feedback moderation
// ------------------------------------------------------------
async function loadFeedbackAdmin() {
  const { data } = await supabaseClient
    .from("feedback")
    .select("*, profiles(full_name), registrations(registration_number)")
    .order("created_at", { ascending: false });
  feedbackCache = data || [];
  renderFeedbackAdmin();
}

function renderFeedbackAdmin() {
  const tbody = document.getElementById("feedback-body");
  if (!tbody) return;
  const list = feedbackFilter === "all" ? feedbackCache : feedbackCache.filter(f => f.status === feedbackFilter);

  if (list.length === 0) { tbody.innerHTML = `<tr><td colspan="6">No feedback matches this filter.</td></tr>`; return; }

  tbody.innerHTML = list.map(f => `
    <tr>
      <td>${f.profiles?.full_name || "—"}<br><small>${f.registrations?.registration_number || ""}</small></td>
      <td><span class="stars">${"★".repeat(f.rating)}${"☆".repeat(5 - f.rating)}</span></td>
      <td>${f.review || "—"}</td>
      <td><small>${f.suggestions || "—"}</small></td>
      <td><span class="status-badge status-${f.status}">${xTitle(f.status)}</span></td>
      <td>
        ${f.status !== "approved" ? `<button class="btn btn-outline btn-sm" onclick="moderateFeedback('${f.id}','approved')">Approve</button>` : ""}
        ${f.status !== "rejected" ? `<button class="btn btn-outline btn-sm" onclick="moderateFeedback('${f.id}','rejected')">Reject</button>` : ""}
      </td>
    </tr>`).join("");
}

async function moderateFeedback(id, status) {
  const { error } = await supabaseClient.from("feedback").update({ status }).eq("id", id);
  if (error) { alert(error.message); return; }
  if (typeof logActivity === "function") logActivity("Feedback " + status, id);
  loadFeedbackAdmin();
  if (typeof loadTestimonialsTable === "function") loadTestimonialsTable();
}

// ------------------------------------------------------------
// Init
// ------------------------------------------------------------
function initExperience() {
  document.getElementById("language-form")?.addEventListener("submit", handleLanguageCreate);
  document.getElementById("translation-form")?.addEventListener("submit", handleTranslationCreate);
  document.getElementById("translation-lang")?.addEventListener("change", loadTranslationsAdmin);
  document.getElementById("translation-category")?.addEventListener("change", loadTranslationsAdmin);
  document.getElementById("chat-settings-form")?.addEventListener("submit", handleChatSettingsSave);
  document.getElementById("chat-faq-form")?.addEventListener("submit", handleChatFaqCreate);
  document.getElementById("help-article-form")?.addEventListener("submit", handleHelpArticleCreate);
  document.getElementById("onboarding-form")?.addEventListener("submit", handleOnboardingCreate);

  document.querySelectorAll("[data-fb-filter]").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-fb-filter]").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      feedbackFilter = btn.dataset.fbFilter;
      renderFeedbackAdmin();
    });
  });

  loadLanguagesAdmin().then(loadTranslationsAdmin);
  loadChatSettings();
  loadChatFaqsAdmin();
  loadHelpArticlesAdmin();
  loadOnboardingAdmin();
  loadFeedbackAdmin();
}
