# mcp-animenewsnetwork

[![npm](https://img.shields.io/npm/v/mcp-animenewsnetwork.svg)](https://www.npmjs.com/package/mcp-animenewsnetwork)
[![CI](https://github.com/smeet666/mcp-animenewsnetwork/actions/workflows/ci.yml/badge.svg)](https://github.com/smeet666/mcp-animenewsnetwork/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/mcp-animenewsnetwork.svg)](./LICENSE)
[![MCP Registry](https://img.shields.io/badge/MCP_Registry-listed-6E56CF)](https://registry.modelcontextprotocol.io/v0/servers?search=io.github.smeet666/mcp-animenewsnetwork)
[![Glama](https://glama.ai/mcp/servers/smeet666/mcp-animenewsnetwork/badges/score.svg)](https://glama.ai/mcp/servers/smeet666/mcp-animenewsnetwork)
[![M8ven](https://m8ven.ai/badge/mcp/smeet666-mcp-animenewsnetwork-tjuof8?variant=verified)](https://m8ven.ai/mcp/smeet666-mcp-animenewsnetwork-tjuof8)
[![Install in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=animenewsnetwork&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIm1jcC1hbmltZW5ld3NuZXR3b3JrIl19)
[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install-0098FF?style=flat&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=animenewsnetwork&config=%7B%22name%22%3A%22animenewsnetwork%22%2C%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22mcp-animenewsnetwork%22%5D%7D)
<!-- m8ven-verify: 0bc9d48876faa24f4d509082ea05d5ba -->

An [MCP](https://modelcontextprotocol.io) server for
[Anime News Network](https://www.animenewsnetwork.com). Search the anime and manga
encyclopedia, read cast, staff and episode lists, and follow the news wire.
**No API key, no account, no configuration.**

_(Version française plus bas / [French version below](#mcp-animenewsnetwork-français))_

---

## Quickstart

**One-click install**

[![Install in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=animenewsnetwork&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIm1jcC1hbmltZW5ld3NuZXR3b3JrIl19)
[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install-0098FF?style=flat&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=animenewsnetwork&config=%7B%22name%22%3A%22animenewsnetwork%22%2C%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22mcp-animenewsnetwork%22%5D%7D)

**Claude Code**

```bash
claude mcp add animenewsnetwork -- npx -y mcp-animenewsnetwork
```

**Claude Desktop, Cursor, and any client using the standard config format**

```json
{
  "mcpServers": {
    "animenewsnetwork": {
      "command": "npx",
      "args": ["-y", "mcp-animenewsnetwork"]
    }
  }
}
```

### With Docker

```json
{
  "mcpServers": {
    "animenewsnetwork": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "ghcr.io/smeet666/mcp-animenewsnetwork:2.0.0"]
    }
  }
}
```

`-i` keeps stdin open, which is where the protocol travels, and no `-t` is
passed: a TTY rewrites the stream and breaks it. The container needs outbound
HTTPS to `www.animenewsnetwork.com` and `cdn.animenewsnetwork.com`, and nothing else: no volume, no port, no environment variable, no credential.

**Bundle, without npm**

Download `mcp-animenewsnetwork-<version>.mcpb` from
[the latest release](https://github.com/smeet666/mcp-animenewsnetwork/releases/latest) and open
it. A client that supports MCP bundles installs it on its own, with no npm and
no configuration file to edit. The bundle carries its dependencies, so nothing
is fetched at install time.

## Tools

| Tool            | What it does                                              | Key parameters                                  |
| --------------- | --------------------------------------------------------- | ----------------------------------------------- |
| `search_titles` | Finds anime and manga by title. Compact rows only.        | `query`, `kind`, `limit`                        |
| `get_title`     | Reads one entry, section by section.                      | `id`, `kind`, `sections`, `max_chars`, `offset` |
| `list_recent`   | Lists recent additions, or browses titles alphabetically. | `kind`, `starts_with`, `limit`, `offset`        |
| `get_news`      | Reads the news, reviews and combined feeds.               | `feed`, `edition`, `category`, `limit`          |

Search returns an encyclopedia `id` and a `kind` for every result; `get_title`
takes both. That is the intended chain: search, then read.

The server is **read-only**. It writes nothing back to Anime News Network.

### Things worth knowing

**Search results carry no records.** A name search on the encyclopedia returns
the complete record of every match. A search for "One Piece" is 1.4 MB of XML,
roughly 360,000 tokens, because 47 full records are embedded in it. This server
reduces the same search to about 10 KB of rows. Read the entry you actually
want with `get_title`.

**One entry is still large, so sections are opt-in.** A record for a
long-running series reaches 79 KB: Cowboy Bebop alone carries 101 cast credits,
70 staff credits, 54 releases and 207 linked news items. `get_title` returns
`basic` by default, and `cast`, `staff`, `episodes`, `releases`, `related`,
`news` and `reviews` only when you ask.

**A trimmed cast keeps every language.** Credits arrive ordered alphabetically
by language, so taking the first sixty answers "who voices this character" with
whichever dub sorts first and can miss the Japanese cast entirely. Each language
keeps a share of the budget instead, and `cast_languages` reports the full count
per language, so a trimmed list still shows what exists. A `lang` of `null`
means the site recorded none, and says nothing about whether a credit is the
original.

**Search matches titles, and nothing else.** It cannot find a series from a
character, a studio, a genre or a plot detail. There is no full-text search
endpoint on the encyclopedia, and the `search` parameter their reports accept
returns nothing. Narrow the query rather than raising `limit`.

**A failure is never an empty result.** Anime News Network answers every
request with HTTP 200, including its failures, which it reports as a `<warning>`
inside the body. An unknown id would otherwise read as "this series does not
exist", so this server turns those warnings into errors with a code.

**The news feed is the whole archive.** There is no endpoint reaching further
back than the feed window, so older coverage cannot be retrieved here.

## Configuration

Every variable is optional. Set them in the `env` block of your MCP client config.

| Variable                | Default                                    | Purpose                                                         |
| ----------------------- | ------------------------------------------ | --------------------------------------------------------------- |
| `ANN_USER_AGENT`        | `mcp-animenewsnetwork v<version> (<repo>)` | User-Agent sent to Anime News Network.                          |
| `ANN_MIN_INTERVAL_MS`   | `1100`                                     | Minimum gap between requests. Values below 1000 ms are ignored. |
| `ANN_TIMEOUT_MS`        | `15000`                                    | Per-request timeout.                                            |
| `ANN_MAX_RETRIES`       | `3`                                        | Retries on rate limiting and transient errors.                  |
| `ANN_CACHE_TTL_MS`      | `3600000`                                  | Encyclopedia cache lifetime (1 hour).                           |
| `ANN_NEWS_CACHE_TTL_MS` | `300000`                                   | News cache lifetime (5 minutes).                                |
| `ANN_CACHE_MAX_ENTRIES` | `200`                                      | In-memory cache size, shared shape across both caches.          |
| `ANN_LOG_LEVEL`         | `error`                                    | `silent`, `error`, `info` or `debug`. Logs go to stderr.        |

The interval floor exists because Anime News Network documents a limit of one
request per second per IP and **delays** anything above it rather than refusing,
so pacing faster only queues requests on their side.

## How it works

The encyclopedia is a real public XML API, so this server makes plain HTTP calls
to `https://cdn.animenewsnetwork.com/encyclopedia` and maps the responses. The
news comes from the RSS feeds on the main site. It sends one request at a time,
paces itself, backs off when rate limited, and keeps two in-memory caches: an
hour for the encyclopedia, which barely changes, and five minutes for the wire,
which publishes several times an hour.

### On robots.txt

`animenewsnetwork.com/robots.txt` disallows `/encyclopedia/api.xml`, under a
comment reading "disallowed for search engines because redundant". This server
uses that endpoint anyway, and the reasoning is worth stating so you can judge
it yourself.

Anime News Network documents `api.xml` as a public API, publishes a rate limit
for it, asks callers to identify themselves and to attribute the data, and
advises caching responses for a week. Those are the instructions of a service
that expects clients, not one asking to be left alone. robots.txt governs
crawlers building an index; this server issues one request in response to one
question from one person, holds the answer briefly, and indexes nothing.

The server honours all of it: one request per second, an identifying
User-Agent, caching, and a source link on every result. If Anime News Network
would rather it did not exist, opening an issue is enough.

## Development

```bash
npm install
npm run build:fixtures   # regenerate the XML test fixtures
npm test                 # unit tests, no network
npm run typecheck
npm run build
ANN_LIVE=1 npm run test:live   # hits the real API, excluded from CI
npm run inspector        # explore the tools in the MCP Inspector
```

Fixtures are generated, not captured: they reproduce Anime News Network's
element names and attributes with placeholder titles, so the tests are
deterministic and no third-party content lives in this repository.

The API layer (`src/ann`) does not import the MCP SDK and is published
separately as `mcp-animenewsnetwork/client`, so it can be used as a plain
library.

## Data and attribution

The encyclopedia and the news wire are the work of Anime News Network and its
contributors. This project claims no rights over them and ships none of their
content.

Anime News Network asks that anything built on their data names them as the
source and links the entry it quotes. Every result this server returns carries a
`source_url` or a `link` for that purpose. If you display or repeat what it
returns, keep that attribution and link back.

This is an unofficial project, with no affiliation to or endorsement by Anime
News Network.

## Contributing

Bugs, questions and ideas all belong in
[the issue tracker](https://github.com/smeet666/mcp-animenewsnetwork/issues). Pull requests
are welcome; please open an issue first so we can agree on what the right
answer is before you write it. [CONTRIBUTING.md](CONTRIBUTING.md) has the
detail, and [SECURITY.md](SECURITY.md) covers anything exploitable.

## Support

These servers are free and stay free. If one of them saved you an afternoon,
you can [buy me a coffee](https://buymeacoffee.com/smeet666).

## License

MIT. See [LICENSE](./LICENSE). The license covers this source code only, not the
data retrieved through it.

---

<a name="mcp-animenewsnetwork-français"></a>

# mcp-animenewsnetwork (français)

Un serveur [MCP](https://modelcontextprotocol.io) pour
[Anime News Network](https://www.animenewsnetwork.com). Cherchez dans
l'encyclopédie anime et manga, lisez les distributions, les équipes et les
listes d'épisodes, et suivez le fil d'actualité. **Sans clé d'API, sans compte,
sans configuration.**

## Démarrage rapide

**Installation en un clic**

[![Install in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=animenewsnetwork&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIm1jcC1hbmltZW5ld3NuZXR3b3JrIl19)
[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install-0098FF?style=flat&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=animenewsnetwork&config=%7B%22name%22%3A%22animenewsnetwork%22%2C%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22mcp-animenewsnetwork%22%5D%7D)

**Claude Code**

```bash
claude mcp add animenewsnetwork -- npx -y mcp-animenewsnetwork
```

**Claude Desktop, Cursor, et tout client utilisant le format standard**

```json
{
  "mcpServers": {
    "animenewsnetwork": {
      "command": "npx",
      "args": ["-y", "mcp-animenewsnetwork"]
    }
  }
}
```

### Avec Docker

```json
{
  "mcpServers": {
    "animenewsnetwork": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "ghcr.io/smeet666/mcp-animenewsnetwork:2.0.0"]
    }
  }
}
```

`-i` garde l'entrée standard ouverte, qui est le canal du protocole, et aucun
`-t` n'est passé : un terminal réécrit le flux et le casse. Le conteneur a besoin
d'un accès HTTPS sortant vers `www.animenewsnetwork.com` et `cdn.animenewsnetwork.com`, et de rien d'autre :
aucun volume, aucun port, aucune variable d'environnement, aucun identifiant.

**Bundle, sans npm**

Téléchargez `mcp-animenewsnetwork-<version>.mcpb` depuis
[la dernière release](https://github.com/smeet666/mcp-animenewsnetwork/releases/latest) et
ouvrez-le. Un client compatible avec les bundles MCP l'installe seul, sans npm
ni fichier de configuration à modifier. Le bundle embarque ses dépendances,
donc rien n'est téléchargé à l'installation.

## Outils

| Outil           | Rôle                                                                     | Paramètres principaux                           |
| --------------- | ------------------------------------------------------------------------ | ----------------------------------------------- |
| `search_titles` | Trouve anime et manga par titre. Lignes compactes uniquement.            | `query`, `kind`, `limit`                        |
| `get_title`     | Lit une fiche, section par section.                                      | `id`, `kind`, `sections`, `max_chars`, `offset` |
| `list_recent`   | Liste les ajouts récents, ou parcourt les titres par ordre alphabétique. | `kind`, `starts_with`, `limit`, `offset`        |
| `get_news`      | Lit les flux actualités, critiques et combiné.                           | `feed`, `edition`, `category`, `limit`          |

La recherche renvoie un `id` d'encyclopédie et un `kind` pour chaque résultat, et
`get_title` prend les deux. C'est l'enchaînement prévu : chercher, puis lire.

Le serveur est en **lecture seule**. Il n'écrit rien vers Anime News Network.

### Ce qu'il faut savoir

**Les résultats de recherche ne contiennent aucune fiche.** Une recherche par nom
renvoie la fiche complète de chaque correspondance. « One Piece » représente
1,4 Mo de XML, environ 360 000 tokens, parce que 47 fiches entières y sont
imbriquées. Ce serveur ramène la même recherche à environ 10 Ko de lignes. La
fiche voulue se lit ensuite avec `get_title`.

**Une fiche reste volumineuse, d'où les sections à la demande.** Une série au
long cours atteint 79 Ko : Cowboy Bebop porte à elle seule 101 rôles, 70 postes
d'équipe, 54 éditions et 207 actualités liées. `get_title` renvoie `basic` par
défaut, et `cast`, `staff`, `episodes`, `releases`, `related`, `news` et
`reviews` seulement sur demande.

**Une distribution tronquée garde toutes les langues.** Les crédits arrivent
triés alphabétiquement par langue, donc prendre les soixante premiers répond
« qui double ce personnage » avec le doublage qui passe en tête et peut manquer
entièrement la distribution japonaise. Chaque langue conserve une part
du budget, et `cast_languages` donne le compte réel par langue, pour qu'une
liste tronquée montre quand même ce qui existe. Un `lang` à `null` signifie que
le site n'en a pas enregistré, et ne dit rien sur le caractère original du
crédit.

**La recherche porte sur les titres, et rien d'autre.** Elle ne sait pas
retrouver une série depuis un personnage, un studio, un genre ou un élément
d'intrigue. L'encyclopédie n'expose aucune recherche plein texte, et le
paramètre `search` que leurs rapports acceptent ne renvoie rien. Affinez la
requête plutôt que d'augmenter `limit`.

**Un échec n'est jamais un résultat vide.** Anime News Network répond à toutes
les requêtes en HTTP 200, y compris à ses échecs, signalés par un `<warning>`
dans le corps. Un id inconnu se lirait sinon comme « cette série n'existe pas »,
donc ce serveur transforme ces avertissements en erreurs avec un code.

**Le fil d'actualité est toute l'archive disponible.** Aucun endpoint ne remonte
au-delà de la fenêtre du flux, les couvertures plus anciennes sont donc hors de
portée ici.

## Configuration

Toutes les variables sont optionnelles, à déclarer dans le bloc `env` de votre client.

| Variable                | Défaut                                      | Rôle                                                               |
| ----------------------- | ------------------------------------------- | ------------------------------------------------------------------ |
| `ANN_USER_AGENT`        | `mcp-animenewsnetwork v<version> (<dépôt>)` | User-Agent envoyé à Anime News Network.                            |
| `ANN_MIN_INTERVAL_MS`   | `1100`                                      | Écart minimal entre requêtes. Sous 1000 ms, la valeur est ignorée. |
| `ANN_TIMEOUT_MS`        | `15000`                                     | Délai d'attente par requête.                                       |
| `ANN_MAX_RETRIES`       | `3`                                         | Tentatives en cas de limitation ou d'erreur passagère.             |
| `ANN_CACHE_TTL_MS`      | `3600000`                                   | Durée de vie du cache encyclopédie (1 heure).                      |
| `ANN_NEWS_CACHE_TTL_MS` | `300000`                                    | Durée de vie du cache actualités (5 minutes).                      |
| `ANN_CACHE_MAX_ENTRIES` | `200`                                       | Taille des caches mémoire.                                         |
| `ANN_LOG_LEVEL`         | `error`                                     | `silent`, `error`, `info` ou `debug`. Logs sur stderr.             |

Le plancher sur l'intervalle existe parce qu'Anime News Network documente une
limite d'une requête par seconde par IP et **retarde** ce qui la dépasse au lieu
de refuser : aller plus vite ne fait que constituer une file d'attente chez eux.

## Fonctionnement

L'encyclopédie est une véritable API XML publique. Ce serveur fait donc de
simples appels HTTP vers `https://cdn.animenewsnetwork.com/encyclopedia` et
transpose les réponses. Les actualités viennent des flux RSS du site principal.
Il envoie une requête à la fois, s'impose un rythme, ralentit en cas de
limitation, et garde deux caches mémoire : une heure pour l'encyclopédie, qui
bouge à peine, et cinq minutes pour le fil, qui publie plusieurs fois par heure.

### À propos du robots.txt

Le `robots.txt` d'animenewsnetwork.com interdit `/encyclopedia/api.xml`, sous un
commentaire indiquant « disallowed for search engines because redundant ». Ce
serveur utilise malgré tout cet endpoint, et le raisonnement mérite d'être
exposé pour que vous puissiez en juger.

Anime News Network documente `api.xml` comme une API publique, en publie la
limite de débit, demande aux clients de s'identifier et d'attribuer les données,
et conseille de mettre les réponses en cache une semaine. Ce sont les
instructions d'un service qui attend des clients, pas d'un service qui demande
qu'on le laisse tranquille. Le robots.txt encadre les robots d'indexation ; ce
serveur émet une requête en réponse à une question d'une personne, garde
brièvement la réponse, et n'indexe rien.

Le serveur respecte l'ensemble : une requête par seconde, un User-Agent
identifiant, la mise en cache, et un lien source sur chaque résultat. Si Anime
News Network préfère qu'il n'existe pas, ouvrir une issue suffit.

## Développement

```bash
npm install
npm run build:fixtures   # régénère les fixtures XML de test
npm test                 # tests unitaires, sans réseau
npm run typecheck
npm run build
ANN_LIVE=1 npm run test:live   # touche la vraie API, exclu de la CI
npm run inspector        # explorer les outils dans le MCP Inspector
```

Les fixtures sont générées, pas capturées : elles reproduisent les noms
d'éléments et d'attributs d'Anime News Network avec des titres de remplissage,
ce qui rend les tests déterministes et évite de stocker du contenu tiers dans ce
dépôt.

La couche API (`src/ann`) n'importe pas le SDK MCP et est publiée séparément
sous `mcp-animenewsnetwork/client`, utilisable comme simple bibliothèque.

## Données et attribution

L'encyclopédie et le fil d'actualité sont l'œuvre d'Anime News Network et de ses
contributeurs. Ce projet ne revendique aucun droit dessus et n'embarque aucun de
leurs contenus.

Anime News Network demande que tout ce qui s'appuie sur leurs données les cite
comme source et renvoie vers la fiche concernée. Chaque résultat de ce serveur
porte un `source_url` ou un `link` à cet effet. Si vous affichez ou reprenez ce
qu'il renvoie, conservez cette attribution et le lien.

Projet non officiel, sans affiliation à Anime News Network ni approbation de sa part.

## Licence

MIT, voir [LICENSE](./LICENSE). La licence couvre uniquement le code source, pas
les données récupérées par son intermédiaire.
