"""Database models for users, projects, and memberships."""

from __future__ import annotations

import uuid

from flask_login import UserMixin
from sqlalchemy.sql import func
from werkzeug.security import check_password_hash, generate_password_hash

from extensions import db


class User(UserMixin, db.Model):
    __tablename__ = "users"

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    email = db.Column(db.String(255), nullable=False, unique=True, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    created_at = db.Column(db.DateTime(timezone=True), server_default=func.now())

    def set_password(self, password: str) -> None:
        self.password_hash = generate_password_hash(password)

    def check_password(self, password: str) -> bool:
        return check_password_hash(self.password_hash, password)


class ProjectRecord(db.Model):
    """Maps a filesystem project folder (UUID dirname) to an owning account."""

    __tablename__ = "projects"

    id = db.Column(db.String(36), primary_key=True)
    owner_user_id = db.Column(
        db.String(36),
        db.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    created_at = db.Column(db.DateTime(timezone=True), server_default=func.now())


class ProjectMember(db.Model):
    """Collaborators other than the owner (`projects.owner_user_id`). Roles: editor, viewer."""

    __tablename__ = "project_members"

    project_id = db.Column(
        db.String(36),
        db.ForeignKey("projects.id", ondelete="CASCADE"),
        primary_key=True,
    )
    user_id = db.Column(
        db.String(36),
        db.ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    role = db.Column(db.String(16), nullable=False)
