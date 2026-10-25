# Leadership USDT: setup guide

## 0. Security first
If you pasted your bot token in any chat, open @BotFather, send /revoke, pick the bot, and use the NEW token. Never share tokens or the Firebase key. Keep the GitHub repo private.

## 1. Firebase (database)
1. console.firebase.google.com > Add project > Build > Firestore Database > Create (production mode).
2. Upgrade to the Blaze plan (pay as you go). The free plan is too small for 10k users.
3. Project settings > Service accounts > Generate new private key. A JSON file downloads.
4. Firestore > Rules: paste the contents of firestore.rules and Publish. No indexes need to be created by hand.

## 2. Deploy on Vercel
Vercel cannot deploy a raw .zip, so use one of these:
- GitHub: unzip, upload the folder to a new PRIVATE GitHub repo, then in Vercel choose Add New > Project > import it. Framework preset: Other.
- Or with a computer: unzip, open a terminal in the folder, run `npx vercel --prod`.
Free (Hobby) plan: the cron runs once a day (Saturday winners are picked within the hour after 00:05 UTC, and broadcast messages go out slowly). Pro plan (recommended, the free plan forbids commercial use): edit vercel.json and change the schedule to "*/5 * * * *".

Add these Environment Variables (Project > Settings > Environment Variables), then Redeploy:

| Name | Value |
|---|---|
| BOT_TOKEN (required) | New token from BotFather |
| BOT_USERNAME | Leaderusdt_bot |
| ADMIN_ID (required) | 5980396006 |
| FIREBASE_SERVICE_ACCOUNT (required) | Whole service-account JSON pasted as one line |
| WEBHOOK_SECRET (required) | Any long random string, letters and numbers only |
| CRON_SECRET (required) | Another long random string |
| APP_URL (required) | https://your-project.vercel.app (no slash at the end) |
| ADEXIUM_WID | Your Adexium widget ID. Already built in as the default, set it only to change it |
| WELCOME_IMAGE | Optional. The welcome banner is built in (public/banner.png). Set it only to use another image link |
| SUPPORT_URL | Support link such as https://t.me/yourname |

Optional settings (defaults in brackets, change only if you want):
REQUIRED_CHANNELS [@leader_usdt_boot,@leaderpaymemtproof], PROOF_CHANNEL [@leaderpaymemtproof], START_DATE [2026-11-02T00:00:00Z, must be a Monday 00:00 UTC. Changing it starts a fresh competition], NOTIFY_ACTIVITY [1, set 0 to stop the per-activity bot messages],
INVITE_POINTS [500], AD_POINTS [100], TASK_POINTS [200], CHECKIN_POINTS [50], ADS_PER_WINDOW [30], ADS_WINDOW_HOURS [12], AD_MIN_GAP_SECONDS [15],
TASK_COST_POINTS [50000], TASK_WAIT_SECONDS [5], BOOST_MULTIPLIER [2], BOOST_LAST_HOURS [24], INVITE_MILESTONES [5:500,10:1500,25:5000],
PRIZE_ROUND1 [6,4], PRIZE_ROUND2 [12,8], PRIZE_STEP [2], PRIZE_MAX [50], PRIZE_3_TO_10 [0.5], BROADCAST_BATCH [600].

## 3. Telegram
1. Make the bot an ADMIN in both channels. Joins cannot be verified without this.
2. Open this link in a browser (put your values in):
   https://api.telegram.org/botBOT_TOKEN/setWebhook?url=APP_URL/api/bot&secret_token=WEBHOOK_SECRET
   It should answer {"ok":true}.
3. BotFather > /mybots > your bot > Bot Settings > Configure Mini App > Enable > paste APP_URL. This makes invite links open the app directly.

## 4. Ads
Adexium (interstitial) and the Adsterra banner are already built in. Adexium's widget ID is the default of ADEXIUM_WID. The Adsterra banner code sits at the top of public/index.html.

## 5. Test before launch
Open the bot, press Start, Open App, join the channels, tap Verify. Set START_DATE to today (a past Monday) to test earning, then set it back to the real date.

## 6. Running it
- Rounds: Monday 00:00 to Saturday 00:00 UTC. Weekend is a countdown.
- Saturday, within 5 minutes: winners are picked, DMed, posted to the proof channel, and sent to you. Their wallets arrive in your bot chat.
- After you pay: /paid USERID AMOUNT TXHASH (posts proof and messages the winner).
- /flag USERID hides a cheater. /unflag restores them.
- Tasks: Earn tab > Add your task (free for your ID). User tasks reach you with Approve/Reject buttons.
- Everyone gets bot messages for: round start, final hours, round end, a friend joining, winning, payment.
