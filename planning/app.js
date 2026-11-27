// Planning employés — une page par centre, épinglée dans le groupe WhatsApp.
// Lit la vue "equipe" de /api/majvac (grilles Excel Dropbox, mise en cache
// 10 min côté serveur). Navigation semaine par semaine.
const CENTRE = document.body.dataset.centre;
const MOIS = ["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"];
const JOURS = ["dim","lun","mar","mer","jeu","ven","sam"];
const JOURS_LONG = ["dimanche","lundi","mardi","mercredi","jeudi","vendredi","samedi"];
const auj = () => new Date(new Date().toLocaleString("en-US",{timeZone:"Europe/Paris"})).toLocaleDateString("fr-CA");
let ancre = auj();

const joliNom = b => b.replace(/^dr\.?\s+/i,"").trim().toLowerCase().replace(/(^|[\s-])([a-zà-ÿ])/g,(m,s,c)=>s+c.toUpperCase());
function joliH(h){
  if(!h) return null;
  const m = h.match(/^(\d{1,2})H?(\d{2})?-(\d{1,2})H?(\d{2})?$/i);
  if(!m) return h;
  const f=(hh,mn)=>parseInt(hh,10)+"h"+(mn&&mn!=="00"?mn:"");
  return f(m[1],m[2])+"-"+f(m[3],m[4]);
}
// Horaire "spécial" = fin avant 19h (ex. 18h30) ou demi-journée → en orange.
const special = h => { const m=(h||"").match(/-(\d{1,2})H?(\d{2})?$/i); return m && (parseInt(m[1],10)<19); };
const decale = (iso,n) => { const d=new Date(iso+"T12:00:00Z"); d.setUTCDate(d.getUTCDate()+n); return d.toISOString().slice(0,10); };
const dJour = iso => { const d=new Date(iso+"T12:00:00Z"); return {wd:d.getUTCDay(), j:d.getUTCDate(), m:d.getUTCMonth()}; };

async function lireSemaine(a){
  const r = await fetch(`../api/majvac?centre=${CENTRE}&vue=equipe&semaine=${a}`);
  return r.json();
}
function titreSemaine(jours){
  const d1=dJour(jours[0]), d2=dJour(jours[5]);
  return "Semaine du "+d1.j+(d1.m!==d2.m?" "+MOIS[d1.m]:"")+" au "+d2.j+" "+MOIS[d2.m];
}
function rendre(d){
  document.getElementById("titre-sem").textContent = titreSemaine(d.semaine.jours);
  const zone = document.getElementById("zone");
  const today = auj();
  const blocs = (d.roles||[]).filter(r=>r.personnes.length).map(r=>{
    const tetes = d.semaine.jours.map(iso=>{const x=dJour(iso);return `<th${iso===today?' class="auj"':''}>${JOURS[x.wd].charAt(0).toUpperCase()+JOURS[x.wd].slice(1)} ${String(x.j).padStart(2,"0")}</th>`;}).join("");
    const lignes = r.personnes.map(p=>{
      const cells = d.semaine.jours.map(iso=>{
        const h = joliH(p.jours[iso]);
        const cls = [iso===today?"auj":"", h?(special(p.jours[iso])?"hspec":""):"off"].filter(Boolean).join(" ");
        return `<td${cls?` class="${cls}"`:""}>${h||"—"}</td>`;
      }).join("");
      let nom = (r.role==="ophta"?"Dr ":"")+joliNom(p.nom);
      if(r.role==="renfort" && /arous/i.test(p.nom)) nom = "Raph";
      return `<tr><td class="nom${r.role==="renfort"?" rouge":""}">${nom}</td>${cells}</tr>`;
    }).join("");
    return `<div class="bloc${r.role==="renfort"?" renfort":""}"><div class="btitre">${r.label.toUpperCase()}</div><div class="scroll"><table><tr><th></th>${tetes}</tr>${lignes}</table></div></div>`;
  }).join("");
  zone.innerHTML = blocs || '<div class="etat">Planning de cette semaine pas encore disponible.</div>';
}
function rendreDemain(d, demainIso){
  const el = document.getElementById("demain");
  if(!d || !d.semaine.jours.includes(demainIso)){ el.style.display="none"; return; }
  const x = dJour(demainIso);
  const gens = [];
  for(const r of d.roles||[]) for(const p of r.personnes){
    const h = p.jours[demainIso];
    if(h) gens.push((r.role==="ophta"?"Dr ":"")+joliNom(p.nom)+" "+joliH(h));
  }
  if(!gens.length){ el.style.display="none"; return; }
  el.style.display="";
  el.innerHTML = "🔔 <b>Demain "+JOURS_LONG[x.wd]+" "+x.j+" "+MOIS[x.m]+" :</b> "+gens.join(" · ");
}
async function charger(){
  const zone = document.getElementById("zone");
  zone.innerHTML = '<div class="etat"><span class="spin"></span> Lecture du planning…</div>';
  try{
    const d = await lireSemaine(ancre);
    if(d.error) throw new Error(d.error);
    rendre(d);
    // Bandeau "demain" : uniquement sur la semaine en cours (dimanche → lundi suivant).
    let demainIso = decale(auj(),1);
    if(dJour(demainIso).wd===0) demainIso = decale(demainIso,1);
    if(ancre===auj()){
      if(d.semaine.jours.includes(demainIso)) rendreDemain(d, demainIso);
      else lireSemaine(demainIso).then(d2=>rendreDemain(d2.error?null:d2, demainIso)).catch(()=>rendreDemain(null,demainIso));
    } else document.getElementById("demain").style.display="none";
  }catch(e){
    zone.innerHTML = '<div class="etat">Impossible de lire le planning pour le moment.<br>Réessaie dans une minute.<br><span style="font-size:11px">'+String(e.message||e)+'</span></div>';
  }
}
document.getElementById("prec").onclick = ()=>{ ancre = decale(ancre,-7); charger(); };
document.getElementById("suiv").onclick = ()=>{ ancre = decale(ancre,7); charger(); };
charger();
