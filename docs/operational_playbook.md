# دليل التشغيل والاسترداد — KUBRA / AURA

## التشغيل الأساسي

- `.env` يجب أن يحتوي على جميع الأسرار (API_KEY، CORS_ALLOW_ORIGINS، وغيرها).
- شغل: `docker-compose up --build`
- راقب health endpoints:
  - `curl http://localhost:8500/health`
  - `curl http://localhost:8000` (يجب أن تظهر واجهة GUI)

## الاسترداد

- في حال فقدان index/faiss:
  1. احذف المؤشر التالف من data/
  2. أعد البناء: سيُعاد بناء index من protos.jsonl تلقائيًا.
- فقدان .ids: يعاد توليدها من protos.jsonl.
- فقدان سجل logs: سيستمر النظام لكن يوصى بأخذ نسخ دورية.
- فقدان consolidation artifacts: تُعاد تلقائيًا عند consolidation القادم.

## النسخ الاحتياطي

- قم بنسخ data/ و logs/ دوريًا.
- احتفظ بنسخ من .env خارج السيرفر.

## التحديث والترقية

- جرب الترقية أولًا في بيئة staging.
- تأكد من أن جميع الاختبارات تمر قبل أي merge.

---

## Troubleshooting

- تحقق من logs في data/logs/memory_log.jsonl
- استخدم health/metrics endpoints لأي تشخيص.
- أعد تشغيل docker-compose إذا لزم الأمر.

---