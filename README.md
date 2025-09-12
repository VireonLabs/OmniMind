# KUBRA / AURA — AI System

## نظرة عامة

منصة ذكية متكاملة لتشغيل نماذج الذكاء الاصطناعي التفاعلية (نص، صوت، صورة، فيديو) مع لوحة تحكم احترافية وواجهات API مؤمنة وقابلة للتوسعة.

---

## ⚡️ التشغيل السريع (زر واحد)

```bash
cp .env.example .env        # حرر المفاتيح حسب بيئتك
docker-compose up --build   # كل شيء يعمل مباشرة
```

- واجهة GUI: http://localhost:8000
- API: http://localhost:8500

---

## إعداد الأسرار (env)

- `API_KEY` — مفتاح الوصول لكل الخدمات (غيّره في الإنتاج)
- `CORS_ALLOW_ORIGINS` — قائمة origins المسموح بها (لاتستخدم "*" في prod)
- `MAX_UPLOAD_SIZE` — أقصى حجم ملف مرفوع (بالبايت)
- `WEIGHTS_URL`, `WEIGHTS_SHA256` — روابط الأوزان (اختياري إذا كان لديك نموذج)

---

## خطوات النشر

1. تأكد من مرور كل اختبارات CI (pytest + Cypress).
2. راجع تقارير الأمان (security_review.md).
3. اكتمال التوثيق (docs/*).
4. نفذ build نهائي:
   ```bash
   docker-compose up --build
   ```
5. راقب health endpoints وراجع logs لأي أخطاء.

---

## Acceptance Checklist

- [x] جميع الاختبارات تمر في CI (Pytest + Cypress)
- [x] واجهات API محمية وتدقق في المفاتيح
- [x] CORS production مضبوط من env
- [x] NO أسرار في الريبو — فقط .env.example
- [x] كل وظائف الرفع والنتائج والجداول والمخططات تعمل
- [x] وثائق: architecture, api, التشغيل، الأمان مرفقة
- [x] مراجعة أمان ومخاطر PII مكتوبة
- [x] فيديو توضيحي مرفق
- [x] جميع متطلبات العميل/المواصفات منجزه أو موثقة

---

## روابط هامة

- [العمارة](docs/architecture.md)
- [دليل التشغيل](docs/operational_playbook.md)
- [تقرير الأمان](security_review.md)
- [API Spec](docs/api_spec.md)

---