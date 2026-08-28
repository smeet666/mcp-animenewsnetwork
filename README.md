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

[Anime News Network](https://www.animenewsnetwork.com) has been covering anime
and manga since 1998. It keeps an encyclopedia of the works themselves, with the
cast and staff credited on each, the episodes, the releases, the opening and
ending themes and the readers' ratings, and it runs a news wire alongside it,
with separate editions for the United States, the United Kingdom and Australia.

This server connects a chat client to both. You can search the encyclopedia for
an anime or a manga, read one entry with its credits and its details, list what
was recently added or browse the encyclopedia alphabetically, and read the news
wire. It needs no API key and no account.

_[Version française](#mcp-animenewsnetwork-français)_

---

## Install

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

Node 24 or later is required, and no environment variable has to be set.

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

`-i` keeps stdin open, which is where the protocol travels, and `-t` is left out
because a TTY rewrites the stream. The container needs outbound HTTPS to
`cdn.animenewsnetwork.com` and `www.animenewsnetwork.com`, and nothing else: no
volume, no port, no credential.

### Bundle, without npm

Download `mcp-animenewsnetwork-2.0.0.mcpb` from
[the latest release](https://github.com/smeet666/mcp-animenewsnetwork/releases/latest)
and open it. A client that supports MCP bundles installs it on its own, with no
npm and no configuration file to edit. The bundle carries its dependencies, so
nothing is fetched at install time.

## What you can ask

- "What does the encyclopedia have on Cowboy Bebop?"
- "Who voiced Spike, and in which languages?"
- "What anime were added to the encyclopedia recently?"
- "What is the anime news today?"
- "How did readers rate that series?"

The ordinary path runs from a search to an entry: a row carries an `id` and a
`kind`, and `get_title` takes both together.

## Tools

| Tool            | What it does                                                          |
| --------------- | --------------------------------------------------------------------- |
| `search_titles` | Finds anime and manga by title in the encyclopedia.                   |
| `get_title`     | Reads one entry, its credits and its details.                         |
| `list_recent`   | Lists what was recently added, or browses the encyclopedia by letter. |
| `get_news`      | Reads the news wire.                                                  |

An entry is addressed by its `id` together with its `kind`, since the
encyclopedia numbers anime and manga separately.

### `search_titles`

Finds anime and manga by title.

| Argument | Type                                       | Required | What it does                    |
| -------- | ------------------------------------------ | -------- | ------------------------------- |
| `query`  | string, at least 1 character               | yes      | A title, or part of one.        |
| `kind`   | `anime`, `manga` or `both`, default `both` | no       | Which part of the encyclopedia. |
| `limit`  | integer, 1 to 50, default `10`             | no       | Rows to serve.                  |

**In return:** rows carrying `id` and `kind`, which `get_title` takes together;
`name`; `type`, reading TV, movie, OAV, ONA, special, manga or novel;
`precision`; `vintage`, the original release date or range as published; and
`source_url`. A field the entry leaves empty is `null`.

### `get_title`

Reads one entry. The heavier parts are asked for rather than served by default.

| Argument    | Type                                                                                                         | Required | What it does                           |
| ----------- | ------------------------------------------------------------------------------------------------------------ | -------- | -------------------------------------- |
| `id`        | integer, 1 or more                                                                                           | yes      | The encyclopedia id.                   |
| `kind`      | `anime` or `manga`                                                                                           | yes      | Which lookup the id belongs to.        |
| `sections`  | array of `basic`, `cast`, `staff`, `episodes`, `releases`, `related`, `news`, `reviews`, default `["basic"]` | no       | Which parts to return.                 |
| `max_chars` | integer, 200 to 20000, default `4000`                                                                        | no       | How much of the plot summary to serve. |
| `offset`    | integer, 0 or more, default `0`                                                                              | no       | Where to resume the plot summary.      |

**In return:** the entry a search row carries, plus `alt_titles`, `genres`,
`themes`, `episode_count`, `running_time`, `objectionable_content`,
`official_websites`, `picture_url`, `opening_themes` and `ending_themes`.
`ratings` carries the readers' `votes`, `weighted_score` and `bayesian_score`,
each `null` where the encyclopedia computed none. `plot_summary` is served a
slice at a time, described by `total_chars`, `returned_chars`, `offset`,
`next_offset` and `truncated`. A cast entry names the `role`, the `person` and
the `lang` they performed in.

### `list_recent`

Lists what was recently added to the encyclopedia, or browses it by first letter.

| Argument      | Type                                                     | Required | What it does                          |
| ------------- | -------------------------------------------------------- | -------- | ------------------------------------- |
| `kind`        | `anime`, `manga`, `person` or `company`, default `anime` | no       | What to list.                         |
| `starts_with` | a single character                                       | no       | Browse the entries beginning with it. |
| `limit`       | integer, 1 to 50, default `20`                           | no       | Rows to serve.                        |
| `offset`      | integer, 0 or more, default `0`                          | no       | Rows to skip, for paging.             |

**In return:** `rows`, each carrying `id`, `kind`, `name`, `type`, `precision`,
`vintage`, `date_added` and `source_url`, any of which the report may leave
empty. `mode` says whether the answer was read as `recent` or as `browse`, since
passing `starts_with` changes the question being asked, and `next_offset`
continues.

### `get_news`

Reads the news wire.

| Argument   | Type                                      | Required | What it does                      |
| ---------- | ----------------------------------------- | -------- | --------------------------------- |
| `feed`     | `all`, `news` or `reviews`, default `all` | no       | Which feed to read.               |
| `edition`  | `us`, `uk` or `au`, default `us`          | no       | Which edition.                    |
| `category` | string                                    | no       | Keep the stories of one category. |
| `limit`    | integer, 1 to 100, default `20`           | no       | Stories to serve.                 |

**In return:** `items`, each with its `title`, `link`, `summary`, `category` and
`published_at` as an ISO timestamp when the feed's date could be read.
`total_available` counts the stories the feed held, which is a fixed feed length
rather than the size of the archive.

## Configuration

Every variable is optional. Set them in the `env` block of your client config.

| Variable                | Default              | What it does                                                                          |
| ----------------------- | -------------------- | ------------------------------------------------------------------------------------- |
| `ANN_USER_AGENT`        | the project identity | Names your application to the service, with an address where a person can be reached. |
| `ANN_MIN_INTERVAL_MS`   | `1100`               | Gap between two requests, from 1000 to 60000.                                         |
| `ANN_TIMEOUT_MS`        | `15000`              | Deadline for one request, from 1000 to 120000.                                        |
| `ANN_MAX_RETRIES`       | `3`                  | Attempts after a transient failure, from 0 to 10.                                     |
| `ANN_CACHE_TTL_MS`      | `3600000`            | How long an encyclopedia entry stays in memory, from 0 to 86400000.                   |
| `ANN_NEWS_CACHE_TTL_MS` | `300000`             | How long a news feed stays in memory, from 0 to 86400000.                             |
| `ANN_CACHE_MAX_ENTRIES` | `200`                | Answers held in memory at once, from 0 to 10000.                                      |
| `ANN_LOG_LEVEL`         | `error`              | `silent`, `error`, `info` or `debug`, written to stderr.                              |

The news wire publishes several times an hour where the encyclopedia changes
rarely, so the two are held for different lengths of time. A value outside its
range falls back to the default, and the reason is written to stderr.

## Errors

Every failure carries one of six codes, a message, and where it helps a hint
naming the next move.

| Code            | What happened                                           | What to do                                                                                                  |
| --------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `not_found`     | The service answered, and holds no such entry.          | Check the id and the kind with `search_titles`.                                                             |
| `invalid_input` | The arguments were refused before any request went out. | Read the message, which names the argument.                                                                 |
| `rate_limited`  | The service asked this client to slow down.             | Wait the number of seconds the hint names and call again with the same arguments. The entry is still there. |
| `parse_failure` | The answer arrived in a shape this client cannot read.  | Report it at [the issue tracker](https://github.com/smeet666/mcp-animenewsnetwork/issues).                  |
| `network_error` | The request did not complete.                           | Try again shortly.                                                                                          |
| `timeout`       | The request passed its deadline.                        | Raise `ANN_TIMEOUT_MS`, or ask for fewer rows.                                                              |

## As a library

The layer reading the service is published on its own, with its pacing, its cache
and its errors, and with no protocol attached.

```ts
import { AnnClient } from "mcp-animenewsnetwork/client";

const client = new AnnClient();
const { data, cached } = await client.getTitle({ id: 1, kind: "anime" });
console.log(data.name, cached);
```

Each read answers `{ data, cached }`, and throws an error carrying one of the six
codes. The floor between two requests holds here as well.

## Pacing and attribution

Requests go out one at a time with at least 1.1 seconds between them, and the
floor of one second holds however the server is configured. The `User-Agent`
always ends with the project identity and an address where a person can be
reached.

Every result carries the address of the encyclopedia page or of the article. The
encyclopedia and the news are the work of Anime News Network and its
contributors, and attribution is what the service asks for in return.

This MCP server is an unofficial project, with no affiliation to Anime News
Network.

## Privacy

This server collects nothing about you and sends nothing to its author. It runs
on your machine, contacts `cdn.animenewsnetwork.com` and
`www.animenewsnetwork.com` and nothing else, holds its answers in memory while it
runs, and writes nothing to disk. [PRIVACY.md](PRIVACY.md) states what a request
carries and which settings change any of it.

## Development

```bash
npm install
npm run build:fixtures
npm test
npm run check
```

Tests run against generated fixtures and make no network request. The live suite,
`npm run test:live`, makes one request per route and runs nightly against the
service itself.

## Contributing

Bugs, questions and ideas belong in
[the issue tracker](https://github.com/smeet666/mcp-animenewsnetwork/issues).
Pull requests are welcome; opening an issue first helps agree on the shape of the
change. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT, see [LICENSE](LICENSE). The encyclopedia and the news belong to Anime News
Network and its contributors.

---

<a name="mcp-animenewsnetwork-français"></a>

# mcp-animenewsnetwork (français)

_[English version](#mcp-animenewsnetwork)_

[Anime News Network](https://www.animenewsnetwork.com) couvre l'anime et le manga
depuis 1998. Le site tient une encyclopédie des œuvres elles-mêmes, avec les
interprètes et l'équipe créditée sur chacune, les épisodes, les parutions, les
génériques de début et de fin et les notes de ses lecteurs, et il fait tourner à
côté un fil d'actualité, avec des éditions distinctes pour les États-Unis, le
Royaume-Uni et l'Australie.

Ce serveur relie un client de conversation aux deux. On peut chercher un anime ou
un manga dans l'encyclopédie, lire une fiche avec ses crédits et ses détails,
lister ce qui vient d'être ajouté ou parcourir l'encyclopédie par lettre, et lire
le fil d'actualité. Aucune clé d'API, aucun compte.

## Installation

**Installation en un clic**

[![Install in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=animenewsnetwork&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIm1jcC1hbmltZW5ld3NuZXR3b3JrIl19)
[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install-0098FF?style=flat&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=animenewsnetwork&config=%7B%22name%22%3A%22animenewsnetwork%22%2C%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22mcp-animenewsnetwork%22%5D%7D)

**Claude Code**

```bash
claude mcp add animenewsnetwork -- npx -y mcp-animenewsnetwork
```

**Claude Desktop, Cursor, et tout client au format de configuration standard**

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

Node 24 ou plus récent est nécessaire, et aucune variable d'environnement n'est à
renseigner.

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

`-i` garde l'entrée standard ouverte, qui est le canal du protocole, et `-t` est
omis parce qu'un TTY réécrit le flux. Le conteneur a besoin d'un accès HTTPS
sortant vers `cdn.animenewsnetwork.com` et `www.animenewsnetwork.com`, et de rien
d'autre : aucun volume, aucun port, aucun identifiant.

### Bundle, sans npm

Téléchargez `mcp-animenewsnetwork-2.0.0.mcpb` depuis
[la dernière publication](https://github.com/smeet666/mcp-animenewsnetwork/releases/latest)
et ouvrez-le. Un client qui gère les bundles MCP l'installe seul, sans npm et
sans fichier de configuration à modifier. Le bundle emporte ses dépendances, donc
rien n'est téléchargé à l'installation.

## Ce qu'on peut demander

- « Qu'est-ce que l'encyclopédie a sur Cowboy Bebop ? »
- « Qui a doublé Spike, et dans quelles langues ? »
- « Quels animes ont été ajoutés récemment à l'encyclopédie ? »
- « Quelle est l'actualité anime du jour ? »
- « Comment les lecteurs ont-ils noté cette série ? »

Le chemin ordinaire va d'une recherche à une fiche : une ligne porte un `id` et
un `kind`, et `get_title` reprend les deux ensemble.

## Les outils

| Outil           | Ce qu'il fait                                                       |
| --------------- | ------------------------------------------------------------------- |
| `search_titles` | Trouve des animes et des mangas par leur titre dans l'encyclopédie. |
| `get_title`     | Lit une fiche, ses crédits et ses détails.                          |
| `list_recent`   | Liste les ajouts récents, ou parcourt l'encyclopédie par lettre.    |
| `get_news`      | Lit le fil d'actualité.                                             |

Une fiche s'adresse par son `id` accompagné de son `kind`, l'encyclopédie
numérotant les animes et les mangas séparément.

### `search_titles`

Trouve des animes et des mangas par leur titre.

| Argument | Type                                      | Requis | Ce qu'il fait                |
| -------- | ----------------------------------------- | ------ | ---------------------------- |
| `query`  | chaîne, au moins 1 caractère              | oui    | Un titre, ou une partie.     |
| `kind`   | `anime`, `manga` ou `both`, défaut `both` | non    | La partie de l'encyclopédie. |
| `limit`  | entier, 1 à 50, défaut `10`               | non    | Lignes à servir.             |

**En retour :** des lignes portant `id` et `kind`, que `get_title` reprend
ensemble ; `name` ; `type`, valant TV, movie, OAV, ONA, special, manga ou
novel ; `precision` ; `vintage`, la date ou la période de parution telle que
publiée ; et `source_url`. Un champ que la fiche laisse vide vaut `null`.

### `get_title`

Lit une fiche. Les parties lourdes se demandent au lieu d'être servies par
défaut.

| Argument    | Type                                                                                                          | Requis | Ce qu'il fait                   |
| ----------- | ------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------- |
| `id`        | entier, 1 ou plus                                                                                             | oui    | L'identifiant encyclopédique.   |
| `kind`      | `anime` ou `manga`                                                                                            | oui    | Le registre dont l'id relève.   |
| `sections`  | tableau de `basic`, `cast`, `staff`, `episodes`, `releases`, `related`, `news`, `reviews`, défaut `["basic"]` | non    | Les parties à rendre.           |
| `max_chars` | entier, 200 à 20000, défaut `4000`                                                                            | non    | La longueur de résumé à servir. |
| `offset`    | entier, 0 ou plus, défaut `0`                                                                                 | non    | Où reprendre le résumé.         |

**En retour :** la fiche que porte une ligne de recherche, plus `alt_titles`,
`genres`, `themes`, `episode_count`, `running_time`, `objectionable_content`,
`official_websites`, `picture_url`, `opening_themes` et `ending_themes`.
`ratings` porte les `votes` des lecteurs, le `weighted_score` et le
`bayesian_score`, chacun `null` là où l'encyclopédie n'en a calculé aucun.
`plot_summary` est servi par tranches, décrites par `total_chars`,
`returned_chars`, `offset`, `next_offset` et `truncated`. Une entrée de
distribution nomme le `role`, la `person` et la langue `lang` dans laquelle elle
a joué.

### `list_recent`

Liste les ajouts récents à l'encyclopédie, ou la parcourt par première lettre.

| Argument      | Type                                                    | Requis | Ce qu'il fait                           |
| ------------- | ------------------------------------------------------- | ------ | --------------------------------------- |
| `kind`        | `anime`, `manga`, `person` ou `company`, défaut `anime` | non    | Ce qu'il faut lister.                   |
| `starts_with` | un seul caractère                                       | non    | Parcourt les fiches commençant par lui. |
| `limit`       | entier, 1 à 50, défaut `20`                             | non    | Lignes à servir.                        |
| `offset`      | entier, 0 ou plus, défaut `0`                           | non    | Lignes à sauter, pour paginer.          |

**En retour :** `rows`, chacune portant `id`, `kind`, `name`, `type`,
`precision`, `vintage`, `date_added` et `source_url`, que le rapport peut laisser
vides. `mode` dit si la réponse a été lue en `recent` ou en `browse`, passer
`starts_with` changeant la question posée, et `next_offset` poursuit.

### `get_news`

Lit le fil d'actualité.

| Argument   | Type                                     | Requis | Ce qu'il fait                             |
| ---------- | ---------------------------------------- | ------ | ----------------------------------------- |
| `feed`     | `all`, `news` ou `reviews`, défaut `all` | non    | Le fil à lire.                            |
| `edition`  | `us`, `uk` ou `au`, défaut `us`          | non    | L'édition.                                |
| `category` | chaîne                                   | non    | Ne garder que les sujets d'une catégorie. |
| `limit`    | entier, 1 à 100, défaut `20`             | non    | Sujets à servir.                          |

**En retour :** `items`, chacun avec son `title`, `link`, `summary`, `category`
et `published_at` en horodatage ISO quand la date du fil a pu être lue.
`total_available` compte les sujets que le fil contenait, ce qui est une longueur
de fil fixe et non la taille des archives.

## Configuration

Chaque variable est facultative. Elles se posent dans le bloc `env` de la
configuration du client.

| Variable                | Défaut               | Ce qu'elle fait                                                                      |
| ----------------------- | -------------------- | ------------------------------------------------------------------------------------ |
| `ANN_USER_AGENT`        | l'identité du projet | Nomme votre application auprès du service, avec une adresse où joindre une personne. |
| `ANN_MIN_INTERVAL_MS`   | `1100`               | Écart entre deux requêtes, de 1000 à 60000.                                          |
| `ANN_TIMEOUT_MS`        | `15000`              | Délai d'une requête, de 1000 à 120000.                                               |
| `ANN_MAX_RETRIES`       | `3`                  | Tentatives après un échec passager, de 0 à 10.                                       |
| `ANN_CACHE_TTL_MS`      | `3600000`            | Durée pendant laquelle une fiche reste en mémoire, de 0 à 86400000.                  |
| `ANN_NEWS_CACHE_TTL_MS` | `300000`             | Durée pendant laquelle un fil reste en mémoire, de 0 à 86400000.                     |
| `ANN_CACHE_MAX_ENTRIES` | `200`                | Réponses gardées en mémoire à la fois, de 0 à 10000.                                 |
| `ANN_LOG_LEVEL`         | `error`              | `silent`, `error`, `info` ou `debug`, écrit sur la sortie d'erreur.                  |

Le fil d'actualité publie plusieurs fois par heure là où l'encyclopédie change
rarement, donc les deux sont gardés des durées différentes. Une valeur hors de sa
plage retombe sur le défaut, et la raison est écrite sur la sortie d'erreur.

## Erreurs

Chaque échec porte un des six codes, un message, et quand cela aide une
indication du geste suivant.

| Code            | Ce qui s'est passé                                   | Que faire                                                                                        |
| --------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `not_found`     | Le service a répondu, et n'a pas cette fiche.        | Vérifiez l'identifiant et le type avec `search_titles`.                                          |
| `invalid_input` | Les arguments ont été refusés avant toute requête.   | Lisez le message, qui nomme l'argument.                                                          |
| `rate_limited`  | Le service demande à ce client de ralentir.          | Attendez les secondes indiquées et rappelez avec les mêmes arguments. La fiche est toujours là.  |
| `parse_failure` | La réponse est arrivée dans une forme illisible ici. | Signalez-le sur [le suivi d'incidents](https://github.com/smeet666/mcp-animenewsnetwork/issues). |
| `network_error` | La requête n'a pas abouti.                           | Réessayez sous peu.                                                                              |
| `timeout`       | La requête a dépassé son délai.                      | Augmentez `ANN_TIMEOUT_MS`, ou demandez moins de lignes.                                         |

## Comme bibliothèque

La couche qui lit le service est publiée seule, avec son rythme, son cache et ses
erreurs, sans protocole attaché.

```ts
import { AnnClient } from "mcp-animenewsnetwork/client";

const client = new AnnClient();
const { data, cached } = await client.getTitle({ id: 1, kind: "anime" });
console.log(data.name, cached);
```

Chaque lecture répond `{ data, cached }`, et lève une erreur portant un des six
codes. Le plancher entre deux requêtes tient également ici.

## Rythme et attribution

Les requêtes partent une à une avec au moins 1,1 seconde entre elles, et le
plancher d'une seconde tient quelle que soit la configuration. Le `User-Agent` se
termine toujours par l'identité du projet et une adresse où joindre une personne.

Chaque résultat porte l'adresse de la page encyclopédique ou de l'article.
L'encyclopédie et l'actualité sont l'œuvre d'Anime News Network et de ses
contributeurs, et l'attribution est ce que le service demande en retour.

Ce MCP est un projet non officiel, sans affiliation à Anime News Network.

## Confidentialité

Ce serveur ne collecte rien sur vous et n'envoie rien à son auteur. Il tourne sur
votre machine, ne joint que `cdn.animenewsnetwork.com` et
`www.animenewsnetwork.com`, garde ses réponses en mémoire le temps qu'il tourne,
et n'écrit rien sur le disque. [PRIVACY.md](PRIVACY.md) dit ce qu'une requête
emporte et quels réglages changent cela.

## Développement

```bash
npm install
npm run build:fixtures
npm test
npm run check
```

Les tests s'exécutent sur des fixtures engendrées et n'émettent aucune requête.
La suite en direct, `npm run test:live`, émet une requête par route et tourne
chaque nuit contre le service lui-même.

## Contribuer

Les anomalies, les questions et les idées ont leur place dans
[le suivi d'incidents](https://github.com/smeet666/mcp-animenewsnetwork/issues).
Les propositions de modification sont bienvenues ; ouvrir un ticket d'abord aide
à s'accorder sur la forme du changement. Voir [CONTRIBUTING.md](CONTRIBUTING.md).

## Licence

MIT, voir [LICENSE](LICENSE). L'encyclopédie et l'actualité appartiennent à Anime
News Network et à ses contributeurs.
