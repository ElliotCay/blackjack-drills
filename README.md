# Blackjack Drills

Entraînement au blackjack tel qu'il se joue dans les casinos français.

**En ligne : <https://elliotcay.github.io/blackjack-drills/>** — l'app est
statique et garde tout en local, elle fonctionne donc aussi hors connexion une
fois chargée sur le téléphone.

```bash
npm install
npm run dev      # http://localhost:5180
npm run check    # types + tests, à lancer avant de pousser
npm run build
```

Le port 5180 est fixé (`strictPort`) pour ne pas entrer en conflit avec les
autres serveurs de développement de la machine.

Aucune donnée ne quitte le navigateur : progression, bankroll et réglages
vivent dans le `localStorage`.

## Deux modes

- **Drill** — une main face à la carte du croupier, tu réponds, l'app corrige et
  fait revenir plus souvent les cases que tu rates.
- **Partie réelle** — un sabot de six jeux, une bankroll, des mises ; l'app
  relève tes écarts à la stratégie optimale.

Un **toggle « conseils »** commun aux deux modes : avec l'espérance de chaque
action affichée avant la décision, ou dans les conditions du casino.

## Règles implémentées

Preset des casinos français, conforme aux
[articles 55-4 à 55-5](https://www.legifrance.gouv.fr/codes/id/LEGISCTA000006138051/)
sur les règles du black-jack :

| Règle | Valeur |
|---|---|
| Sabot | 6 jeux de 52 |
| Croupier | Tire à 16, reste à 17 — y compris 17 souple |
| Carte cachée | Aucune : 2ᵉ carte prise après le tour des joueurs |
| Blackjack du croupier | Emporte aussi les mises doublées et séparées |
| Double | Sur tout total initial, et après séparation |
| Séparation | Une seule fois ; as séparés : une carte chacun |
| Blackjack | Payé 3 pour 2 |
| Assurance | Payée 2 pour 1 |
| Abandon | Non proposé |

Attention au contresens répandu : plusieurs sources affirment qu'on ne double
qu'en 9/10/11 en France. Le texte réglementaire dit le contraire.

## Pourquoi la stratégie est calculée et non recopiée

Une table de stratégie trouvée en ligne suppose presque toujours un croupier à
carte cachée. En France, il complète sa main *après* ton tour, et son blackjack
emporte alors les mises doublées ou séparées. Quatre cases changent de réponse :

| Main | Croupier | Table américaine | Table française |
|---|---|---|---|
| 11 | 10 | Doubler | Tirer |
| 8,8 | 10 | Séparer | Tirer |
| 8,8 | As | Séparer | Tirer |
| A,A | As | Séparer | Tirer |

`src/engine/` calcule donc la décision optimale par récursion exacte sur la
distribution du croupier, pour le jeu de règles choisi. L'app marque ces cases
comme pièges quand elle te corrige.

La suite de tests vérifie ces déviations, recoupe les probabilités de bust du
croupier avec les tables publiées (moins de 0,5 point d'écart sur les dix cartes
visibles) et contrôle une trentaine de cases de référence.

## Comment le drill choisit les mains

Un tirage uniforme ferait réviser « 20 contre 6 » aussi souvent que les cases
difficiles. Le poids d'une case est donc le produit de trois quantités :

    fréquence réelle  ×  coût d'une erreur  ×  méconnaissance

La première vient du sabot, la deuxième de l'écart d'espérance entre la bonne
action et la deuxième meilleure, la troisième d'un système de boîtes à la
Leitner. Le produit est l'espérance de gain à réviser cette case-là.

Conséquence assumée : « 16 contre 5 » passe devant « 16 contre 10 » bien que ce
dernier soit plus fréquent — tirer et rester y sont presque équivalents, donc
l'erreur n'y coûte presque rien.

## Le chiffre qui fait progresser

Le bilan de partie affiche trois montants plutôt qu'un solde : le résultat réel,
le coût de tes écarts à la stratégie, et le résultat corrigé de ces écarts.
L'écart entre les deux derniers, c'est la variance ; le reste, c'est le jeu.
Sans cette séparation, une session perdante n'apprend rien et une session
gagnante conforte les erreurs.

## Développement

    src/engine/    cartes, règles, distribution du croupier, EV, table de stratégie
    src/drill/     sélection pondérée des mains, boîtes de Leitner, agrégats
    src/game/      sabot, déroulé du coup, paiements, bankroll
    src/ui/        les quatre écrans

105 tests, dont : les quatre déviations françaises, les probabilités de bust du
croupier recoupées avec les tables publiées, une trentaine de cases de
référence, la conservation des jetons sur 10 000 mains simulées, et le parcours
des écrans exercé comme un utilisateur.
