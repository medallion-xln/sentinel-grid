# Bound placeholder log (my error, corrected without rebuilding the candidate)

`register-candidate-v4.mjs` was launched with its stdout/stderr redirected into
`evidence/successor-v4/logs/register-candidate.{stdout,stderr}.log`. The shell created both files (empty) before the
builder ran, the builder hashed every file under `evidence/successor-v4/` (so it bound both as the empty file,
sha256 e3b0c442...b855), and the builder's console output was then written into the stdout file, which no longer
matched its binding.

Correction: the console output (239 bytes; the candidate hash, source counts and inheritance head, all of which are
also in the candidate itself) was moved to `evidence/successor-v4-preflight/register-candidate.stdout.log`, and the
bound file was restored to its bound bytes (empty). No other bound file was affected; the candidate file was not
rebuilt or edited.
