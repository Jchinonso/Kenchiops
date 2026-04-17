# Encrypted Secrets

This directory holds SOPS-encrypted environment files for each deploy
environment. The encryption key is an age key; see
`docs/SECURITY_IMPLEMENTATION.md` §B for key storage, rotation, and
decryption procedures.

## Files

| File                 | Environment | Deployed to                       |
| -------------------- | ----------- | --------------------------------- |
| `production.env.enc` | production  | `/etc/kenchi/.env.production.enc` |
| `staging.env.enc`    | staging     | `/etc/kenchi/.env.staging.enc`    |

## Editing secrets

**Always edit via `sops`, never decrypt to a plain file on your laptop.**

```bash
# Requires age private key at ~/.config/sops/age/keys.txt
# (copy from password manager once, mode 0400)
sops deploy/secrets/production.env.enc
```

SOPS opens your `$EDITOR` with the decrypted content and re-encrypts on
save. The encrypted file can be safely committed to git.

## Safety rules

- Never `cat` or `less` a decrypted secret into your terminal scrollback
  longer than necessary.
- Never paste a decrypted secret into Slack, GitHub, screenshots, or AI
  chat tools.
- Never commit a decrypted `.env` file. The `.gitignore` at repo root
  blocks common filenames, but this directory is the source of truth.
- If a secret leaks: rotate the secret immediately at the provider, then
  re-encrypt with the new value.
