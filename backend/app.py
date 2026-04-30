"""
Flask backend for DocsBuilder.

What this module does:
  • Stores multiple projects under ``DOCSBUILDER_DATA_ROOT/projects/<uuid>/`` (``conf.py``, ``_static``, ``documents.json``, ``meta.json``).
  • Accepts Jupyter notebooks (.ipynb) and MyST/Markdown text from the React app.
  • Builds Sphinx HTML previews in ephemeral temp dirs and serves them under /api/sphinx-preview/...

Run with: python app.py  → listens on port 5000 (see bottom of file).
"""

import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from tempfile import TemporaryDirectory
import shutil
import tempfile
import uuid

from flask import Flask, abort, jsonify, request, send_from_directory
from flask_cors import CORS
import jupytext
from sphinx.cmd.build import build_main
import yaml

# -----------------------------------------------------------------------------
# App setup & in-memory Sphinx build cache
# -----------------------------------------------------------------------------
# Flask serves REST endpoints. CORS lets the Vite dev server (different origin)
# call /api/* during development.
app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 16 * 1024 * 1024
CORS(app, resources={r"/api/*": {"origins": "*"}})

# Each successful Sphinx build gets a UUID; we map id → temp folder containing
# source + build output. Old entries are deleted when we exceed MAX_SPHINX_PREVIEWS.
SPHINX_PREVIEWS: dict[str, Path] = {}
MAX_SPHINX_PREVIEWS = 10

# Persistent project data: ``DOCSBUILDER_DATA_ROOT`` (default: ``backend/data``).
_DATA_ROOT_RAW = os.environ.get("DOCSBUILDER_DATA_ROOT")
if _DATA_ROOT_RAW:
    DATA_ROOT = Path(_DATA_ROOT_RAW).expanduser().resolve()
else:
    DATA_ROOT = (Path(__file__).resolve().parent / "data").resolve()

PROJECTS_ROOT = DATA_ROOT / "projects"

# HTML themes shipped for the Sphinx preview (`html_theme` in workspace conf.py).
ALLOWED_HTML_THEMES: tuple[tuple[str, str], ...] = (
    ("sphinx_book_theme", "Sphinx Book"),
    ("pydata_sphinx_theme", "PyData"),
    ("sphinx_rtd_theme", "Read the Docs"),
    ("shibuya", "Shibuya"),
)
ALLOWED_HTML_THEME_IDS = frozenset(t[0] for t in ALLOWED_HTML_THEMES)
_HTML_THEME_LINE_RE = re.compile(
    r"^html_theme\s*=\s*[\"'][^\"']*[\"']\s*$",
    re.MULTILINE,
)


def _parse_html_theme_from_conf(content: str) -> str:
    m = re.search(
        r"^html_theme\s*=\s*[\"']([^\"']+)[\"']",
        content,
        re.MULTILINE,
    )
    if m and m.group(1) in ALLOWED_HTML_THEME_IDS:
        return m.group(1)
    return "sphinx_book_theme"


def _set_html_theme_in_conf(content: str, theme: str) -> str:
    if theme not in ALLOWED_HTML_THEME_IDS:
        raise ValueError("invalid theme id")
    line = f"html_theme = '{theme}'"
    if _HTML_THEME_LINE_RE.search(content):
        return _HTML_THEME_LINE_RE.sub(line, content, count=1)
    return content.rstrip() + "\n\n" + line + "\n"


def _ensure_active_html_theme_extension(conf_text: str) -> str:
    """Append the selected HTML theme as a Sphinx extension if missing.

    Sphinx resolves packaged themes after each theme package's ``setup()`` runs.
    With ``sphinx.cmd.build.build_main``, ``html_theme = '…'`` alone does not
    always load that package, which yields "no theme named … found".
    """
    theme_id = _parse_html_theme_from_conf(conf_text)
    ext_mod = theme_id if theme_id in ALLOWED_HTML_THEME_IDS else "sphinx_book_theme"
    # Do not treat ``html_theme = '…'`` as “already listed”; match extension lines only.
    if re.search(
        rf'^\s*["\']{re.escape(ext_mod)}["\']\s*,?\s*$',
        conf_text,
        re.MULTILINE,
    ):
        return conf_text
    insertion = f'\n    "{ext_mod}",'
    for needle in ('"sphinx_design",', "'sphinx_design',", '"myst_nb",', "'myst_nb',"):
        if needle in conf_text:
            return conf_text.replace(needle, needle + insertion, 1)
    m = re.search(r"(extensions\s*=\s*\[)\s*\n", conf_text)
    if m:
        pos = m.end()
        return conf_text[:pos] + f'    "{ext_mod}",\n' + conf_text[pos:]
    return conf_text


