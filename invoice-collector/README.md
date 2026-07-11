# 🧾 Invoice Collector · אספן חשבוניות

אפליקציה שמתחברת לתיבת המייל שלך (**Gmail** או **Outlook**), אוספת אוטומטית את כל
**החשבוניות והקבלות**, ומאפשרת לסנן לפי **טווח תאריכים** — עם **סיכום סכומים חודשי**,
**תצוגה מקדימה של קבצים מצורפים (PDF/תמונות)**, והורדה/ייצוא ל‑CSV.

> An app that connects to your Gmail **or** Outlook mailbox, automatically collects
> all invoices and receipts, and lets you filter by date range — with monthly
> totals, in‑app attachment preview, and CSV export.
> **Read‑only access; nothing is ever sent or deleted.**

## תכונות / Features

- 🔐 חיבור מאובטח ל‑**Gmail** (Google OAuth) ו/או **Outlook** (Microsoft OAuth) — הרשאת **קריאה בלבד**.
- 🔀 מעבר בין ספקי מייל בלחיצה, עם חיווי חיבור לכל אחד.
- 🔎 זיהוי אוטומטי של חשבוניות וקבלות (מילות מפתח בעברית ובאנגלית + קבצים מצורפים).
- 📅 סינון לפי טווח תאריכים, עם קיצורים (החודש / חודש שעבר / השנה / שנה שעברה).
- 💰 זיהוי סכום ומטבע חכם — קורא את **גוף המייל** ומעדיף את הסכום ליד "סה״כ / לתשלום / total".
- 📄 **סריקת PDF לסכום** (אופציונלי) — כשאין סכום בטקסט, מוריד את ה‑PDF וקורא ממנו את הסכום.
- 📊 **סיכום סכומים** — סה״כ לפי מטבע, חלוקה **לפי חודש** ו**לפי ספק**.
- 🔗 **קישורי חשבונית מגוף המייל** + כפתור **"פתח במייל"** לכל שורה.
- ✨ **התראה על חשבוניות חדשות** — סימון "חדש" ו‑Web Notification למה שהתקבל מאז הביקור הקודם.
- 👁 **תצוגה מקדימה** של קבצים מצורפים (PDF ותמונות) בתוך האפליקציה.
- 📎 הורדת הקבצים המצורפים ישירות מהטבלה.
- ⬇ ייצוא הרשימה (כולה או המסומן) ל‑CSV תואם‑Excel (עם תמיכה בעברית).

## דרישות / Requirements

- Node.js 18+
- פרטי OAuth של Google ו/או Microsoft (חינמי). מספיק להגדיר את הספק שבו תשתמש.

## הגדרה / Setup

```sh
cd invoice-collector
npm install
cp .env.example .env      # מלא את הפרטים של הספק/ים שתרצה
npm start                 # פתח: http://localhost:3000
```

### Gmail (Google)

1. [Google Cloud Console](https://console.cloud.google.com/) → צור/בחר פרויקט.
2. *APIs & Services → Library →* הפעל **Gmail API**.
3. *OAuth consent screen* → סוג **External**, והוסף את המייל שלך תחת **Test users**.
4. *Credentials → Create Credentials → OAuth client ID →* **Web application**.
   הוסף *Authorized redirect URI*:
   `http://localhost:3000/oauth2callback/google`
5. העתק את ה‑Client ID / Secret ל‑`.env` (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`).

### Outlook (Microsoft)

1. [Azure Portal](https://portal.azure.com/) → **App registrations → New registration**.
2. תחת **Supported account types** בחר באפשרות שכוללת חשבונות אישיים (Personal Microsoft accounts).
3. תחת **Redirect URI** בחר סוג **Web** והזן:
   `http://localhost:3000/oauth2callback/microsoft`
4. לאחר היצירה: **Certificates & secrets → New client secret** — העתק את ה‑**Value**.
5. *API permissions* → ודא הרשאות **Microsoft Graph → Delegated → `Mail.Read`, `User.Read`, `offline_access`**.
6. העתק את ה‑Application (client) ID ואת ה‑secret ל‑`.env` (`MS_CLIENT_ID`, `MS_CLIENT_SECRET`).

### הרצה ושימוש

הפעל `npm start`, פתח `http://localhost:3000`, בחר ספק (Gmail/Outlook), לחץ **התחבר**,
אשר את ההרשאות, בחר טווח תאריכים → **חפש חשבוניות**.

## איך זה עובד / How it works

- **`server.js`** (Express) מנתב בקשות לשכבת **providers** אחידה.
- **`providers/google.js`** — OAuth + חיפוש Gmail (שאילתת `after:`/`before:` + מילות מפתח + `has:attachment`).
- **`providers/microsoft.js`** — OAuth + Microsoft Graph (KQL `$search` עם `received>=`/`<=`, `hasAttachments`), דרך `fetch` (ללא תלות נוספת).
- **`providers/amount.js`** — זיהוי סכום ומטבע לצורך הסיכום החודשי.
- ה‑tokens נשמרים מקומית בקבצים `token.google.json` / `token.microsoft.json` (ב‑`.gitignore`).
- הכול נשאר בין הדפדפן שלך לחשבון שלך — אין שרת חיצוני ואין אחסון בענן.

## מבנה / Structure

```
invoice-collector/
├── server.js              # שרת Express + ניתוב לספקים
├── providers/
│   ├── google.js          # Gmail (OAuth + חיפוש)
│   ├── microsoft.js       # Outlook / Microsoft Graph
│   └── amount.js          # זיהוי סכום ומטבע
├── package.json
├── .env.example
└── public/
    ├── index.html         # ממשק (RTL, עברית)
    ├── styles.css
    └── app.js             # מעבר ספקים, סיכום חודשי, תצוגה מקדימה, CSV
```

## הערות אבטחה / Security notes

- ההרשאות המבוקשות: Gmail `gmail.readonly`, Microsoft `Mail.Read` — **קריאה בלבד**.
- `.env` ו‑`token.*.json` **אינם** נכללים ב‑git (ראה `.gitignore`).
- מיועד להרצה מקומית (localhost). לפריסה בענן יש להוסיף אחסון tokens מאובטח לכל משתמש.

## רישיון / License

MIT
