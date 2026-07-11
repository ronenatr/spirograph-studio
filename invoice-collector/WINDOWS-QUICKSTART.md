# הרצה מהירה ב-Windows 🪟

מדריך קצר להרצת **אספן החשבוניות** על מחשב Windows, בלי ידע טכני.

## שלב 1 — התקן Node.js (פעם אחת)

1. היכנס ל-**https://nodejs.org**
2. לחץ על הכפתור הגדול של גרסת **LTS** (ההורדה מתחילה אוטומטית).
3. פתח את הקובץ שהורד והתקן — פשוט לחיצות **Next → Next → Finish** (אפשר להשאיר הכל ברירת מחדל).

## שלב 2 — הכן את התיקייה

1. פרוס (Extract) את קובץ ה-ZIP שקיבלת למקום נוח, למשל לשולחן העבודה.
2. תיכנס לתיקייה `invoice-collector`.

## שלב 3 — הפעל בפעם הראשונה

1. לחץ פעמיים על הקובץ **`start.bat`**.
   > אם Windows מציג אזהרת "Windows protected your PC": לחץ **More info → Run anyway** (הקובץ הוא סקריפט מקומי שלך, לא מהאינטרנט).
2. בפעם הראשונה ייפתח **Notepad** עם קובץ ההגדרות. הדבק בו את הפרטים מ-Google (ראה שלב 4), שמור (Ctrl+S), סגור את Notepad, והפעל שוב את `start.bat`.

## שלב 4 — מה להדביק בקובץ ההגדרות (.env)

```
PORT=3000
GOOGLE_CLIENT_ID=הדבק-כאן-את-ה-Client-ID
GOOGLE_CLIENT_SECRET=הדבק-כאן-את-ה-Client-Secret
GOOGLE_REDIRECT_URI=http://localhost:3000/oauth2callback/google
```

- את ה-`Client ID` ו-`Client Secret` תמצא בקובץ ה-JSON שהורדת מ-Google Cloud
  (או ב-*Google Auth Platform → Clients → * לחיצה על שם ה-Client).

## שלב 5 — השתמש

1. אחרי הפעלה חוזרת של `start.bat`, ייפתח הדפדפן בכתובת **http://localhost:3000**.
2. בחר **Gmail** → **התחבר** → אשר את ההרשאות בחלון של Google.
3. בחר טווח תאריכים → **חפש חשבוניות**. 🎉

> **חשוב:** ודא שהוספת את כתובת ה-Gmail שלך כ-**Test user** ב-Google Cloud
> (*Google Auth Platform → Audience → Test users*), אחרת Google תחסום את ההתחברות.

## עצירה

כדי לעצור את האפליקציה — פשוט סגור את החלון השחור (או הקש `Ctrl + C` בתוכו).

---

נתקעת? צלם את המסך (או העתק את הודעת השגיאה מהחלון השחור) ושלח — ואעזור.
