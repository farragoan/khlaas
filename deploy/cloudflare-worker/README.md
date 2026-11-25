# khlaas-edge

Cloudflare Worker for `dhruvnagpal.in/khlaas*`. Only `/khlaas` and `/khlaas/...` are sent through the `KHLAAS` Workers VPC binding; similar paths such as `/khlaasx` go to the normal origin. The VPC service uses plain HTTP to the private app on port 3100, while forwarding the public HTTPS host and protocol to Next.js and Clerk.

```sh
npm ci
npm run typecheck
npm test
npm run deploy # runs wrangler deploy
```

Deploy from this directory with an authenticated Cloudflare account that can bind the existing VPC service. `wrangler types` regenerates `worker-configuration.d.ts` after binding changes. No application secrets belong in this Worker.
