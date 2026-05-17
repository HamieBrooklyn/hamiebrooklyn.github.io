# PokePon website

Static site for **PokePon** (landing + web app + legal). Hosted on [GitHub Pages](https://pages.github.com/).

**Public URL:** [https://pokepon.org](https://pokepon.org)  
(`https://hamiebrooklyn.github.io` remains available as the GitHub default host.)

Custom domain setup (DNS, HTTPS, bot env): see [docs/CUSTOM_DOMAIN.md](docs/CUSTOM_DOMAIN.md).

## Publish

1. Repo: `HamieBrooklyn/hamiebrooklyn.github.io` — deploy from `main` / root.
2. **Settings → Pages → Custom domain:** `pokepon.org` (see `CNAME` in repo root).
3. Update **`index.html`**: replace `YOUR_APPLICATION_ID` in the Discord invite URL with your app’s client ID.

**Player guide** (share in Discord): [https://pokepon.org/#player-guide](https://pokepon.org/#player-guide)

## Collection HTTP API (website)

The [collection binder](https://pokepon.org/collection/) talks to the **running bot** (`WEB_PORT` + OAuth + session cookie). Deploy [Poke-Cards](https://github.com/HamieBrooklyn/Poke-Cards) with the collection / shop / trade APIs enabled.

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/me/collection` | Paginated cards; each item includes **`sell`** (`quote_pokedollars`, `needs_confirm`, `blocked_reason`, `can_sell`). |
| `GET` | `/api/me/cards/{public_id}` | One card + same **`sell`** object. |
| `POST` | `/api/me/cards/{public_id}/sell` | Body: `{ "expected_payout": <int>, "confirm_rare"?: true }`. |

Production API base: **`https://api.pokepon.org`** (see [docs/API_SUBDOMAIN.md](docs/API_SUBDOMAIN.md) for Cloudflare Tunnel from a home PC). CORS must allow `https://pokepon.org` in the bot’s `WEB_ALLOWED_ORIGINS`.

## Legal

`terms.html` and `privacy.html` are templates for a Discord bot. Review and adjust with your counsel before relying on them in production.
