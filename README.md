# Sakura website hosting

Hosting files and server-side handlers for [Sakura](https://sakuraonseeker.com/app/), a reading, anime, and community application.

**This public repository is a hosting snapshot, not a complete copy of the current production release.** The live website includes newer integrations and privately maintained Studio components. A successful check here does not establish that this snapshot is safe to deploy over production.

## Find the right repository

| Repository | Responsibility |
| --- | --- |
| [Sakura](https://github.com/Sakura-11488/Sakura) | Shared Expo application and web/native interface |
| [sakura-perps](https://github.com/Sakura-11488/sakura-perps) | Perps research, paper engine, and Rooms community service |
| **sakura-web** | Hosting package, static pages, API handlers, and generated web exports |

The current application UI is authored in `Sakura/sakura-mobile/`, with web builds produced in `Sakura/web/dist`. The `app/` directory here is generated output. Do not edit bundled JavaScript to change the application.

## Current product status

[Sakura Rooms](https://sakuraonseeker.com/app/perps/community/) is an invite-only **paper beta**: members share a plan, choose their own paper allocations, and review fixed simulated scenarios. It accepts no deposits or real funds. Its persistent service is a separate deployment; copying an application export does not install or preserve it.

## Working with this snapshot

Use Node.js 22 for the public checks. There are no npm dependencies to install in this snapshot.

```sh
node --check scripts/write-jobs-supabase-config.js
npm run build
git diff --check
```

Here, `npm run build` only generates the careers client configuration. Without configuration it writes empty placeholders to ignored `jobs/supabase-config.js`. It does **not** build the Expo app, test the live integrations, or deploy a site. The validation workflow uses synthetic configuration and has no deployment steps or production credentials.

| Path | Contents |
| --- | --- |
| `api/`, `lib/` | Server-side handlers and supporting code |
| `app/` | Generated application snapshot |
| `jobs/`, `index.html`, other static pages | Hosting content |
| `scripts/` | Configuration and packaging utilities |
| `docs/` | Repository and release guidance |

The legacy `sync:webapp` script in this snapshot replaces `app/`. It is **not** the current production release procedure. Follow the [release boundaries](docs/RELEASE.md) before packaging any web release.

Read [Contributing](CONTRIBUTING.md), [Security](SECURITY.md), and the [documentation index](docs/README.md) before making changes.

## Tracked next phase

Follow the [release-readiness milestone](https://github.com/millw14/sakura-web/milestone/1): [reviewed public hosting source](https://github.com/millw14/sakura-web/issues/2) and [security/incident ownership](https://github.com/millw14/sakura-web/issues/3). The linked Sakura application repository also has a historical public default branch; its source reconciliation is tracked separately.
