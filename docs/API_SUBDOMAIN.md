# API host: `api.pokepon.org` (home PC → port 8080)

The static site lives on **GitHub Pages** at `https://pokepon.org`.  
The **Discord bot** serves OAuth, collection/shop/trade APIs, Stripe, and Top.gg on **port 8080** at home.

Use **`https://api.pokepon.org`** as the public API — do **not** point the apex domain at your PC.

## Architecture

| Host | Serves |
|------|--------|
| `pokepon.org` | GitHub Pages (HTML/CSS/JS) |
| `api.pokepon.org` | Cloudflare Tunnel → `http://127.0.0.1:8080` (bot) |

## 1. Cloudflare Tunnel (recommended for home)

You need **Cloudflare** managing DNS for `pokepon.org` (add the domain under **Websites** if it is only at the registrar today).

### Install `cloudflared` (macOS)

```bash
brew install cloudflared
```

### Create the tunnel

```bash
cloudflared tunnel login
cloudflared tunnel create pokepon-api
```

Note the tunnel **UUID** printed (and credentials file under `~/.cloudflared/`).

### Config file

Create `~/.cloudflared/config.yml`:

```yaml
tunnel: <TUNNEL_UUID>
credentials-file: /Users/<YOU>/.cloudflared/<TUNNEL_UUID>.json

ingress:
  - hostname: api.pokepon.org
    service: http://localhost:8080
  - service: http_status:404
```

Replace `<TUNNEL_UUID>`, `<YOU>`, and the credentials path with your values.

### DNS route

```bash
cloudflared tunnel route dns pokepon-api api.pokepon.org
```

This creates a CNAME for `api` in Cloudflare. **Do not** change the apex `pokepon.org` A records (they must stay on GitHub Pages).

### Run the tunnel

**Foreground (testing):**

```bash
cloudflared tunnel run pokepon-api
```

**Background (macOS, survives reboot):**

```bash
sudo cloudflared service install
sudo cloudflared service start
```

(After `service install`, ensure `config.yml` is in place.)

### Dashboard alternative

**Zero Trust** → **Networks** → **Tunnels** → your tunnel → **Public Hostname**:

- Subdomain: `api`
- Domain: `pokepon.org`
- Service: `http://localhost:8080`

## 2. Bot `.env` (Poke-Cards repo)

On the home PC:

```env
WEB_PORT=8080
TOPGG_WEBHOOK_PORT=8080
WEB_PUBLIC_URL=https://api.pokepon.org
WEB_ALLOWED_ORIGINS=https://pokepon.org,https://hamiebrooklyn.github.io
WEB_FRONTEND_URL=https://pokepon.org/collection/
TOPGG_WEBHOOK_SECRET=whs_...
```

Restart the bot after saving.

## 3. External dashboards

| Service | URL |
|---------|-----|
| **Top.gg** webhook | `https://api.pokepon.org/topgg/webhook` |
| **Discord** OAuth redirect | `https://api.pokepon.org/auth/discord/callback` |
| **Stripe** webhook | `https://api.pokepon.org/api/stripe/webhook` |

## 4. Website

Pages use:

```html
<meta name="pokepon-api-base" content="https://api.pokepon.org" />
```

(Already set in this repo for collection, shop, trades, etc.)

## 5. Verify

1. Bot running: `curl -sS -o /dev/null -w "%{http_code}\n" https://api.pokepon.org/api/me` → expect `200` or `401`/`403`, not `502`.
2. Bot log: `Web server listening on http://0.0.0.0:8080` and `Top.gg vote webhook route registered at /topgg/webhook`.
3. Top.gg → send **webhook test**.
4. Open `https://pokepon.org/collection/` → sign in with Discord.

## Troubleshooting

- **502 / error 1033**: tunnel not running, or bot not on 8080.
- **OAuth redirect mismatch**: add exact callback URL in Discord portal.
- **CORS errors**: `WEB_ALLOWED_ORIGINS` must include `https://pokepon.org`.
- **Collection “API offline”**: `pokepon-api-base` must be `https://api.pokepon.org` and tunnel + bot must be up.
