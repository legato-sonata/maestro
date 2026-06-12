# Maestro: Playwright Codespace PoC

Maestro is a proof-of-concept project that automates the creation of a GitHub Codespace, runs a headless Playwright browser recording session within it, retrieves the recorded video artifact, and manages the Codespace lifecycle.

## Getting Started

1. **Push your code:** Ensure this repository is pushed to GitHub.
2. **Configure:** Edit `maestro.env` to set your target URL, video duration, and codespace behavior.
3. **Run:** Execute `./maestro.sh` to begin the orchestration.

## Configuration Modes

`maestro.env` supports two `CODESPACE_CLEANUP_MODE` options:
- `delete`: Completely destroys the Codespace after recording. Best for one-off recordings to save quota.
- `stop`: Pauses the Codespace after recording. Best when experimenting with configurations, as the next `./maestro.sh` run will reuse the existing Codespace, avoiding the setup time.

## Troubleshooting

### HTTP 403 Error (Forbidden)
If you encounter a `403` error when the script attempts to create or manage the Codespace, it means your GitHub CLI token lacks the required `codespace` scope. 

To grant the necessary permissions, refresh your authentication by running the following command:
```bash
gh auth refresh -h github.com -s codespace
```
After successful authentication, run `./maestro.sh` again.
