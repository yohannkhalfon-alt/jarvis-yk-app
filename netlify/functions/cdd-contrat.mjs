// Générateur de contrat CDD « REMPLA OPHTA 1 JOUR » — CDS OPHTALMO ARGENTEUIL.
// Texte repris mot pour mot du modèle validé par l'avocate
// (Dropbox : CONTRAT TYPE TOUTES SOCIETES/CONTRATS AVOCATE/CDS OPHTALMO
// ARGENTEUIL/OPHTA/CDD/CDD REMPLA OPHTA 1 JOUR CDSOA, versions homme/femme),
// avec les accords de genre appliqués selon la civilité du praticien.
// Rendu PDF via pdf-lib (déjà utilisé par JARVIS SIGN). Le tampon du centre
// (image uploadée dans l'admin, stockée en Blobs privés) est apposé en
// signature employeur et en paraphe de chaque page.
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const PAGE_L = 595.28, PAGE_H = 841.89;       // A4 portrait (points)
const MARGE = 62, BAS = 70;

const dateLongue = (iso, sansJourSemaine = false) => {
  const [a, m, j] = iso.split("-").map(Number);
  const opts = { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" };
  if (!sansJourSemaine) opts.weekday = "long";
  return new Date(Date.UTC(a, m - 1, j)).toLocaleDateString("fr-FR", opts);
};

// Le praticien : formes accordées selon la civilité ("M" ou "Mme").
function formes(resa) {
  const f = (resa.civilite || "M") === "Mme";
  const nom = `${(resa.nom || "").toUpperCase()} ${resa.prenom || ""}`.trim();
  return {
    f,
    civLong: f ? "Madame" : "Monsieur",
    m: f ? "Mme" : "M",
    nom,
    mNom: `${f ? "Mme" : "M"} ${nom}`,
    e: f ? "e" : "",
    ilElle: f ? "Elle" : "Il",
    designe: f ? "désignée" : "désigné",
  };
}

// Construit les blocs du contrat : {t:"titre"|"h"|"p"|"li"|"note", x:texte}
export function blocsContrat(resa, slot, cfg) {
  const P = formes(resa);
  const dateVac = dateLongue(slot.date);
  const remplace = (cfg.remplaceByCentre || {})[slot.centre] || "____________________";
  const neLe = resa.dateNaissance ? dateLongue(resa.dateNaissance, true) : "____________";
  const lieuN = resa.lieuNaissance || "____________";
  const natio = resa.nationalite || "____________";
  const secu = resa.secu || "____________";
  const remu = "1.300 euros (mille trois cents euros)";
  const prime = "130 euros (cent trente euros)";

  return [
    { t: "titre", x: "CONTRAT DE TRAVAIL A DUREE DETERMINEE\nA TERME PRECIS" },
    { t: "p", x: "Entre les soussignés :" },
    { t: "p", x: "L’Association CDS OPHTALMO ARGENTEUIL\nSiret : 934 579 913 00013\nAssociation régie par la loi du 1er juillet 1901,\nAyant son siège social au 2, Rue Antonin Georges Belin – 95100 Argenteuil\nAgissant par l’intermédiaire de Monsieur SITRUK Thierry, dont les cotisations de sécurité sociale sont versées à l’URSSAF de Montreuil." },
    { t: "p", x: "(ci-après désignée « le Centre de santé Ophtalmo Argenteuil » ou « l’employeur » ou « l’Association »)" },
    { t: "p", x: "d'une part," },
    { t: "p", x: "Et :" },
    { t: "p", x: `${P.civLong} ${P.nom}, né${P.e} le ${neLe} à ${lieuN}, de nationalité ${natio}, inscrit${P.e} à la sécurité sociale sous le numéro ${secu}, demeurant ${resa.adresse || "____________"}.` },
    { t: "p", x: `N° RPPS : ${resa.rpps || "____________"}` },
    { t: "p", x: `(ci-après ${P.designe} « le Salarié » ou « Dr ${P.nom} » ou « le Praticien »)` },
    { t: "p", x: "d'autre part," },
    { t: "p", x: "Ci-après ensemble dénommé(e)s les « Parties »." },
    { t: "p", x: "Il a été convenu et arrêté ce qui suit :" },

    { t: "h", x: "Préambule" },
    { t: "p", x: `La déclaration préalable à l'embauche de ${P.mNom} a été effectuée à l'Urssaf de Montreuil auprès de laquelle le Centre de santé Ophtalmo Argenteuil est immatriculé. ${P.ilElle} pourra exercer auprès de cet organisme son droit d'accès et de rectification conformément à la loi n° 78-17 du 6 janvier 1978.` },
    { t: "p", x: "Le présent contrat est conclu en conformité avec les dispositions législatives et réglementaires en vigueur, notamment celles contenues dans le Code du travail, le Code de la Santé publique et le Code de déontologie médicale (figurant aux articles R4127-1 à R 4127-112 du Code de la Santé Publique portant Code de Déontologie Médicale), dont le Praticien reconnait avoir pris connaissance." },
    { t: "p", x: `A titre d'information, la convention collective nationale actuellement applicable au Centre de santé Ophtalmo Argenteuil est la Convention Collective des Cabinets Médicaux (IDCC 1147). La Convention Collective est tenue à la disposition de ${P.mNom} qui peut la consulter dans le bureau de la Direction et en demander la communication.` },
    { t: "p", x: "Les Parties reconnaissent que cette référence ne constitue pas un élément essentiel du contrat de travail." },

    { t: "h", x: "Article 1. Engagement – Objet et durée du contrat" },
    { t: "p", x: `Le Centre de santé Ophtalmo Argenteuil engage ${P.mNom} à compter du ${dateVac} en qualité d’Ophtalmologue, pour une durée déterminée pour assurer le remplacement temporaire de ${remplace} habituellement employé dans le centre en qualité d’Ophtalmologue Statut Cadre, Positionnement 15, pendant son absence pour congés.` },
    { t: "p", x: `Le présent contrat à durée déterminée est conclu pour une durée d’une journée. Il prend effet le ${dateVac} à 9 heures et se terminera le ${dateVac} au soir.` },
    { t: "p", x: `${P.mNom}, qui accepte cet engagement, déclare formellement ne faire l'objet d'aucune restriction pouvant affecter la signature du présent contrat et/ou l'accomplissement de ses fonctions au sein du Centre de santé Ophtalmo Argenteuil.` },
    { t: "p", x: `${P.mNom} déclare au jour de la signature des présentes n’être tenu${P.e} à aucune clause de non-concurrence envers son ancien employeur ou ses autres employeurs éventuels.` },
    { t: "p", x: `${P.mNom} s’engage sur la véracité de l’ensemble des documents et renseignements remis lors de son embauche, ayant trait à sa situation propre. ${P.ilElle} est informé${P.e} que ces documents pourront être vérifiés, et ce conformément aux obligations incombant à l’employeur.` },
    { t: "p", x: "Dans l’hypothèse où les documents fournis auraient été falsifiés ou ne seraient plus valables, le Centre de santé Ophtalmo Argenteuil serait forcé d’envisager les mesures qui s’imposent." },
    { t: "p", x: `${P.mNom} s’engage à informer spontanément et immédiatement le Centre de santé Ophtalmo Argenteuil de toute modification postérieure à son engagement qui pourrait intervenir dans son état civil, sa situation familiale, ou son adresse.` },

    { t: "h", x: "Article 2. Fonctions" },
    { t: "p", x: `${P.mNom} est engagé${P.e} en qualité d’Ophtalmologue Statut Cadre, Positionnement 15 selon la Convention Collective applicable, au poste habituellement occupé par ${remplace}.` },
    { t: "p", x: `${P.mNom}, en sa qualité d’Ophtalmologue, recevra tous les patients que le Centre de santé Ophtalmo Argenteuil lui confiera et leur donnera ses soins consciencieux et attentifs, conformément aux dispositions de l’article R.4127-7 du Code de la santé publique.` },
    { t: "p", x: `${P.mNom} exercera ses fonctions dans le respect des procédures en place dans le Centre de santé Ophtalmo Argenteuil et rendra compte de ses fonctions à son supérieur hiérarchique et se conformera à ses instructions et directives administratives, ainsi qu’aux règles établies par la Direction du Centre.` },
    { t: "p", x: `En effet, ${P.mNom} n’est soumis${P.e} à un lien de subordination à l’égard de son employeur, que pour la détermination de ses conditions de travail sur le plan administratif, ${P.f ? "elle" : "il"} exerce donc ses fonctions en toute indépendance professionnelle en tant que praticien.` },

    { t: "h", x: "Article 3. Période d'essai" },
    { t: "p", x: "Le présent contrat n’est pas soumis à une période d’essai." },

    { t: "h", x: "Article 4. Lieu de travail" },
    { t: "p", x: `A titre d’information et sans que cette précision n’ait valeur contractuelle, il est précisé que ${P.mNom} exercera ses fonctions dans le Centre de santé Ophtalmo Argenteuil au 2 Rue Antonin Georges Belin, 95100 Argenteuil.` },

    { t: "h", x: "Article 5. Durée de travail" },
    { t: "p", x: `${P.mNom} exerce ses fonctions selon une durée journalière de travail de 9 heures, selon les horaires suivants : de 9 heures à 19 heures, avec 1 heure de pause.` },

    { t: "h", x: "Article 6. Rémunération" },
    { t: "p", x: "La rémunération fixée ci-après correspond à la durée du travail fixée à l’article 5 du présent contrat." },
    { t: "p", x: `En contrepartie de l’accomplissement de ses fonctions, ${P.mNom} percevra pour la journée travaillée une rémunération nette de ${remu} congés payés inclus, avant déduction des prélèvements sociaux (et étant précisé qu’un jour de travail équivaut à 9 heures).` },
    { t: "p", x: `Il est précisé qu’à cette rémunération, s’ajoutera, si elle est due conformément aux conditions légales en vigueur, une prime de précarité à hauteur de ${prime} (équivalant à environ 10% de la rémunération nette de base) le cas échéant.` },
    { t: "p", x: `La rémunération de ${P.mNom} est payée en fin de mois.` },
    { t: "p", x: `${P.mNom} se fera rembourser 50 % de son titre de transport sous réserve d’un justificatif selon les dispositifs légaux et conventionnels en vigueur.` },

    { t: "h", x: "Article 7. Absences" },
    { t: "p", x: "En cas d'incapacité de travail résultant de maladie ou d'accident, l'exécution du présent contrat sera suspendue dans les conditions déterminées par les dispositions légales, conventionnelles et réglementaires applicables." },
    { t: "p", x: `${P.mNom} est tenu${P.e} de prévenir immédiatement le Centre de santé Ophtalmo Argenteuil de son absence (initiale ou prolongée) et de lui faire parvenir dans les quarante-huit (48) heures un certificat médical pour justifier son absence et de la prolongation éventuelle de son indisponibilité.` },

    { t: "h", x: "Article 8. Retraite et prévoyance" },
    { t: "p", x: `${P.mNom} bénéficiera des avantages sociaux, consentis au personnel de sa catégorie, notamment en ce qui concerne le régime de retraite complémentaire et de prévoyance.` },
    { t: "li", x: "L’organisme de retraite complémentaire est le suivant : Malakoff AGIRC - ARCCO : 21, Rue Laffitte – 75317 Paris cedex 09" },
    { t: "li", x: "Le régime de prévoyance est le suivant : Swiss life prévoyance" },

    { t: "h", x: "Article 9. Exécution du contrat" },
    { t: "p", x: `${P.mNom} s’engage pendant toute la durée du présent contrat, à observer les prescriptions du Code de la santé publique qu’${P.f ? "elle" : "il"} déclare bien connaître et les règles et usages de la profession médicale, ainsi que le règlement intérieur du Centre de santé Ophtalmo Argenteuil.` },

    { t: "h", x: "Article 10. Loyauté" },
    { t: "p", x: `${P.mNom} s’engage à exercer ses fonctions avec toute la loyauté, la compétence et la diligence requises, dans le respect des lois applicables, des procédures du Centre de santé Ophtalmo Argenteuil, et à agir à tout moment au mieux des intérêts du Centre de santé Ophtalmo Argenteuil.` },
    { t: "p", x: `Ainsi, ${P.mNom} s’engage à ne dénigrer en aucune manière le Centre de santé Ophtalmo Argenteuil, à ne rien faire pouvant nuire à son image et/ou à sa réputation, à la situation financière, économique, commerciale ou administrative du Centre de santé Ophtalmo Argenteuil ou à celle de ses dirigeants ou pouvant lui porter préjudice.` },
    { t: "p", x: `Ces obligations perdureront sans limitation de durée après la cessation des fonctions de ${P.mNom} au sein du Centre de santé Ophtalmo Argenteuil.` },

    { t: "h", x: "Article 11. Moyens mis à disposition du Praticien" },
    { t: "h2", x: "Article 11-A : Equipements" },
    { t: "p", x: "Le Centre met à la disposition du Praticien pour toute la durée du contrat, l’ensemble de ses équipements et de ses installations techniques, qu’il s’engage à entretenir, modifier ou compléter, le cas échéant, de telle sorte qu’à tout moment lesdits équipements et installations techniques satisfassent aux conditions techniques de fonctionnement normatives, ainsi qu’aux impératifs réglementaires concernant la sécurité des malades." },
    { t: "p", x: "Le renouvellement du matériel nécessaire à l’exercice du Praticien et qui appartient à l’établissement, sera assuré en fonction des possibilités de ce dernier, et, dans la mesure du possible, après consultation du Praticien." },
    { t: "h2", x: "Article 11-B : Personnel" },
    { t: "p", x: "Le Centre assure de façon permanente au Praticien le concours d’un personnel quantitativement et qualitativement qualifié conformément aux normes imposées par les conditions techniques d’agrément, que ce personnel soit affecté aux services techniques ou aux services administratifs." },
    { t: "h2", x: "Article 11-C : Secret professionnel" },
    { t: "p", x: "Le Praticien est tenu au secret professionnel prévu par la loi et le Code de Déontologie qui lui est applicable." },
    { t: "p", x: "Le Centre s’engage à prendre toutes les mesures nécessaires pour assurer le respect du secret médical notamment en ce qui concerne l’accès et la configuration des locaux de consultations, le personnel mis à disposition du Praticien ou encore la tenue et la conservation des documents médicaux réglementaires." },
    { t: "p", x: "Parallèlement, le Centre s’oblige à prendre toutes dispositions pour que le courrier adressé personnellement au Praticien ne puisse être décacheté que par lui, ou par toute personne expressément habilitée par lui, et elle-même astreinte au secret médical." },

    { t: "h", x: "Article 12. Obligations du Praticien et indépendance" },
    { t: "h2", x: "Article 12.A : Droits des patients" },
    { t: "p", x: "Il est rappelé qu’en vertu de son statut, le Centre doit garantir l’accès égal à toute personne dont l’état requiert ses services." },
    { t: "p", x: "Par voie de conséquence, le Praticien s’engage à délivrer les consultations ou les actes de sa spécialité sans discrimination aux patients accueillis dans le Centre." },
    { t: "p", x: "En outre, le Praticien doit, dans toutes circonstances, respecter les droits fondamentaux du patient dont, notamment :" },
    { t: "li", x: "le libre choix," },
    { t: "li", x: "le libre consentement," },
    { t: "li", x: "le droit à l’information," },
    { t: "li", x: "le droit à la dignité," },
    { t: "li", x: "le droit à la confidentialité des informations." },
    { t: "h2", x: "Article 12.B : Qualité des soins" },
    { t: "p", x: "Le Praticien s’engage, conformément aux dispositions législatives, réglementaires et déontologiques en vigueur, à pratiquer son art dans le respect des règles de sécurité et eu égard aux données acquises de la science ; il s’oblige pour ce faire à entretenir de manière permanente ses compétences par tout moyen à sa convenance et notamment à participer aux séances de formation organisées par l’entité juridique à laquelle le Centre est affilié." },
    { t: "p", x: "En tout état de cause, le Praticien doit délivrer des soins consciencieux, éclairés et prudents, dans la plus stricte économie compatible avec l’efficacité des soins." },
    { t: "h2", x: "Article 12.C : Collaboration professionnelle" },
    { t: "p", x: "Le Praticien s’engage à collaborer avec les autres médecins et auxiliaires exerçant dans le Centre et/ou au sein de l’entité juridique à laquelle le Centre est affilié, en application des dispositions de l’article R. 4127-5 du Code de santé Publique portant Code de déontologie qui instituent son indépendance professionnelle." },
    { t: "p", x: "D’autre part dans ses rapports avec le personnel mis à sa disposition par le Centre, et en vertu des nouvelles dispositions légales, toute forme de harcèlement avéré du personnel, sanctionné par la loi, constituera une faute susceptible d’entraîner une sanction allant jusqu’au licenciement pour faute grave." },
    { t: "h2", x: "Article 12.D : Responsabilité professionnelle" },
    { t: "p", x: "Le Praticien exerce dans le Centre en toute indépendance technique, notamment en termes de prescriptions et de rythme des consultations pour un patient donné, et sous sa propre responsabilité." },
    { t: "p", x: "Conformément aux dispositions de la loi du 4 Mars 2002, le Centre a souscrit une assurance en ce qui concerne la Responsabilité Civile Professionnelle des Praticiens qu’il emploie." },
    { t: "p", x: "Pour autant, il est conseillé au Praticien de souscrire, à titre personnel, une assurance en responsabilité civile professionnelle. Le Praticien pourra également à tire personnel souscrire une assurance complémentaire en protection juridique pour le couvrir de toute faute éventuelle détachable de son service." },
    { t: "h2", x: "Article 12.E : Documents médicaux et administratifs" },
    { t: "p", x: "Le Praticien s’engage, selon les circonstances :" },
    { t: "li", x: "à tenir sous sa responsabilité les documents médicaux règlementaires imposés au Centre et dont celui-ci est dépositaire et qui relèvent de la compétence et du rôle propres du Praticien, tels que le dossier médical, les prescriptions, etc ;" },
    { t: "li", x: "à remplir ou à fournir au Centre dans des délais compatibles avec les impératifs de ce dernier, tous les imprimés, documents ou informations nécessaires au Centre pour respecter ses obligations envers tous ces créanciers et débiteurs et vis-à-vis des autorités de tutelle. Sont ainsi concernés l’ensemble des données d’activité nécessaires à l’établissement de la facturation et des statistiques d’activité." },
    { t: "p", x: "Pour satisfaire aux obligations immédiatement précitées, le Praticien s’oblige notamment à utiliser de manière exclusive les supports techniques de toute natures employés dans le Centre et qui sont la propriété de ce dernier (dossiers médicaux manuels et/ou informatisés, registres, cahiers, systèmes informatiques, etc)." },
    { t: "p", x: "Ces dispositions ne font pas obstacle à ce que le Praticien constitue en tant que de besoin et en sus, ses propres dossiers ou documents en utilisant des supports qui lui sont personnels." },
    { t: "p", x: "Le Praticien s’engage par ailleurs à apporter son concours actif au Centre pour la mise en place, le traitement et/ou le suivi en son sein :" },
    { t: "li", x: "d’enquêtes médico-administratives diligentées par les autorités de tutelle" },
    { t: "li", x: "de structures et procédures internes de contrôle ou d’amélioration de la qualité, prévues dans les éventuelles procédures de certification ou d’accréditation." },
    { t: "h2", x: "Article 12.F : Fonctionnement de l’établissement" },
    { t: "p", x: "Le Praticien s’engage à respecter l’ensemble des règlements et usages dans le Centre notamment :" },
    { t: "li", x: "les termes des conventions de coopération conclues ou à conclure entre le Centre et différents établissement ou professionnels de santé" },
    { t: "li", x: "les horaires et conditions de travail du personnel du Centre," },
    { t: "li", x: "l’organisation de l’accès aux locaux techniques du Centre." },
    { t: "li", x: "Le règlement intérieur du Centre" },
    { t: "p", x: "Dont il reconnaît avoir été mis au courant à la date de signature du présent contrat." },
    { t: "h2", x: "Article 12.G : Indépendance" },
    { t: "p", x: "Le Praticien exercera son art en toute indépendance." },
    { t: "p", x: "L’Association s'engage notamment à ne faire aucune pression d'aucune sorte sur lui en ce qui concerne les prescriptions d’examens complémentaires, et de traitements." },
    { t: "p", x: "Le Praticien sera néanmoins tenu, en application de l'article 258 du Code de la Sécurité Sociale et, de manière générale, dans le cadre de la législation et de la réglementation en vigueur, d'observer, dans ses prescriptions, la plus stricte économie compatible avec l'efficacité du traitement." },
    { t: "p", x: "Le Praticien ne sera tenu à aucune norme de productivité, de rendement horaire ni à toute autre disposition qui aurait pour conséquence une limitation et/ou l'abandon de son indépendance." },
    { t: "p", x: "Le Praticien s’engage scrupuleusement à respecter :" },
    { t: "li", x: "Les dispositions de la nomenclature générales des actes professionnels et les tarifs fixés par le service conformément à la réglementation en vigueur." },
    { t: "li", x: "Les dispositions des conventions liant le Centre médical social aux organismes d'assurance maladie." },
    { t: "li", x: "A constituer et à tenir à jour pour chaque patient un dossier médical conforme aux dispositions réglementaires." },
    { t: "li", x: "A ne pas dispenser des soins à un nombre de patient incompatible avec la pratique consciencieuse de son art" },

    { t: "h", x: "Article 13. Traitement automatisé des données" },
    { t: "p", x: "Pour satisfaire à ses obligations notamment vis-à-vis de la sécurité sociale, le Centre recourt au traitement automatisé d’informations nominatives." },
    { t: "p", x: "Ce traitement s’effectue dans le cadre des dispositions de la loi relative à l’informatique, aux fichiers et aux libertés." },
    { t: "p", x: "Le droit d’accès à ces traitements automatisé, tant des patients que des tiers ou des Praticiens qui ont contribué à compiler ou à traiter les données, s’exerce dans les conditions définies par les dispositions règlementaires applicables à chaque type de traitement." },

    { t: "h", x: "Article 14. Conseil de l’ordre nationale des Médecins" },
    { t: "p", x: "Le Praticien communiquera un exemplaire du présent contrat établi conformément à l’article L4113-9 du code de la santé publique à son conseil départemental de l'ordre." },
    { t: "p", x: "Il en sera de même pour tout avenant ou modification ultérieurs éventuels." },

    { t: "h", x: "Article 15. Déclarations et engagements divers" },
    { t: "p", x: `${P.mNom} s'engage à se conformer :` },
    { t: "li", x: "aux dispositions légales, réglementaires, conventionnelles et contractuelles ;" },
    { t: "li", x: "aux dispositions prévues par les règlements, politiques et chartes, notamment en ce qui concerne l’hygiène et la sécurité ; Incluant le port obligatoire de la blouse et du badge ;" },
    { t: "li", x: "aux règles générales et permanentes de discipline et de vie en entreprise, en vigueur au sein du Centre de santé Ophtalmo Argenteuil ;" },
    { t: "li", x: "à toutes les instructions et consignes particulières de travail qui lui seront données." },
    { t: "p", x: "Les stipulations du contrat de travail annulent et remplacent de plein droit celles contenues dans tout document, correspondance ou communication écrite ou orale, échangés entre les Parties avant la signature du présent contrat de travail et relatives à l'objet de ce dernier." },
    { t: "p", x: `${P.mNom} reconnaît avoir pris connaissance du présent contrat, en accepte les modalités et s'engage expressément à les respecter.` },

    { t: "h", x: "Article 16. Fin du contrat, renouvellement et rupture" },
    { t: "p", x: `Le présent contrat prendra fin de plein droit et sans formalité à l'échéance de son terme, soit à la date du ${dateVac}.` },
    { t: "p", x: "Chacune des deux Parties se réserve mutuellement le droit de mettre fin au contrat immédiatement en cas de faute grave de l'autre Partie (dans ce cas, sans indemnité) ou de force majeure." },

    { t: "h", x: "Article 17. Indemnités de précarité d’emploi" },
    { t: "p", x: `Au terme de son contrat, ${P.mNom} percevra une indemnité de fin de contrat aux conditions légales en vigueur.` },

    { t: "h", x: "Article 18. Vidéosurveillance" },
    { t: "h2", x: "18.1 Objet du traitement, données et catégorie de personnes concernées" },
    { t: "p", x: `Afin de mieux assurer la sécurité des personnes et des biens, notamment compte tenu de l’activité de l’Association, le Centre de santé Ophtalmo Argenteuil a installé des caméras dans ses locaux, ce dont ${P.mNom} reconnait être parfaitement informé${P.e} par le présent article, conformément aux dispositions de la Loi du 6 janvier 1978 relative à l'informatique, aux fichiers et aux libertés, modifiée par la Loi relative à la protection des personnes physiques à l'égard des traitements de données à caractère personnel du 6 août 2004.` },
    { t: "p", x: "Les salariés de l’Association sont filmés par le dispositif mis en place. Les visiteurs occasionnels des locaux et patients du Centre de santé Ophtalmo Argenteuil sont également susceptibles d’être filmés." },
    { t: "p", x: "Les images enregistrées dans ce dispositif ne sont pas utilisées à des fins de surveillance du personnel ni de contrôle des horaires." },
    { t: "p", x: "Ces images n’ont aucun caractère ni objectif commercial ou publicitaire." },
    { t: "h2", x: "18.2 Visionnage" },
    { t: "p", x: "Les images peuvent être visionnées de manière sécurisée, en cas d’incident, par la Direction du Centre. La Direction du Centre en charge de la maintenance du matériel peut également accéder aux images, à cette seule fin." },
    { t: "p", x: "La base légale du traitement est l’intérêt légitime (cf. article 6.1.f) du Règlement européen sur la protection des données." },
    { t: "h2", x: "18.3 Durée de conservation" },
    { t: "p", x: "Les images sont conservées 1 mois." },
    { t: "p", x: "En cas d’incident lié à la sécurité des personnes et des biens, les images de vidéosurveillance peuvent néanmoins être extraites du dispositif. Elles sont alors conservées sur un autre support le temps du règlement des procédures liées à cet incident et accessibles aux seules personnes habilitées dans ce cadre." },
    { t: "h2", x: "18.4 Droits Informatiques et Libertés" },
    { t: "li", x: `Droit d’accès : ${P.mNom} peut accéder aux données le concernant ou demander leur effacement.` },
    { t: "li", x: `Droit d’opposition et limitation du traitement des données : ${P.mNom} dispose également d'un droit d’opposition et d’un droit à la limitation du traitement de ses données (cf. cnil.fr pour plus d’informations sur vos droits).` },
    { t: "p", x: `Pour exercer ces droits Informatiques et Libertés ou pour toute question sur le traitement de ses données dans ce dispositif, ${P.mNom} peut contacter la Direction du Centre à l’adresse e-mail suivante : ophta95100@gmail.com` },
    { t: "p", x: `Si ${P.mNom} estime, après avoir contacté la Direction du Centre, que ses droits Informatique et Libertés ne sont pas respectés ou que le dispositif vidéo n’est pas conforme aux règles de protection des données, ${P.f ? "elle" : "il"} peut adresser une réclamation en ligne à la CNIL (Commission nationale de l’informatique et des libertés) sur cnil.fr/plaintes.` },

    { t: "h", x: "Article 19. Dispositions finales" },
    { t: "p", x: "Toutes les contestations qui pourraient s’élever entre les Parties sur la validité, l’interprétation, l’exécution ou la résolution de leur présente convention pourront, avant toute action en justice, être soumises à une tentative de conciliation devant le président du conseil départemental de l’ordre conformément aux dispositions de l’article R.4127-56 du code de la santé publique." },
    { t: "p", x: "En cas de désaccord sur l’interprétation, l’exécution ou la résiliation du présent contrat, les parties s’engagent, préalablement à toute action contentieuse, à soumettre leur différend à deux conciliateurs, l’un étant désigné parmi les membres du Conseil de l’Ordre." },
    { t: "p", x: "Ceux-ci s’efforceront de trouver une solution amiable, dans un délai maximum de trois mois à compter de la désignation du premier des conciliateurs." },
    { t: "p", x: "***" },
  ];
}

// Coupe une ligne en morceaux tenant dans `largeur` points.
function couper(texte, font, taille, largeur) {
  const lignes = [];
  for (const brute of texte.split("\n")) {
    const mots = brute.split(/\s+/).filter(Boolean);
    let ligne = "";
    for (const mot of mots) {
      const essai = ligne ? ligne + " " + mot : mot;
      if (font.widthOfTextAtSize(essai, taille) > largeur && ligne) { lignes.push(ligne); ligne = mot; }
      else ligne = essai;
    }
    lignes.push(ligne);
  }
  return lignes;
}

// Génère le PDF. tamponBytes : image JPEG/PNG du tampon du centre (ou null).
export async function genererContratPdf(resa, slot, cfg, tamponBytes, tamponMime) {
  const doc = await PDFDocument.create();
  const police = await doc.embedFont(StandardFonts.TimesRoman);
  const gras = await doc.embedFont(StandardFonts.TimesRomanBold);
  let tampon = null;
  if (tamponBytes) {
    try {
      tampon = (tamponMime || "").includes("png")
        ? await doc.embedPng(tamponBytes)
        : await doc.embedJpg(tamponBytes);
    } catch { tampon = null; }
  }

  const largeur = PAGE_L - 2 * MARGE;
  let page = doc.addPage([PAGE_L, PAGE_H]);
  let y = PAGE_H - MARGE;

  const nouvellePage = () => { page = doc.addPage([PAGE_L, PAGE_H]); y = PAGE_H - MARGE; };
  const assurer = (h) => { if (y - h < BAS) nouvellePage(); };

  const ecrire = (texte, { f = police, taille = 10.5, interligne = 13.2, avant = 0, apres = 6, retrait = 0, centre = false } = {}) => {
    y -= avant;
    const lignes = couper(texte, f, taille, largeur - retrait);
    for (const l of lignes) {
      assurer(interligne);
      const x = centre ? (PAGE_L - f.widthOfTextAtSize(l, taille)) / 2 : MARGE + retrait;
      page.drawText(l, { x, y: y - taille, size: taille, font: f, color: rgb(0.05, 0.05, 0.1) });
      y -= interligne;
    }
    y -= apres;
  };

  const P = formes(resa);
  for (const b of blocsContrat(resa, slot, cfg)) {
    if (b.t === "titre") { for (const l of b.x.split("\n")) ecrire(l, { f: gras, taille: 14, interligne: 18, apres: 2, centre: true }); y -= 12; }
    else if (b.t === "h") ecrire(b.x, { f: gras, taille: 11.5, avant: 8, apres: 5 });
    else if (b.t === "h2") ecrire(b.x, { f: gras, taille: 10.5, avant: 4, apres: 4 });
    else if (b.t === "li") ecrire("•  " + b.x, { retrait: 14, apres: 3 });
    else ecrire(b.x);
  }

  // Bloc signatures (dernière page ; saute une page si trop bas)
  assurer(230);
  const dateJour = new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" });
  ecrire(`Fait à Argenteuil en trois exemplaires originaux, le ${dateJour}.`, { avant: 8 });
  const yBloc = y;
  const col2 = PAGE_L / 2 + 10;
  page.drawText("Pour le Centre de santé Ophtalmo Argenteuil*", { x: MARGE, y: yBloc - 12, size: 10.5, font: gras });
  page.drawText("Pour le Praticien*", { x: col2, y: yBloc - 12, size: 10.5, font: gras });
  if (tampon) {
    const dims = tampon.scale(Math.min(170 / tampon.width, 110 / tampon.height));
    page.drawImage(tampon, { x: MARGE, y: yBloc - 30 - dims.height, width: dims.width, height: dims.height });
  } else {
    page.drawText("(tampon et signature)", { x: MARGE, y: yBloc - 60, size: 9, font: police, color: rgb(0.5, 0.5, 0.5) });
  }
  page.drawText(`Dr ${P.nom}`, { x: col2, y: yBloc - 32, size: 10.5, font: police });
  page.drawText("Signature, précédée de « Lu et approuvé » :", { x: col2, y: yBloc - 48, size: 9, font: police, color: rgb(0.4, 0.4, 0.45) });
  y = yBloc - 160;
  ecrire("*Les signatures seront précédées de la mention manuscrite \"Lu et approuvé\". Chacune des pages autres que la dernière doit être paraphée par chacune des Parties.", { taille: 8.5, interligne: 10.5, avant: 6 });

  // Paraphe employeur (tampon réduit) + numérotation sur chaque page sauf la dernière
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    p.drawText(`Page ${i + 1} / ${pages.length}`, { x: PAGE_L - MARGE - 50, y: 30, size: 8, font: police, color: rgb(0.5, 0.5, 0.55) });
    if (i < pages.length - 1) {
      p.drawText("Paraphes :", { x: MARGE, y: 34, size: 8, font: police, color: rgb(0.5, 0.5, 0.55) });
      if (tampon) {
        const d = tampon.scale(Math.min(55 / tampon.width, 34 / tampon.height));
        p.drawImage(tampon, { x: MARGE + 45, y: 24, width: d.width, height: d.height });
      }
    }
  });

  return doc.save();
}
