# API Specification — KUBRA / AURA

## Authentication

- جميع النقاط تتطلب `X-API-KEY` في header (ماعدا /health, /metrics).

## Endpoints

### POST /encode

- body: `{ input: string, modality: string }`
- returns: `{ embedding: [float] }`

### POST /assign

- body: `{ embedding: [float], modality: string }`
- returns: `{ proto_id: string }`

### POST /upload

- form-data: `file` (audio/image/video/text)
- returns: `{ saved_as: string, size: int }`

### POST /consolidation/trigger

- body: `{ ... }`
- returns: `{ enqueued: bool, trace_id: string }`

### POST /teacher/teach

- body: `{ concept_label, bundle, relations, teacher_id }`
- returns: `{ concept_id, proto_id }`

### GET /health

- returns: `{ status, weights_state, faiss_ok }`

### GET /metrics

- returns: `{ cpu_percent, memory_percent, queue_len }`

---

## Response Codes

- 200: Success
- 403: Forbidden (API Key)
- 413: Payload Too Large
- 422: Invalid Input

---

## نماذج استجابة/خطأ

```json
{"error": "Forbidden", "type": "HTTPException"}
```

---

## ملاحظات

- كل Endpoint يكتب log في data/logs/memory_log.jsonl
- كل ملف رفع يُخزن في data/uploads/
- كل تغيير في النموذج مُسجل في protos.jsonl/concept_graph.jsonl

---