# KUBRA / AURA — Architecture

## المكونات الأساسية

- **API** (FastAPI): جميع العمليات المركزية (encode, upload, assign, ...).
- **GUI** (React, MUI): لوحة تحكم تفاعلية، تعرض البيانات بشكل لحظي مع دعم رفع الملفات والصوت والصور والفيديو.
- **Consolidation Worker**: معالجة وتجميع النتائج في الخلفية.
- **Model Core**: إدارة الأوزان وذاكرة النموذج (FAISS/ProtoMemory).
- **Security Gateway**: حماية endpoints عبر X-API-KEY وCORS.

## سريان البيانات

1. المستخدم يرسل طلب (نص/صوت/صورة...) من الواجهة.
2. تمرر البيانات إلى API مع X-API-KEY.
3. API يدير كل عملية (تخزين، تحويل، تسجيل log).
4. Consolidation worker يعالج المهام الدورية/المجمعة.
5. النتائج تُعرض في الواجهة بشكل مباشر (جداول، مخططات، إشعارات).

## التقنيات

- Python/FastAPI, React/MUI, Docker, FAISS, Cypress, Github Actions CI

---

## الرسم التخطيطي العام

```
[GUI] <—> [API (FastAPI)] <—> [Model Core/FAISS/ProtoMemory]
     \—> [Upload/Audio/Image/Video]
     \—> [Consolidation Worker]
```

---

## قابلية التوسعة

- إضافة أنواع خبراء/نماذج/واجهات جديدة دون تعديل البنية الأساسية.
- دعم M-of-N gating لأي وحدة أمنية أو تدقيق إضافي.
- إدارة النسخ/البيانات عبر ملفات JSONL+FAISS.

---