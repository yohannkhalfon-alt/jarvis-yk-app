/* JARVIS SIGN — conversion Word (.docx) → PDF, entièrement dans le navigateur.
 *
 * Pourquoi côté navigateur : le document ne sort jamais du poste avant d'être
 * un PDF, et aucun service de conversion tiers (payant, hors UE) n'est utilisé.
 *
 * Principe : docx-preview reconstitue la mise en page Word en HTML, on découpe
 * ce rendu en pages (marges et en-têtes/pieds répétés comme dans Word), puis
 * chaque page est photographiée et assemblée en PDF.
 *
 * Limite assumée : le PDF produit contient l'image de chaque page (le texte
 * n'y est pas sélectionnable). L'utilisateur doit donc TOUJOURS vérifier
 * l'aperçu avant d'envoyer — c'est ce PDF-là qui sera signé.
 */
(function () {
  const VENDOR = "/sign/vendor/";
  const LIBS = ["jszip.min.js", "docx-preview.min.js", "html2canvas.min.js", "jspdf.umd.min.js"];
  const PX_PAR_MM = 96 / 25.4;

  /* Le rendu se fait dans une iframe vierge, jamais dans la page du tableau de
   * bord : le CSS de l'application (box-sizing, couleurs, polices) fausserait
   * la mise en page Word, et la capture y serait dix fois plus lente. */
  function creerCadre() {
    const cadre = document.createElement("iframe");
    cadre.setAttribute("aria-hidden", "true");
    cadre.setAttribute("title", "conversion Word");
    cadre.style.cssText = "position:absolute; left:-20000px; top:0; width:1400px; height:1200px; border:0; opacity:0;";
    document.body.appendChild(cadre);
    const d = cadre.contentDocument;
    d.open();
    d.write('<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;background:#fff;color:#000"></body></html>');
    d.close();
    return cadre;
  }

  function charger(doc) {
    return LIBS.reduce(
      (suite, nom) =>
        suite.then(
          () =>
            new Promise((ok, ko) => {
              const s = doc.createElement("script");
              s.src = VENDOR + nom;
              s.onload = ok;
              s.onerror = () => ko(new Error("Impossible de charger le convertisseur Word (" + nom + ")."));
              doc.head.appendChild(s);
            })
        ),
      Promise.resolve()
    );
  }


  const estWord = (f) => !!f && /\.docx$/i.test(f.name || "");
  const estVieuxWord = (f) => !!f && /\.docx?$/i.test(f.name || "") && !estWord(f);

  /* Certains documents définissent leurs puces au niveau du style : le rendu
   * produit alors une puce vide. On remet une puce visible. */
  function reparerPuces(vue, racine) {
    racine.querySelectorAll("p, div, li").forEach((el) => {
      const cs = vue.getComputedStyle(el);
      if (cs.display !== "list-item" || cs.listStyleType !== "none") return;
      const avant = vue.getComputedStyle(el, "::before").content;
      if (avant && avant !== "none" && /[^"'\s\\9]/.test(avant)) return; // puce déjà là
      const puce = racine.ownerDocument.createElement("span");
      puce.textContent = "• ";
      el.insertBefore(puce, el.firstChild);
    });
  }

  /* Découpe une section trop haute en pages successives, en gardant les marges
   * et en répétant en-tête et pied de page — comme le ferait Word. */
  function paginer(vue, section) {
    const cs = vue.getComputedStyle(section);
    const hPage = parseFloat(cs.minHeight) || parseFloat(cs.height);
    const article = section.querySelector(":scope > article");
    if (!article || !hPage) return [section];
    if (section.getBoundingClientRect().height <= hPage + 1) return [section];

    const entete = section.querySelector(":scope > header");
    const pied = section.querySelector(":scope > footer");
    const dispo =
      hPage -
      parseFloat(cs.paddingTop) -
      parseFloat(cs.paddingBottom) -
      (entete ? entete.getBoundingClientRect().height : 0) -
      (pied ? pied.getBoundingClientRect().height : 0);
    if (!(dispo > 60)) return [section]; // marges aberrantes : on ne touche à rien

    const blocs = [...article.children];
    const pages = [];
    let art = null;
    const nouvellePage = () => {
      const s = section.cloneNode(false);
      s.style.display = "flex";
      s.style.flexDirection = "column";
      if (entete) s.appendChild(entete.cloneNode(true));
      art = section.ownerDocument.createElement("article");
      s.appendChild(art);
      if (pied) {
        const p = pied.cloneNode(true);
        p.style.marginTop = "auto"; // pied collé en bas de page
        s.appendChild(p);
      }
      section.parentNode.insertBefore(s, section);
      pages.push(s);
    };

    nouvellePage();
    for (const bloc of blocs) {
      art.appendChild(bloc);
      if (art.getBoundingClientRect().height > dispo && art.children.length > 1) {
        art.removeChild(bloc);
        nouvellePage();
        art.appendChild(bloc);
      }
    }
    section.remove();
    return pages;
  }

  /* Cherche vers le haut une ligne de pixels uniforme (interligne, marge, trait
   * de tableau) pour couper sans trancher une ligne de texte. */
  function ligneDeCoupe(ctx, largeur, mini, cible) {
    const haut = Math.max(0, Math.floor(mini));
    const hauteur = Math.ceil(cible) - haut;
    if (hauteur <= 1) return cible;
    let bande;
    try { bande = ctx.getImageData(0, haut, largeur, hauteur).data; }
    catch { return cible; }
    const pas = Math.max(1, Math.floor(largeur / 400));
    for (let y = hauteur - 1; y >= 0; y--) {
      const base = y * largeur * 4;
      const r = bande[base], v = bande[base + 1], b = bande[base + 2];
      let uniforme = true;
      for (let x = pas; x < largeur; x += pas) {
        const i = base + x * 4;
        if (bande[i] !== r || bande[i + 1] !== v || bande[i + 2] !== b) { uniforme = false; break; }
      }
      if (uniforme) return haut + y;
    }
    return cible;
  }

  async function pageVersCanvas(vue, el, hPageCss, echelle) {
    const cv = await vue.html2canvas(el, {
      scale: echelle,
      backgroundColor: "#ffffff",
      useCORS: true,
      logging: false,
      scrollX: 0,
      scrollY: 0,
    });
    const hPage = Math.round(hPageCss * echelle);
    if (cv.height <= hPage + 2) return [cv];

    // Bloc unique plus haut qu'une page (grand tableau, grande image) :
    // on tranche l'image en pages entières, sur une ligne propre.
    const ctx = cv.getContext("2d", { willReadFrequently: true });
    const morceaux = [];
    let y = 0;
    while (y < cv.height) {
      let fin = Math.min(y + hPage, cv.height);
      if (fin < cv.height) fin = Math.max(y + Math.round(hPage * 0.5), ligneDeCoupe(ctx, cv.width, y + hPage * 0.8, fin));
      const c = vue.document.createElement("canvas");
      c.width = cv.width;
      c.height = hPage; // toutes les pages au même format
      const c2 = c.getContext("2d");
      c2.fillStyle = "#ffffff";
      c2.fillRect(0, 0, c.width, c.height);
      c2.drawImage(cv, 0, y, cv.width, fin - y, 0, 0, cv.width, fin - y);
      morceaux.push(c);
      y = fin;
    }
    return morceaux;
  }

  /**
   * Convertit un fichier .docx en PDF, sans rien envoyer sur le réseau.
   * @param {File} fichier
   * @param {(etape:string)=>void} [avancement]
   * @returns {Promise<{fichier: File, pages: number}>}
   */
  async function convertir(fichier, avancement) {
    const dire = (t) => { try { avancement && avancement(t); } catch {} };
    if (estVieuxWord(fichier)) {
      throw new Error(
        "Format .doc (ancien Word) non pris en charge. Ouvrez le document dans Word puis « Enregistrer sous » en .docx ou en PDF."
      );
    }
    if (!estWord(fichier)) throw new Error("Ce fichier n'est pas un document Word (.docx).");

    dire("Préparation…");
    const cadre = creerCadre();
    try {
      const vue = cadre.contentWindow;
      const doc = cadre.contentDocument;
      dire("Chargement du convertisseur…");
      await charger(doc);

      dire("Lecture du document Word…");
      // Les octets doivent appartenir au « monde » de l'iframe, sinon les
      // contrôles de type des librairies qui y tournent les rejettent.
      const brut = new Uint8Array(await fichier.arrayBuffer());
      const donnees = new vue.Uint8Array(new vue.ArrayBuffer(brut.byteLength));
      donnees.set(brut);
      await vue.docx.renderAsync(donnees, doc.body, null, {
        className: "jsdocx",
        inWrapper: true,
        ignoreWidth: false,
        ignoreHeight: false,
        breakPages: true,
        renderHeaders: true,
        renderFooters: true,
        renderFootnotes: true,
        useBase64URL: true,
        experimental: true,
      });

      reparerPuces(vue, doc.body);
      if (doc.fonts && doc.fonts.ready) { try { await doc.fonts.ready; } catch {} }

      const sections = [...doc.querySelectorAll("section.jsdocx")];
      if (!sections.length) throw new Error("Document Word illisible ou vide.");

      dire("Mise en pages…");
      const pages = [];
      for (const s of sections) pages.push(...paginer(vue, s));
      if (!pages.length) throw new Error("Document Word illisible ou vide.");

      // Au-delà d'une quinzaine de pages, on réduit la finesse pour rester
      // sous la limite d'envoi de 10 Mo.
      const echelle = pages.length > 15 ? 1.5 : 2;
      const { jsPDF } = vue.jspdf;
      let pdf = null;
      let numero = 0;

      for (const page of pages) {
        const cs = vue.getComputedStyle(page);
        const lmm = page.getBoundingClientRect().width / PX_PAR_MM;
        const hauteurCss = parseFloat(cs.minHeight) || parseFloat(cs.height);
        const hmm = hauteurCss / PX_PAR_MM;
        dire("Conversion… page " + ++numero + "/" + pages.length);
        const canvases = await pageVersCanvas(vue, page, hauteurCss, echelle);
        for (const cv of canvases) {
          const image = cv.toDataURL("image/jpeg", 0.88);
          const paysage = lmm > hmm;
          if (!pdf) pdf = new jsPDF({ unit: "mm", format: [lmm, hmm], orientation: paysage ? "l" : "p", compress: true });
          else pdf.addPage([lmm, hmm], paysage ? "l" : "p");
          pdf.addImage(image, "JPEG", 0, 0, lmm, hmm, undefined, "FAST");
        }
      }

      const blob = pdf.output("blob");
      const nom = (fichier.name || "document").replace(/\.docx$/i, "") + ".pdf";
      return {
        fichier: new File([blob], nom, { type: "application/pdf" }),
        pages: pdf.getNumberOfPages(),
      };
    } finally {
      cadre.remove();
    }
  }

  window.JarvisDocx = { estWord, estVieuxWord, convertir };
})();
