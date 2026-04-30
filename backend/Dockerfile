FROM python:3.12-slim-bookworm

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py .

ENV DOCSBUILDER_DATA_ROOT=/data \
    PYTHONUNBUFFERED=1

RUN mkdir -p /data

EXPOSE 5000

CMD ["python", "-u", "-c", "from app import app; app.run(host=\"0.0.0.0\", port=5000, debug=False)"]
