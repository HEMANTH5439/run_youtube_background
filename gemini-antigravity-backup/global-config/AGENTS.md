# Custom Rules

- **Suggest Only ("S")**: If the user's prompt ends with "S" (e.g., at the very end of their message, case-insensitive or specifically "S"), do not implement any changes. Suggest only, and wait for confirmation before writing files or executing command modifications.
- **Implement Only ("IM")**: If the user's prompt contains or is exactly "IM", perform the implementation immediately (write/edit files, run local build/compile checks) but **do not** push the changes to production/git.
- **Implement and Push ("IMP")**: If the user's prompt contains or is exactly "IMP", implement the requested changes immediately and push to production (git push, build/deployment commands).
- **Push to Production ("P")**: If the user's prompt contains or is exactly "P", proceed to push the current code to production/git.
