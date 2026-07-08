//
//  DCC — Tap tooltips
//

var PILL_LABELS = { aws: "AWS accounts", kubernetes: "EKS clusters", git: "Git repos", vpn: "VPN connections" };

function showTooltip(anchor, text) {
  if (!elements.tooltip || !elements.tooltipText) return;
  elements.tooltipText.textContent = text;
  elements.tooltip.hidden = false;
  var rect = anchor.getBoundingClientRect();
  elements.tooltip.style.top = (rect.bottom + 8) + "px";
  elements.tooltip.style.left = Math.max(8, Math.min(rect.left + rect.width / 2, window.innerWidth - 172)) + "px";
  elements.tooltip.style.transform = "translateX(-50%)";
}

function hideTooltip() {
  if (elements.tooltip) elements.tooltip.hidden = true;
}

function pillTooltip(serviceName) {
  var data = lastStateData[serviceName];
  if (!data || !Array.isArray(data.instances) || data.instances.length === 0) {
    return (PILL_LABELS[serviceName] || serviceName) + ": no data";
  }
  var parts = data.instances.map(function (i) { return i.name + " (" + i.label + ")"; });
  return data.instances.length + " " + PILL_LABELS[serviceName] + ": " + parts.join(", ");
}

function cardTooltip(card) {
  return card.title + " \u00b7 " + card.tag + ": " + card.value + " \u2014 " + card.hint;
}

function bindTooltip() {
  document.addEventListener("click", function (e) {
    if (e.target.closest(".dcc-tooltip")) return;
    var pill = e.target.closest(".status-pill");
    if (pill) {
      e.stopPropagation();
      var svc = Object.keys(elements.pills).find(function (k) { return elements.pills[k] === pill; });
      if (svc) { showTooltip(pill, pillTooltip(svc)); return; }
    }
    var card = e.target.closest(".dcc-card");
    if (card) {
      e.stopPropagation();
      var title = card.querySelector(".dcc-card__title")?.textContent || "";
      var tag = card.querySelector(".dcc-card__tag")?.textContent || "";
      var value = card.querySelector(".dcc-card__value")?.textContent || "";
      var hint = card.querySelector(".dcc-card__hint")?.textContent || "";
      showTooltip(card, cardTooltip({ title: title, tag: tag, value: value, hint: hint }));
      return;
    }
    hideTooltip();
  });
}
