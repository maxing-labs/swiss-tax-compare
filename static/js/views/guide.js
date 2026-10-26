import { I18N } from "../i18n/index.js";
import { state } from "../state.js";

export function renderGuideTab() {
  const dict = I18N[state.lang] || I18N.en;
  const g = dict.guide;
  const container = document.getElementById("guide-dynamic-container");
  if (!container || !g) return;

  container.innerHTML = `
    <div class="guide-banner">
      <span class="guide-kicker">${g.kicker}</span>
      <h2>${g.title}</h2>
      <p>${g.desc}</p>
    </div>
    <div class="guide-grid">
      ${g.cards.map(c => `
        <article class="guide-card ${c.highlight ? "highlight-guide-card" : ""}">
          <div class="guide-card-top">
            <span class="cat-tag cat-${c.cat}">${c.badge}</span>
            <span class="discount-tag ${c.tagGreen ? "text-green" : ""}">${c.tag}</span>
          </div>
          <h3>${c.title}</h3>
          <p>${c.desc}</p>
          <ul class="guide-list">
            ${c.bullets.map(b => `<li>${b}</li>`).join("")}
          </ul>
        </article>
      `).join("")}
    </div>
  `;
}
