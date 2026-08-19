---
name: astrologia-growth
description: >
  Machine de croissance d'AStrologIA (astrologia-love.netlify.app/) —
  production de vidéos TikTok/Reels via Higgsfield, prédiction de viralité,
  publication, kit de marque, hooks FR/EN/ES, et pilotage de la boucle virale.
  Déclencher pour : "vidéo du jour", "contenu astrologia", "poste sur tiktok",
  "campagne", "hook", "croissance", "stats de lancement", ou toute demande
  marketing/contenu liée à AStrologIA.
---

# AStrologIA — Machine de croissance

## L'app
- URL publique : https://astrologia-love.netlify.app/ (domaine dédié à venir — vérifier avant de publier du contenu)
- Pitch : « Tes messages WhatsApp face aux astres. Un seul dira la vérité. » Analyse 100% locale, gratuite, FR/EN/ES.
- Monétisation : Pack Cosmique 4,99€ (Stripe Payment Link — vérifier s'il est actif dans l'app), waitlists « pack-cosmique » et « rencontres » (Netlify Forms, dashboard Netlify → Forms).

## Kit de marque
- Couleurs : fond nuit `#0b0d1e`→`#151038`, or `#e8c56b`, violet `#8b7bff`, bleu `#5a8bff`, rose `#f472b6`.
- Typo : Unbounded (titres), Outfit (texte).
- Univers : les 12 Dieux du Zodiaque (assets dans `astrologia/media/`, sources Higgsfield dans `.github/workflows/zodiac-media.yml`). Léo = « Lionne voilée de lumière » (soul CLEO, visage deviné). Vierge = bouquet de roses célestes.
- Signatures cachées (ne jamais divulguer publiquement, ce sont des easter eggs) : triangle de Sirius sur l'accueil (tap = message caché), AS de AStrologIA.
- Ton : cosmique + cash. L'astro promet, les données tranchent. Jamais méchant gratuitement, toujours drôle-cruel.

## Production vidéo (Higgsfield)
1. `get_workflow_instructions` (catalogue) → choisir le workflow UGC/ad adapté au format du jour.
2. Modèles éprouvés sur ce compte : images `soul_2` (2K), vidéos `seedance_2_0` (1080p, 5 s, `generate_audio:false`, ~45 crédits) ; secours anti-filtre : `kling3_0` mode pro (~9 crédits).
3. TOUJOURS passer la vidéo finale dans `virality_predictor` avant publication. Seuil : si hook/rétention faibles → régénérer avec un autre hook. Ne jamais publier une vidéo sous la moyenne.
4. Publication : `tiktok_connect` (une fois) puis `tiktok_prepare_publish` + `tiktok_publish`. Instagram Reels : republier manuellement la même vidéo (pas d'API).
5. Budget : vérifier `balance` avant toute série. Ne pas descendre sous 200 crédits sans accord de Yohann.

## Les 14 formats du calendrier (rotation)
1. Hook démo : « J'ai créé une IA qui lit vos conversations et dit QUI aime le plus »
2. Réaction en direct (score choc d'un couple réel anonymisé)
3. « L'astro dit 81%, ses messages disent 32%. Quelqu'un ment. »
4. Red flags : « 33% de ses messages font moins de 5 caractères »
5. Le Défi Couple : « envoie-lui SA version, compare les verdicts »
6. Les records : « on répond plus vite que 91% des couples »
7. Dieux du Zodiaque (les vidéos de `astrologia/media/` en montage)
8. Mode horoscope mensuel : « Mercure rétrograde explique ses "ok" »
9. UGC bait : « fais le test avec ton crush et filme sa tête »
10. La courbe cruelle : « en janvier il répondait en 20 min, en mai : 1h30 »
11. Archétypes tarot : « quel Anxieux Romantique es-tu ? »
12. « L'IA a prédit notre rupture » (format témoignage)
13. Avant/après : conversation saine vs conversation toxique
14. L'easter egg tease : « il y a un secret caché dans l'app » (sans le révéler)

## Hooks vérifiés (première seconde)
- FR : « Ton crush ne t'aime pas. Ses messages le prouvent. » / « L'astrologie vous a menti. Vos textos, jamais. » / « 4h pour répondre "oui". Voilà ce que ça veut dire. »
- EN : "Your texts don't lie. The stars might." / "I ran my situationship through an AI. It ended us."
- ES : « Tus mensajes no mienten. Los astros sí. » / « La IA leyó nuestra conversación. Terminamos. »

## Règles de publication
- 1 vidéo/jour minimum pendant les 14 premiers jours, heure locale 18h-20h.
- Lien en bio TOUJOURS : l'app. CTA vidéo : « lien en bio, gratuit, rien ne quitte ton tel ».
- Hashtags : #astrologie #redflag #couple #wrapped + langue locale. Jamais plus de 5.
- Ne JAMAIS montrer de vraie conversation identifiable sans flouter noms/photos.
- Le 1er du mois = jour horoscope (le contenu de l'app change) → vidéo dédiée.

## Boucles produit à surveiller (dans l'app)
Défi Couple (bouton ⚔️), percentiles « Vous vs le monde », image story avec watermark URL, waitlists. Si une boucle casse (test Playwright dans le scratchpad des sessions précédentes ou refaire un parcours démo), la réparer AVANT de publier du contenu.

## Métriques hebdo à rapporter à Yohann
Visites (analytics du site si branché), inscrits waitlists (Netlify → Forms), followers TikTok/IG, vues par vidéo, top hook. Format : 5 lignes max, tendance vs semaine passée, une recommandation.
