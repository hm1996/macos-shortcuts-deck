//
//  DCC — Swiper carousel & workspace navigation
//

var currentWorkspaceIndex = 0;
var swiperInstance = null;

function createSwiperSlides() {
  var wrapper = document.getElementById("swiperWrapper");
  wrapper.innerHTML = "";
  WORKSPACE_ORDER.forEach(function (key) {
    var slide = document.createElement("div");
    slide.className = "swiper-slide";
    slide.dataset.workspace = key;
    var grid = document.createElement("div");
    grid.className = "workspace-grid";
    slide.appendChild(grid);
    renderSlideGrid(grid, key);
    wrapper.appendChild(slide);
  });
  renderWorkspaceLabels();
}

function renderSlideGrid(grid, key) {
  if (key === "focus") { renderFocusWorkspaceGrid(grid); return; }
  if (key === "home") { renderHomeWorkspaceGrid(grid); return; }
  renderStaticWorkspaceGrid(grid, key);
}

function renderStaticWorkspaceGrid(grid, key) {
  if (!grid) return;
  var workspace = WORKSPACE_CONTENT[key];
  if (!workspace) return;
  grid.innerHTML = "";
  workspace.cards.forEach(function (card, index) {
    buildCardNode(grid, card, index);
  });
}

function renderHomeWorkspaceGrid(grid) {
  if (!grid) return;
  var workspace = WORKSPACE_CONTENT["home"];
  if (!workspace) return;
  grid.innerHTML = "";
  workspace.cards.forEach(function (card, index) {
    buildCardNode(grid, card, index);
  });
}

function buildCardNode(grid, card, index) {
  var node = elements.cardTemplate.content.firstElementChild.cloneNode(true);
  node.classList.add("dcc-card--compact");
  node.style.animationDelay = (index * 55) + "ms";
  node.querySelector(".dcc-card__title").textContent = card.title;
  node.querySelector(".dcc-card__tag").textContent = card.tag;
  node.querySelector(".dcc-card__value").textContent = card.value;
  node.querySelector(".dcc-card__hint").textContent = card.hint;
  var iconWrap = node.querySelector(".dcc-card__icon-wrap");
  if (iconWrap && card.icon) iconWrap.innerHTML = card.icon;
  else if (iconWrap) iconWrap.style.display = "none";
  if (card.action) {
    node.style.cursor = "pointer";
    node.addEventListener("click", function (e) {
      e.stopPropagation();
      playTapSound();
      dispatchShortcutAction(card.action);
    });
  }
  grid.appendChild(node);
}

function renderWorkspaceLabels() {
  var container = document.getElementById("swiperLabels");
  if (!container) return;
  container.innerHTML = "";
  WORKSPACE_ORDER.forEach(function (key, i) {
    var label = document.createElement("span");
    label.className = "swiper-label";
    label.dataset.idx = i;
    label.textContent = key;
    if (i === currentWorkspaceIndex) label.classList.add("is-active");
    container.appendChild(label);
  });
}

function updateActiveLabel(idx) {
  var labels = document.querySelectorAll(".swiper-label");
  labels.forEach(function (l) {
    l.classList.toggle("is-active", parseInt(l.dataset.idx, 10) === idx);
  });
}

function updateHomeCards() {
  if (!lastStateData.aws || !lastStateData.kubernetes || !lastStateData.git || !lastStateData.vpn) return;
  document.querySelectorAll(".swiper-slide[data-workspace=\"home\"] .dcc-card").forEach(function (card) {
    var title = card.querySelector(".dcc-card__title")?.textContent || "";
    if (title === "AWS") {
      var aws = computeServiceStatus(lastStateData.aws);
      card.querySelector(".dcc-card__value").textContent = aws.label;
      card.querySelector(".dcc-card__hint").textContent =
        (lastStateData.aws?.instances || []).map(function (i) { return i.name; }).join(" \u00b7 ") || "?";
    }
    if (title === "Kubernetes") {
      var k8s = computeServiceStatus(lastStateData.kubernetes);
      card.querySelector(".dcc-card__value").textContent = k8s.label;
      card.querySelector(".dcc-card__hint").textContent =
        (lastStateData.kubernetes?.instances || []).map(function (i) { return i.label; }).join(", ") || "?";
    }
    if (title === "Git") {
      var git = computeServiceStatus(lastStateData.git);
      card.querySelector(".dcc-card__value").textContent = git.label;
      card.querySelector(".dcc-card__hint").textContent =
        (lastStateData.git?.instances || []).map(function (i) { return i.name + ":" + i.label; }).join(", ") || "?";
    }
    if (title === "Incidents") {
      var active = lastStateData.incidents?.active || [];
      card.querySelector(".dcc-card__value").textContent = String(active.length);
      if (active.length > 0) {
        card.querySelector(".dcc-card__hint").textContent =
          active.map(function (i) { return i.severity + ": " + i.name; }).join(" \u00b7 ");
      }
    }
  });
}

function updateOpsCards() {
  if (!lastStateData.incidents && !lastStateData.communicate) return;
  document.querySelectorAll(".swiper-slide[data-workspace=\"ops\"] .dcc-card").forEach(function (card) {
    var title = card.querySelector(".dcc-card__title")?.textContent || "";
    if (title === "Alerts") {
      var active = lastStateData.incidents?.active || [];
      card.querySelector(".dcc-card__value").textContent = String(active.length);
      if (active.length > 0) {
        card.querySelector(".dcc-card__hint").textContent =
          active.map(function (i) { return i.severity + ": " + i.name; }).join(" \u00b7 ");
      }
    }
    if (title === "On-Call") {
      var oncall = lastStateData.communicate?.oncall;
      if (oncall?.name) {
        card.querySelector(".dcc-card__value").textContent = oncall.name;
        card.querySelector(".dcc-card__hint").textContent = "On-call now";
      }
    }
  });
}

function initSwiper() {
  createSwiperSlides();

  var savedWorkspace = (function () { try { return localStorage.getItem("dcc.workspace"); } catch (e) { return null; } })();
  var startIdx = savedWorkspace ? WORKSPACE_ORDER.indexOf(savedWorkspace) : -1;
  currentWorkspaceIndex = startIdx >= 0 ? startIdx : 0;

  swiperInstance = new Swiper("#workspaceSwiper", {
    loop: true,
    initialSlide: currentWorkspaceIndex,
    on: {
      init: function () {
        document.querySelectorAll(".swiper-slide-duplicate").forEach(function (dup) {
          var key = dup.dataset.workspace;
          if (key) renderSlideGrid(dup.querySelector(".workspace-grid"), key);
        });
      },
      slideChange: function () {
        currentWorkspaceIndex = this.realIndex;
        var key = WORKSPACE_ORDER[currentWorkspaceIndex];
        try { localStorage.setItem("dcc.workspace", key); } catch (e) {}
        updateActiveLabel(currentWorkspaceIndex);
      },
      touchStart: function () { playTapSound(); }
    }
  });
}

function setActiveWorkspace(workspaceKey) {
  var idx = WORKSPACE_ORDER.indexOf(workspaceKey);
  if (idx === -1) return;
  if (swiperInstance) swiperInstance.slideToLoop(idx);
}
