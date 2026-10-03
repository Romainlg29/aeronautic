# Security policy

## Supported versions

Only the latest published version of `r3f-afterburner` gets fixes.

## Reporting a vulnerability

Please don't open a public issue. Report it privately through GitHub's
[private vulnerability reporting](https://github.com/Romainlg29/afterburner/security/advisories/new)
instead.

Include what's affected, how to reproduce it, and what an attacker could do
with it. You'll get an answer within a week. Once a fix is published, the
advisory is made public, crediting you unless you'd rather not be named.

## What's in scope

The published npm package. The library runs
entirely in the browser and makes no network requests of its own. The docs
site is static.

Releases are published from GitHub Actions only, through npm's trusted
publishing with provenance. The provenance on npmjs.com links each version to
the workflow run that built it. The one exception is 0.0.1, published by hand
because trusted publishing needs the package to exist first. Any later version
without provenance didn't come from this repository. Report it.
