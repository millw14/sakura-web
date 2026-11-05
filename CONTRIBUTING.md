# Contributing to Sakura hosting

This repository owns hosting and server handlers. Application UI changes belong in [Sakura](https://github.com/Sakura-11488/Sakura); paper engine and community-service changes belong in [sakura-perps](https://github.com/Sakura-11488/sakura-perps).

## Make a focused change

1. Create a branch from the current public default branch. Use a descriptive name such as `fix/hosting-route` or `docs/release-guide`.
2. Change the relevant source file. Do not patch generated `app/_expo` bundles or copy a private release checkout into this public repository.
3. Run the applicable checks and inspect `git diff --check` and the complete diff.
4. Open a pull request explaining the behavior, verification, and any release-preservation impact.

Keep unrelated local edits and generated exports out of the PR. Never use a bulk commit to reconcile a long-lived deployment worktree with public main. Do not rewrite shared history or remove retained release assets as housekeeping.

## Verification available here

The `Hosting validation` workflow checks JavaScript syntax, root JSON configuration, and the existing careers configuration generator with synthetic values. It does not deploy, use production credentials, or make backend requests.

Run the snapshot's build with Node.js 22:

```sh
npm run build
git diff --check
```

This build only writes the ignored careers configuration file. It is not a full application build. Never place a privileged key in client configuration. Add focused regression coverage when changing an API's behavior; document any checks that need a separately authorized environment.

## Changes that need a web release

A merge to this public repository is not authorization or evidence of a production deployment. Use the owner-managed [Studio web release process](docs/RELEASE.md), preserving the application, Studio, ATSU, existing sessions' assets, and the Rooms service. Documentation housekeeping must not deploy a website.

## Reporting problems

Use a public issue for ordinary reproducible bugs or a proposed improvement. Include the affected route, expected result, actual result, and browser where relevant. Redact account data and credentials.

For a possible vulnerability, follow [SECURITY.md](SECURITY.md). Do not put exploit details in a public issue or pull request.

Describe implementation status precisely. A paper simulation is not live trading, passing CI is not a security audit, and a source commit is not proof that the website runs that commit.
