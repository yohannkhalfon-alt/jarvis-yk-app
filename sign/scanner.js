/* JARVIS SCAN — photo d'un document vers page A4 propre, entierement sur
   l'appareil. Detection de la feuille, recadrage, fond ramene au blanc.

   API : JarvisScan.chargerFichier(file) -> source
         JarvisScan.traiter(source, { rotation, auto }) -> canvas A4
         JarvisScan.titre(canvas) -> string (lecture OCR, ou '' si indisponible)
*/
const JarvisScan = (() => {
  const A4_L = 1654, A4_H = 2339;   // A4 a 200 dpi
  const COTE_MAX = 1800;            // bride la photo avant traitement
  const ANALYSE_L = 240;            // largeur de travail pour la detection
  const MARGE = 0.006;              // rognage vers l'interieur, en fraction de page :
                                    // ecarte le lisere sombre du bord de feuille,
                                    // bien avant les marges de texte (~2 cm)
  const SEUIL = 0.78;               // au-dessus : blanc pur (ombres, verso par transparence)

  const toile = (w, h) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  };

  async function chargerFichier(fichier) {
    // imageOrientation gere la rotation EXIF des photos de telephone.
    if (window.createImageBitmap) {
      try { return await createImageBitmap(fichier, { imageOrientation: 'from-image' }); } catch {}
    }
    const url = URL.createObjectURL(fichier);
    try {
      const img = new Image();
      await new Promise((ok, ko) => { img.onload = ok; img.onerror = () => ko(new Error('format non reconnu')); img.src = url; });
      return img;
    } finally { setTimeout(() => URL.revokeObjectURL(url), 10000); }
  }

  /** Photo redressee et bridee en taille, prete a analyser. */
  function photoDeTravail(source, rotation) {
    const sw = source.width, sh = source.height;
    const pivote = rotation === 90 || rotation === 270;
    const l = pivote ? sh : sw, h = pivote ? sw : sh;
    const k = Math.min(1, COTE_MAX / Math.max(l, h));
    const c = toile(Math.round(l * k), Math.round(h * k));
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingQuality = 'high';
    ctx.translate(c.width / 2, c.height / 2);
    ctx.rotate(rotation * Math.PI / 180);
    ctx.drawImage(source, -sw * k / 2, -sh * k / 2, sw * k, sh * k);
    return c;
  }

  /** Masque du papier : clair et peu colore, contrairement au fond. */
  function masquePapier(photo) {
    const l = ANALYSE_L, h = Math.max(1, Math.round(photo.height * l / photo.width));
    const petit = toile(l, h);
    const ctx = petit.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(photo, 0, 0, l, h);
    const px = ctx.getImageData(0, 0, l, h).data;
    const m = new Uint8Array(l * h);
    for (let i = 0, j = 0; i < m.length; i++, j += 4) {
      const r = px[j], g = px[j + 1], b = px[j + 2];
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      const sat = max === 0 ? 0 : (max - min) * 255 / max;   // S de HSV, 0-255
      m[i] = (sat < 70 && max > 110) ? 1 : 0;
    }
    nettoyerMasque(m, l, h);
    return { m, l, h };
  }

  /** Ouverture puis fermeture 3x3, deux passes : enleve le grain, bouche les trous. */
  function nettoyerMasque(m, l, h) {
    const morpho = (src, min) => {
      const out = new Uint8Array(src.length);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < l; x++) {
          let n = 0;
          for (let dy = -1; dy <= 1; dy++) {
            const yy = y + dy; if (yy < 0 || yy >= h) continue;
            for (let dx = -1; dx <= 1; dx++) {
              const xx = x + dx; if (xx < 0 || xx >= l) continue;
              n += src[yy * l + xx];
            }
          }
          out[y * l + x] = n >= min ? 1 : 0;
        }
      }
      return out;
    };
    let t = m;
    t = morpho(t, 7); t = morpho(t, 1);        // ouverture
    t = morpho(t, 1); t = morpho(t, 7);        // fermeture
    m.set(t);
  }

  /** Plus grande zone connexe du masque ; les autres sont effacees. */
  function plusGrandeZone(m, l, h) {
    const lab = new Int32Array(m.length).fill(-1);
    const pile = [];
    let best = -1, bestN = 0, courant = 0;
    for (let d = 0; d < m.length; d++) {
      if (!m[d] || lab[d] >= 0) continue;
      let n = 0;
      pile.push(d); lab[d] = courant;
      while (pile.length) {
        const p = pile.pop(); n++;
        const x = p % l, y = (p / l) | 0;
        if (x > 0 && m[p - 1] && lab[p - 1] < 0) { lab[p - 1] = courant; pile.push(p - 1); }
        if (x < l - 1 && m[p + 1] && lab[p + 1] < 0) { lab[p + 1] = courant; pile.push(p + 1); }
        if (y > 0 && m[p - l] && lab[p - l] < 0) { lab[p - l] = courant; pile.push(p - l); }
        if (y < h - 1 && m[p + l] && lab[p + l] < 0) { lab[p + l] = courant; pile.push(p + l); }
      }
      if (n > bestN) { bestN = n; best = courant; }
      courant++;
    }
    if (best < 0 || bestN < 0.2 * m.length) return false;
    for (let d = 0; d < m.length; d++) m[d] = lab[d] === best ? 1 : 0;
    return true;
  }

  const mediane = (t) => {
    const s = Float64Array.from(t).sort();
    return s.length ? s[s.length >> 1] : 0;
  };

  /** Bords de la feuille, par mediane : un debordement du masque vers une
      zone claire du fond ne concerne qu'une minorite de lignes. */
  function cadre(m, l, h) {
    const g = [], d = [], ht = [], bs = [];
    for (let y = 0; y < h; y++) {
      let a = -1, b = -1;
      for (let x = 0; x < l; x++) if (m[y * l + x]) { if (a < 0) a = x; b = x; }
      if (a >= 0) { g.push(a); d.push(b); }
    }
    for (let x = 0; x < l; x++) {
      let a = -1, b = -1;
      for (let y = 0; y < h; y++) if (m[y * l + x]) { if (a < 0) a = y; b = y; }
      if (a >= 0) { ht.push(a); bs.push(b); }
    }
    if (!g.length || !ht.length) return null;
    let x0 = Math.round(mediane(g)), x1 = Math.round(mediane(d));
    let y0 = Math.round(mediane(ht)), y1 = Math.round(mediane(bs));

    // Resserre chaque bord tant que la ligne n'est pas franchement du papier :
    // le bord de table ou l'ombre portee entrent parfois dans la decoupe, et
    // leur epaisseur varie trop pour une marge fixe.
    const partLigneH = (y) => { let n = 0; for (let x = x0; x <= x1; x++) n += m[y * l + x]; return n / Math.max(1, x1 - x0 + 1); };
    const partLigneV = (x) => { let n = 0; for (let y = y0; y <= y1; y++) n += m[y * l + x]; return n / Math.max(1, y1 - y0 + 1); };
    const PLEIN = 0.97, MAX = Math.round(0.08 * Math.min(l, h));
    for (let k = 0; k < MAX && y0 < y1 && partLigneH(y0) < PLEIN; k++) y0++;
    for (let k = 0; k < MAX && y1 > y0 && partLigneH(y1) < PLEIN; k++) y1--;
    for (let k = 0; k < MAX && x0 < x1 && partLigneV(x0) < PLEIN; k++) x0++;
    for (let k = 0; k < MAX && x1 > x0 && partLigneV(x1) < PLEIN; k++) x1--;

    return { x0: x0 / l, x1: (x1 + 1) / l, y0: y0 / h, y1: (y1 + 1) / h };
  }

  /** Fond blanc franc, texte et signatures nets, en niveaux de gris. */
  function nettoyer(page) {
    const l = page.width, h = page.height;
    const ctx = page.getContext('2d', { willReadFrequently: true });
    const img = ctx.getImageData(0, 0, l, h), px = img.data;

    // Estimation du fond : reduction forte puis agrandissement lisse.
    const pl = Math.max(2, Math.round(l / 24)), ph = Math.max(2, Math.round(h / 24));
    const petit = toile(pl, ph), pc = petit.getContext('2d', { willReadFrequently: true });
    pc.imageSmoothingQuality = 'high'; pc.drawImage(page, 0, 0, pl, ph);
    const grand = toile(l, h), gc = grand.getContext('2d', { willReadFrequently: true });
    gc.imageSmoothingQuality = 'high'; gc.drawImage(petit, 0, 0, l, h);
    const fond = gc.getImageData(0, 0, l, h).data;

    const n = l * h;
    const norm = new Float32Array(n);
    for (let i = 0, j = 0; i < n; i++, j += 4) {
      const gris = 0.299 * px[j] + 0.587 * px[j + 1] + 0.114 * px[j + 2];
      const f = Math.max(1, 0.299 * fond[j] + 0.587 * fond[j + 1] + 0.114 * fond[j + 2]);
      norm[i] = gris / f;
    }
    // Le papier, majoritaire, donne la reference de blanc.
    const ech = [];
    for (let i = 0; i < n; i += 37) ech.push(norm[i]);
    ech.sort((a, b) => a - b);
    const blanc = Math.max(1e-3, ech[Math.floor(ech.length * 0.70)]);

    const gris = new Uint8ClampedArray(n);
    for (let i = 0; i < n; i++) {
      const v = Math.min(1, norm[i] / blanc);
      gris[i] = Math.pow(Math.max(0, (v - SEUIL) / (1 - SEUIL)), 0.75) * 255;
    }
    // Renforcement mesure des traits (noyau 3x3).
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < l; x++) {
        const i = y * l + x;
        let v = gris[i];
        if (x > 0 && x < l - 1 && y > 0 && y < h - 1) {
          const moy = (gris[i - 1] + gris[i + 1] + gris[i - l] + gris[i + l]) / 4;
          v = Math.max(0, Math.min(255, gris[i] + 0.45 * (gris[i] - moy)));
        }
        const j = i * 4;
        px[j] = px[j + 1] = px[j + 2] = v; px[j + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return page;
  }

  /** Photo -> page A4 recadree et nettoyee. */
  async function traiter(source, { rotation = 0, auto = true } = {}) {
    const photo = photoDeTravail(source, rotation);
    let z = { x0: 0, x1: 1, y0: 0, y1: 1 };
    if (auto) {
      const { m, l, h } = masquePapier(photo);
      if (plusGrandeZone(m, l, h)) {
        const c = cadre(m, l, h);
        if (c && c.x1 - c.x0 > 0.2 && c.y1 - c.y0 > 0.2) {
          z = { x0: c.x0 + MARGE, x1: c.x1 - MARGE, y0: c.y0 + MARGE, y1: c.y1 - MARGE };
        }
      }
    }
    const sx = z.x0 * photo.width, sy = z.y0 * photo.height;
    const sw = (z.x1 - z.x0) * photo.width, sh = (z.y1 - z.y0) * photo.height;

    // Page A4 : la decoupe est inseree en conservant ses proportions.
    const page = toile(A4_L, A4_H);
    const ctx = page.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, A4_L, A4_H);
    ctx.imageSmoothingQuality = 'high';
    const k = Math.min(A4_L / sw, A4_H / sh);
    const dw = sw * k, dh = sh * k;
    ctx.drawImage(photo, sx, sy, sw, sh, (A4_L - dw) / 2, (A4_H - dh) / 2, dw, dh);
    return nettoyer(page);
  }

  // --- Lecture du titre (OCR charge a la demande) ---
  let ocr = null;
  function chargerOcr() {
    if (ocr) return ocr;
    ocr = new Promise((ok, ko) => {
      if (window.Tesseract) return ok(window.Tesseract);
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
      s.onload = () => ok(window.Tesseract);
      s.onerror = () => ko(new Error('OCR indisponible'));
      document.head.appendChild(s);
    });
    return ocr;
  }

  /** Ligne la plus « titre » du haut de page : longue et en majuscules. */
  function meilleureLigne(texte) {
    let best = '', score = 0;
    for (const brut of String(texte || '').split('\n')) {
      const l = brut.replace(/\s+/g, ' ').trim();
      if (l.length < 6 || l.length > 90) continue;
      const lettres = l.replace(/[^A-Za-zÀ-ÿ]/g, '');
      if (lettres.length < 5) continue;
      const majuscules = (l.match(/[A-ZÀ-Þ]/g) || []).length / lettres.length;
      const s = (0.6 + majuscules) * Math.min(l.length, 60);
      if (s > score) { score = s; best = l; }
    }
    return best;
  }

  async function titre(page) {
    const T = await chargerOcr();
    // Seul le haut de la page porte le titre : moins d'image, lecture plus sure.
    const bande = toile(page.width, Math.round(page.height * 0.38));
    bande.getContext('2d').drawImage(page, 0, 0);
    const { data } = await T.recognize(bande, 'fra');
    return meilleureLigne(data && data.text);
  }

  return { chargerFichier, traiter, titre, _meilleureLigne: meilleureLigne };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = JarvisScan;
