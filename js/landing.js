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
      <a href="apply.html?project=${p.id}" class="btn btn-primary btn-block">Apply Now</a>
    </article>
  `).join("");
}

async function loadTestimonials() {
  const { data, error } = await supabaseClient
    .from("testimonials").select("*").eq("is_active", true)
    .order("display_order", { ascending: true });

  const grid = document.getElementById("testimonials-grid");
  if (error || !data || data.length === 0) {
    grid.innerHTML = '<div class="empty-state">Reviews jald hi orhan add kiye jayenge.</div>';
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
    list.innerHTML = '<p>FAQs jald hi add kiye jayenge.</p>';
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

  wrap.innerHTML = live.map(b => `
    <div class="promo-banner">
      <div class="container">
        ${b.image_url ? `<img src="${b.image_url}" alt="${b.title}" loading="lazy">` : ""}
        <div class="promo-text">
          ${b.badge_text ? `<span class="promo-offer">${b.badge_text}</span>` : ""}
          <h3>${b.title}</h3>
          ${b.description ? `<p>${b.description}</p>` : ""}
          ${b.coupon_code ? `<span class="promo-coupon">CODE: ${b.coupon_code}</span>` : ""}
        </div>
        ${b.discount_text ? `<div class="promo-discount">${b.discount_text}<small>OFF</small></div>` : ""}
        ${b.offer_details && !b.badge_text ? `<span class="promo-offer">${b.offer_details}</span>` : ""}
        <a href="${b.button_link || "signup.html"}" class="btn btn-brass">${b.button_text || "Apply Now"}</a>
      </div>
    </div>`).join("");
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
