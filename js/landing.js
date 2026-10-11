// ============================================================
// Landing page: projects, testimonials, FAQ, SEO meta
// ============================================================

document.getElementById("year").textContent = new Date().getFullYear();

async function loadHomeProjects() {
  const { data: projects, error } = await supabaseClient
    .from("projects").select("*").eq("is_active", true).order("created_at", { ascending: false });

  const grid = document.getElementById("projects-grid");
  if (error || !projects || projects.length === 0) {
    grid.innerHTML = '<div class="empty-state">No projects are available right now. We will update soon — contact us on WhatsApp.</div>';
    return;
  }
  grid.innerHTML = projects.map(p => `
    <article class="plan-card">
      ${p.image_url ? `<img src="${p.image_url}" alt="${p.project_name} handwriting project" style="border-radius:4px;margin-bottom:14px" loading="lazy">` : ""}
      <h3>${p.project_name}</h3>
      <p class="desc">${p.description || ""}</p>
      <div class="plan-meta">
        <div><span>Pages</span><strong>${p.num_pages} A4</strong></div>
        <div><span>Duration</span><strong>${p.duration_days} days</strong></div>
        <div><span>Registration Fee</span><strong>₹${p.registration_fee}</strong></div>
        <div><span>Advance (${p.advance_percent || 50}%)</span><strong>₹${p.advance_payment}</strong></div>
      </div>
      <a href="#" class="btn btn-primary btn-block" onclick="startApply(event, '${p.id}')">Apply Now</a>
    </article>
  `).join("");
}

async function loadTestimonials() {
  const { data, error } = await supabaseClient
    .from("testimonials").select("*").eq("is_active", true)
    .order("display_order", { ascending: true });

  const grid = document.getElementById("testimonials-grid");
  if (error || !data || data.length === 0) {
    grid.innerHTML = '<div class="empty-state">Reviews will be added soon.</div>';
    return;
  }
  grid.innerHTML = data.map(t => `
    <article class="testimonial-card">
      <div class="stars" aria-label="${t.rating} out of 5 stars">${"★".repeat(t.rating || 5)}${"☆".repeat(5 - (t.rating || 5))}</div>
      <p class="quote">${t.review}</p>
      <div class="who">${t.customer_name}</div>
      <div class="meta">${[t.location, t.project_name].filter(Boolean).join(" · ")}</div>
    </article>
  `).join("");
}

async function loadFAQ() {
  const { data, error } = await supabaseClient
    .from("faq_items").select("*").eq("is_active", true)
    .order("display_order", { ascending: true });

  const list = document.getElementById("faq-list");
  if (error || !data || data.length === 0) {
    list.innerHTML = '<p>FAQs will be added soon.</p>';
    return;
  }

  list.innerHTML = data.map((f, i) => `
    <div class="faq-item" id="faq-${i}">
      <button class="faq-q" type="button" aria-expanded="false">${f.question}</button>
      <div class="faq-a">${f.answer}</div>
    </div>
  `).join("");

  list.querySelectorAll(".faq-q").forEach(btn => {
    btn.addEventListener("click", () => {
      const item = btn.parentElement;
      const isOpen = item.classList.toggle("open");
      btn.setAttribute("aria-expanded", String(isOpen));
    });
  });

  // FAQ structured data for SEO
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": data.map(f => ({
      "@type": "Question",
      "name": f.question,
      "acceptedAnswer": { "@type": "Answer", "text": f.answer }
    }))
  };
  const script = document.createElement("script");
  script.type = "application/ld+json";
  script.textContent = JSON.stringify(faqSchema);
  document.head.appendChild(script);
}

async function applySeoMeta() {
  const { data } = await supabaseClient.from("company_settings").select("seo_title, seo_description, seo_keywords").eq("id", 1).single();
  if (!data) return;
  if (data.seo_title) document.title = data.seo_title;
  if (data.seo_description) document.querySelector('meta[name="description"]')?.setAttribute("content", data.seo_description);
  if (data.seo_keywords) document.querySelector('meta[name="keywords"]')?.setAttribute("content", data.seo_keywords);
}

async function loadEnquiryProjects() {
  const select = document.getElementById("enquiry-project");
  if (!select) return;
  const { data } = await supabaseClient.from("projects").select("project_name").eq("is_active", true);
  (data || []).forEach(p => {
    const opt = document.createElement("option");
    opt.value = p.project_name;
    opt.textContent = p.project_name;
    select.appendChild(opt);
  });
}