# -----------------------------------------------------------------------------
# Small helpers shared by multiple routes
# -----------------------------------------------------------------------------


def _parse_bool(value: str | None, default: bool = True) -> bool:
    """Interpret multipart form checkbox/string flags ('true', '1', 'on', …)."""
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def normalize_myst_nb_notebook_metadata(content: str) -> str:
    """Ensure YAML declares a myst-nb text notebook so ``{code-cell}`` fences parse.

    myst-nb switches to the notebook reader only when front matter includes
    ``file_format: mystnb`` or ``jupytext.text_representation.format_name: myst``.
    Jupytext often emits only ``kernelspec``; stripping ``jupytext`` removes the
    second marker — without ``file_format``, myst-nb falls back to plain MyST and
    treats ``code-cell`` as invalid.
    """
    text = content.lstrip("\ufeff")
    if not text.startswith("---"):
        return "---\nfile_format: mystnb\n---\n\n" + text

    lines = text.splitlines()
    closing = None
    for idx in range(1, len(lines)):
        line = lines[idx].strip()
        if line == "---" or line == "...":
            closing = idx
            break
    if closing is None:
        return "---\nfile_format: mystnb\n---\n\n" + text

    raw_header = "\n".join(lines[1:closing])
    try:
        meta = yaml.safe_load(raw_header)
    except yaml.YAMLError:
        return "---\nfile_format: mystnb\n---\n\n" + text

    if not isinstance(meta, dict):
        meta = {}

    if meta.get("file_format") == "mystnb":
        return content

    jupytext = meta.get("jupytext")
    if isinstance(jupytext, dict):
        tr = jupytext.get("text_representation")
        if isinstance(tr, dict) and tr.get("format_name") == "myst":
            return content

    meta["file_format"] = "mystnb"
    dumped = yaml.safe_dump(
        meta,
        sort_keys=False,
        allow_unicode=True,
        default_flow_style=False,
    ).rstrip()
    body = "\n".join(lines[closing + 1 :])
    sep = "\n" if body else ""
    return f"---\n{dumped}\n---{sep}{body}"


def strip_jupytext_header(content: str) -> str:
    # Used by /api/convert: jupytext emits YAML front matter that may include a
    # "jupytext" key; stripping it yields cleaner Myst Markdown for publishing.
    lines = content.splitlines(keepends=True)
    if not lines or lines[0].strip() != "---":
        return content

    closing_index = None
    for idx in range(1, len(lines)):
        if lines[idx].strip() == "---":
            closing_index = idx
            break
    if closing_index is None:
        return content

    front_matter_text = "".join(lines[1:closing_index])
    front_matter = yaml.safe_load(front_matter_text) or {}
    if not isinstance(front_matter, dict) or "jupytext" not in front_matter:
        return content

    del front_matter["jupytext"]
    body = "".join(lines[closing_index + 1 :]).lstrip("\n")
    if not front_matter:
        return body

    rebuilt_front_matter = yaml.safe_dump(front_matter, sort_keys=False)
    return f"---\n{rebuilt_front_matter}---\n\n{body}"


def _prune_old_previews() -> None:
    # Oldest insertion order (dict preserves order in Python 3.7+); remove dirs
    # from disk so temp space does not grow forever.
    while len(SPHINX_PREVIEWS) > MAX_SPHINX_PREVIEWS:
        oldest_id = next(iter(SPHINX_PREVIEWS))
        preview_dir = SPHINX_PREVIEWS.pop(oldest_id)
        shutil.rmtree(preview_dir, ignore_errors=True)


def _cell_source_text(cell: dict) -> str:
    # Notebook JSON stores "source" as either a string or a list of lines.
    raw = cell.get("source", "")
    if isinstance(raw, list):
        return "".join(raw)
    return str(raw)


