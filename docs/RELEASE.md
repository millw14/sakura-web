# Web release boundaries

Sakura's live website is composed from the shared Expo application, hosting handlers, privately maintained Studio components, and independently deployed services. This public hosting snapshot alone cannot reproduce the complete live release.

## Public changes and production releases

A public PR can improve documentation or reviewed hosting source. It must not merge private Studio source or a private release history into public Git. The validation workflow in this repository does not deploy or upload the checkout to GitHub Pages.

For a website change, prepare a focused commit and request an **owner-managed Studio web release**. The release process snapshots the authoring checkouts, combines current work with the private Studio line on a local-only release branch, builds, verifies a preview, and promotes the verified release. Private release source and history are not pushed to public remotes.

Documentation-only organization does not require a website deployment.

The production Vercel project's Git connection was disconnected on November 5,
2026 because this public default branch is an older snapshot. Git pushes must
not automatically deploy it. Keep releases owner-managed until public source
and release preservation have been reconciled and a new deployment policy is
explicitly reviewed. Disconnection does not remove the existing deployment or
prevent the authorized CLI release process.

GitHub Pages also has a repository-level publication setting independent of
workflow files. It is set to `workflow`, with no publishing workflow installed.
The legacy mirror has no custom domain. Keep both this setting and the Vercel
Git connection under review before enabling any future automatic publication;
removing a workflow file alone does not disable branch-based Pages publishing.

## What a release must preserve

| Surface | Requirement |
| --- | --- |
| Application | Build the shared Expo source to `web/dist`; verify the complete export under `/app/` |
| Studio | Retain `/app/studio/` and its integrations; run the Studio export guard without bypassing it |
| ATSU | Retain the restored relay and its catalog, cover, page, reader, and share-artwork integrations; preserve server-side configuration |
| Rooms | Retain `api/rooms/v1/info.js`, `api/rooms/v1/command.js`, the community proxy, and the community packaging guard in the complete release |
| Persistent service | Preserve production identity and data; keep preview credentials and storage separate |
| Existing sessions | Keep earlier hashed application assets required by active browser sessions |
| Public previews | Retain share metadata/image handlers and their bundled assets; verify them on the public domain |

Some named handlers and guards live in the complete release and are **not present in this public snapshot**. Their presence must be checked in the actual release package; the lightweight public CI cannot certify them.

Do not deploy by copying only a new `app/` directory into an old hosting checkout. Do not reset or restore over the live Rooms database to fix a frontend release. Do not replace the current reader with a historical UI.

The legacy `npm run sync:webapp` in this snapshot deletes and replaces `app/`; it does not implement the preservation requirements above. It must not be used as the production release procedure.

## Verification and evidence

An authorized release should record the exact source and package revisions, build identity, checks run, preview results, and production smoke results in the private release record. Verify Studio availability, ATSU reading and artwork, Rooms membership and recovery, share previews, and relevant mobile/desktop routes against the actual packaged application.

Rooms uses durable storage. Backup verification and recovery readiness are operational requirements distinct from a web build. Do not infer off-host replication or disaster-recovery coverage merely from the existence of a backup file.

Keep operational evidence containing private endpoints, admission codes, identities, or credentials outside public Git. Publish only reviewed, sanitized summaries.
