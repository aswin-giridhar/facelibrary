"""Audit & Traceability Agent — Logs transactions and monitors usage patterns."""
from datetime import datetime
from models import AuditLog, SessionLocal


class AuditAgent:
    name = "audit"

    def log(self, license_id: int | None, agent_name: str, action: str, details: str = "",
            model_used: str = "", tokens_used: int = 0) -> dict:
        """Log an agent action to the audit trail."""
        db = SessionLocal()
        try:
            entry = AuditLog(
                license_id=license_id,
                agent_name=agent_name,
                action=action,
                details=details,
                model_used=model_used,
                tokens_used=tokens_used,
            )
            db.add(entry)
            db.commit()
            return {
                "agent": self.name,
                "action": "logged",
                "entry_id": entry.id,
                "timestamp": entry.created_at.isoformat(),
            }
        finally:
            db.close()

    def get_license_audit_trail(self, license_id: int) -> list[dict]:
        """Get full audit trail for a license."""
        db = SessionLocal()
        try:
            logs = db.query(AuditLog).filter(
                AuditLog.license_id == license_id
            ).order_by(AuditLog.created_at.asc()).all()
            return [
                {
                    "id": log.id,
                    "agent": log.agent_name,
                    "action": log.action,
                    "details": log.details,
                    "model": log.model_used,
                    "tokens": log.tokens_used,
                    "timestamp": log.created_at.isoformat(),
                }
                for log in logs
            ]
        finally:
            db.close()

    def get_system_stats(self) -> dict:
        """Get overall system usage statistics."""
        db = SessionLocal()
        try:
            total_logs = db.query(AuditLog).count()
            total_tokens = sum(
                log.tokens_used or 0 for log in db.query(AuditLog).all()
            )
            agents_active = db.query(AuditLog.agent_name).distinct().count()
            return {
                "total_actions": total_logs,
                "total_tokens_used": total_tokens,
                "unique_agents_active": agents_active,
            }
        finally:
            db.close()
