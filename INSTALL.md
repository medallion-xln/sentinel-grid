# W0-A' A1–A10 — install

**Copy all THREE directories.** The A1–A5 bundle had only two; reusing that
command silently omits the lifecycle registry and the suite cannot run.

```bash
cd ~/Desktop/sentinel-grid
rm -f sgrid-lab/tests/w0a-clone-mask.test.js        # superseded

cp -R /path/to/w0a-prime-a1-a10/docs/governance/.        docs/governance/
cp -R /path/to/w0a-prime-a1-a10/public_html/azl/.        public_html/azl/
cp -R /path/to/w0a-prime-a1-a10/sgrid-lab/tests/.        sgrid-lab/tests/
```

The trailing `/.` matters. `cp -R docs .` copies the *directory* into an existing
`docs/`, producing `docs/docs/governance/...` — copying the contents avoids that.

## Verify before running anything

```bash
cd sgrid-lab
node tests/check-install.js
```

Expect `INSTALL CHECK PASS`. It now also checks the three W0-A' files and reports
a partial install explicitly, which is what went wrong last time.

If a file landed in the wrong place:

```bash
find ~/Desktop/sentinel-grid -name "action-lifecycle-registry.json"
```

Remove any nested `docs/docs/` copy once the real one is in place.

## Run

```bash
node tests/w0a-action-legality.test.js   # W0-A' A1-A10 TESTS PASS (115/115)
node tests/governance-v2.test.js         # 61/61
node tests/w0s-search-semantics.test.js  # 62/62
node tests/portability-report.js --digest
#   a54149dcce84cbc415c927a389947156a4ef467fe076a7892888301b90a12f7c
```

## Files

| path | note |
|---|---|
| `docs/governance/action-lifecycle-registry.json` | new — the file that was missing |
| `public_html/azl/azl-ref-adapter-v4.js` | new |
| `sgrid-lab/tests/w0a-action-legality.test.js` | new; supersedes `w0a-clone-mask.test.js` |
| `sgrid-lab/tests/_preflight.js` | **replaces** — adds `requireFile` |
| `sgrid-lab/tests/check-install.js` | **replaces** — adds W0-A' partial-install detection |

A missing required file now prints what is missing, where it ships, the exact fix,
and a `find` command — instead of a stack trace.
