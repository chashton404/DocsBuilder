# DocsBuilder

A local web app for working with Jupyter notebooks as **MyST Markdown** and previewing them like documentation sites.

You can import an `.ipynb` notebook (converted via **jupytext**), edit MyST/Markdown in the browser, tweak Sphinx **`conf.py`** and static assets per project, and get a **live HTML preview** built with Sphinx (MyST parser, selectable themes such as Sphinx Book and PyData).

Start from the **Projects** screen: create a project (names are unique with **case-sensitive** comparison), complete or skip a short theme wizard, then use the editor. Markdown documents are saved under **`DOCSBUILDER_DATA_ROOT`** (see backend); open tabs are remembered in the browser per project.

## Quick start with Docker Compose (lab-friendly)

If you only need to **run** DocsBuilder (not hack on the Python/React source daily), Docker Compose is the simplest path: one command brings up Postgres, the Flask API, and the built UI behind nginx.

### Prerequisites

- [Docker Desktop](https://docs.docker.com/desktop/) (macOS or Windows), or **Docker Engine** plus the [Compose plugin](https://docs.docker.com/compose/install/linux/) on Linux.
- Enough disk space for images and two named volumes (project files + database).

### Run the stack

From the **repository root**:

```bash
docker compose up --build
```

The first run downloads images and builds the frontend and backend; later starts are faster. The backend container runs **`flask db upgrade`** on startup so the database schema stays current.

### Open the app

| Service | URL | Notes |
|--------|-----|--------|
| **Web UI** | [http://localhost:8080](http://localhost:8080) | nginx serves the SPA and proxies `/api` to the backend |
| **API (optional)** | [http://localhost:5000](http://localhost:5000) | Direct access for debugging |

Sign in with the admin account defined in `docker-compose.yml`:

- **`DOCSBUILDER_ADMIN_EMAIL`** — default `admin@localhost`
- **`DOCSBUILDER_ADMIN_PASSWORD`** — see `docker-compose.yml` (`DOCSBUILDER_ADMIN_PASSWORD`)

If `DOCSBUILDER_ADMIN_SYNC_PASSWORD` is `"true"` (as in this repo’s compose file), the admin password is reset to match **`DOCSBUILDER_ADMIN_PASSWORD`** whenever the backend container starts—convenient for local dev, but change it before treating the deployment as shared or long-lived.

**Security:** Before exposing DocsBuilder beyond your own machine, set a strong random **`DOCSBUILDER_SECRET_KEY`**, choose a unique admin password, and consider turning off **`DOCSBUILDER_ADMIN_SYNC_PASSWORD`** so passwords are not overwritten on every restart.

### Where data lives

Compose defines two volumes:

- **`docsbuilder-data`** — Sphinx projects and generated docs (`DOCSBUILDER_DATA_ROOT=/data` in the backend container).
- **`docsbuilder-pg`** — PostgreSQL 16 data for app metadata and auth.

Stopping containers does **not** delete these volumes.

### Stop and reset

- Stop: **Ctrl+C**, then:

  ```bash
  docker compose down
  ```

- Remove containers **and** volumes (wiping projects + database):

  ```bash
  docker compose down -v
  ```

### Notebook dependencies (executed code cells)

Preview builds can execute MyST/Markdown cells using the **backend image’s** Python environment (`backend/requirements.txt`). If your notebooks need extra packages, add them to `backend/requirements.txt` and rebuild:

```bash
docker compose up --build
```

---

## Prerequisites (running without Docker)

- **Python 3** with `pip`
- **Node.js** and **npm** (for the Vite dev server)

## Run locally (without Docker)

Use **two terminals**: the Flask API on port **5000**, and the React UI on port **5173**. Vite proxies `/api/*` to the backend so you open only the frontend URL in the browser.

### 1. Backend (Flask)

```bash
cd backend
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

The API listens on **http://127.0.0.1:5000**.

Optional: set **`DOCSBUILDER_DATA_ROOT`** to a directory where projects should persist (default is **`backend/data`** relative to `app.py`). Without **`DATABASE_URL`**, the backend uses SQLite under that directory (`docsbuilder.db`). Run **`FLASK_APP=app flask db upgrade`** once when first setting up locally (Compose runs migrations automatically).

### Notebook packages (executed code cells)

Preview builds can **execute** MyST/Markdown code cells using **the same Python environment** as the backend—typically `backend/.venv` after you activate it.

Add whatever your notebooks import to **`backend/requirements.txt`**, then reinstall:

```bash
pip install -r requirements.txt
```

If you prefer to keep stacks separate, add a second file (for example **`requirements-notebooks.txt`**) in `backend/` and install both:

```bash
pip install -r requirements.txt -r requirements-notebooks.txt
```

### 2. Frontend (Vite + React)

In another terminal:

```bash
cd frontend
npm install
npm run dev
```

Open the URL Vite prints (usually **http://localhost:5173**).

## Typical workflow

1. Open **Projects**, create a project, then skip or finish the theme wizard.
2. Use **Import** to load a notebook; it appears as editable MyST/Markdown.
3. Edit content and workspace settings; use **Recompile** to rebuild the Sphinx HTML when needed.
4. **Download** saves your Markdown when you want a `.md` file on disk.

For a production-style static build of the UI, run `npm run build` in `frontend/` and serve `frontend/dist/` behind a reverse proxy that routes `/api` to the Flask app (SPA fallback to `index.html` for client-side routes).
