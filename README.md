# hamiebrooklyn.github.io

Static site for **PokePon** (landing + legal). Deploy as a [GitHub Pages](https://pages.github.com/) user/organization site.

## Publish

1. Create or use the repo `HamieBrooklyn/hamiebrooklyn.github.io`.
2. Copy the contents of this folder to the **root** of that repository (`index.html`, `collection/`, `deck/`, `trades/`, `auctions/`, `terms/`, `privacy/`, `assets/`, …).
3. In the repo **Settings → Pages**, set Source to **Deploy from branch** (usually `main` / root).
4. Update **`index.html`**: replace `YOUR_APPLICATION_ID` in the Discord invite URL with your app’s client ID.

After DNS propagates, the site will be available at `https://hamiebrooklyn.github.io/`.

**Player guide** (share in Discord — jumps to the section on the same page as the landing hero): `https://hamiebrooklyn.github.io/#player-guide`

(`guide.html` also redirects there.)

## Collection HTTP API (website)

The [collection binder](https://hamiebrooklyn.github.io/collection/) talks to the **running bot** (`WEB_PORT` + OAuth + session cookie). Deploy [Poke-Cards](https://github.com/HamieBrooklyn/Poke-Cards) **master** with the collection sell API ([`97c5d1f`](https://github.com/HamieBrooklyn/Poke-Cards/commit/97c5d1f) or newer).

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/me/collection` | Paginated cards; each item includes **`sell`** (`quote_pokedollars`, `needs_confirm`, `blocked_reason`, `can_sell`). |
| `GET` | `/api/me/cards/{public_id}` | One card + same **`sell`** object. |
| `POST` | `/api/me/cards/{public_id}/sell` | Body: `{ "expected_payout": <int>, "confirm_rare"?: true }`. Amount is computed with `quote_collection_sell_payout` (same helper as any Discord UI wired to `poke_pon_bot.services.collection_sell`). |

Configure the page’s **`pokepon-api-base`** meta tag (or `?api=` override) to your HTTPS bot URL. CORS must allow the GitHub Pages origin in the bot’s `WEB_ALLOWED_ORIGINS`.

## Legal

`terms/` and `privacy/` are templates for a Discord bot. Review and adjust with your counsel before relying on them in production.

## Clean URLs and custom domain

App pages use folder URLs (no `.html` in the address bar), e.g. `/collection/`, `/deck/`. Old `*.html` links redirect automatically.

To use your own domain (e.g. `pokepon.app`):

1. Buy the name at a registrar (check availability on [Namecheap](https://www.namecheap.com) or [Cloudflare Registrar](https://www.cloudflare.com/products/registrar/)).
2. Copy `CNAME.example` to `CNAME` in the repo root and set the domain inside (one line, no `https://`).
3. Point DNS: `CNAME` record `@` or `www` → `hamiebrooklyn.github.io` (GitHub’s [custom domain docs](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site)).
4. In repo **Settings → Pages**, enable **Enforce HTTPS** after DNS verifies.
5. Update the bot’s `WEB_ALLOWED_ORIGINS` and `WEB_FRONTEND_URL` to `https://your-domain/collection/`.