async function handleEnquirySubmit(e) {
  e.preventDefault();
  const f = e.target;
  const msg = document.getElementById("enquiry-form-msg");
  msg.textContent = ""; msg.className = "form-msg";
  const restoreBtn = typeof lockSubmitButton === "function" ? lockSubmitButton(f, "Sending...") : () => {};

  if (typeof runValidations === "function") {
    const err = runValidations([
      [Validate.notEmpty(f.full_name.value), "Please enter your name."],
      [Validate.mobile(f.mobile.value), "Please enter a valid 10-digit mobile number."],
      [!f.email.value || Validate.email(f.email.value), "Please enter a valid email address."],
    ]);
    if (err) { msg.textContent = err; msg.classList.add("error"); restoreBtn(); return; }
  }

  const { error } = await supabaseClient.from("enquiries").insert({
    full_name: f.full_name.value.trim(),
    mobile: f.mobile.value.trim(),
    email: f.email.value.trim() || null,
    project_interest: f.project_interest.value || null,
    message: f.message.value.trim() || null,
    preferred_contact: f.preferred_contact.value,
  });

  if (error) {
    msg.textContent = "Something went wrong. Please try again or contact us on WhatsApp.";
    msg.classList.add("error");
    restoreBtn();
    return;
  }

  msg.textContent = "Thank you! We have received your enquiry and our team will contact you soon.";
  msg.classList.add("ok");
  f.reset();
  restoreBtn();
}

