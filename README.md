# Notebook -> MyST Converter

A local web app that converts a Jupyter notebook (`.ipynb`) into MyST Markdown (`.md`) using `jupytext`.

## Stack

- Frontend: React + Vite
- Backend: Flask + flask-cors
- Conversion: jupytext

## Project Structure

```text
.
├── backend/
│   ├── app.py
│   └── requirements.txt
├── frontend/
│   └── src/
│       └── App.jsx
└── README.md
```

## Run Locally

### 1) Start backend (port 5000)

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
flask --app app run --port 5000
```

### 2) Start frontend (port 5173)

In a separate terminal:

```bash
cd frontend
npm install
npm run dev
```

Then open the local URL shown by Vite (typically <http://localhost:5173>).

## How It Works

1. Upload one `.ipynb` file in the frontend.
2. Click **Convert**.
3. Frontend sends `multipart/form-data` to `POST /api/convert`.
4. Flask reads the notebook and converts it to MyST markdown.
5. Converted content appears in a live preview pane.
6. Click **Download** to save the generated `.md` file.
