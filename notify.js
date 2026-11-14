/* BloodSyncBD - notify.js (GitHub Actions e chole, prottek ~5 min e)
   1) notun Blood Request ashle sobar kache push
   2) version.json e notun version ashle sobar kache push */
const admin = require("firebase-admin");

const SITE = process.env.SITE_URL;           // jemon https://bloodsyncbd.netlify.app (shes e / nai)
const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(sa),
  databaseURL: "https://sirajganj-blood-bank-default-rtdb.asia-southeast1.firebasedatabase.app"
});
const db = admin.database();

async function sendToAll(title, body) {
  const all = (await db.ref("fcmTokens").get()).val() || {};
  const tokens = Object.keys(all);
  console.log("tokens:", tokens.length, "|", title);
  for (let i = 0; i < tokens.length; i += 500) {
    const chunk = tokens.slice(i, i + 500);
    const res = await admin.messaging().sendEachForMulticast({
      tokens: chunk,
      notification: { title, body },
      webpush: {
        notification: { icon: SITE + "/icon.png", badge: SITE + "/icon.png" },
        fcmOptions: { link: SITE + "/" }
      }
    });
    const dead = [];
    res.responses.forEach((r, idx) => {
      const c = r.error && r.error.code;
      if (c === "messaging/registration-token-not-registered" || c === "messaging/invalid-registration-token") dead.push(chunk[idx]);
    });
    await Promise.all(dead.map(t => db.ref("fcmTokens/" + t).remove()));
  }
}

(async () => {
  const now = Date.now();

  // ---- 1) notun requests ----
  const tRef = db.ref("meta/lastNotifiedAt");
  const last = (await tRef.get()).val();
  if (!last) {
    await tRef.set(now);                       // prothom bar shudhu save
  } else {
    const snap = await db.ref("requests").orderByChild("createdAt").startAt(last + 1).get();
    const list = Object.values(snap.val() || {}).sort((a, b) => a.createdAt - b.createdAt);
    for (const r of list) {
      const urg = { critical: "জরুরি! ", urgent: "দ্রুত: " }[r.urgency] || "";
      await sendToAll(
        urg + (r.blood || "") + " রক্ত দরকার",
        [r.hospital, r.upazila].filter(Boolean).join(", ") + (r.units ? " · " + r.units + " ব্যাগ" : "")
      );
    }
    const newest = list.length ? list[list.length - 1].createdAt : last;
    await tRef.set(Math.max(newest, last));
  }

  // ---- 2) notun app update ----
  try {
    const res = await fetch(SITE + "/version.json?t=" + now, { cache: "no-store" });
    if (res.ok) {
      const info = await res.json();
      const vRef = db.ref("meta/lastNotifiedVersion");
      const lastV = (await vRef.get()).val();
      if (!lastV) await vRef.set(info.version);
      else if (info.version && lastV !== info.version) {
        await vRef.set(info.version);
        await sendToAll("নতুন Update এসেছে", "BloodSyncBD v" + info.version + " - এখনই আপডেট করুন");
      }
    }
  } catch (e) { console.log("version check skipped", e.message); }

  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
      
