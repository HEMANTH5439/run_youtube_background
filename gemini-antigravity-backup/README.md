# Gemini Antigravity Config Backup

Backed up on: 2026-07-02

## Directory Structure

```
gemini-antigravity-backup/
├── global-config/                    # → ~/.gemini/config/
│   ├── AGENTS.md                     # Global rules (S/IM/IMP/P shortcuts)
│   ├── config.json                   # Global settings & permission grants
│   └── projects/                     # → ~/.gemini/config/projects/
│       ├── 2fc73645-...-ec1f.json    # run_youtube_background
│       ├── 5d4a2aca-...-4c79.json    # the-way-back
│       ├── 660448ba-...-59ce.json    # alpaca-ai-bot
│       └── d23325f6-...-4711.json    # Comic AI
└── workspaces/
    └── the-way-back/
        └── AGENTS.md                 # Next.js agent rules
```

## How to Restore

After reinstalling your OS and installing Gemini Antigravity:

```bash
# 1. Clone this repo
git clone https://github.com/HEMANTH5439/run_youtube_background.git

# 2. Restore global config
mkdir -p ~/.gemini/config/projects
cp gemini-antigravity-backup/global-config/AGENTS.md ~/.gemini/config/
cp gemini-antigravity-backup/global-config/config.json ~/.gemini/config/
cp gemini-antigravity-backup/global-config/projects/*.json ~/.gemini/config/projects/

# 3. Restore workspace-level configs (once you re-clone those repos)
cp gemini-antigravity-backup/workspaces/the-way-back/AGENTS.md /path/to/the-way-back/
```

> **Note**: The project JSON files reference local paths (e.g., `file:///Users/chills/...`).
> You may need to update these paths if your username or directory structure changes.
