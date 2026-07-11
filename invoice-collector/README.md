# 🧾 Invoice Collector · אספן חשבוניות

אפליקציה שמתחברת לתיבת ה‑Gmail שלך, אוספת אוטומטית את כל **החשבוניות והקבלות**,
ומאפשרת לסנן אותן לפי **טווח תאריכים** — עם הורדת הקבצים המצורפים וייצוא ל‑CSV.

> An app that connects to your Gmail, automatically collects all invoices and
> receipts, and lets you filter them by date range — with attachment download
> and CSV export. **Read‑only access; nothing is ever sent or deleted.**

## תכונות / Features

- 🔐 חיבור מאובטח ל‑Gmail דרך Google OAuth (הרשאת **קריאה בלבד**).
- 🔎 זיהוי אוטומטי של חשבוניות וקבלות (מילות מפתח בעברית ובאנגלית + קבצים מצורפים).
- 📅 סינון לפי טווח תאריכים, עם קיצורים (החודש / חודש שעבר / השנה / שנה שעברה).
- 💰 זיהוי סכום מתוך הנושא/התקציר (₪, $, €, £).
- 📎 הורדת הקבצים המצורפים (PDF וכו') ישירות מהטבלה.
- ⬇ ייצוא הרשימה (כולה או המסומן) ל‑CSV תואם‑Excel (עם תמיכה בעברית).

## דרישות / Requirements

- Node.js 18+
- חשבון Google + פרטי OAuth client (חינמי).

## הגדרה / Setup

### 1. פרטי OAuth של Google

1. פתח את [Google Cloud Console](https://console.cloud.google.com/) וצור פרויקט
   (או השתמש בקיים).
2. הפעל את **Gmail API**: *APIs & Services → Library → Gmail API → Enable*.
3. תחת *APIs & Services → OAuth consent screen* הגדר אפליקציה מסוג **External**,
   והוסף את כתובת המייל שלך תחת **Test users** (כל עוד האפליקציה במצב Testing).
4. תחת *APIs & Services → Credentials → Create Credentials → OAuth client ID*
   בחר **Web application**, והוסף כ‑*Authorized redirect URI*:
   ```
   http://localhost:3000/oauth2callback
   ```
5. העתק את ה‑**Client ID** וה‑**Client secret**.

### 2. הגדרת הפרויקט

```sh
cd invoice-collector
npm install
cp .env.example .env
# ערוך את .env והדבק את ה‑Client ID / Secret
```

### 3. הרצה

```sh
npm start
# פתח בדפדפן:  http://localhost:3000
```

לחץ **התחבר ל‑Gmail**, אשר את ההרשאות, ובחר טווח תאריכים → **חפש חשבוניות**.

## איך זה עובד / How it works

- השרת (`server.js`, Express) מבצע את זרימת ה‑OAuth ושומר את ה‑token מקומית
  בקובץ `token.json` (ב‑`.gitignore`, לא נשמר ב‑git).
- החיפוש בונה שאילתת Gmail: מילות מפתח (`invoice`, `receipt`, `חשבונית`, `קבלה`…)
  משולבות עם `after:` / `before:` לפי הטווח שנבחר, ואופציונלית `has:attachment`.
- לכל הודעה נשלפים כותרות (שולח, נושא, תאריך), הקבצים המצורפים, וניסיון לזהות סכום.
- הכל נשאר בין הדפדפן שלך לחשבון שלך — אין שרת חיצוני ואין אחסון בענן.

## מבנה / Structure

```
invoice-collector/
├── server.js          # שרת Express + OAuth + חיפוש Gmail
├── package.json
├── .env.example       # תבנית להגדרות (העתק ל‑.env)
└── public/
    ├── index.html     # ממשק (RTL, עברית)
    ├── styles.css
    └── app.js         # לוגיקת צד‑לקוח
```

## הערות אבטחה / Security notes

- ההרשאה המבוקשת היא `gmail.readonly` בלבד.
- ה‑`token.json` וה‑`.env` **אינם** נכללים ב‑git (ראה `.gitignore`).
- מיועד להרצה מקומית (localhost). לפריסה בענן יש להוסיף אחסון tokens מאובטח לכל משתמש.

## רישיון / License

MIT
