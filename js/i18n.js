// ============================================================
// Multi-language support (i18n)
// Usage in HTML: <span data-i18n="nav.projects">Projects</span>
// ============================================================

let currentLang = localStorage.getItem("abp-lang") || "en";
let translations = {};

async function loadLanguages() {
  const { data } = await supabaseClient
    .from("languages").select("*").eq("is_active", true).order("display_order");
  return data || [{ code: "en", name: "English" }];
}

async function loadTranslations(lang) {
  const { data } = await supabaseClient
    .from("translations").select("translation_key, value").eq("lang_code", lang);

  translations = {};
  (data || []).forEach(t => { translations[t.translation_key] = t.value; });
}

function t(key, fallback) {
  return translations[key] || fallback || key;
}

function applyTranslations() {
  document.querySelectorAll("[data-i18n]").forEach(el => {
    const key = el.dataset.i18n;
    if (translations[key]) el.textContent = translations[key];
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach(el => {
    const key = el.dataset.i18nPlaceholder;
    if (translations[key]) el.placeholder = translations[key];
  });
  document.documentElement.lang = currentLang;
}

async function switchLanguage(lang) {
  currentLang = lang;
  localStorage.setItem("abp-lang", lang);
  await loadTranslations(lang);
  applyTranslations();

  // Save preference for logged-in customers
  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
      await supabaseClient.from("profiles").update({ preferred_language: lang }).eq("id", session.user.id);
    }
  } catch (e) { /* not logged in — fine */ }

  document.querySelectorAll("[data-lang-option]").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.langOption === lang);
  });
}

async function initLanguageSwitcher() {
  const holder = document.getElementById("lang-switcher");
  const langs = await loadLanguages();

  if (holder && langs.length > 1) {
    holder.innerHTML = langs.map(l =>
      `<button type="button" class="lang-btn ${l.code === currentLang ? "active" : ""}" data-lang-option="${l.code}">${l.name}</button>`
    ).join("");
    holder.querySelectorAll("[data-lang-option]").forEach(btn => {
      btn.addEventListener("click", () => switchLanguage(btn.dataset.langOption));
    });
  }

  await loadTranslations(currentLang);
  applyTranslations();
}

document.addEventListener("DOMContentLoaded", () => {
  if (typeof supabaseClient !== "undefined") initLanguageSwitcher();
});
