# Azure deploy notes

Canonical instructions live in [../../DEPLOYMENT.md](../../DEPLOYMENT.md) (Sections 3–4). Quick reference:

| Resource | Name used in docs | Notes |
|---|---|---|
| Resource group | `matpotlib-rg` | region `eastus` |
| Container registry | `<acrname>` (globally unique) | Basic SKU |
| Container Apps env | `matpotlib-env` | |
| Container App | `matpotlib-api` | external ingress :3000, min replicas 0 (scale-to-zero), max 1 |

- Free HTTPS domain: `https://matpotlib-api.<hash>.eastus.azurecontainerapps.io` — no custom domain or cert needed for MVP.
- Scale-to-zero means the first request after idle takes a few seconds (cold start). The ESP32 posts every 15 min, which keeps it mostly warm during demos; acceptable trade-off for free-tier cost.
- CI/CD: `.github/workflows/deploy.yml` builds `backend/Dockerfile`, pushes `matpotlib-backend:<git-sha>` to ACR, and runs `az containerapp update`. Secrets required: `AZURE_CREDENTIALS`, `ACR_NAME`, `CONTAINERAPP_NAME`, `RESOURCE_GROUP`.
- App env/secrets are set on the Container App itself (`az containerapp update --set-env-vars ... --secrets ...`), not in the image.
