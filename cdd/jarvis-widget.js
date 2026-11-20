// JARVIS — widget de chat plein écran (app MAJ VAC).
// S'appuie sur /api/chat (code d'accès demandé une fois, mémorisé en localStorage).
(function () {
  const API = "/api/chat";
  let MSGS = [];
  let IMAGES = []; // [{media_type, data(b64), apercu}]

  function code() {
    let c = "";
    try { c = localStorage.getItem("jarvis_code") || ""; } catch (e) {}
    if (!c) {
      c = (prompt("Code d'accès JARVIS :") || "").trim();
      if (c) { try { localStorage.setItem("jarvis_code", c); } catch (e) {} }
    }
    return c;
  }
  function oublierCode() { try { localStorage.removeItem("jarvis_code"); } catch (e) {} }

  // ---------- UI ----------
  const css = `
  #jrvOverlay { position:fixed; inset:0; z-index:1000; display:none; flex-direction:column; background:#04060C;
    color:#C8D6E5; font-family:'Rajdhani',sans-serif; }
  #jrvOverlay.on { display:flex; }
  #jrvHead { display:flex; align-items:center; gap:12px; padding:12px 16px; border-bottom:1px solid rgba(79,216,235,.18);
    background:rgba(4,6,12,.7); }
  #jrvHead img { width:36px; height:36px; border-radius:9px; }
  #jrvHead .t { font-family:'Orbitron'; font-weight:700; letter-spacing:2px; color:#EAF4FF; font-size:16px; }
  #jrvHead .s { font-size:10.5px; color:#6B7C93; letter-spacing:1px; }
  #jrvClose { margin-left:auto; width:36px; height:36px; border-radius:10px; border:1px solid rgba(79,216,235,.3);
    background:transparent; color:#4FD8EB; font-size:18px; cursor:pointer; }
  #jrvFil { flex:1; overflow-y:auto; padding:16px; display:flex; flex-direction:column; gap:10px; }
  .jrvB { max-width:86%; padding:10px 13px; border-radius:13px; font-size:15px; line-height:1.5; white-space:pre-wrap; }
  .jrvB.u { align-self:flex-end; background:linear-gradient(135deg,#1B6FD8,#0d4ea0); color:#fff; border-bottom-right-radius:4px; }
  .jrvB.a { align-self:flex-start; background:rgba(10,16,28,.85); border:1px solid rgba(79,216,235,.2); border-bottom-left-radius:4px; }
  .jrvDoc { align-self:flex-start; border:1px solid rgba(79,216,235,.5); background:rgba(79,216,235,.08); color:#4FD8EB;
    border-radius:11px; padding:9px 14px; font-size:14px; font-weight:700; cursor:pointer; font-family:'Rajdhani'; }
  #jrvApercus { display:flex; gap:8px; flex-wrap:wrap; padding:0 14px; }
  #jrvApercus span { position:relative; display:inline-block; }
  #jrvApercus img { height:50px; border-radius:8px; border:1px solid rgba(255,255,255,.2); }
  #jrvApercus button { position:absolute; top:-6px; right:-6px; width:20px; height:20px; line-height:1; padding:0;
    border-radius:50%; font-size:11px; border:none; background:#FF5D6C; color:#fff; cursor:pointer; }
  #jrvBar { display:flex; gap:8px; padding:12px 14px calc(12px + env(safe-area-inset-bottom)); border-top:1px solid rgba(79,216,235,.18);
    background:rgba(4,6,12,.7); }
  #jrvBar button { border-radius:11px; border:1px solid rgba(79,216,235,.3); background:rgba(10,16,28,.85);
    color:#4FD8EB; font-size:17px; padding:0 13px; cursor:pointer; }
  #jrvSaisie { flex:1; min-width:0; border-radius:11px; border:1px solid rgba(79,216,235,.3); background:rgba(10,16,28,.85);
    color:#C8D6E5; font-family:inherit; font-size:16px; padding:11px 12px; outline:none; }
  #jrvSaisie:focus { border-color:#4FD8EB; }
  #jrvEnv { background:linear-gradient(135deg,#1B6FD8,#4FD8EB) !important; color:#04060C !important; font-weight:700; border:none !important; }
  #jrvEnv:disabled { opacity:.45; }
  .jrvAttend { align-self:flex-start; color:#6B7C93; font-size:13px; letter-spacing:1px; }`;

  const html = `
  <div id="jrvHead">
    <img src="/cdd/jarvis-logo.svg" alt="">
    <div><div class="t">JARVIS</div><div class="s">propulsé par Claude</div></div>
    <button id="jrvClose" title="Fermer">✕</button>
  </div>
  <div id="jrvFil"></div>
  <div id="jrvApercus"></div>
  <div id="jrvBar">
    <button id="jrvJoindre" title="Joindre une capture">📎</button>
    <input id="jrvFichier" type="file" accept="image/*" multiple style="display:none">
    <input id="jrvSaisie" placeholder="Écris à JARVIS… (colle une capture)" autocomplete="off">
    <button id="jrvEnv">➤</button>
  </div>`;

  function init() {
    if (document.getElementById("jrvOverlay")) return;
    const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
    const ov = document.createElement("div"); ov.id = "jrvOverlay"; ov.innerHTML = html; document.body.appendChild(ov);
    document.getElementById("jrvClose").onclick = () => ov.classList.remove("on");
    document.getElementById("jrvJoindre").onclick = () => document.getElementById("jrvFichier").click();
    document.getElementById("jrvFichier").onchange = function () { ajouter(this.files); this.value = ""; };
    document.getElementById("jrvEnv").onclick = envoyer;
    const saisie = document.getElementById("jrvSaisie");
    saisie.addEventListener("keydown", (e) => { if (e.key === "Enter") envoyer(); });
    saisie.addEventListener("paste", coller);
    bulle("a", "Salut, c'est JARVIS 🤖\nPose-moi une question (vacations, plannings, Dropbox…), demande une attestation, ou colle une capture WhatsApp d'un employé : je te prépare la réponse.");
  }

  function bulle(role, texte) {
    const d = document.createElement("div");
    d.className = "jrvB " + (role === "u" ? "u" : "a");
    d.textContent = texte;
    const fil = document.getElementById("jrvFil");
    fil.appendChild(d); fil.scrollTop = fil.scrollHeight;
    return d;
  }

  function boutonDoc(doc) {
    const b = document.createElement("button");
    b.className = "jrvDoc";
    b.textContent = "📄 " + (doc.nom || "Document") + " — télécharger";
    b.onclick = async () => {
      try {
        const r = await fetch(API + "?doc=" + encodeURIComponent(doc.id), { headers: { "x-cdd-code": code() } });
        if (!r.ok) throw new Error(r.status);
        const url = URL.createObjectURL(await r.blob());
        window.open(url, "_blank");
      } catch (e) { alert("Téléchargement impossible (" + e.message + ")"); }
    };
    const fil = document.getElementById("jrvFil");
    fil.appendChild(b); fil.scrollTop = fil.scrollHeight;
  }

  // ---------- images ----------
  function reduire(fichier) {
    return new Promise((res, rej) => {
      const img = new Image();
      const url = URL.createObjectURL(fichier);
      img.onload = () => {
        const max = 1400, ratio = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * ratio); c.height = Math.round(img.height * ratio);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        const dataUrl = c.toDataURL("image/jpeg", 0.85);
        res({ media_type: "image/jpeg", data: dataUrl.split(",")[1], apercu: dataUrl });
      };
      img.onerror = rej;
      img.src = url;
    });
  }
  async function ajouter(fichiers) {
    for (const f of Array.from(fichiers || [])) {
      if (!f.type.startsWith("image/")) continue;
      if (IMAGES.length >= 4) { alert("4 captures maximum par message."); break; }
      try { IMAGES.push(await reduire(f)); } catch (e) { alert("Image illisible"); }
    }
    apercus();
  }
  function coller(ev) {
    const items = Array.from(ev.clipboardData && ev.clipboardData.items || []).filter(i => i.type.startsWith("image/"));
    if (!items.length) return;
    ev.preventDefault();
    ajouter(items.map(i => i.getAsFile()).filter(Boolean));
  }
  function apercus() {
    const z = document.getElementById("jrvApercus");
    z.innerHTML = "";
    IMAGES.forEach((im, i) => {
      const s = document.createElement("span");
      const img = document.createElement("img"); img.src = im.apercu;
      const b = document.createElement("button"); b.textContent = "×";
      b.onclick = () => { IMAGES.splice(i, 1); apercus(); };
      s.appendChild(img); s.appendChild(b); z.appendChild(s);
    });
  }
  function elaguer(msgs) {
    return msgs.map((m, idx) => {
      if (m.role !== "user" || !Array.isArray(m.content) || idx >= msgs.length - 3) return m;
      return { ...m, content: m.content.map(c => c.type === "image" ? { type: "text", text: "[capture d'écran déjà analysée plus haut]" } : c) };
    });
  }

  // ---------- envoi ----------
  async function envoyer() {
    const saisie = document.getElementById("jrvSaisie");
    const texte = saisie.value.trim();
    if (!texte && !IMAGES.length) return;
    const c = code();
    if (!c) return;
    saisie.value = "";
    document.getElementById("jrvEnv").disabled = true;
    bulle("u", (IMAGES.length ? "📷 " + IMAGES.length + " capture" + (IMAGES.length > 1 ? "s" : "") + "\n" : "") + texte);
    if (IMAGES.length) {
      const contenu = IMAGES.map(im => ({ type: "image", source: { type: "base64", media_type: im.media_type, data: im.data } }));
      contenu.push({ type: "text", text: texte || "Analyse cette capture et propose-moi une réponse." });
      MSGS.push({ role: "user", content: contenu });
      IMAGES = []; apercus();
    } else {
      MSGS.push({ role: "user", content: texte });
    }
    MSGS = elaguer(MSGS);
    const attend = bulle("a", "…"); attend.classList.add("jrvAttend");
    try {
      for (let tour = 0; tour < 10; tour++) {
        const r = await fetch(API, {
          method: "POST",
          headers: { "content-type": "application/json", "x-cdd-code": c },
          body: JSON.stringify({ messages: MSGS }),
        });
        if (r.status === 401) { oublierCode(); throw new Error("code d'accès refusé — il sera redemandé"); }
        if (!r.ok) throw new Error("erreur " + r.status);
        const data = await r.json();
        MSGS = data.messages || MSGS;
        (data.docs || []).forEach(boutonDoc);
        if (data.done) {
          attend.remove();
          const dernier = MSGS[MSGS.length - 1];
          const blocs = Array.isArray(dernier && dernier.content) ? dernier.content : [];
          const txt = blocs.filter(b => b.type === "text").map(b => b.text).join("\n").trim();
          bulle("a", txt || "(réponse vide)");
          return;
        }
      }
      attend.remove();
      bulle("a", "Je n'ai pas réussi à terminer — réessaie.");
    } catch (e) {
      attend.remove();
      bulle("a", "⚠️ " + e.message);
    } finally {
      document.getElementById("jrvEnv").disabled = false;
    }
  }

  window.jarvisOuvrir = function () {
    init();
    if (!code()) return;
    document.getElementById("jrvOverlay").classList.add("on");
    setTimeout(() => { try { document.getElementById("jrvSaisie").focus(); } catch (e) {} }, 50);
  };
})();
