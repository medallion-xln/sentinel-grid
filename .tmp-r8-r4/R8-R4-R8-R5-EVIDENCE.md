# R8-R4 / R8-R5 Evidence — Online-R0

## R8-R4 exact runtime review
- Runtime SHA256: `0d6561a83905a6c263daa772ffdee690d8e623525def54a0eaf73f81aeb8017a`.
- Runtime bytes: 1,400,787.
- Main SHA256: `1055917bf5f8b51bc009be8000e6ed5629f9a93d2dd4546932f8d3d6f4894c84`.
- Clock SHA256: `38744f6bb0f09a19cb879d1842c491c573ab9191e21089c46769f509c40d81dc`.
- Forensic report: `.tmp-r8-r3-r2/TRACK1_FORENSIC_0D6561A8.md`.
- Gate result: `STAGE_2F4E3G_R8_R4_PROCEDURAL=PASS`, `STAGE_2F4E3G_R8_R4_SUBSTANTIVE=PASS`.
- Gate manifest SHA256: `9b4e101f1ff85ae1b95bc456f13801554bd493411c4e0154ebf25a7d16831085`.
- Review archive SHA256: `481a14256588451e93978509bc83ff66254583e7d77b4f05dabca50a0b9492fe`.

## R8-R5 hydration
- Patch SHA256: `61007865b01d0157ccd34932dad670f1af79aca6829864eed6823e16b83b1999`.
- Applied file: `sentinel-grid/live-parity/runtime-collector/tests/self-test.mjs` only.
- Applied file SHA256: `d2e90525848064627e2fb136667912955779efb0be3d773d86890efe668a41f6`.
- Historical fixtures and `collector-core.mjs` were not modified by hydration.
- Verification: PASS 18/18, R0, record pass true, manifest valid.

## Live qualification
- First accepted capture ID: `zeknova-live-20260809214907-86ef2c255ea07348:000000:fbbdf4b0665f27903377`.
- Record count: 1,749 before; 1,750 after.
- Manifest count: 41 before; 42 after.
- Quarantine count: 0.
- Sampling state identities: 1,736.
- Collector runtime build SHA256: `683135420467866ca1f1ac6df8587fd322e6fa3609bea71b423504004ef3f2eb`.
- Authority: R0; dispatch false; live-world mutation false.
- Ports: collector `127.0.0.1:43127` LISTEN; dev `127.0.0.1:8790` LISTEN.

## Compatibility correction
The current certified campaign exposes 4–18 sub-objectives per mission. The provider's obsolete exact-five restriction prevented readiness. Mission phase is now derived from the completed-objective ratio (`≤25%` opening, `≤75%` midgame, otherwise late), retaining deterministic semantics across the expanded catalog. The binding publishes R0 qualification status and bounded error detail through document data attributes; it adds no command or mutation surface.
