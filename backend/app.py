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

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})
SPHINX_PREVIEWS: dict[str, Path] = {}
MAX_SPHINX_PREVIEWS = 10


def _parse_bool(value: str | None, default: bool = True) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def strip_jupytext_header(content: str) -> str:
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
    while len(SPHINX_PREVIEWS) > MAX_SPHINX_PREVIEWS:
        oldest_id = next(iter(SPHINX_PREVIEWS))
        preview_dir = SPHINX_PREVIEWS.pop(oldest_id)
        shutil.rmtree(preview_dir, ignore_errors=True)


def render_sphinx_preview(markdown_content: str) -> tuple[str, str]:
    temp_dir = Path(tempfile.mkdtemp(prefix="sphinx-preview-"))
    source_dir = temp_dir / "source"
    build_dir = temp_dir / "build"
    source_dir.mkdir(parents=True, exist_ok=True)
    build_dir.mkdir(parents=True, exist_ok=True)

    conf_py = """extensions = ['myst_parser']
source_suffix = {'.md': 'markdown'}
master_doc = 'index'
html_theme = 'sphinx_book_theme'

myst_enable_extensions = [
    'amsmath',
    'dollarmath',
    'colon_fence',
    'substitution',
]
suppress_warnings = [
    'myst.role_unknown',
    'myst.xref_missing',
    'ref.eq',
]

# -- MathJax -----------------------------------------------------------------
mathjax_path = "https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"

mathjax3_config = {
    "tex": {
        "macros": {
            "RR": "\\\\mathbb{R}",
            "NN": "\\\\mathbb{N}",
            "ZZ": "\\\\mathbb{Z}",
            "I":  "\\\\mathbf{I}",
            "0":  "\\\\mathbf{0}",
            "1":  "\\\\mathbf{1}",
            "q":  "\\\\mathbf{q}",
            "u":  "\\\\mathbf{u}",
            "z":  "\\\\mathbf{z}",
            "d":  "\\\\mathbf{d}",
            "f":  "\\\\mathbf{f}",
            "s":  "\\\\mathbf{s}",
            "Q":  "\\\\mathbf{Q}",
            "U":  "\\\\mathbf{U}",
            "Z":  "\\\\mathbf{Z}",
            "Op":    "\\\\mathbf{f}",
            "Ophat": "\\\\hat{\\\\mathbf{f}}",
            "c":  "\\\\mathbf{c}",
            "A":  "\\\\mathbf{A}",
            "H":  "\\\\mathbf{H}",
            "G":  "\\\\mathbf{G}",
            "B":  "\\\\mathbf{B}",
            "N":  "\\\\mathbf{N}",
            "v":  "\\\\mathbf{v}",
            "w":  "\\\\mathbf{w}",
            "V":  "\\\\mathbf{V}",
            "W":  "\\\\mathbf{W}",
            "Vr": "\\\\mathbf{V}_{\\\\!r}",
            "Wr": "\\\\mathbf{W}_{\\\\!r}",
            "qhat": "\\\\hat{\\\\mathbf{q}}",
            "zhat": "\\\\hat{\\\\mathbf{z}}",
            "fhat": "\\\\hat{\\\\mathbf{f}}",
            "Qhat": "\\\\hat{\\\\mathbf{Q}}",
            "Zhat": "\\\\hat{\\\\mathbf{Z}}",
            "chat": "\\\\hat{\\\\mathbf{c}}",
            "Ahat": "\\\\hat{\\\\mathbf{A}}",
            "Hhat": "\\\\hat{\\\\mathbf{H}}",
            "Ghat": "\\\\hat{\\\\mathbf{G}}",
            "Bhat": "\\\\hat{\\\\mathbf{B}}",
            "Nhat": "\\\\hat{\\\\mathbf{N}}",
            "D":    "\\\\mathbf{D}",
            "ohat": "\\\\hat{\\\\mathbf{o}}",
            "Ohat": "\\\\hat{\\\\mathbf{O}}",
            "bfmu":     "\\\\boldsymbol{\\\\mu}",
            "bfGamma":  "\\\\boldsymbol{\\\\Gamma}",
            "bfPhi":    "\\\\boldsymbol{\\\\Phi}",
            "bfSigma":  "\\\\boldsymbol{\\\\Sigma}",
            "bfPsi":    "\\\\boldsymbol{\\\\Psi}",
            "bfLambda": "\\\\boldsymbol{\\\\Lambda}",
            "bfxi":     "\\\\boldsymbol{\\\\xi}",
            "trp":   "{^{\\\\mathsf{T}}}",
            "ddt":   "\\\\frac{\\\\textrm{d}}{\\\\textrm{d}t}",
            "ddqhat": "\\\\frac{\\\\partial}{\\\\partial\\\\qhat}",
            "mean":   "\\\\operatorname{mean}",
            "std":    "\\\\operatorname{std}",
            "argmin": "\\\\operatorname{argmin}",
        }
    }
}

# -- Figure numbering --------------------------------------------------------
numfig = True
numfig_secnum_depth = 1
"""
    (source_dir / "conf.py").write_text(conf_py, encoding="utf-8")
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


@app.get("/api/sphinx-preview/<preview_id>/")
@app.get("/api/sphinx-preview/<preview_id>/<path:asset_path>")
def serve_sphinx_preview(preview_id: str, asset_path: str = "index.html"):
    preview_root = SPHINX_PREVIEWS.get(preview_id)
    if preview_root is None:
        abort(404)

    build_dir = preview_root / "build"
    resolved_path = (build_dir / asset_path).resolve()
    if not str(resolved_path).startswith(str(build_dir.resolve())):
        abort(404)
    if not resolved_path.exists():
        abort(404)

    return send_from_directory(build_dir, asset_path)


@app.post("/api/convert")
def convert_notebook():
    file = request.files.get("file")
    if file is None:
        return jsonify({"error": "No file uploaded."}), 400

    original_name = file.filename or "notebook.ipynb"
    if not original_name.lower().endswith(".ipynb"):
        return jsonify({"error": "Only .ipynb files are supported."}), 400
    strip_jupytext = _parse_bool(request.form.get("strip_jupytext"), default=True)

    with TemporaryDirectory() as temp_dir:
        notebook_path = Path(temp_dir) / original_name
        file.save(notebook_path)

        try:
            notebook = jupytext.read(notebook_path)
            content = jupytext.writes(notebook, fmt="myst")
            if strip_jupytext:
                content = strip_jupytext_header(content)
            preview_id, sphinx_html = render_sphinx_preview(content)
        except Exception as exc:  # pragma: no cover
            return jsonify({"error": f"Failed to convert notebook: {exc}"}), 500

    output_name = f"{Path(original_name).stem}.md"
    return jsonify(
        {
            "content": content,
            "filename": output_name,
            "sphinx_html": sphinx_html,
            "sphinx_preview_url": f"/api/sphinx-preview/{preview_id}/index.html",
        }
    )


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
