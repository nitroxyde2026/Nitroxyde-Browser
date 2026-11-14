PUBLIER nitroxyde.fr
====================

Le site est statique : des pages HTML, une feuille de style, un script, des images et un fichier version.json.
Il n'y a rien à programmer côté serveur.

1) CHOISIR UN HÉBERGEUR
   Gratuit : Cloudflare Pages, Netlify ou GitHub Pages (envoi du dossier ou lien avec un dépôt).
   Payant classique : OVH, o2switch, etc. (dépose les fichiers par FTP à la racine du site, le fichier .htaccess fourni
   force le HTTPS et affiche la page 404).
   Ensuite, relie nitroxyde.fr à l'hébergeur avec les réglages DNS qu'il t'indique. Le site doit être en HTTPS :
   le navigateur Nitroxyde refuse une adresse de mise à jour qui n'est pas en https.

2) PUBLIER UNE VERSION DU NAVIGATEUR
   a. Dans le projet du navigateur : npm run dist  (les installateurs apparaissent dans le dossier dist/).
   b. Dans le dossier du site : node outils/publier.js ..\nitroxyde-navigation\dist
      (adapte le chemin). Le script copie les installateurs dans telecharger/, calcule les empreintes SHA-256
      et met à jour version.json : la page de téléchargement affiche alors la bonne version et les empreintes.
   c. Envoie tout le dossier du site sur l'hébergeur.
   Les boutons macOS et Linux restent « Bientôt disponible » tant qu'aucun fichier correspondant n'a été publié.

3) MISES À JOUR DANS LE NAVIGATEUR
   Dix secondes après le démarrage, Nitroxyde lit https://nitroxyde.fr/version.json. Si "version" est plus récente que
   celle installée, il affiche une notification qui ouvre la page de téléchargement. Ce n'est pas une mise à jour
   automatique : l'utilisateur retélécharge l'installateur.

4) À COMPLÉTER AVANT LA MISE EN LIGNE
   - mentions-legales.html : éditeur, contact et hébergeur (zones surlignées en jaune).
   - confidentialite.html : date de dernière mise à jour.
   - Une adresse de contact, pour que les visiteurs bloqués puissent t'écrire.

5) FAUX POSITIFS ANTIVIRUS
   Un programme non signé peut être signalé à tort. Tu peux envoyer le fichier à Microsoft pour analyse
   (recherche « Microsoft Security Intelligence, soumettre un fichier ») afin de réduire les alertes de Defender.
