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

**Important:** If the Cloudflare proxy (orange cloud) is on for `staging`, Firefox/Chrome will show “unsafe” because GitHub’s certificate is for `staging.pokepon.org`, not the proxy. Turn the proxy **off** for the `staging` record.

### 2b. HTTPS certificate (Firefox “unsafe” warning)

GitHub must issue a certificate for **`staging.pokepon.org`** (not `*.github.io`).

1. **pokepon-org-staging → Settings → Pages** → confirm custom domain `staging.pokepon.org` is saved (no “DNS not configured” warning).
2. Wait **15 minutes – 24 hours** after DNS propagates.
3. When ready, enable **Enforce HTTPS** on that Pages screen.

Until the cert is ready you can use **http://staging.pokepon.org** (same site, no TLS warning). Do not use `https://pokepon.org/?api=…` for routine staging work.

Check the cert (should show `CN=staging.pokepon.org`):

```bash
echo | openssl s_client -connect staging.pokepon.org:443 -servername staging.pokepon.org 2>/dev/null | openssl x509 -noout -subject
```

If the subject shows `CN=*.github.io` instead, browsers block **https://staging.pokepon.org** (looks “down”). The HTML is usually still fine on **http://staging.pokepon.org**. Fix:

1. **pokepon-org-staging → Settings → Pages** — save custom domain `staging.pokepon.org` again (or re-run the API steps below).
2. When GitHub shows the certificate **approved**, enable **Enforce HTTPS**.
3. Wait a few minutes for the new cert to appear at the edge.

```bash
# Re-trigger cert + enforce HTTPS (requires gh auth)
gh api -X PUT repos/HamieBrooklyn/pokepon-org-staging/pages \
  --input - <<< '{"cname": "staging.pokepon.org", "https_enforced": true}'
```

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

### Staying on staging (not pokepon.org)

- Use **staging.pokepon.org** in the address bar (not pokepon.org with `?api=`).
- After Discord login, you should land back on **staging** — if you still hit production, sign out and log in again on staging (old OAuth fallback used `WEB_FRONTEND_URL` before it pointed at staging).
- `assets/site-origin.js` rewrites any `https://pokepon.org/...` links on the staging host to stay on staging.

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
