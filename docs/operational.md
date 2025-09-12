# التشغيل الكامل (زر واحد)

## للتشغيل الكامل للإنتاج:
```bash
docker-compose up --build
```
- كل الخدمات (API, GUI) تعمل تلقائيًا.
- healthcheck مفعل للخدمات.
- إعدادات CORS production/الأمان.
- كل اختبارات E2E تعمل تلقائيًا في CI (Cypress).

## إعداد CORS production
- في .env: CORS_ALLOW_ORIGINS=http://yourdomain.com
- لا تضع * في الإنتاج.

## اختبارات GUI (Cypress)
- cd services/gui && npm ci
- npx cypress open
- أو npx cypress run --browser chrome
- fixture test.wav حقيقي (1 ثانية صوت).
- كل الوظائف (رفع نص، صوت، صورة، إلخ) مغطاة.

---