async function loadPromoBanners() {
  const wrap = document.getElementById("promo-banner-wrap");
  if (!wrap) return;
  const today = new Date().toISOString().slice(0, 10);

  const { data } = await supabaseClient
    .from("banners").select("*").eq("is_active", true)
    .order("display_order", { ascending: true });

  const live = (data || []).filter(b =>
    (!b.start_date || b.start_date <= today) && (!b.end_date || b.end_date >= today)
  );
  if (live.length === 0) { wrap.innerHTML = ""; return; }

  if (!document.getElementById("promo-img-style")) {
    const st = document.createElement("style");
    st.id = "promo-img-style";
    st.textContent = `
      html{scroll-behavior:smooth}
      #projects{scroll-margin-top:80px}
      .promo-img-banner{background:#12284C;padding:10px 0 12px}
      .promo-img-banner .container{display:flex;flex-direction:column;align-items:center;gap:8px}
      .promo-img-link{display:block;width:100%;max-width:880px;border-radius:14px;overflow:hidden;box-shadow:0 8px 28px rgba(0,0,0,.35);line-height:0}
      .promo-img-link img{width:100%;height:auto;display:block;aspect-ratio:16/9;object-fit:cover;object-position:center}
      .promo-timer{width:100%;max-width:880px;text-align:center}
      .promo-timer-label{color:#D4A034;font-size:11px;font-weight:600;letter-spacing:.6px;margin-bottom:4px;text-transform:uppercase}
      .promo-timer-row{display:flex;justify-content:center;gap:8px}
      .promo-timer-box{background:linear-gradient(180deg,#1b3a6b,#12284C);border:1.5px solid #D4A034;border-radius:10px;min-width:54px;padding:5px 4px 4px}
      .promo-timer-box b{display:block;color:#fff;font-size:19px;line-height:1.1;font-variant-numeric:tabular-nums}
      .promo-timer-box small{display:block;color:#D4A034;font-size:9px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;margin-top:2px}
      .promo-img-banner .promo-cta{display:inline-flex;align-items:center;justify-content:center;text-align:center;width:100%;max-width:260px;padding:9px 20px;font-size:15px;border-radius:999px}
      .promo-pro,.promo-pro *{box-sizing:border-box}
      .promo-pro{background:#0b1b36;padding:14px 0}
      .pp-card{position:relative;max-width:880px;margin:0 auto;padding:18px 18px 16px;border-radius:16px;color:#fff;overflow:hidden;
        background:radial-gradient(circle at 92% 12%,rgba(212,160,52,.28),transparent 42%),radial-gradient(circle at 6% 100%,rgba(212,160,52,.14),transparent 40%),linear-gradient(135deg,#0e2040 0%,#12284C 55%,#1b3a6b 100%);
        border:1px solid rgba(212,160,52,.55);box-shadow:0 10px 30px rgba(0,0,0,.35)}
      .pp-card:before{content:"";position:absolute;left:0;top:0;right:0;height:3px;background:linear-gradient(90deg,transparent,#D4A034,transparent)}
      .pp-top{display:flex;align-items:center;justify-content:space-between;gap:14px}
      .pp-main{flex:1;min-width:0}
      .pp-badge{display:inline-block;background:#D4A034;color:#12284C;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;padding:4px 11px;border-radius:999px;margin-bottom:8px}
      .pp-title{margin:0 0 6px;font-size:21px;line-height:1.25;font-weight:700;color:#fff}
      .pp-desc{margin:0;font-size:13px;line-height:1.5;color:rgba(255,255,255,.78)}
      .pp-seal{flex:0 0 auto;width:86px;height:86px;border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;
        background:radial-gradient(circle at 30% 25%,#f1cf7a,#D4A034 60%,#b8861f);color:#12284C;box-shadow:0 0 0 4px rgba(212,160,52,.25),0 6px 16px rgba(0,0,0,.35)}
      .pp-seal b{font-size:26px;line-height:1;font-weight:800}
      .pp-seal small{font-size:11px;font-weight:700;letter-spacing:1.5px;margin-top:2px}
      .pp-bottom{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-top:14px;padding-top:12px;border-top:1px solid rgba(212,160,52,.28);flex-wrap:wrap}
      .pp-bottom .promo-timer{width:auto;max-width:none;text-align:left}
      .pp-bottom .promo-timer-label{margin-bottom:5px}
      .pp-bottom .promo-timer-row{justify-content:flex-start;gap:6px}
      .promo-pro .promo-cta{display:inline-flex;align-items:center;justify-content:center;text-align:center;padding:10px 24px;border-radius:999px;font-size:15px;font-weight:600;line-height:1.2}
      .pp-bottom .promo-cta{max-width:none;width:auto;white-space:nowrap}
      @media(max-width:640px){
        .promo-img-banner{padding:8px 0 12px}
        .promo-img-link{border-radius:12px}
        .promo-timer-box{min-width:50px}
        .promo-timer-box b{font-size:17px}
        .promo-img-banner .promo-cta{max-width:220px;padding:8px 16px;font-size:14px}
        .promo-pro{padding:10px 0}
        .pp-card{padding:14px 14px 12px;border-radius:14px}
        .pp-title{font-size:18px}
        .pp-desc{font-size:12px}
        .pp-seal{width:70px;height:70px}
        .pp-seal b{font-size:21px}
        .pp-seal small{font-size:10px}
        .pp-bottom{flex-direction:column;align-items:stretch;gap:10px;margin-top:12px}
        .pp-bottom .promo-timer{text-align:center}
        .pp-bottom .promo-timer-row{justify-content:center}
        .pp-bottom .promo-cta{width:100%;max-width:none}
      }
    `;
    document.head.appendChild(st);
  }

  wrap.innerHTML = live.map(b => {
    const link = b.button_link || "signup.html";
    if (b.image_url) {
      return `
    <div class="promo-banner promo-img-banner">
      <div class="container">
        <a href="${link}" class="promo-img-link" aria-label="${b.title}">
          <img src="${b.image_url}" alt="${b.title}">
        </a>
        ${b.end_date ? `
        <div class="promo-timer" data-end="${b.end_date}">
          <div class="promo-timer-label">Offer ends in</div>
          <div class="promo-timer-row">
            <div class="promo-timer-box"><b data-t="d">00</b><small>Days</small></div>
            <div class="promo-timer-box"><b data-t="h">00</b><small>Hours</small></div>
            <div class="promo-timer-box"><b data-t="m">00</b><small>Min</small></div>
            <div class="promo-timer-box"><b data-t="s">00</b><small>Sec</small></div>
          </div>
        </div>` : ""}
        <a href="${link}" class="btn btn-brass promo-cta">${b.button_text || "Apply Now"}</a>
      </div>
    </div>`;
    }
    return `
    <div class="promo-pro">
      <div class="container">
        <div class="pp-card">
          <div class="pp-top">
            <div class="pp-main">
              ${b.badge_text ? `<span class="pp-badge">${b.badge_text}</span>` : ""}
              <h3 class="pp-title">${b.title}</h3>
              ${b.description ? `<p class="pp-desc">${b.description}</p>` : ""}
            </div>
            ${b.discount_text ? `<div class="pp-seal"><b>${b.discount_text}</b><small>OFF</small></div>` : ""}
          </div>
          <div class="pp-bottom">
            ${b.end_date ? `
            <div class="promo-timer" data-end="${b.end_date}">
              <div class="promo-timer-label">Offer ends in</div>
              <div class="promo-timer-row">
                <div class="promo-timer-box"><b data-t="d">00</b><small>Days</small></div>
                <div class="promo-timer-box"><b data-t="h">00</b><small>Hours</small></div>
                <div class="promo-timer-box"><b data-t="m">00</b><small>Min</small></div>
                <div class="promo-timer-box"><b data-t="s">00</b><small>Sec</small></div>
              </div>
            </div>` : ""}
            <a href="${link}" class="btn btn-brass promo-cta">${b.button_text || "Apply Now"}</a>
          </div>
        </div>
      </div>
    </div>`;
  }).join("");

  startPromoTimers(wrap);
}

