#!/bin/sh
set -e
cd /app
export FLASK_APP=app
flask db upgrade
exec python -u -c 'from app import app; app.run(host="0.0.0.0", port=5000, debug=False)'
