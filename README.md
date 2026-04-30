# Notebook-to-Myst

A local web app for working with Jupyter notebooks as **MyST Markdown** and previewing them like documentation sites.

You can import an `.ipynb` notebook (converted via **jupytext**), edit MyST/Markdown in the browser, tweak Sphinx **`conf.py`** and static assets, and get a **live HTML preview** built with Sphinx (MyST parser, selectable themes such as Sphinx Book and PyData).

## Prerequisites

- **Python 3** with `pip`
- **Node.js** and **npm** (for the Vite dev server)

## Run locally

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

1. Use **Import** to load a notebook; it appears as editable MyST/Markdown.
2. Edit content and workspace settings; use **Preview** to rebuild the Sphinx HTML when needed.
3. **Download** saves your Markdown when you want a `.md` file on disk.

For a production-style static build of the UI, run `npm run build` in `frontend/` and serve `frontend/dist/` behind a reverse proxy that routes `/api` to the Flask app.
