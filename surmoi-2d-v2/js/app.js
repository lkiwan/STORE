/* ============================================================
   VirtualFit: Spatial Try-On — all logic (vanilla JS)
   Data comes from js/data.js (window.ITEMS).
   The arc is driven by ITEMS: two copies of every item are
   built as cards, so with the spec's 5 items there are the
   spec's 10 cards and every formula below is the spec's.
   ============================================================ */
(function () {
  "use strict";

  var ITEMS = window.ITEMS || [];
  var L = window.LANGS[window.LANG] || window.LANGS.fr;
  var N = ITEMS.length;      // garments (spec: 5)
  var CARDS = N * 2;         // arc cards (spec: 10)
  var EASE = "cubic-bezier(.2,.8,.2,1)";
  var SCAN_EASE = "cubic-bezier(.65,0,.35,1)";
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function $(s) { return document.querySelector(s); }
  function mod(a, n) { return ((a % n) + n) % n; }

  var room = $(".room");
  var ghost = $(".ghost");
  var letters = Array.prototype.slice.call(ghost.querySelectorAll("span"));
  var stage = $("#stage");
  var arc = $("#arc");
  var mCur = $("#mCur"), mNext = $("#mNext");
  var grid = $(".grid"), scan = $(".scan");
  var cur = $("#cur"), ring = cur.querySelector(".ring");
  var tabs = Array.prototype.slice.call(document.querySelectorAll(".tab"));
  var pill = $("#tabPill");
  var nameLn = $("#nameLn"), priceLn = $("#priceLn");
  var thumb = $("#thumb"), thumbG = $("#thumbG");
  var buyBtn = $("#buyBtn");
  var sheet = $("#sheet"), sheetName = $("#sheetName"), sheetPrice = $("#sheetPrice"),
      sheetDesc = $("#sheetDesc"), sheetBuy = $("#sheetBuy");

  /* ---------------- state ---------------- */
  var W = window.innerWidth, H = window.innerHeight;
  var CW = 200, XSpx = [0, 0, 0, 0, 0, 0];
  var pos = 0, target = 0;
  var intro = reduced ? 1 : 0;
  var sx = 0, sy = 0, tx = 0, ty = 0;        // pointer parallax (smoothed / target)
  var mx = W / 2, my = H / 2, cx = mx, cy = my; // cursor (target / lerped)
  var dragging = false;
  var shown = -1;                             // item index currently on the model
  var activeTab = tabs[0];

  function isPhone() { return W <= 767; }

  /* ---------------- garment / figure painting ---------------- */
  function setGarmentBg(el, item) {
    if (item.img) {
      el.style.backgroundImage = "url(\"" + item.img + "\")";
      el.style.backgroundSize = "contain";
      el.style.backgroundPosition = "center";
      el.style.backgroundRepeat = "no-repeat";
    } else {
      el.style.backgroundImage = "url(\"assets/garment-sheet.webp\")";
      el.style.backgroundSize = "320% 212.5%";
      el.style.backgroundPosition = item.g[0] + "% " + item.g[1] + "%";
      el.style.backgroundRepeat = "no-repeat";
    }
  }
  function setFigure(el, item) {
    el.style.backgroundPosition = (item.m != null ? item.m : 0) + "% 100%";
  }

  /* ---------------- cards ----------------
     V3: the arc shows ONLY the cart selection (arcItems = unique
     item indices from the cart). buildArc() rebuilds the cards
     every time the cart changes; N and CARDS track arcItems. */
  var cards = [];
  var cardNames = [];
  var arcItems = [];
  var shownArc = -1;   // position in arcItems of the item on the character
  var preview = -1;    // item worn from the grid, not (yet) in the arc
  var arcReady = false;
  function buildArc() {
    arc.innerHTML = "";
    cards = [];
    cardNames = [];
    N = arcItems.length;
    CARDS = N * 2;
    for (var k = 0; k < CARDS; k++) {
      (function (k) {
        var item = ITEMS[arcItems[k % N]];
        var card = document.createElement("div");
        card.className = "card glass";
        card.dataset.idx = k;
        var g = document.createElement("div");
        g.className = "g";
        setGarmentBg(g, item);
        var nm = document.createElement("div");
        nm.className = "cname";
        nm.textContent = L.items[arcItems[k % N]].n;
        cardNames.push(nm);
        var pr = document.createElement("div");
        pr.className = "cprice";
        pr.textContent = item.p + " MAD";
        var sh = document.createElement("div");
        sh.className = "sheen";
        card.appendChild(g);
        card.appendChild(nm);
        card.appendChild(pr);
        card.appendChild(sh);
        var drop = document.createElement("button");
        drop.className = "cdrop";
        drop.type = "button";
        drop.textContent = "\u2715";
        drop.setAttribute("aria-label", "Remove from cart");
        drop.addEventListener("pointerdown", function (e) { e.stopPropagation(); });
        drop.addEventListener("click", function (e) {
          e.stopPropagation();
          var idx = arcItems[k % N];
          for (var li = cart.length - 1; li >= 0; li--) {
            if (cart[li].i === idx) cart.splice(li, 1);
          }
          cartSave(); cartBadgeUpdate();
        });
        card.appendChild(drop);
        card.addEventListener("mouseenter", function () {
          if (reduced) return;
          sh.animate(
            [{ transform: "translateX(-130%)" }, { transform: "translateX(130%)" }],
            { duration: 1000, easing: EASE }
          );
        });
        var tapX = 0, tapY = 0;
        card.addEventListener("pointerdown", function (e) { tapX = e.clientX; tapY = e.clientY; });
        card.addEventListener("click", function (e) {
          if (Math.abs(e.clientX - tapX) > 8 || Math.abs(e.clientY - tapY) > 8) return; // it was a drag
          openCartSheet(arcItems[k % N]);
        });
        arc.appendChild(card);
        cards.push(card);
      })(k);
    }
  }

  /* ---------------- buy card ---------------- */
  function rollText(ln, text) {
    var stack = ln.firstElementChild;
    if (reduced) {
      stack.innerHTML = "";
      var s0 = document.createElement("span");
      s0.textContent = text;
      stack.appendChild(s0);
      return;
    }
    if (stack.dataset.rolling) {
      stack.getAnimations().forEach(function (a) { a.cancel(); });
      while (stack.children.length > 1) stack.removeChild(stack.firstElementChild);
      delete stack.dataset.rolling;
    }
    var nw = document.createElement("span");
    nw.textContent = text;
    stack.appendChild(nw);
    stack.dataset.rolling = "1";
    var anim = stack.animate(
      [{ transform: "translateY(0px)" }, { transform: "translateY(" + (-ln.clientHeight) + "px)" }],
      { duration: 620, easing: EASE, fill: "forwards" }
    );
    anim.onfinish = function () {
      if (stack.firstElementChild && stack.children.length > 1) {
        stack.removeChild(stack.firstElementChild);
      }
      anim.cancel();
      delete stack.dataset.rolling;
    };
  }

  function updateBuy(item, idx) {
    var li = L.items[idx];
    rollText(nameLn, li.n);
    if (buyBtn) { buyBtn.href = item.u; }
    if (sheetBuy) { sheetBuy.href = item.u; }
    if (sheetName) { sheetName.textContent = li.n; sheetPrice.textContent = item.p + " MAD · " + li.c; sheetDesc.textContent = li.d || ""; }
    rollText(priceLn, item.p + " MAD · " + li.c);
    setGarmentBg(thumbG, item);
    if (!reduced) {
      thumb.animate(
        [{ transform: "translateY(70%) scale(.8)" }, { transform: "translateY(0%) scale(1)" }],
        { duration: 650, easing: EASE }
      );
    }
  }

  /* ---------------- try-on scan ---------------- */
  var scanAnims = [];
  function tryOn(idx) {
    zoomReset();
    shown = idx;
    var item = ITEMS[idx];
    updateBuy(item, idx);
    scanAnims.forEach(function (a) { a.cancel(); });
    scanAnims = [];
    setFigure(mNext, item);
    if (reduced) {
      setFigure(mCur, item);
      mCur.style.opacity = "1";
      return;
    }
    var a1 = mNext.animate(
      [{ clipPath: "inset(0 0 100% 0)" }, { clipPath: "inset(0 0 0% 0)" }],
      { duration: 950, easing: SCAN_EASE, fill: "forwards" }
    );
    var a2 = grid.animate(
      [
        { clipPath: "inset(0 0 100% 0)", offset: 0 },
        { clipPath: "inset(0 0 0% 0)", offset: 0.5 },
        { clipPath: "inset(100% 0 0 0)", offset: 1 }
      ],
      { duration: 1092, easing: SCAN_EASE, fill: "forwards" }
    );
    var a3 = scan.animate(
      [
        { top: "0%", transform: "scaleX(.2)", opacity: "0", offset: 0 },
        { top: "6%", transform: "scaleX(1)", opacity: "1", offset: 0.08 },
        { top: "94%", offset: 0.92 },
        { top: "100%", transform: "scaleX(.2)", opacity: "0", offset: 1 }
      ],
      { duration: 950, easing: SCAN_EASE, fill: "forwards" }
    );
    var a4 = mNext.animate(
      [{ transform: "scale(1.012)" }, { transform: "scale(1)" }],
      { duration: 1250, easing: "ease-out", fill: "forwards" }
    );
    scanAnims = [a1, a2, a3, a4];
    a1.onfinish = function () {
      setFigure(mCur, item);
      mCur.style.opacity = "1";
      scanAnims.forEach(function (a) { a.cancel(); });
      scanAnims = [];
    };
  }

  /* ---------------- front / back view ---------------- */
  var backView = false;
  var modelEl = $(".model");
  var fbOne = $("#fbOne"), fbOneTx = $("#fbOneTx");
  function flipView(toBack) {
    if (toBack === backView) return;
    zoomReset();
    backView = toBack;
    fbOneTx.textContent = backView ? L.ui.front : L.ui.back;
    fbOne.setAttribute("aria-label", backView ? L.ui.seeFront : L.ui.seeBack);
    var item = ITEMS[shown];
    scanAnims.forEach(function (a) { a.cancel(); });
    scanAnims = [];
    mNext.style.backgroundImage = "url(\"" + sheetFor(genderF, backView) + "\")";
    setFigure(mNext, item);
    if (reduced) {
      modelEl.classList.toggle("back", backView);
      mNext.style.backgroundImage = "";
      setFigure(mCur, item);
      mCur.style.opacity = "1";
      return;
    }
    var a1 = mNext.animate(
      [{ clipPath: "inset(0 0 100% 0)" }, { clipPath: "inset(0 0 0% 0)" }],
      { duration: 950, easing: SCAN_EASE, fill: "forwards" }
    );
    var a2 = grid.animate(
      [
        { clipPath: "inset(0 0 100% 0)", offset: 0 },
        { clipPath: "inset(0 0 0% 0)", offset: 0.5 },
        { clipPath: "inset(100% 0 0 0)", offset: 1 }
      ],
      { duration: 1092, easing: SCAN_EASE, fill: "forwards" }
    );
    var a3 = scan.animate(
      [
        { top: "0%", transform: "scaleX(.2)", opacity: "0", offset: 0 },
        { top: "6%", transform: "scaleX(1)", opacity: "1", offset: 0.08 },
        { top: "94%", offset: 0.92 },
        { top: "100%", transform: "scaleX(.2)", opacity: "0", offset: 1 }
      ],
      { duration: 950, easing: SCAN_EASE, fill: "forwards" }
    );
    var a4 = mNext.animate(
      [{ transform: "scale(1.012)" }, { transform: "scale(1)" }],
      { duration: 1250, easing: "ease-out", fill: "forwards" }
    );
    scanAnims = [a1, a2, a3, a4];
    a1.onfinish = function () {
      modelEl.classList.toggle("back", backView);
      mNext.style.backgroundImage = "";
      setFigure(mCur, item);
      mCur.style.opacity = "1";
      scanAnims.forEach(function (a) { a.cancel(); });
      scanAnims = [];
    };
  }
  fbOne.addEventListener("click", function () { flipView(!backView); });

  /* ---------------- gender switch (Homme / Femme) ---------------- */
  var genderF = false;
  var gHomme = $("#gHomme"), gFemme = $("#gFemme");
  function sheetFor(f, back) {
    if (f) return back ? "assets/model-sheet-f-back-full.webp" : "assets/model-sheet-f-full.webp";
    return back ? "assets/model-sheet-back-6.webp" : "assets/model-sheet-6.webp";
  }
  function setGender(f) {
    if (f === genderF) return;
    zoomReset();
    genderF = f;
    gHomme.classList.toggle("act", !f);
    gFemme.classList.toggle("act", f);
    var item = ITEMS[shown];
    scanAnims.forEach(function (a) { a.cancel(); });
    scanAnims = [];
    mNext.style.backgroundImage = "url(\"" + sheetFor(genderF, backView) + "\")";
    setFigure(mNext, item);
    if (reduced) {
      modelEl.classList.toggle("f", genderF);
      mNext.style.backgroundImage = "";
      setFigure(mCur, item);
      mCur.style.opacity = "1";
      return;
    }
    var a1 = mNext.animate(
      [{ clipPath: "inset(0 0 100% 0)" }, { clipPath: "inset(0 0 0% 0)" }],
      { duration: 950, easing: SCAN_EASE, fill: "forwards" }
    );
    var a2 = grid.animate(
      [
        { clipPath: "inset(0 0 100% 0)", offset: 0 },
        { clipPath: "inset(0 0 0% 0)", offset: 0.5 },
        { clipPath: "inset(100% 0 0 0)", offset: 1 }
      ],
      { duration: 1092, easing: SCAN_EASE, fill: "forwards" }
    );
    var a3 = scan.animate(
      [
        { top: "0%", transform: "scaleX(.2)", opacity: "0", offset: 0 },
        { top: "6%", transform: "scaleX(1)", opacity: "1", offset: 0.08 },
        { top: "94%", offset: 0.92 },
        { top: "100%", transform: "scaleX(.2)", opacity: "0", offset: 1 }
      ],
      { duration: 950, easing: SCAN_EASE, fill: "forwards" }
    );
    var a4 = mNext.animate(
      [{ transform: "scale(1.012)" }, { transform: "scale(1)" }],
      { duration: 1250, easing: "ease-out", fill: "forwards" }
    );
    scanAnims = [a1, a2, a3, a4];
    a1.onfinish = function () {
      modelEl.classList.toggle("f", genderF);
      mNext.style.backgroundImage = "";
      setFigure(mCur, item);
      mCur.style.opacity = "1";
      scanAnims.forEach(function (a) { a.cancel(); });
      scanAnims = [];
    };
  }
  gHomme.addEventListener("click", function () { setGender(false); });
  gFemme.addEventListener("click", function () { setGender(true); });

  /* ---------------- tabs / arrows / chips ---------------- */
  function movePill(btn) {
    if (!btn) return;
    pill.style.width = btn.offsetWidth + "px";
    pill.style.height = btn.offsetHeight + "px";
    pill.style.transform = "translateX(" + btn.offsetLeft + "px)";
  }
  tabs.forEach(function (btn) {
    btn.addEventListener("click", function () {
      tabs.forEach(function (b) { b.classList.remove("active"); });
      btn.classList.add("active");
      activeTab = btn;
      movePill(btn);
      preview = -1;
      if (N > 0) target += N; // full lap — lands back on the same garment
    });
  });
  Array.prototype.forEach.call(document.querySelectorAll(".chip"), function (ch) {
    ch.addEventListener("click", function () {
      Array.prototype.forEach.call(document.querySelectorAll(".chip"), function (x) { x.classList.remove("act"); });
      ch.classList.add("act");
    });
  });
  var infoBtn = $("#infoBtn");
  if (infoBtn) infoBtn.addEventListener("click", function () { sheet.hidden = false; });
  $("#sheetX").addEventListener("click", function () { sheet.hidden = true; });
  sheet.addEventListener("click", function (e) { if (e.target === sheet) sheet.hidden = true; });
  $("#prevBtn").addEventListener("click", function () { preview = -1; target -= 1; });
  $("#nextBtn").addEventListener("click", function () { preview = -1; target += 1; });
  Array.prototype.forEach.call(document.querySelectorAll(".chip"), function (chip) {
    chip.addEventListener("click", function () {
      Array.prototype.forEach.call(document.querySelectorAll(".chip"), function (c) {
        c.classList.remove("act");
      });
      chip.classList.add("act");
    });
  });

  /* ---------------- cursor ---------------- */
  var curState = "", pressed = false, curShown = false;
  function ringScale() {
    var b = curState === "try" ? 1.5 : curState === "drag" ? 1.2 : curState === "btn" ? 0.6 : 1;
    ring.style.transform = "scale(" + (b * (pressed ? 1.05 : 1)) + ")";
  }
  function setCurState(s) {
    if (s === curState) return;
    curState = s;
    cur.classList.remove("try", "drag", "btn");
    if (s) cur.classList.add(s);
    ringScale();
  }
  document.addEventListener("pointermove", function (e) {
    mx = e.clientX; my = e.clientY;
    tx = e.clientX / W - 0.5;
    ty = e.clientY / H - 0.5;
    if (!curShown) {
      curShown = true;
      cx = mx; cy = my;
      cur.style.opacity = "1";
    }
    var t0 = e.target;
    cur.classList.toggle("dark", !!(t0.closest && t0.closest(".cartPage")));
    if (!dragging) {
      var t = e.target;
      if (t.closest && t.closest(".card")) setCurState("try");
      else if (t.closest && t.closest("button")) setCurState("btn");
      else if (t.closest && t.closest(".stage")) setCurState("drag");
      else setCurState("");
    }
  });
  document.addEventListener("pointerdown", function () { pressed = true; ringScale(); });
  document.addEventListener("pointerup", function () { pressed = false; ringScale(); });

  /* ---------------- drag / click ---------------- */
  var dragId = null, startX = 0, startY = 0, lastY = 0, gMode = "?", p0 = 0, lastX = 0, lastT = 0, vel = 0, moved = 0, downCard = null;
  stage.addEventListener("pointerdown", function (e) {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    preview = -1; // touching the arc takes back control from a grid preview
    dragId = e.pointerId;
    try { stage.setPointerCapture(dragId); } catch (err) {}
    dragging = true;
    startX = lastX = e.clientX;
    startY = lastY = e.clientY;
    gMode = "?";
    lastT = performance.now();
    p0 = pos;
    vel = 0;
    moved = 0;
    downCard = (e.target.closest && e.target.closest(".card")) || null;
    setCurState("drag");
  });
  stage.addEventListener("pointermove", function (e) {
    if (dragId !== e.pointerId) return;
    var dx = e.clientX - startX;
    var dy = e.clientY - startY;
    if (Math.abs(dx) > moved) moved = Math.abs(dx);
    if (Math.abs(dy) > moved) moved = Math.abs(dy);
    if (gMode === "?") {
      // touch-action:none — the direction is decided here: a mostly
      // vertical drag scrolls the page by hand, a horizontal one turns the arc
      if (zoomS <= 1 && Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx) * 1.2) gMode = "scroll";
      else if (Math.abs(dx) > 10) gMode = "arc";
      else return;
    }
    if (gMode === "scroll") {
      scrollPage.scrollTop -= (e.clientY - lastY);
      lastY = e.clientY;
      lastX = e.clientX;
      return;
    }
    var now = performance.now();
    var inst = (e.clientX - lastX) / Math.max(1, now - lastT); // px per ms
    vel = vel * 0.7 + inst * 0.3;
    lastX = e.clientX;
    lastT = now;
    pos = p0 - dx / XSpx[1];
  });
  function endDrag(e) {
    if (dragId !== e.pointerId) return;
    dragId = null;
    dragging = false;
    if (gMode === "scroll") { gMode = "?"; downCard = null; return; }
    gMode = "?";
    if (moved < 6) {
      if (downCard) {
        preview = -1;
        var i = parseInt(downCard.dataset.idx, 10);
        target += mod(i - target + N, CARDS) - N;
      }
    } else {
      target = Math.round(pos - vel * 3.2);
    }
    downCard = null;
  }
  stage.addEventListener("pointerup", endDrag);
  stage.addEventListener("pointercancel", endDrag);

  /* ---------------- keys ----------------
     V3: no wheel-to-arc — the page itself scrolls (products below). */
  window.addEventListener("keydown", function (e) {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") { preview = -1; target += 1; }
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") { preview = -1; target -= 1; }
  });


  /* ---------------- character zoom (pinch / ctrl+wheel) ----------------
     Free zoom on the model only: two fingers pinch, ctrl+wheel zooms,
     and while zoomed in, one finger pans the character instead of
     turning the arc. Every switch (hoodie, front/back, Homme/Femme)
     resets the zoom to the default place (zoomReset, called above). */
  var zoomS = 1, zoomX = 0, zoomY = 0;
  var zPointers = new Map();
  var pinchD0 = 0, pinchS0 = 1, pinchMX = null, pinchMY = null;
  var panId = null, panLX = 0, panLY = 0;

  function zoomApply(anim) {
    modelEl.style.transition = anim ? "transform .45s cubic-bezier(.22,.9,.26,1)" : "none";
    modelEl.style.transform = "translateX(-50%) translate(" + zoomX + "px," + zoomY + "px) scale(" + zoomS + ")";
  }
  function zoomClamp() {
    if (zoomS <= 1) { zoomS = 1; zoomX = 0; zoomY = 0; return; }
    var mx = modelEl.offsetWidth * (zoomS - 1) * 0.55;
    var my = modelEl.offsetHeight * (zoomS - 1) * 0.55;
    zoomX = Math.min(mx, Math.max(-mx, zoomX));
    zoomY = Math.min(my, Math.max(-my, zoomY));
  }
  function zoomOriginAt(cx, cy) {
    var r = modelEl.getBoundingClientRect();
    if (!r.width || !r.height) return;
    var fx = Math.min(1, Math.max(0, (cx - r.left) / r.width));
    var fy = Math.min(1, Math.max(0, (cy - r.top) / r.height));
    modelEl.style.transformOrigin = (fx * 100) + "% " + (fy * 100) + "%";
  }
  function zoomReset() {
    if (zoomS === 1 && zoomX === 0 && zoomY === 0) return;
    zoomS = 1; zoomX = 0; zoomY = 0;
    panId = null;
    modelEl.style.transformOrigin = "50% 50%";
    zoomApply(true);
    window.setTimeout(function () { modelEl.style.transition = "none"; }, 480);
  }

  stage.addEventListener("pointerdown", function (e) {
    zPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (zPointers.size === 2) {
      dragId = null; dragging = false; // pinch wins over the arc drag
      var pts = Array.from(zPointers.values());
      pinchD0 = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
      pinchS0 = zoomS;
      pinchMX = (pts[0].x + pts[1].x) / 2;
      pinchMY = (pts[0].y + pts[1].y) / 2;
      zoomOriginAt(pinchMX, pinchMY);
    } else if (zPointers.size === 1 && zoomS > 1) {
      dragId = null; dragging = false; // zoomed: one finger pans the character
      panId = e.pointerId; panLX = e.clientX; panLY = e.clientY;
    }
  });
  stage.addEventListener("pointermove", function (e) {
    if (!zPointers.has(e.pointerId)) return;
    zPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (zPointers.size === 2) {
      var pts = Array.from(zPointers.values());
      var d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
      zoomS = Math.min(3, Math.max(1, pinchS0 * d / pinchD0));
      var mx2 = (pts[0].x + pts[1].x) / 2, my2 = (pts[0].y + pts[1].y) / 2;
      if (pinchMX !== null) { zoomX += mx2 - pinchMX; zoomY += my2 - pinchMY; }
      pinchMX = mx2; pinchMY = my2;
      zoomClamp(); zoomApply(false);
    } else if (panId === e.pointerId && zoomS > 1) {
      zoomX += e.clientX - panLX; zoomY += e.clientY - panLY;
      panLX = e.clientX; panLY = e.clientY;
      zoomClamp(); zoomApply(false);
    }
  });
  function zEnd(e) {
    zPointers.delete(e.pointerId);
    if (zPointers.size < 2) { pinchMX = null; pinchMY = null; }
    if (panId === e.pointerId) panId = null;
    if (zPointers.size === 1 && zoomS > 1) {
      var ent = Array.from(zPointers.entries())[0];
      panId = ent[0]; panLX = ent[1].x; panLY = ent[1].y; // remaining finger takes over the pan
      dragId = null; dragging = false;
    }
  }
  stage.addEventListener("pointerup", zEnd);
  stage.addEventListener("pointercancel", zEnd);
  window.addEventListener("wheel", function (e) {
    if (!e.ctrlKey) return;
    e.preventDefault();
    zoomOriginAt(e.clientX, e.clientY);
    zoomS = Math.min(3, Math.max(1, zoomS * (e.deltaY < 0 ? 1.12 : 0.89)));
    zoomClamp(); zoomApply(false);
  }, { passive: false });
  /* iOS Safari: two-finger gestures belong to the pinch above — Safari
     otherwise claims them for its own page zoom / scroll. */
  stage.addEventListener("gesturestart", function (e) { e.preventDefault(); });
  stage.addEventListener("touchmove", function (e) { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });

  /* ---------------- layout ---------------- */
  function layout() {
    W = window.innerWidth;
    H = window.innerHeight;
    CW = isPhone() ? Math.min(W * 0.30, 170) : Math.min(W * 0.148, H * 0.33);
    document.documentElement.style.setProperty("--CW", CW + "px");
    var f = isPhone() ? [0, 0.36, 0.5, 0.56, 0.6, 0.62] : [0, 0.215, 0.345, 0.432, 0.49, 0.52];
    XSpx = f.map(function (v) { return v * W; });
    document.documentElement.style.setProperty("--arcX", XSpx[1] + "px");
    movePill(activeTab);
  }
  window.addEventListener("resize", layout);

  function xAt(a) {
    if (a >= 5) return XSpx[5];
    var s = Math.floor(a), fr = a - s;
    return XSpx[s] + (XSpx[s + 1] - XSpx[s]) * fr;
  }

  /* ---------------- main loop — the arc maths ---------------- */
  var lastNow = 0;
  function r2(v) { return Math.round(v * 100) / 100; }
  function putT(el, str) { if (el._tf !== str) { el._tf = str; el.style.transform = str; } }
  function frame(now) {
    var t = now / 1000;

    /* cursor first, with frame-rate independent smoothing (same feel at 30/60/120 Hz) */
    var dtF = lastNow ? Math.min(3, Math.max(0.25, (now - lastNow) / 16.667)) : 1;
    lastNow = now;
    var ck = 1 - Math.pow(0.78, dtF);
    cx += (mx - cx) * ck;
    cy += (my - cy) * ck;
    putT(cur, "translate3d(" + r2(cx) + "px, " + r2(cy) + "px, 0) translate(-50%, -50%)");


    if (!dragging) pos = reduced ? target : pos + (target - pos) * 0.11;
    if (intro < 1) intro = Math.min(1, intro + 0.012);
    var ie = reduced ? 1 : 1 - Math.pow(1 - intro, 3);

    sx += (tx - sx) * 0.06;
    sy += (ty - sy) * 0.06;

    putT(room, "translate3d(" + r2(-sx * 22) + "px, " + r2(-sy * 14) + "px, 0) scale(" + r2(1.08 - 0.03 * ie) + ")");
    putT(ghost, "translate(calc(-50% + " + r2(-sx * 40) + "px), " + r2(-sy * 16) + "px)");
    letters.forEach(function (el, i) {
      putT(el, "translateY(" + r2((1 - ie) * (60 + 30 * i)) + "px)");
    });

    for (var i = 0; i < CARDS; i++) {
      var card = cards[i];
      var u = mod(i - pos + N, CARDS) - N;
      var a = Math.abs(u), sg = Math.sign(u);
      var s, z, ry, op, blur = 0;
      if (a < 1) {
        s = 0.55 + 0.45 * a;
        z = -260 * (1 - a);
        op = a;
        ry = -sg * 16 * a;
      } else {
        s = 1 / (1 + 0.3 * Math.pow(a - 1, 1.15));
        z = -110 * (a - 1);
        ry = -sg * (16 + 9 * Math.min(2, a - 1));
        blur = Math.max(0, a - 1.6) * 2.4;
        op = 1;
        if (a > 3.4) op = 1 - (a - 3.4) / 0.8;
      }
      var bob = reduced ? 0 : Math.sin(t * 1.1 + i * 1.37) * H * 0.006 * Math.min(1, a);
      var y = bob - (1 - s) * H * 0.04;
      ry += sx * 10;
      var x = sg * xAt(a) * ie;
      op *= ie;
      putT(card,
        "translate(" + r2(x) + "px, " + r2(y) + "px) perspective(1300px) translateZ(" + r2(z) + "px)" +
        " rotateY(" + r2(ry) + "deg) rotateX(" + r2(-sy * 6) + "deg) scale(" + r2(s * (0.6 + 0.4 * ie)) + ")");
      var opR = Math.round(op * 1000) / 1000;
      if (card._op !== opR) { card._op = opR; card.style.opacity = opR; }
      var zi = a < 1 ? 1 : Math.round(100 - 10 * a);
      if (card._z !== zi) { card._z = zi; card.style.zIndex = zi; }
      var fs = blur > 0.01 ? "blur(" + r2(blur) + "px)" : "";
      if (card._f !== fs) { card._f = fs; card.style.filter = fs; }
      var vs = op < 0.01 ? "hidden" : "visible";
      if (card._v !== vs) { card._v = vs; card.style.visibility = vs; }
    }

    if (!dragging && Math.abs(target - pos) < 0.02 && N > 0 && preview < 0) {
      var idx = mod(Math.round(target), N);
      if (idx !== shownArc) { shownArc = idx; tryOn(arcItems[idx]); }
    }

    requestAnimationFrame(frame);
  }


  /* ---------------- language (all texts live in js/lang.js) ---------------- */
  var langTx = $("#langTx");
  function applyLang() {
    L = window.LANGS[window.LANG] || window.LANGS.fr;
    document.documentElement.lang = window.LANG;
    document.documentElement.dir = "ltr";
    document.title = L.ui.title;
    if (langTx) langTx.textContent = window.LANG === "ar" ? "عربي" : window.LANG.toUpperCase();
    gHomme.textContent = L.ui.homme;
    gFemme.textContent = L.ui.femme;
    tabs.forEach(function (b) { b.textContent = L.ui.tops; });
    var rl = document.querySelectorAll(".rail .rlabel");
    if (rl[0]) rl[0].textContent = L.ui.tops;
    if (rl[1]) rl[1].textContent = L.ui.cart;
    if (rl[2]) rl[2].textContent = L.ui.calendar;
    if (rl[3]) rl[3].textContent = L.ui.profile;
    var lbl = document.querySelector(".sizeRow .lbl");
    if (lbl) lbl.textContent = L.ui.size;
    if (buyBtn) buyBtn.textContent = L.ui.addToCart;
    if (sheetBuy) sheetBuy.textContent = L.ui.addToCart;
    var ib = $("#infoBtn");
    if (ib) ib.textContent = L.ui.moreInfo;
    fbOneTx.textContent = backView ? L.ui.front : L.ui.back;
    fbOne.setAttribute("aria-label", backView ? L.ui.seeFront : L.ui.seeBack);
    var ct = document.querySelector(".clab.try"), cd = document.querySelector(".clab.drag");
    if (ct) ct.textContent = L.ui.tryOn;
    if (cd) cd.textContent = L.ui.drag;
    cardNames.forEach(function (nm, k) { if (arcItems.length) nm.textContent = L.items[arcItems[k % N]].n; });
    var cur = shown < 0 ? 0 : shown;
    updateBuy(ITEMS[cur], cur);
    cartTexts2();
    if (!cartSheet.hidden && csItem >= 0) { csName.textContent = L.items[csItem].n; renderCsLines(); }
    movePill(activeTab);
    railSel(); // rail labels change width with the language — re-align the sliding pill
  }
  var langBtn = $("#langBtn");
  if (langBtn) langBtn.addEventListener("click", function () {
    window.LANG = window.LANG === "fr" ? "en" : window.LANG === "en" ? "ar" : "fr";
    try { window.localStorage.setItem("lbs-lang", window.LANG); } catch (e) {}
    applyLang();
  });


  /* ---------------- cart data ----------------
     The home page IS the cart page (Omar, 2026-11-21): the separate
     cart page is deleted. The cart lives in the arc beside the
     character (syncArc) and in the top-bar badge. */
  var cartBadgeEl = $("#cartBadge");
  var ORDER_EMAIL = "arhouneo14@gmail.com";
  var cartBar = $("#cartBar"), cbTotalVal = $("#cbTotalVal");
  var cartSheet = $("#cartSheet"), csName = $("#csName"), csLines = $("#csLines"), csTotalVal = $("#csTotalVal");
  var orderSheet = $("#orderSheet"), osSum = $("#osSum"), osTotalVal = $("#osTotalVal");
  var csItem = -1;
  var cart = [];
  try { cart = JSON.parse(window.localStorage.getItem("lbs-cart") || "[]"); } catch (e) { cart = []; }
  if (!Array.isArray(cart)) cart = [];

  function cartSave() { try { window.localStorage.setItem("lbs-cart", JSON.stringify(cart)); } catch (e) {} }
  function cartCount() { return cart.reduce(function (s, l) { return s + l.qty; }, 0); }
  function selSize() { var c = document.querySelector(".sizeRow .chip.act"); return c ? c.textContent.trim() : "M"; }
  function cartBadgeUpdate(pulse) {
    var n = cartCount();
    cartBadgeEl.hidden = n === 0;
    cartBadgeEl.textContent = n;
    if (pulse && n > 0) { cartBadgeEl.classList.remove("pulse"); void cartBadgeEl.offsetWidth; cartBadgeEl.classList.add("pulse"); }
    if (arcReady) syncArc(); // the side arc mirrors the cart, always
    cartBarUpdate();
  }
  /* ---------------- home = cart: total bar, per-item sheet, order form ---------------- */
  function cartTotalVal() {
    var t = 0;
    cart.forEach(function (l) { t += ITEMS[l.i].p * l.qty; });
    return t;
  }
  function cartBarUpdate() {
    cartBar.hidden = cart.length === 0;
    cbTotalVal.textContent = cartTotalVal() + " MAD";
    fbOne.classList.toggle("lift", cart.length > 0);
  }
  function cartTexts2() {
    $("#cbTotalTx").textContent = L.ui.total;
    $("#cbOrder").textContent = L.ui.checkout;
    $("#csTotalTx").textContent = L.ui.total;
    $("#csOrder").textContent = L.ui.checkout;
    $("#osTitle").textContent = L.ui.formTitle;
    $("#osTotalTx").textContent = L.ui.total;
    $("#osNote").textContent = L.ui.deliveryFree;
    $("#osNameTx").textContent = L.ui.fName;
    $("#osPhoneTx").textContent = L.ui.fPhone;
    $("#osCityTx").textContent = L.ui.fCity;
    $("#osAddrTx").textContent = L.ui.fAddress;
    $("#osConfirm").textContent = L.ui.confirm;
  }
  function openCartSheet(itemIdx) {
    if (!cart.some(function (l) { return l.i === itemIdx; })) return;
    csItem = itemIdx;
    csName.textContent = L.items[itemIdx].n;
    renderCsLines();
    cartSheet.hidden = false;
  }
  function renderCsLines() {
    csLines.innerHTML = "";
    var any = false;
    cart.forEach(function (l, li) {
      if (l.i !== csItem) return;
      any = true;
      var row = document.createElement("div");
      row.className = "csLine";
      var sz = document.createElement("span");
      sz.className = "csSize";
      sz.textContent = L.ui.size + " " + l.size;
      var qty = document.createElement("div");
      qty.className = "csQty";
      var minus = document.createElement("button");
      minus.className = "csStep"; minus.type = "button"; minus.textContent = "\u2212";
      minus.addEventListener("click", function () { stepLine(li, -1); });
      var val = document.createElement("span");
      val.className = "csQtyVal"; val.textContent = l.qty;
      var plus = document.createElement("button");
      plus.className = "csStep"; plus.type = "button"; plus.textContent = "+";
      plus.addEventListener("click", function () { stepLine(li, 1); });
      qty.appendChild(minus); qty.appendChild(val); qty.appendChild(plus);
      var pr = document.createElement("span");
      pr.className = "csPrice";
      pr.textContent = (ITEMS[l.i].p * l.qty) + " MAD";
      var rm = document.createElement("button");
      rm.className = "csRemove"; rm.type = "button"; rm.textContent = L.ui.remove;
      rm.addEventListener("click", function () { removeLine(li); });
      row.appendChild(sz); row.appendChild(qty); row.appendChild(pr); row.appendChild(rm);
      csLines.appendChild(row);
    });
    csTotalVal.textContent = cartTotalVal() + " MAD";
    if (!any) cartSheet.hidden = true;
  }
  function stepLine(li, d) {
    var l = cart[li];
    if (!l) return;
    l.qty = Math.max(1, l.qty + d);
    cartSave(); cartBadgeUpdate(); renderCsLines();
  }
  function removeLine(li) {
    cart.splice(li, 1);
    cartSave(); cartBadgeUpdate(); renderCsLines();
  }
  function openOrderSheet() {
    if (!cart.length) return;
    cartSheet.hidden = true;
    osSum.innerHTML = "";
    cart.forEach(function (l) {
      var r = document.createElement("div");
      r.className = "osSumRow";
      var a = document.createElement("span");
      a.textContent = L.items[l.i].n + " · " + l.size + " \u00d7" + l.qty;
      var b = document.createElement("b");
      b.textContent = (ITEMS[l.i].p * l.qty) + " MAD";
      r.appendChild(a); r.appendChild(b);
      osSum.appendChild(r);
    });
    osTotalVal.textContent = cartTotalVal() + " MAD";
    orderSheet.hidden = false;
  }
  $("#cartSheetX").addEventListener("click", function () { cartSheet.hidden = true; });
  cartSheet.addEventListener("click", function (e) { if (e.target === cartSheet) cartSheet.hidden = true; });
  $("#orderSheetX").addEventListener("click", function () { orderSheet.hidden = true; });
  orderSheet.addEventListener("click", function (e) { if (e.target === orderSheet) orderSheet.hidden = true; });
  $("#cbOrder").addEventListener("click", openOrderSheet);
  $("#csOrder").addEventListener("click", openOrderSheet);
  $("#orderForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var name = $("#fName"), phone = $("#fPhone"), city = $("#fCity"), addr = $("#fAddr");
    var ok = true;
    [name, phone].forEach(function (inp) {
      var bad = !inp.value.trim();
      inp.classList.toggle("bad", bad);
      if (bad) ok = false;
    });
    if (!ok) return;
    var lines = cart.map(function (l) {
      return "\u2022 " + window.LANGS.fr.items[l.i].n + " \u00b7 Taille " + l.size + " \u00d7" + l.qty + " \u2014 " + (ITEMS[l.i].p * l.qty) + " MAD";
    });
    var body = "Nouvelle commande \u2014 LBS\n\n" + lines.join("\n") +
      "\n\nTotal : " + cartTotalVal() + " MAD" +
      "\n\nNom : " + name.value.trim() +
      "\nT\u00e9l\u00e9phone : " + phone.value.trim() +
      "\nVille : " + city.value.trim() +
      "\nAdresse : " + addr.value.trim();
    location.href = "mailto:" + ORDER_EMAIL + "?subject=" +
      encodeURIComponent("Commande LBS \u2014 " + name.value.trim()) + "&body=" + encodeURIComponent(body);
  });

  function addToCart(idx) {
    preview = -1; // once added, the item lives in the arc — no longer a preview
    var sz = selSize(), found = null;
    cart.forEach(function (l) { if (l.i === idx && l.size === sz) found = l; });
    if (found) found.qty++; else cart.push({ i: idx, size: sz, qty: 1 });
    cartSave(); cartBadgeUpdate(true);
  }
  var buyBtnEl = $("#buyBtn"), sheetBuyEl = $("#sheetBuy");
  function flashAdded(btn) {
    if (!btn) return;
    btn.textContent = L.ui.addedMsg;
    window.setTimeout(function () { btn.textContent = L.ui.addToCart; }, 950);
  }
  if (buyBtnEl) buyBtnEl.addEventListener("click", function (e) {
    e.preventDefault();
    addToCart(shown < 0 ? 0 : shown);
    flashAdded(buyBtnEl);
  });
  if (sheetBuyEl) sheetBuyEl.addEventListener("click", function (e) {
    e.preventDefault();
    addToCart(shown < 0 ? 0 : shown);
    sheet.hidden = true;
    flashAdded(buyBtnEl);
  });

  cartBadgeUpdate(false);

  /* ---------------- V3 — one page ----------------
     The top section is the character page AND the cart page:
     the arc beside the character shows only the cart selection
     (syncArc, driven by every cart change). Cart empty ->
     skeleton boxes with a "+ Ajouter" button that smooth-scrolls
     to the products below. A grid tap wears the hoodie (preview)
     and scrolls back up; Ajouter then puts it in the arc. */
  var scrollPage = $("#scrollPage"), pgrid = $("#pgrid");
  var skelL = $("#skelL"), skelR = $("#skelR");
  setGarmentBg(skelL.querySelector(".skelImg"), ITEMS[0]);
  setGarmentBg(skelR.querySelector(".skelImg"), ITEMS[1]);

  function syncArc() {
    var uniq = [];
    cart.forEach(function (l) { if (uniq.indexOf(l.i) < 0) uniq.push(l.i); });
    arcItems = uniq;
    buildArc();
    var has = arcItems.length > 0;
    skelL.hidden = has;
    skelR.hidden = has;
    var pv = $("#prevBtn"), nx = $("#nextBtn");
    if (pv) pv.style.visibility = arcItems.length > 1 ? "" : "hidden";
    if (nx) nx.style.visibility = arcItems.length > 1 ? "" : "hidden";
    if (has) {
      var ai = arcItems.indexOf(shown);
      if (ai >= 0) { pos = target = ai; shownArc = ai; }
      else { pos = target = 0; shownArc = -1; } // the settle loop will tryOn(arcItems[0])
    } else if (shown !== 0) {
      tryOn(0); // empty cart: the default hoodie stays on the character
    }
  }

  function buildGrid() {
    pgrid.innerHTML = "";
    ITEMS.forEach(function (item, i) {
      var card = document.createElement("button");
      card.className = "pcard";
      card.type = "button";
      var img = document.createElement("div");
      img.className = "pimg";
      // direct URL (never an inline var()) — iOS Safari drops var() in inline styles
      img.style.backgroundImage = 'url("assets/cart-nobg-' + (i + 1) + '.webp")';
      var meta = document.createElement("div");
      meta.className = "pmeta";
      var nm = document.createElement("div");
      nm.className = "pn";
      nm.textContent = L.items[i].n;
      var pr = document.createElement("div");
      pr.className = "pp";
      pr.textContent = item.p + " MAD";
      meta.appendChild(nm);
      meta.appendChild(pr);
      card.appendChild(img);
      card.appendChild(meta);
      card.addEventListener("click", function () { openProduct(i); });
      pgrid.appendChild(card);
    });
  }
  function openProduct(i) {
    preview = i;
    tryOn(i);
    scrollPage.scrollTo({ top: 0, behavior: "smooth" });
  }
  function goProducts() {
    var p = document.getElementById("products");
    if (p) p.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  Array.prototype.forEach.call(document.querySelectorAll(".skelBtn"), function (btn) {
    btn.addEventListener("click", goProducts);
  });
  Array.prototype.forEach.call(document.querySelectorAll(".cpCase"), function (c) {
    c.addEventListener("click", goProducts);
  });
  buildGrid();
  arcReady = true;
  syncArc();

  /* Top rail selection follows the page (Omar, 2026-11-21): the top
     section IS the cart page, so Cart is selected on load; scrolling
     down to the products moves the selection to Tops; scrolling back
     up returns it to Cart. The white pill SLIDES between the two
     buttons (same animation as the tabs pill / Loby nav). */
  var topsBtn = document.getElementById("topsBtn"),
      cartBtnEl = document.getElementById("cartBtn"),
      railPill = document.getElementById("railPill");
  function moveRailPill(btn) {
    if (!btn || !railPill) return;
    railPill.style.width = btn.offsetWidth + "px";
    railPill.style.height = btn.offsetHeight + "px";
    railPill.style.transform = "translateX(" + btn.offsetLeft + "px)";
  }
  function railSel() {
    var p = document.getElementById("products");
    if (!p || !topsBtn || !cartBtnEl) return;
    var inProd = p.getBoundingClientRect().top - scrollPage.getBoundingClientRect().top <= scrollPage.clientHeight * 0.5;
    topsBtn.classList.toggle("act", inProd);
    cartBtnEl.classList.toggle("act", !inProd);
    moveRailPill(inProd ? topsBtn : cartBtnEl);
  }
  scrollPage.addEventListener("scroll", railSel, { passive: true });
  window.addEventListener("resize", railSel);
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(railSel);
  }
  railSel();
  /* The rail buttons are section links now: Cart = the home/cart
     section (top), Tops = the products below. */
  cartBtnEl.addEventListener("click", function () {
    scrollPage.scrollTo({ top: 0, behavior: "smooth" });
  });
  topsBtn.addEventListener("click", goProducts);

  /* ---------------- init ---------------- */
  setGarmentBg(thumbG, ITEMS[0]);
  applyLang();
  layout();
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () { movePill(activeTab); });
  }
  requestAnimationFrame(frame);
})();
