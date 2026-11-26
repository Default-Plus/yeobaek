# Code Signing Policy

This document describes the code signing policy for **Yeobaek** (`Default-Plus/yeobaek`), in alignment with [SignPath Foundation](https://signpath.org/) open-source code signing guidelines.

## Purpose & Scope

- **Windows Releases (`.exe`):** Free code signing provided by [SignPath.io](https://signpath.io/), certificate by [SignPath Foundation](https://signpath.org/) (upon approval).
- **Android Releases (`.apk`):** Signed automatically in GitHub Actions using the project's dedicated release keystore stored in encrypted GitHub Repository Secrets.

## Build & Signing Provenance

1. All official release binaries are built exclusively from this public GitHub repository (`Default-Plus/yeobaek`) via GitHub Actions (`.github/workflows/release.yml`).
2. Signed releases are triggered only from versioned Git tags (`v*`) corresponding to publicly auditable commits on the `main` branch.
3. No manually built or locally modified Windows binaries are submitted for foundation code signing.

## Team Roles

- **Committers & Reviewers:** `@Default-Plus` (Nam Gi-tae)
- **Approvers:** `@Default-Plus` (Nam Gi-tae)

## Privacy & Security

- Yeobaek is a **Local-First** productivity application. All notes, tasks, and calendar entries are stored locally in the user's browser/app storage (IndexedDB).
- Optional synchronization uses the user's own Google Drive (`drive.appdata` scope only) directly from the client. No user data is transmitted to or stored on any third-party developer server.
- Full Privacy Policy and Terms are available in the repository under `src/app/privacy` and `src/app/terms`.
- To report a security issue, please contact `default_plus@naver.com` or open an advisory on GitHub.