def extract_markdown_from_ipynb_bytes(data: bytes, include_code_as_fenced: bool) -> str:
    # Powers /api/import-notebook: walks nbformat cells and concatenates Markdown,
    # optionally turning code cells into fenced ``` blocks for the editor.
    parsed = json.loads(data.decode("utf-8"))
    cells = parsed.get("cells") if isinstance(parsed, dict) else None
    if not isinstance(cells, list):
        raise ValueError("Invalid notebook: missing cells.")

    chunks: list[str] = []
    for cell in cells:
        if not isinstance(cell, dict):
            continue
        cell_type = cell.get("cell_type")
        src = _cell_source_text(cell).rstrip()

        if cell_type == "markdown" and src:
            chunks.append(src)
            chunks.append("\n\n")
        elif cell_type == "code" and include_code_as_fenced and src.strip():
            lang = (
                cell.get("metadata", {}).get("language")
                if isinstance(cell.get("metadata"), dict)
                else None
            )
            lang = lang or "python"
            chunks.append(f"```{lang}\n{src}\n```\n\n")

    return "".join(chunks).strip()


# -----------------------------------------------------------------------------
# Core Sphinx build — default workspace ``conf.py`` (first run / reset material)
# -----------------------------------------------------------------------------

DEFAULT_WORKSPACE_CONF_PY = '''# -*- coding: utf-8 -*-
"""
Portable Sphinx defaults for DocsBuilder (MyST + myst-nb).

- Set ``project``, ``copyright``, and ``author`` for your docs.
- Pick an HTML theme from the Settings sidebar (Book, PyData, RTD, Shibuya).
- Files you upload under Assets are copied to ``_static`` for each preview build.
"""

# -- Project metadata --------------------------------------------------------
project = "Documentation"
copyright = ""
author = ""
version = ""
release = version

# -- General -----------------------------------------------------------------
nitpicky = False
pygments_style = "friendly"

templates_path = []
exclude_patterns = [
    "_build",
    "Thumbs.db",
    ".DS_Store",
    "**/.ipynb_checkpoints",
]

# -- Extensions --------------------------------------------------------------
extensions = [
    "myst_nb",
    "sphinx_design",
]

source_suffix = {".md": "myst-nb"}
master_doc = "index"

# myst-nb: ``nb_execution_mode`` / timeout are appended by DocsBuilder per Recompile.

# -- MyST --------------------------------------------------------------------
myst_enable_extensions = [
    "amsmath",
    "dollarmath",
    "colon_fence",
    "substitution",
    "deflist",
    "tasklist",
]
myst_heading_anchors = 3

suppress_warnings = [
    "myst.role_unknown",
    "myst.xref_missing",
    "ref.eq",
]

# -- HTML output -------------------------------------------------------------
html_theme = "sphinx_book_theme"
html_title = project
html_static_path = ["_static"]

# MathJax (works across bundled themes)
mathjax_path = "https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"
mathjax3_config = {}

# Figure/table numbering (sections + captions)
numfig = True
numfig_secnum_depth = 1
'''


def _default_workspace_conf() -> str:
    """Initial ``conf.py`` body (execution mode is appended each Sphinx build)."""
    return DEFAULT_WORKSPACE_CONF_PY


def _ensure_projects_root() -> None:
    PROJECTS_ROOT.mkdir(parents=True, exist_ok=True)


def _parse_uuid(project_id: str) -> uuid.UUID | None:
    try:
        return uuid.UUID(project_id)
    except ValueError:
        return None


def _project_path(uid: uuid.UUID) -> Path:
    return PROJECTS_ROOT / str(uid)


def _project_dir_or_abort(project_id: str) -> Path:
    uid = _parse_uuid(project_id)
    if uid is None:
        abort(404)
    path = _project_path(uid)
    if not path.is_dir():
        abort(404)
    return path


def _workspace_conf_file(proj: Path) -> Path:
    return proj / "conf.py"


def _workspace_static_dir(proj: Path) -> Path:
    return proj / "_static"


def _documents_file(proj: Path) -> Path:
    return proj / "documents.json"


def _read_workspace_conf(proj: Path) -> str:
    conf = _workspace_conf_file(proj)
    if not conf.exists():
        conf.write_text(_default_workspace_conf(), encoding="utf-8")
    return conf.read_text(encoding="utf-8")


