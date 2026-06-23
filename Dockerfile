# ---- stage 1: build the owner web console (web/dist) ----
FROM node:20-slim AS web
WORKDIR /web
COPY web/package.json ./
RUN npm install
COPY web/ ./
RUN npm run build

# ---- stage 2: python API that also serves the built SPA ----
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /srv

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app/ ./app/
COPY --from=web /web/dist ./web/dist

EXPOSE 32950

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "32950"]
