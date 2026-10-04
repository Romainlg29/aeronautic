# Releasing

Only the maintainer publishes to npm. Each package in `packages/` is released
on its own, from a tag naming it: `core-vX.Y.Z` publishes `@aeronautic/core`,
and `afterburner-v*`, `wing-vapor-v*` and `controls-v*` the same.

Pushing a tag runs `.github/workflows/release.yml`. It checks the tag against
the package's `version`, runs every check, waits for the maintainer's approval
in the `npm` environment, and publishes with provenance through npm's trusted
publishing: no npm token is stored anywhere. Once the package is on npm, it
creates the GitHub release for the tag, with notes since that package's
previous release. Afterburner's releases are marked Latest.

- [A new version](#a-new-version)
- [When a release run fails](#when-a-release-run-fails)
- [A new package](#a-new-package)
- [One-time setup](#one-time-setup)

## A new version

1. Bump `version` in `packages/<package>/package.json` and merge it through a
   pull request (`main` takes no direct pushes).
2. Update your `main` and tag the merged commit `<package>-vX.Y.Z`:

   ```bash
   git checkout main
   git pull
   git tag afterburner-v0.5.0
   git push origin afterburner-v0.5.0
   ```

3. Approve the run in the Actions tab.

**One tag at a time.** The workflow lets one release run wait at a time: a
second tag pushed while the first waits for approval cancels the waiting one.
Push a tag, approve its run, then push the next.

**Core first.** The others take `@aeronautic/core` as a peer, written
`workspace:^` in the repo. Packing replaces it with a caret on the core version
at the time, so afterburner packed against core 0.1.0 asks for `^0.1.0`. Below
1.0 a caret holds the minor, so `^0.1.0` takes 0.1.x and not 0.2.0. When a
package needs a new core:

1. Release core.
2. Then release each package that needs it, so it is packed against that core.

A minor or major core release (0.1 to 0.2) leaves every package still asking
for the old one out of range. Release a new version of each of them after it,
even with no other change, or they can't be installed beside the new core.

## When a release run fails

Nothing is published unless the run gets to its Publish step, so a failed run
can be run again.

- **Something outside the repo** (an npm setting, a missing trusted publisher,
  a flaky runner): fix it and re-run the failed run from the Actions tab.
- **Something in the repo** (a check fails, the workflow is wrong): a run uses
  the workflow and the code as they are at the tagged commit, so a re-run
  fails the same way. Fix it through a pull request, then move the tag onto the
  new `main`:

  ```bash
  git checkout main
  git pull
  git tag -d afterburner-v0.5.0
  git push origin :refs/tags/afterburner-v0.5.0
  git tag afterburner-v0.5.0
  git push origin afterburner-v0.5.0
  ```

  Move a tag only while its version isn't on npm. Once it is, the version is
  spent: bump to the next one instead.

- **Cancelled before it started**: another tag replaced it in the queue (see
  "One tag at a time"). Re-run it once the other run is done.

## A new package

Say it's `packages/<name>`, published as `@aeronautic/<name>`.

### In the repo

1. **The package.** Copy `packages/controls`: `package.json`, `tsconfig.json`,
   `tsdown.config.ts`, `vitest.config.ts`, `LICENSE` and a `README.md`. In
   `package.json`, set `name`, `version` (start at `0.1.0`), `description`,
   `keywords`, `homepage`, `repository.directory` and `exports`. Keep
   `files`, `publishConfig.access: "public"` and a `@aeronautic/core`
   dependency as `workspace:^`, in `devDependencies` and in
   `peerDependencies`.
2. **The build.** Add `--filter @aeronautic/<name>` to `build` in the root
   `package.json`, after core.
3. **The release workflow.** In `.github/workflows/release.yml`, add
   `"<name>-v*"` to `on.push.tags` and `<name>` to the `case` that reads the
   tag.
4. **The lint.** Add `packages/<name>/src/**` to the library overrides in
   `.oxlintrc.json`.
5. **The docs.** In `apps/docs`:
   - add `"@aeronautic/<name>": "workspace:*"` to `package.json`;
   - point each entry of the package at its source in `next.config.ts`
     (`resolveAlias`) and `tsconfig.json` (`paths`), so the docs run it
     without a build;
   - add `content/docs/<name>` with its `meta.json`, and the folder to
     `content/docs/meta.json`.
6. **The words.** Add it to the packages table and the release tags in
   `README.md`, to the layout table in `CONTRIBUTING.md`, to the release tags
   at the top of this file, and to the versions asked for in
   `.github/ISSUE_TEMPLATE/bug.yml`.

Then run what CI runs (`pnpm lint`, `pnpm fmt:check`, `pnpm build`,
`pnpm typecheck`, `pnpm test`, `pnpm build:docs`) and merge it through a pull
request.

### On GitHub

7. **The `npm` environment** (Settings → Environments → `npm` → Deployment
   branches and tags): add the `<name>-v*` tag pattern. A tag it doesn't list
   can't run in the environment, and the run fails at once.
8. **The tag ruleset** (Settings → Rules → Rulesets): add `<name>-v*` to the
   targets, so only the maintainer can create, move or delete those tags.

### The first version, by hand

Trusted publishing is set on a package that exists, so its first version goes
up from your machine, with your 2FA code.

9. **Publish it**, from the merged `main`. Pack it with pnpm, which writes the
   `workspace:^` on core as the version core is at; `npm publish` on the folder
   would publish `workspace:^` as is, and nobody could install it.

   ```bash
   git checkout main
   git pull
   pnpm install
   pnpm build
   cd packages/<name>
   npm pkg delete scripts devDependencies
   pnpm pack
   npm publish aeronautic-<name>-0.1.0.tgz --access public
   git restore package.json
   rm aeronautic-<name>-0.1.0.tgz
   ```

   Check it on npmjs.com: its `@aeronautic/core` should read `^0.1.0` (or
   whatever core is at), never `workspace:^`.

10. **Set it up on npmjs.com**, in the package's settings:
    - add a trusted publisher: GitHub Actions, `Romainlg29/aeronautic`,
      workflow `release.yml`, environment `npm`;
    - set publishing access to **Require two-factor authentication and
      disallow tokens**. Trusted publishing still works with this on, and
      nothing else can publish.

11. **Tag it and make its GitHub release.** Pushing the tag starts a release
    run: reject it at the approval step, the version is already on npm.

    ```bash
    git tag <name>-v0.1.0
    git push origin <name>-v0.1.0
    gh release create <name>-v0.1.0 --target main --latest=false --notes "First release: …"
    ```

From the next version on, it releases like the others: see
[A new version](#a-new-version).

## One-time setup

Already done for this repo; kept for a fork or a rebuild.

- **GitHub account:** two-factor authentication on.
- **Environment:** Settings → Environments → New environment `npm`, with
  **Required reviewers** set to yourself and **Deployment branches and tags**
  limited to the `core-v*`, `afterburner-v*`, `wing-vapor-v*` and
  `controls-v*` tag patterns.
- **Tag ruleset:** Settings → Rules → Rulesets → New tag ruleset targeting
  `v*`, `core-v*`, `afterburner-v*`, `wing-vapor-v*` and `controls-v*`,
  restricting creations, updates and deletions, with no bypass list except
  Repository admin.
- **Branch ruleset** on `main`: require a pull request and the CI check.
- **Pages:** Settings → Pages → Source: GitHub Actions, for the docs.
- **Security:** Settings → Code security, turn on private vulnerability
  reporting and Dependabot alerts.

Afterburner was tagged `vX.Y.Z` up to 0.3.0, before the repo held more than
one package. Those tags no longer start a release.