def _list_project_metas() -> list[dict]:
    _ensure_projects_root()
    out: list[dict] = []
    if not PROJECTS_ROOT.is_dir():
        return out
    for child in PROJECTS_ROOT.iterdir():
        if not child.is_dir():
            continue
        meta_fp = child / "meta.json"
        if not meta_fp.is_file():
            continue
        try:
            meta = json.loads(meta_fp.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            continue
        if isinstance(meta, dict) and meta.get("id"):
            out.append(meta)
    out.sort(key=lambda m: str(m.get("created_at") or ""))
    return out


def _name_taken(name: str, exclude_project_id: str | None = None) -> bool:
    for meta in _list_project_metas():
        if meta.get("name") == name:
            pid = meta.get("id")
            if exclude_project_id is not None and pid == exclude_project_id:
                continue
            return True
    return False


def _create_project_on_disk(name: str) -> uuid.UUID:
    _ensure_projects_root()
    uid = uuid.uuid4()
    proj = _project_path(uid)
    proj.mkdir(parents=False)
    _workspace_static_dir(proj).mkdir(parents=True)
    _workspace_conf_file(proj).write_text(_default_workspace_conf(), encoding="utf-8")
    now = datetime.now(timezone.utc).isoformat()
    meta = {
        "id": str(uid),
        "name": name,
        "created_at": now,
        "wizard_completed": False,
    }
    (proj / "meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    _documents_file(proj).write_text(
        json.dumps({"documents": []}, indent=2),
        encoding="utf-8",
    )
    return uid


def _safe_asset_filename(raw: str) -> str | None:
    """Reject path traversal and odd names; returns basename only."""
    if not isinstance(raw, str) or not raw.strip():
        return None
    name = Path(raw).name
    if name != raw.strip():
        return None
    if name in {".", ".."} or ".." in name:
        return None
    if "/" in name or "\\" in name:
        return None
    if len(name) > 240:
        return None
    return name


def _copy_workspace_static_into(source_dir: Path, workspace_static: Path) -> None:
    """Ensure ``source/_static`` exists and copy project workspace assets into it."""
    dest = source_dir / "_static"
    dest.mkdir(parents=True, exist_ok=True)
    if not workspace_static.exists():
        return
    for path in workspace_static.iterdir():
        target = dest / path.name
        if path.is_dir():
            shutil.copytree(path, target, dirs_exist_ok=True)
        elif path.is_file():
            shutil.copy2(path, target)


def render_sphinx_preview(
    markdown_content: str,
    *,
    project_dir: Path,
    execution_mode: str = "off",
) -> tuple[str, str]:
    """Writes conf.py + index.md, runs sphinx-build, registers preview dir.

    execution_mode (myst-nb ``nb_execution_mode``): ``off`` (no execution) or
    ``force`` (always execute code cells).
    """
    mode = execution_mode if execution_mode in {"off", "force"} else "off"

    markdown_content = normalize_myst_nb_notebook_metadata(markdown_content)

    temp_dir = Path(tempfile.mkdtemp(prefix="sphinx-preview-"))
    source_dir = temp_dir / "source"
    build_dir = temp_dir / "build"
    source_dir.mkdir(parents=True, exist_ok=True)
    build_dir.mkdir(parents=True, exist_ok=True)

    ws_static = _workspace_static_dir(project_dir)
    conf_body = _ensure_active_html_theme_extension(
        _read_workspace_conf(project_dir).rstrip(),
    )
    conf_py = (
        conf_body
        + "\n\n# nb_execution_mode / timeout - set by DocsBuilder Recompile menu\n"
        + f"nb_execution_mode = {repr(mode)}\n"
        + "nb_execution_timeout = 120\n"
    )
    (source_dir / "conf.py").write_text(conf_py, encoding="utf-8")
    _copy_workspace_static_into(source_dir, ws_static)
    (source_dir / "index.md").write_text(markdown_content, encoding="utf-8")

    exit_code = build_main(
        [
            "-b",
            "html",
            "-q",
            str(source_dir),
            str(build_dir),
        ]
    )
    if exit_code != 0:
        shutil.rmtree(temp_dir, ignore_errors=True)
        raise RuntimeError("Sphinx build failed.")

    index_html = (build_dir / "index.html").read_text(encoding="utf-8")
    preview_id = uuid.uuid4().hex
    SPHINX_PREVIEWS[preview_id] = temp_dir
    _prune_old_previews()
    return preview_id, index_html


# -----------------------------------------------------------------------------
# Static serving of a finished Sphinx HTML tree (iframe loads index.html here)
# -----------------------------------------------------------------------------


@app.get("/api/sphinx-preview/<preview_id>/")
@app.get("/api/sphinx-preview/<preview_id>/<path:asset_path>")
def serve_sphinx_preview(preview_id: str, asset_path: str = "index.html"):
    preview_root = SPHINX_PREVIEWS.get(preview_id)
    if preview_root is None:
        abort(404)

    build_dir = preview_root / "build"
    # Path traversal guard: only files under build/ are served.
    resolved_path = (build_dir / asset_path).resolve()
    if not str(resolved_path).startswith(str(build_dir.resolve())):
        abort(404)
    if not resolved_path.exists():
        abort(404)

    return send_from_directory(build_dir, asset_path)


# -----------------------------------------------------------------------------
# API: projects (each project has its own ``conf.py``, ``_static``, documents)
# -----------------------------------------------------------------------------


@app.get("/api/projects")
def api_projects_list():
    metas = _list_project_metas()
    return jsonify(
        {
            "projects": [
                {
                    "id": m["id"],
                    "name": m["name"],
                    "created_at": m.get("created_at"),
                    "wizard_completed": bool(m.get("wizard_completed", False)),
                }
                for m in metas
            ]
        },
    )


@app.post("/api/projects")
def api_projects_create():
    payload = request.get_json(silent=True) or {}
    name = payload.get("name")
    if not isinstance(name, str) or not name.strip():
        return jsonify({"error": 'Field "name" is required.'}), 400
    name_stripped = name.strip()
    if _name_taken(name_stripped):
        return jsonify({"error": "A project with this name already exists."}), 409
    uid = _create_project_on_disk(name_stripped)
    return jsonify(
        {
            "id": str(uid),
            "name": name_stripped,
            "wizard_completed": False,
        },
    ), 201


@app.get("/api/projects/<project_id>")
def api_project_get(project_id: str):
    proj = _project_dir_or_abort(project_id)
    meta_fp = proj / "meta.json"
    meta = json.loads(meta_fp.read_text(encoding="utf-8"))
    return jsonify(meta)


@app.patch("/api/projects/<project_id>")
def api_project_patch(project_id: str):
    proj = _project_dir_or_abort(project_id)
    payload = request.get_json(silent=True) or {}
    meta_fp = proj / "meta.json"
    meta = json.loads(meta_fp.read_text(encoding="utf-8"))
    if not isinstance(meta, dict):
        meta = {}
    if "wizard_completed" in payload:
        wc = payload["wizard_completed"]
        if isinstance(wc, bool):
            meta["wizard_completed"] = wc
    meta_fp.write_text(json.dumps(meta, indent=2), encoding="utf-8")
    return jsonify(meta)


@app.delete("/api/projects/<project_id>")
def api_project_delete(project_id: str):
    proj = _project_dir_or_abort(project_id)
    shutil.rmtree(proj)
    return jsonify({"ok": True})


@app.get("/api/projects/<project_id>/documents")
def api_project_documents_get(project_id: str):
    proj = _project_dir_or_abort(project_id)
    dp = _documents_file(proj)
    if not dp.exists():
        dp.write_text(json.dumps({"documents": []}, indent=2), encoding="utf-8")
    data = json.loads(dp.read_text(encoding="utf-8"))
    docs = data.get("documents") if isinstance(data, dict) else []
    if not isinstance(docs, list):
        docs = []
    return jsonify({"documents": docs})


@app.put("/api/projects/<project_id>/documents")
def api_project_documents_put(project_id: str):
    proj = _project_dir_or_abort(project_id)
    payload = request.get_json(silent=True) or {}
    docs = payload.get("documents")
    if docs is None or not isinstance(docs, list):
        return jsonify({"error": 'Field "documents" must be an array.'}), 400
    cleaned: list[dict[str, str]] = []
    for item in docs:
        if not isinstance(item, dict):
            continue
        did = item.get("id")
        nm = item.get("name")
        content = item.get("content")
        if isinstance(did, str) and isinstance(nm, str) and isinstance(content, str):
            cleaned.append({"id": did, "name": nm, "content": content})
    _documents_file(proj).write_text(
        json.dumps({"documents": cleaned}, indent=2),
        encoding="utf-8",
    )
    return jsonify({"ok": True, "documents": cleaned})


# -----------------------------------------------------------------------------
# API: import notebook → plain Markdown for the left-hand editor
# -----------------------------------------------------------------------------


@app.post("/api/projects/<project_id>/import-notebook")
def import_notebook(project_id: str):
    """Parse .ipynb and return concatenated Markdown cells for the editor."""
    _project_dir_or_abort(project_id)
    file = request.files.get("file")
    if file is None:
        return jsonify({"error": "No file uploaded."}), 400

    original_name = file.filename or "notebook.ipynb"
    if not original_name.lower().endswith(".ipynb"):
        return jsonify({"error": "Only .ipynb files are supported."}), 400

    include_code = _parse_bool(request.form.get("include_code_as_fenced"), default=False)

    raw = file.read()
    try:
        markdown_text = extract_markdown_from_ipynb_bytes(
            raw,
            include_code_as_fenced=include_code,
        )
    except (UnicodeDecodeError, json.JSONDecodeError, ValueError) as exc:
        return jsonify({"error": f"Could not read notebook: {exc}"}), 400

    suggested_name = f"{Path(original_name).stem}.md"
    return jsonify(
        {
            "markdown": markdown_text,
            "source_name": original_name,
            "suggested_filename": suggested_name,
        },
    )


# -----------------------------------------------------------------------------
# API: on-demand Sphinx preview from whatever is currently in the editor
# -----------------------------------------------------------------------------


@app.post("/api/projects/<project_id>/preview")
def preview_markdown(project_id: str):
    """Build Sphinx HTML from arbitrary Markdown (manual recompile)."""
    proj = _project_dir_or_abort(project_id)
    payload = request.get_json(silent=True) or {}
    markdown_content = payload.get("markdown")
    if markdown_content is None or not isinstance(markdown_content, str):
        return jsonify({"error": 'Field "markdown" is required.'}), 400

    raw_mode = payload.get("execution_mode")
    execution_mode = (
        raw_mode
        if isinstance(raw_mode, str) and raw_mode in {"off", "force"}
        else "off"
    )

    try:
        preview_id, _sphinx_html = render_sphinx_preview(
            markdown_content,
            project_dir=proj,
            execution_mode=execution_mode,
        )
    except RuntimeError:
        return jsonify({"error": "Sphinx build failed."}), 500
    except Exception as exc:  # pragma: no cover
        return jsonify({"error": f"Sphinx build failed: {exc}"}), 500

    return jsonify(
        {
            "sphinx_preview_url": f"/api/sphinx-preview/{preview_id}/index.html",
        },
    )


# -----------------------------------------------------------------------------
# API: full jupytext conversion (entire notebook → Myst) + Sphinx preview
# -----------------------------------------------------------------------------
# Used when you need the same pipeline as "save as Myst" from a whole .ipynb,
# not just Markdown cells stitched together.


@app.post("/api/projects/<project_id>/convert")
def convert_notebook(project_id: str):
    proj = _project_dir_or_abort(project_id)
    file = request.files.get("file")
    if file is None:
        return jsonify({"error": "No file uploaded."}), 400

    original_name = file.filename or "notebook.ipynb"
    if not original_name.lower().endswith(".ipynb"):
        return jsonify({"error": "Only .ipynb files are supported."}), 400
    strip_jupytext = _parse_bool(request.form.get("strip_jupytext"), default=True)
    exec_raw = request.form.get("execution_mode")
    exec_mode = (
        exec_raw
        if isinstance(exec_raw, str) and exec_raw in {"off", "force"}
        else "off"
    )

    with TemporaryDirectory() as temp_dir:
        notebook_path = Path(temp_dir) / original_name
        file.save(notebook_path)

        try:
            notebook = jupytext.read(notebook_path)
            content = jupytext.writes(notebook, fmt="myst")
            if strip_jupytext:
                content = strip_jupytext_header(content)
            content = normalize_myst_nb_notebook_metadata(content)
            preview_id, sphinx_html = render_sphinx_preview(
                content,
                project_dir=proj,
                execution_mode=exec_mode,
            )
        except Exception as exc:  # pragma: no cover
            return jsonify({"error": f"Failed to convert notebook: {exc}"}), 500

    output_name = f"{Path(original_name).stem}.md"
    return jsonify(
        {
            "content": content,
            "filename": output_name,
            "sphinx_html": sphinx_html,
            "sphinx_preview_url": f"/api/sphinx-preview/{preview_id}/index.html",
        },
    )


# -----------------------------------------------------------------------------
# API: project workspace — conf.py + _static assets (copied into Sphinx builds)
# -----------------------------------------------------------------------------


@app.get("/api/projects/<project_id>/workspace/conf")
def workspace_conf_get(project_id: str):
    proj = _project_dir_or_abort(project_id)
    return jsonify({"content": _read_workspace_conf(proj)})


@app.put("/api/projects/<project_id>/workspace/conf")
def workspace_conf_put(project_id: str):
    proj = _project_dir_or_abort(project_id)
    payload = request.get_json(silent=True) or {}
    content = payload.get("content")
    if content is None or not isinstance(content, str):
        return jsonify({"error": 'Field "content" is required.'}), 400
    conf = _workspace_conf_file(proj)
    conf.parent.mkdir(parents=True, exist_ok=True)
    conf.write_text(content, encoding="utf-8")
    return jsonify({"ok": True})


@app.get("/api/projects/<project_id>/workspace/themes")
def workspace_themes_get(project_id: str):
    proj = _project_dir_or_abort(project_id)
    text = _read_workspace_conf(proj)
    current = _parse_html_theme_from_conf(text)
    themes = [{"id": tid, "label": label} for tid, label in ALLOWED_HTML_THEMES]
    return jsonify({"themes": themes, "current": current})


@app.put("/api/projects/<project_id>/workspace/theme")
def workspace_theme_put(project_id: str):
    proj = _project_dir_or_abort(project_id)
    payload = request.get_json(silent=True) or {}
    theme = payload.get("theme")
    if not isinstance(theme, str) or theme not in ALLOWED_HTML_THEME_IDS:
        return jsonify(
            {
                "error": "Invalid theme.",
                "allowed": sorted(ALLOWED_HTML_THEME_IDS),
            },
        ), 400
    text = _read_workspace_conf(proj)
    updated = _set_html_theme_in_conf(text, theme)
    _workspace_conf_file(proj).write_text(updated, encoding="utf-8")
    return jsonify({"ok": True, "theme": theme, "content": updated})


@app.get("/api/projects/<project_id>/workspace/assets")
def workspace_assets_list(project_id: str):
    proj = _project_dir_or_abort(project_id)
    static_dir = _workspace_static_dir(proj)
    static_dir.mkdir(parents=True, exist_ok=True)
    files: list[dict[str, str | int]] = []
    for p in sorted(static_dir.iterdir()):
        if p.is_file():
            files.append({"name": p.name, "size": int(p.stat().st_size)})
    return jsonify({"files": files})


@app.post("/api/projects/<project_id>/workspace/assets")
def workspace_assets_upload(project_id: str):
    proj = _project_dir_or_abort(project_id)
    static_dir = _workspace_static_dir(proj)
    file = request.files.get("file")
    if file is None or not getattr(file, "filename", None):
        return jsonify({"error": "No file uploaded."}), 400
    safe = _safe_asset_filename(file.filename)
    if safe is None:
        return jsonify({"error": "Invalid filename."}), 400
    static_dir.mkdir(parents=True, exist_ok=True)
    dest = static_dir / safe
    file.save(dest)
    return jsonify({"ok": True, "name": safe})


@app.get("/api/projects/<project_id>/workspace/assets/<path:name>")
def workspace_assets_get(project_id: str, name: str):
    proj = _project_dir_or_abort(project_id)
    static_dir = _workspace_static_dir(proj)
    safe = _safe_asset_filename(name)
    if safe is None:
        abort(404)
    path = static_dir / safe
    if not path.is_file():
        abort(404)
    return send_from_directory(static_dir, safe)


@app.delete("/api/projects/<project_id>/workspace/assets/<path:name>")
def workspace_assets_delete(project_id: str, name: str):
    proj = _project_dir_or_abort(project_id)
    static_dir = _workspace_static_dir(proj)
    safe = _safe_asset_filename(name)
    if safe is None:
        return jsonify({"error": "Invalid filename."}), 400
    dest = static_dir / safe
    if not dest.is_file():
        return jsonify({"error": "Not found."}), 404
    dest.unlink()
    return jsonify({"ok": True})


# -----------------------------------------------------------------------------
# Entry point (development server)
# -----------------------------------------------------------------------------


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
