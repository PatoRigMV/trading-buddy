# Secrets hygiene & rotation

- **Never** log raw keys. Use a masker that redacts values except last 4 chars.
- Add CI secret scanning (e.g., Gitleaks) and a pre-commit hook.
- Rotation playbook: revoke → re-issue → deploy → invalidate old; document per provider.
- Mask keys in `/health` and `/status` endpoints.
