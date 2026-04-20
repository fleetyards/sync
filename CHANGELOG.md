# Changelog

## [1.3.0](https://github.com/fleetyards/sync/compare/v1.2.6...v1.3.0) (2026-04-20)


### Features

* add store delay notice to Discord release notification ([793eae1](https://github.com/fleetyards/sync/commit/793eae1460d42f934ea6c8e757f11154a4ec6305))


### Bug Fixes

* **ci:** approve pnpm build scripts for esbuild and spawn-sync ([c726799](https://github.com/fleetyards/sync/commit/c726799e001112470763b39bdec95339ab7a85a3))
* **ci:** use .npmrc for pnpm build script approval ([f98b65e](https://github.com/fleetyards/sync/commit/f98b65e2c0457195632f99967b6d9a91220d57f1))


### Chores

* **deps-dev:** bump vitest from 4.1.2 to 4.1.4 ([#95](https://github.com/fleetyards/sync/issues/95)) ([cdc3184](https://github.com/fleetyards/sync/commit/cdc3184efd35f54ac291f311c2b7a5cb881d79a6))
* **deps:** bump actions/checkout from 4 to 6 ([#93](https://github.com/fleetyards/sync/issues/93)) ([8940de8](https://github.com/fleetyards/sync/commit/8940de84a58d66ca42cbf91ff87655740784bb7a))
* **deps:** bump actions/download-artifact from 7 to 8 ([#92](https://github.com/fleetyards/sync/issues/92)) ([1026f94](https://github.com/fleetyards/sync/commit/1026f94c5601124dc99ab43dbbbb6e8d2fa8d734))
* **deps:** bump vue from 3.5.31 to 3.5.32 ([#94](https://github.com/fleetyards/sync/issues/94)) ([cafaeb2](https://github.com/fleetyards/sync/commit/cafaeb23c7186480ddb9f4c8799cd8473c9b511f))

## [1.2.6](https://github.com/fleetyards/sync/compare/v1.2.5...v1.2.6) (2026-04-07)


### Bug Fixes

* **ci:** replace broken Firefox addon action with direct API calls ([70cbf31](https://github.com/fleetyards/sync/commit/70cbf317c8877572f90575280de440b5ee588213))

## [1.2.5](https://github.com/fleetyards/sync/compare/v1.2.4...v1.2.5) (2026-04-07)


### Bug Fixes

* **ci:** use correct AMO license slug GPL-3.0-only ([673b98b](https://github.com/fleetyards/sync/commit/673b98b53d5158e6f0f91cbfa58e4396de9774d7))

## [1.2.4](https://github.com/fleetyards/sync/compare/v1.2.3...v1.2.4) (2026-04-07)


### Bug Fixes

* **ci:** add explicit license to Firefox Add-ons publish step ([ab62c6f](https://github.com/fleetyards/sync/commit/ab62c6fb2a6f19f6c9891f6b95d442e2c2e15a60))

## [1.2.3](https://github.com/fleetyards/sync/compare/v1.2.2...v1.2.3) (2026-04-07)


### Bug Fixes

* **ci:** use correct input name release-note for Firefox Add-ons action ([00eeb00](https://github.com/fleetyards/sync/commit/00eeb00b0e67a6c22afca07295b97bd7bd834a90))
* remove URL pattern from permissions array ([d6c22cd](https://github.com/fleetyards/sync/commit/d6c22cd63e1eca8c0ed4b26594b57555770a5ac6))

## [1.2.2](https://github.com/fleetyards/sync/compare/v1.2.1...v1.2.2) (2026-04-07)


### Bug Fixes

* **ci:** add release-notes to Firefox Add-ons publish step ([e74d9dc](https://github.com/fleetyards/sync/commit/e74d9dc623e8e6d3495f8871eff7993910d993c5))

## [1.2.1](https://github.com/fleetyards/sync/compare/v1.2.0...v1.2.1) (2026-04-07)


### Bug Fixes

* **ci:** use exact versioned filenames in publish steps ([0ec3e59](https://github.com/fleetyards/sync/commit/0ec3e59ced6b51d7900d0e44028cdfc68d2dc102))

## [1.2.0](https://github.com/fleetyards/sync/compare/v1.1.0...v1.2.0) (2026-04-07)


### Features

* **ci:** add Discord notification with embed on release ([3775868](https://github.com/fleetyards/sync/commit/3775868cb03a885f4e8608082f4d48bc0fed2722))


### Bug Fixes

* **ci:** fix release workflow artifact upload and bump action versions ([d1b7188](https://github.com/fleetyards/sync/commit/d1b71888c02baf6cc2bda0fb15be31d8e0523446))

## [1.1.0](https://github.com/fleetyards/sync/compare/v1.0.5...v1.1.0) (2026-04-07)


### Features

* add fleetyards.dev to production content script matches ([b328034](https://github.com/fleetyards/sync/commit/b3280341fb96c4785d8baa1100284e1c3eadaea4))


### Bug Fixes

* **ci:** use default GITHUB_TOKEN for release-please ([ce76eba](https://github.com/fleetyards/sync/commit/ce76eba1a989a88f498f22f1b670b17b785919c2))
* **ci:** use RELEASE_TOKEN for release-please to trigger CI on PRs ([bb31c95](https://github.com/fleetyards/sync/commit/bb31c9501072b1d2075f2233f7caddd479926109))


### Chores

* **deps-dev:** bump typescript from 5.9.3 to 6.0.2 ([#77](https://github.com/fleetyards/sync/issues/77)) ([32a2ad6](https://github.com/fleetyards/sync/commit/32a2ad6511d0b9e736c4f0c690a265b8a1a89732))
* **deps-dev:** bump vue-tsc from 3.1.5 to 3.2.6 ([#80](https://github.com/fleetyards/sync/issues/80)) ([ffeb84a](https://github.com/fleetyards/sync/commit/ffeb84ae4913b469c572cc456b42e3da490bd25f))
* **deps-dev:** bump wxt from 0.20.11 to 0.20.20 ([#78](https://github.com/fleetyards/sync/issues/78)) ([84bb9e7](https://github.com/fleetyards/sync/commit/84bb9e7f0d7178d7331e30ef5225dc8f2f03dec0))
* switch from manual prepare-release to release-please ([f96fdf7](https://github.com/fleetyards/sync/commit/f96fdf7a7fbfa5b009f3d02daf50c999ecf386e3))