var promoTimerInterval = null;
function startPromoTimers(wrap) {
  if (promoTimerInterval) { clearInterval(promoTimerInterval); promoTimerInterval = null; }
  const timers = wrap.querySelectorAll(".promo-timer[data-end]");
  if (!timers.length) return;
  const pad = n => String(n).padStart(2, "0");
  const tick = () => {
    let anyLive = false;
    timers.forEach(t => {
      // offer is valid through the end date (India time)
      const end = new Date(t.dataset.end + "T23:59:59+05:30").getTime();
      const left = end - Date.now();
      if (left <= 0) {
        const banner = t.closest(".promo-banner, .promo-pro");
        if (banner) banner.remove();
        return;
      }
      anyLive = true;
      const d = Math.floor(left / 86400000);
      const h = Math.floor((left % 86400000) / 3600000);
      const m = Math.floor((left % 3600000) / 60000);
      const s = Math.floor((left % 60000) / 1000);
      t.querySelector('[data-t="d"]').textContent = pad(d);
      t.querySelector('[data-t="h"]').textContent = pad(h);
      t.querySelector('[data-t="m"]').textContent = pad(m);
      t.querySelector('[data-t="s"]').textContent = pad(s);
    });
    if (!anyLive) { clearInterval(promoTimerInterval); promoTimerInterval = null; }
  };
  tick();
  promoTimerInterval = setInterval(tick, 1000);
}

async function handleNewsletterSubscribe(e) {
  e.preventDefault();
  const f = e.target;
  const msg = document.getElementById("newsletter-msg");
  msg.textContent = ""; msg.className = "form-msg";

  const email = f.email.value.trim();
  if (typeof Validate !== "undefined" && !Validate.email(email)) {
    msg.textContent = "Please enter a valid email address."; msg.classList.add("error"); return;
  }

  const { error } = await supabaseClient.from("newsletter_subscribers").insert({
    email, name: f.name.value.trim() || null,
  });

  if (error && error.code === "23505") {
    msg.textContent = "You are already subscribed — thank you!";
    msg.classList.add("ok");
    return;
  }
  if (error) {
    msg.textContent = "Something went wrong. Please try again.";
    msg.classList.add("error");
    return;
  }

  msg.textContent = "Subscribed! You will hear about new projects and offers.";
  msg.classList.add("ok");
  f.reset();
}

document.addEventListener("DOMContentLoaded", () => {
  loadHomeProjects();
  loadTestimonials();
  loadFAQ();
  applySeoMeta();
  loadEnquiryProjects();
  loadPromoBanners();
  document.getElementById("enquiry-form")?.addEventListener("submit", handleEnquirySubmit);
  document.getElementById("newsletter-form")?.addEventListener("submit", handleNewsletterSubscribe);
});


// ---------- Apply flow: pehle login/signup, phir apply ----------
async function startApply(e, projectId) {
  e.preventDefault();
  sessionStorage.setItem("abp-pending-project", projectId);

  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) {
    window.location.href = "apply.html?project=" + projectId;
  } else {
    // Account hai to login, nahi hai to signup — dono ek hi page se
    window.location.href = "login.html?next=apply&project=" + projectId;
  }
}
