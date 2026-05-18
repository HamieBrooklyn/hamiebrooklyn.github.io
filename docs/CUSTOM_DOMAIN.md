# Custom domain: pokepon.org

Primary site URL: **https://pokepon.org**  
`www.pokepon.org` redirects to apex (handled by GitHub Pages when DNS below is set).

## 1. DNS (at your registrar)

### Apex — `pokepon.org`

| Type | Host / name | Value |
|------|-------------|--------|
| A | `@` | `185.199.108.153` |
| A | `@` | `185.199.109.153` |
| A | `@` | `185.199.110.153` |
| A | `@` | `185.199.111.153` |

### www — `www.pokepon.org`

| Type | Host / name | Value |
|------|-------------|--------|
| CNAME | `www` | `hamiebrooklyn.github.io` |

**Cloudflare users:** use **DNS only** (grey cloud) on these records until GitHub shows a valid HTTPS certificate, then you may enable proxy if you want.

Propagation check: [whatsmydns.net — A record for pokepon.org](https://www.whatsmydns.net/#A/pokepon.org)

## 2. GitHub Pages

Repo **HamieBrooklyn/hamiebrooklyn.github.io**:

1. **Settings → Pages → Custom domain** → enter `pokepon.org` → Save.
2. Wait for DNS check (can take minutes to 48h).
3. Enable **Enforce HTTPS** when the option appears.

The repo root **`CNAME`** file must contain `pokepon.org` (already committed).

## 3. Bot / API (Poke-Cards `.env`)

Update on the machine that runs the bot (restart after saving):

```env
WEB_ALLOWED_ORIGINS=https://pokepon.org,https://hamiebrooklyn.github.io
WEB_FRONTEND_URL=https://pokepon.org/collection/
```

Keep `https://hamiebrooklyn.github.io` in origins during transition; remove it later if you want.

`WEB_PUBLIC_URL` is your **API** host (`https://api.pokepon.org`), not the GitHub Pages site.  
See **[API_SUBDOMAIN.md](./API_SUBDOMAIN.md)** for Cloudflare Tunnel from a home PC.

## 4. Discord Developer Portal

**OAuth2 → Redirects** — keep your API callback; no change unless you only listed the old site.

Users log in from `https://pokepon.org/...`; CORS must allow that origin (step 3).

## 5. Stripe

If checkout success/cancel URLs are built from `WEB_FRONTEND_URL`, set:

```env
WEB_FRONTEND_URL=https://pokepon.org/shop/
```

(or `/collection/` if that is your configured frontend base — shop checkout appends `/shop/`).

Stripe webhook: `https://api.pokepon.org/api/stripe/webhook`  
Top.gg webhook: `https://api.pokepon.org/topgg/webhook`

## 6. Share links

Use **https://pokepon.org** in Discord, Top.gg, and bios.  
`https://hamiebrooklyn.github.io` continues to work as GitHub’s default host.
