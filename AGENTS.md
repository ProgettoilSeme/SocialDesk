# SocialDesk — istruzioni per chi sviluppa

App desktop (Electron) per organizzare i post social di uno o più clienti: cartelle dei post,
file Illustrator dai template, testi in Markdown e piano editoriale Excel. Interfaccia e
conversazione in **italiano**; spiegazioni all'utente brevi e non tecniche.

Il progetto funziona: leggere il codice prima di modificarlo, non ricostruirlo. Le nuove
richieste dell'utente prevalgono su queste note. La storia delle versioni è nei commit
(`git log`), non qui.

## Modo di lavorare

- Sviluppo sul ramo `dev`. `main` contiene l'ultima versione rilasciata e si aggiorna (merge) solo
  su richiesta. Commit, push, compilazione e pubblicazione solo quando l'utente lo chiede.
- Versioni: `X.Y.Z` in `package.json` (`npm version X.Y.Z --no-git-tag-version`); `Y` per nuove
  funzioni, `Z` per correzioni e ritocchi. Aggiungere qui solo ciò che cambia le regole.
- Prove sempre su copie: mai test o titoli finti nel piano o nelle cartelle reali dei clienti.
- Dopo una modifica all'interfaccia: prova in Electron (Playwright) su una copia, anche a 390 px
  di larghezza, senza scorrimento orizzontale né errori in console.

## Avvio, test, compilazione, rilascio

- `npm ci`, poi `npm start`.
- `npm test`: richiede `SOCIAL_TEST_FIXTURE` (copia di una cartella Social di prova con piano
  2026 senza ID, template `base <Social>.ai`); `SOCIAL_TEST_TEMP` facoltativo. Per le prove
  dell'interfaccia: `SOCIAL_TEST_ROOT` (cartella Social di prova) e `SOCIAL_TEST_USER_DATA`.
- `SOCIAL_DIST=<cartella> SOCIAL_NOTES="…" npm run package`: app Mac (Apple Silicon, firma ad hoc,
  zip) e installer Windows (NSIS per utente, senza amministratore), più `versione.json`.
  Le copie locali vanno in `Mac/` e `Windows/` del progetto (fuori da git).
- `npm run release -- <cartella della compilazione>`: crea su GitHub la Release `vX.Y.Z` con
  `SocialDesk-Mac.zip`, `SocialDesk-Setup-X.Y.Z.exe` e `versione.json` (il commit deve essere già
  su GitHub). È pubblico: solo su richiesta.
- Non cambiare `appId`/bundle id `it.progettoilseme.social` né `productName`: identificano
  l'installazione esistente.

## Aggiornamenti

`lib/update.cjs` legge l'ultima Release del repository in `package.json` → `updates.github`
(deve essere pubblico): `…/releases/latest/download/versione.json` =
`{version, notes, mac:{file,size,sha256}, windows:{file,size,sha256}}`. Scarica il file del
proprio sistema in una cartella temporanea, controlla dimensione e SHA-256, poi:
- Mac: estrae lo zip accanto all'app in uso, verifica la versione nell'Info.plist, uno script
  aspetta la chiusura, scambia le app (rimette la vecchia se qualcosa va storto) e riapre;
- Windows: avvia l'installer con `--updated /S --force-run`.

Il renderer non passa mai percorsi o indirizzi. `SOCIAL_UPDATE_URL` sostituisce l'indirizzo
solo per le prove. App Mac senza firma Apple: scaricata dal browser mostra l'avviso di
sviluppatore non verificato; gli aggiornamenti fatti dall'app no.

## Architettura

Electron 45, CommonJS, HTML/CSS/JS senza framework. Interfaccia con la libreria **myPgs**
(dipendenza git, ramo `dev`; `.npmrc` ha `allow-git=root`) e le icone `@marcix/myicons`;
anteprima dei file Illustrator con `pdfjs-dist`; Excel modificato con `fflate` + `@xmldom/xmldom`.

- `main.cjs`: finestra, preferenze del computer (`social-preferences.json`: cartella Social e
  cliente in uso), dialoghi nativi, IPC (`endpoint(...)`, mittente controllato, un'operazione per
  volta con `busy`), avanzamento verso il renderer (`social:progress`), menu del tasto destro.
- `preload.cjs`: API minima. Mantenere contextIsolation, sandbox, niente nodeIntegration, CSP,
  nessun accesso libero al filesystem dal renderer.
- `ui/index.html`, `ui/renderer.js` (stato, pagine, modali), `ui/styles.css` (solo dettagli del
  progetto), `ui/post-filters.js`, `ui/markdown.js`, `ui/illustrator-preview.js`.
