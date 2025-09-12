FROM python:3.10-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY services/ services/
COPY scripts/ scripts/
COPY data/ data/
COPY .env .env

RUN adduser --disabled-password --gecos "" appuser && chown -R appuser /app

USER appuser

EXPOSE 8500

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD curl -s http://localhost:8500/health | grep '"status": "ok"'

CMD ["uvicorn", "services.api.main:app", "--host", "0.0.0.0", "--port", "8500", "--proxy-headers", "--limit-concurrency", "32"]