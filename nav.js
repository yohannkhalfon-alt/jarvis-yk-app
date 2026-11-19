/* Barre d'onglets commune aux applications JARVIS.
   Un seul fichier, insere par chaque page : la barre reste identique
   partout et n'est a modifier qu'ici.

   Les pages partagent deja le meme site et les memes variables CSS
   (--cyan, --line, --dim) ; la barre s'y fond sans style supplementaire. */
(() => {
  const ONGLETS = [
    { libelle: 'MAJ VAC', href: '/vac/', prefixes: ['/vac/'], icone:
      '<path d="M3 4h18v16H3z"/><path d="M8 2v4M16 2v4M3 10h18"/>' },
    { libelle: 'Signature', href: '/sign/', prefixes: ['/sign/', '/sign/index.html'], exact: true, icone:
      '<path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/>' },
    { libelle: 'Photo → PDF', href: '/sign/scan.html', prefixes: ['/sign/scan'], icone:
      '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>' },
    { libelle: 'CDD', href: '/cdd/admin.html', prefixes: ['/cdd/'], icone:
      '<path d="M20 7h-4V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z"/><path d="M10 7V5h4v2"/>' },
  ];

  const ici = location.pathname.replace(/\/index\.html$/, '/');
  const actif = (o) => (o.exact ? ici === o.href : o.prefixes.some((p) => ici.startsWith(p)));
  // « Signature » ne doit pas s'allumer quand on est sur Photo → PDF.
  const surScan = ici.startsWith('/sign/scan');

  const style = document.createElement('style');
  style.textContent = `
    /* flex:none — plusieurs pages ont un body en colonne flex, ou la barre
       se ferait ecraser par le contenu qui, lui, grandit. */
    .jarvis-nav {
      display:flex; gap:8px; padding:12px 18px 0; max-width:860px;
      margin:0 auto; width:100%; flex-wrap:wrap; flex:none;
    }
    .jarvis-nav a {
      display:flex; align-items:center; gap:7px; padding:9px 15px; border-radius:11px;
      border:1px solid var(--line, rgba(79,216,235,.18)); font-size:14px; font-weight:600;
      color:var(--dim, #6B7C93); text-decoration:none; background:rgba(4,6,12,.45);
      font-family:inherit; white-space:nowrap;
    }
    .jarvis-nav a.actif {
      color:var(--cyan, #4FD8EB); background:rgba(79,216,235,.1);
      border-color:rgba(79,216,235,.45);
    }
    .jarvis-nav a svg { width:16px; height:16px; flex:none; }
    /* Sur un ecran etroit, la barre defile au doigt plutot que de passer
       sur deux lignes, ce qui decalait tout le contenu de la page. */
    @media (max-width:520px) {
      .jarvis-nav {
        flex-wrap:nowrap; overflow-x:auto; scrollbar-width:none;
        padding-bottom:2px; -webkit-overflow-scrolling:touch;
      }
      .jarvis-nav::-webkit-scrollbar { display:none; }
      .jarvis-nav a { padding:8px 13px; font-size:13px; }
    }
  `;
  document.head.appendChild(style);

  const nav = document.createElement('nav');
  nav.className = 'jarvis-nav';
  nav.innerHTML = ONGLETS.map((o) => {
    const est = o.libelle === 'Signature' ? (actif(o) && !surScan) : actif(o);
    return '<a href="' + o.href + '"' + (est ? ' class="actif"' : '') + '>' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
      'stroke-linecap="round" stroke-linejoin="round">' + o.icone + '</svg>' + o.libelle + '</a>';
  }).join('');

  const poser = () => {
    if (document.querySelector('.jarvis-nav')) return;
    const entete = document.querySelector('header');
    if (entete && entete.parentNode) entete.parentNode.insertBefore(nav, entete.nextSibling);
    else document.body.insertBefore(nav, document.body.firstChild);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', poser);
  else poser();
})();
