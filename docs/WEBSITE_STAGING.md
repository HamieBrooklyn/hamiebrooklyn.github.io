# Staging website (separate from production)

Production and staging are **two deployments**. Editing the staging branch or `pokepon-org-staging` repo does **not** change **https://pokepon.org** until you promote.

| | Production | Staging |
|---|---|---|
| URL | **https://pokepon.org** | **https://staging.pokepon.org** |
| Git branch | `main` | `staging` |
| GitHub repo | `HamieBrooklyn/hamiebrooklyn.github.io` | `HamieBrooklyn/pokepon-org-staging` |
| API (default) | `https://api.pokepon.org` | `https://api-staging.pokepon.org` |
| Bot port | 8080 | 8081 |

The staging hostname pins the API to staging automatically (`assets/api-base-init.js`). You no longer need `?api=https://api-staging.pokepon.org` on the live domain for day-to-day work.

---

## One-time setup

### 1. Staging site repository

```bash
gh repo create HamieBrooklyn/pokepon-org-staging --public --description "PokePon staging website"
```

In **pokepon-org-staging → Settings → Pages**:

- Source: **Deploy from a branch** → branch `main` → `/ (root)`
- **Custom domain:** `staging.pokepon.org` → Save

### 2. DNS (Cloudflare / registrar)

| Type | Name | Value |
|------|------|--------|
| CNAME | `staging` | `HamieBrooklyn.github.io` |

Use **DNS only** (grey cloud) until GitHub shows a valid certificate, same as apex setup.

### 3. Staging branch on the main website repo

```bash
cd ~/Documents/GitHub/hamiebrooklyn.github.io
git checkout main
git checkout -b staging
git push -u origin staging
```

### 4. Bot `.env.staging` (Poke-Cards)

Add the staging site origin (see `config/STAGING-FILL-IN.md`):

```env
WEB_FRONTEND_URL=https://staging.pokepon.org/collection/
WEB_ALLOWED_ORIGINS=https://staging.pokepon.org,https://pokepon.org,https://hamiebrooklyn.github.io
```

Restart staging bot after editing.

### 5. Discord staging OAuth

Redirect URL stays:

`https://api-staging.pokepon.org/auth/discord/callback`

Sign in from **https://staging.pokepon.org** while testing.

---

## Daily workflow

**Agents:** push **staging** after every feature; push **production** only when you say “push to production”.

```bash
cd ~/Documents/GitHub/hamiebrooklyn.github.io
git checkout staging
# … edit HTML / assets …

bash scripts/deploy-website-staging.sh
```

Open **https://staging.pokepon.org** and test with the staging bot (`bash scripts/start-bot-staging.sh` in Poke-Cards).

When you want live users to see it, say **push to production** — then:

```bash
bash scripts/promote-website-to-production.sh
```

That merges `staging` → `main` and updates **pokepon.org** only.

---

## Optional: GitHub Actions

`.github/workflows/deploy-staging-site.yml` can deploy on every push to `staging` if you add a `STAGING_SITE_TOKEN` secret (PAT with `repo` scope on `pokepon-org-staging`). Manual `deploy-website-staging.sh` works without it.

---

## Legacy `?api=` on pokepon.org

Still supported for quick checks, but prefer **staging.pokepon.org** so production localStorage and bookmarks are not affected.