- `lib/`: `clients` (clienti), `folders` (cartelle fisse), `settings` (impostazioni del cliente),
  `posts` (creazione, piattaforme e formati, template, controlli comuni), `workbook` (XLSX),
  `editor`, `status`, `drafts`, `delete`, `addchannel`, `regenerate`, `relink`, `details`,
  `illustrator`, `ideas`, `assets`, `templates`, `layout`, `dates`, `update`, `safe-fs`.
- `test/*.test.cjs`: test del backend (`node --test`).

## Dati: cartella Social e clienti

- La cartella **Social** (scelta in Impostazioni dell'app, ricordata per computer) contiene una
  cartella per **cliente**: è un cliente ogni sottocartella diretta con `Piano editoriale.xlsx`
  (escluse quelle che iniziano con `.`, `@`, `#`, `~` e i nomi riservati). Nome mostrato = nome
  della cartella con spazi al posto di `_`; rinominare il cliente = rinominare la cartella.
- Struttura fissa di ogni cliente: `Piano editoriale.xlsx`, `00_Cestino`, `01_Posts`,
  `02_Settings` (`settings.json`, `idee.json`, logo, sfondo), `03_Template` (template `.ai`,
  `Archivio asset`). `lib/folders.cjs` accetta anche i vecchi nomi (`00_cestino`, `00_Settings`,
  `00_template`). Un nuovo cliente nasce con piano vuoto (`lib/templates/piano-vuoto.xlsx`) e
  cartelle vuote.
- Post: `01_Posts/<anno>/<ID a 3 cifre>_<Titolo>/{01_Sorgenti,02_Asset,03_Export}`, una cartella
  per post comune a tutti i social. In `01_Sorgenti` i file hanno il suffisso del social:
  `Titolo_instagram.ai`, `Titolo_instagram.md`. Il nome della cartella non contiene la data.
  Il codice legge ancora la vecchia struttura per social (`01_Facebook/<anno>/MM-GG_Titolo`).
- I nomi con accenti possono essere NFD sulla cartella condivisa e NFC nel piano: usare
  `layout.existingPath`.
- `02_Asset` contiene solo immagini e resta il posto dei file collegati da Illustrator.

## Piano editoriale Excel

- Una scheda per anno (`2026`, `2027`…), intestazioni cercate per nome, non per posizione.
  Colonne: A ID, B Canale, C Data, D Titolo, E Argomento, F Formato, G Stato, H Cartella
  Sorgenti (link relativo alla cartella del cliente, etichetta `Apri sorgenti`).
- Una riga per social; i social dello stesso post hanno lo stesso ID. Gli ID ripartono da 0 ogni
  anno (massimo + 1). Un anno/ID compare una sola volta per social.
- Data da definire = cella vuota. Date Excel vere (anche calendario 1904); testi mai come formule.
- Stati: `testi da creare` (iniziale, non chiesto in creazione), `testi in bozza`,
  `immagine da creare`, `da pubblicare`, `pubblicato`.
- Ogni scrittura: piano chiuso in Excel/Numbers/LibreOffice (`checkExcelClosed`), revisione
  (SHA-256) uguale a quella letta, lock `.social-create.lock` nella cartella del cliente, file
  preparato in `.social-stage-*`, backup in `.social-backups/`, poi sostituzione. Modifiche mirate
  dell'XML: conservare stili, tabelle, filtri, convalide, link. Non promettere transazioni a
  prova di interruzione della rete.

## Piattaforme, formati, template

- Piattaforme (`lib/posts.cjs` → `CHANNELS`): Facebook, Instagram, LinkedIn (predefinite), Blog,
  TikTok, YouTube, X, Reddit, ognuna con i suoi formati. Il cliente sceglie le sue in
  Impostazioni del cliente (almeno una).
- Formati da immagine (`Immagine singola`, `Carosello`, `Storia foto`, `Articolo`) → copia del
  template `03_Template/<Piattaforma> - <Formato>.ai` (se manca, `base <Piattaforma>.ai`); formati
  video (`Video`, `Reel`, `Storia video`, `Shorts`) → `.mp4` vuoto; formato da definire → solo
  il `.md`. Il file si crea anche quando il formato si sceglie dopo (Modifica o Rigenera).
- Testi dei post in Markdown semplice (`ui/markdown.js`); `.txt` ancora letti.
- Non riscrivere i collegamenti interni dei file Illustrator (decisione dell'utente).

## Interfaccia (myPgs)

- Prima di toccare l'interfaccia leggere `node_modules/mypgs/AGENTS-USAGE.md` e i riferimenti in
  `node_modules/mypgs/reference/html/`; dopo un aggiornamento di myPgs leggere `migration.md`.
  Usare i componenti con gli attributi `pgs`/`pgs-state`/`pgs-data`, non ricrearli a mano; dopo
  ogni `innerHTML` chiamare `pgs.helper.init` (`enhance`). Preferire le opzioni di myPgs a regole
  CSS proprie (es. `btnPaddingEqual`, `gapNone`).
- `btnCurrent` si attiva solo con `aria-current="page"` o `aria-selected="true"`.
- myPgs chiude le altre modali quando se ne apre una: una modale sopra un'altra va scritta dentro
  di essa (`createModal` lo fa). Esc, X e sfondo passano da `modal.request()` per rispettare
  salvataggi e conferme. Un dropdown ridisegnato mentre è aperto resta «aperto»: chiuderlo prima.
- In myPgs `1rem` = 10 px. Il colore del cliente sostituisce `--color-primary` su `:root`.
- Toast di avanzamento (`progressToast`) per le operazioni lunghe; errori nella modale o pagina.
- Errori «Il piano è cambiato» (codice `CHANGED`): il messaggio ha il pulsante Aggiorna, che
  ricarica e riaggancia il post (`refreshChangedPlan`, `planRefresh` delle modali).

## Scelte dell'utente da non disfare

- Header: logo e nome del cliente a sinistra con la freccia dei clienti; Tutti i post
  (`icon-fileText`), Post in bozza (`icon-formEdit`), Idee (lampadina), Crea nuovo post (cerchio con
  «+», da non cambiare); stesse icone nel menu compatto. Footer: logo SocialDesk, Impostazioni dell'app, versione, Cerca
  aggiornamenti. Niente sfumatura colorata dietro l'header.
- Home: «Ciao, <cliente>»; schede Tutti i post / Post in bozza (un riquadro), Idee, Crea nuovo
  post (colore del cliente), tutte pulsanti myPgs; immagini tinte col colore del cliente solo
  nelle parti colorate; sotto, al centro: Impostazioni del cliente, Aggiorna archivio asset,
  Aggiorna, Cambia cliente. Sfondo della home per cliente (solo in home, cover/contain, anche
  sfocato).
- Benvenuto al posto della home al primo avvio (nessuna cartella scelta) o con una cartella senza
  clienti: «Inizia» (apre Crea cliente) e sotto «Collega cartella esistente». Senza cartella, il
  primo passo di Crea cliente è «Dove salvo i clienti?» (dialogo che permette anche di crearla);
  la cartella scelta diventa subito quella di questo computer.
- Impostazioni separate: dell'app (cartella Social, tema; solo su quel computer) e del cliente
  (nome, logo, sfondo, colore, piattaforme, template, cartelle dei post; per tutti).
- Crea cliente a passi: (cartella, solo se manca), nome, logo facoltativo, social (almeno uno).
- Elenco post: un solo elenco (Post in bozza = filtro interno, senza casella visibile), più
  recenti in alto, raggruppati per ID, ricerca, filtri anno/social/stato/mese; righe compatte;
  data come testo (si cambia da Modifica o Cambia stato); etichette dei dettagli non in grassetto.
- Niente conferma nativa «hai chiuso i file?» prima di salvare: il controllo del piano aperto
  resta automatico. Titoli tutti in maiuscolo non ammessi (sigle sì).
- Modifica post e Dettagli sono modali a tutto schermo sopra l'elenco.
- Menu in alto su Mac (`updateMenu` in `main.cjs`, ricostruito a ogni `status()`; su Windows nessun
  menu): SocialDesk (Informazioni, Cerca aggiornamenti, Impostazioni ⌘,), Modifica, Post (Nuovo
  post ⌘N, Home ⌘⇧H, Tutti i post ⌘1, Post in bozza ⌘2, Idee ⌘3, Aggiorna ⌘R), Cliente (Cambia
  cliente con l'elenco, Crea cliente, Impostazioni del cliente ⌘⇧,, Aggiorna archivio asset),
  Impostazioni, Vista, Finestra, Aiuto (GitHub, novità). Le voci mandano `social:menu` al renderer
  (`menuAction`), che usa le stesse funzioni dei pulsanti; con una finestra aperta la navigazione
  aspetta, senza cliente valido le voci dei post sono spente.
- Gruppi per ID nell'elenco: icone dei social a sinistra (1 al centro, 2 in diagonale, 3 a
  triangolo, 4 in griglia 2×2; con 5 o più le prime 3 e una casella «+N»; tutti i nomi restano
  nell'etichetta accessibile). I badge di stato a destra occupano al massimo metà riga e vanno a
  capo; sotto 760 px vanno su una riga sotto il titolo.

## Limiti e cose non verificate

- Windows: installer, aggiornamento silenzioso e cartelle di rete non provati su un PC reale.
  `lib/safe-fs.cjs` aggira gli errori `ENOTSUP` di Windows sui file copiati da Mac in rete.
- Il lock non protegge da modifiche fatte a mano in Excel o da altri programmi; un arresto
  forzato può lasciare un lock da togliere a mano (controllare prima che nessuno stia lavorando).
- Spostare un post da un anno all'altro non è supportato.
