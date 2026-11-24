# Venue Book, self-hosted with GitHub storage

How it fits together
- `site/index.html` is the venue book. It only talks to `/api/marks` on its own address. No secret is inside it.
- `functions/api/marks.js` runs on Cloudflare. It holds the GitHub token as a secret, and reads/writes `marks.json` in your private data repo.
- Cloudflare Access sits in front of everything and only lets in the two emails. The function also re-checks Access's signed login token and the email list, so a request that skips Access is refused.
- `data/marks.json` is your current marks (hearts, statuses), ready to commit as the starting data.

Setup (about 20 minutes)
1. GitHub: create a PRIVATE repo, e.g. `venue-book-data`. Commit `data/marks.json` to its root as `marks.json` on the `main` branch.
2. GitHub: Settings > Developer settings > Fine-grained tokens > Generate new token.
   Repository access: Only select repositories > the data repo. Permission: Contents = Read and write. Nothing else. Set an expiry and note the date.
   Do not paste this token into chats, the page or any file.
3. Cloudflare (free plan is enough): `npm i -g wrangler` then `wrangler login`.
4. Edit `wrangler.toml`: set REPO (and BRANCH if not main). Leave TEAM_DOMAIN and POLICY_AUD for step 6.
5. From this folder: `wrangler pages project create venue-book --production-branch main`, then
   `wrangler pages secret put GITHUB_TOKEN --project-name venue-book` (paste the token when asked), then `wrangler pages deploy`.
6. Cloudflare dashboard > Zero Trust > Access > Applications > Add an application > Self-hosted.
   Hostname: your site address (venue-book.pages.dev, or your own domain). Add a policy: Action Allow, Include > Emails > christopher.servant@gmail.com and k.youssefamasha@gmail.com. Login method: One-time PIN.
   Also protect the preview addresses (*.venue-book.pages.dev).
   Copy the application's Audience (AUD) tag into POLICY_AUD, and your team domain (xxxx.cloudflareaccess.com) into TEAM_DOMAIN in `wrangler.toml`, then run `wrangler pages deploy` again.
7. Test: open the site, sign in with an email code, heart a place, and check that a commit appears in the data repo. Try another email: it must be refused.

Good to know
- Each change is one commit in the data repo. History there is your backup.
- Marks refresh every 20 seconds, so you and Karine see each other's changes within that time.
- The PDF/CSV download buttons only existed inside Claude, so they are hidden here.
- Rotate the GitHub token before its expiry: make a new one, run the `secret put` command again, delete the old one.
- Not tested against real Cloudflare or GitHub accounts. The sign-in check and the GitHub read/write logic were tested here with mocks.
