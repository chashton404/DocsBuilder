FROM python:3.12-slim-bookworm

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py extensions.py models.py authz.py entrypoint.sh ./
COPY migrations ./migrations

ENV DOCSBUILDER_DATA_ROOT=/data \
    PYTHONUNBUFFERED=1 \
    FLASK_APP=app

RUN mkdir -p /data \
    && chmod +x /app/entrypoint.sh

EXPOSE 5000

ENTRYPOINT ["./entrypoint.sh"]
