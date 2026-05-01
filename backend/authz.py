"""Project-level authorization (roles: owner, editor, viewer)."""

from __future__ import annotations

from flask_login import current_user

from extensions import db
from models import ProjectMember, ProjectRecord

ROLE_RANK: dict[str, int] = {"viewer": 1, "editor": 2, "owner": 3}


def effective_project_role(project_id: str, user_id: str) -> str | None:
    rec = db.session.get(ProjectRecord, project_id)
    if rec is None:
        return None
    if rec.owner_user_id == user_id:
        return "owner"
    m = db.session.get(ProjectMember, (project_id, user_id))
    if m is None:
        return None
    if m.role in ROLE_RANK and m.role != "owner":
        return m.role
    return None


def accessible_project_ids_for(user_id: str) -> set[str]:
    owned = (
        db.session.query(ProjectRecord.id)
        .filter(ProjectRecord.owner_user_id == user_id)
        .all()
    )
    ids = {row[0] for row in owned}
    member_rows = (
        db.session.query(ProjectMember.project_id)
        .filter(ProjectMember.user_id == user_id)
        .all()
    )
    ids |= {row[0] for row in member_rows}
    return ids


def current_user_effective_role(project_id: str) -> str | None:
    if not current_user.is_authenticated:
        return None
    return effective_project_role(project_id, current_user.id)
