from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.database import get_db
from app.ingest import (
    answer_questions,
    batch_dto,
    confirm_batch,
    discard_batch,
    skip_interview,
    stage_drafts,
)
from app.models import ImportBatch

router = APIRouter(tags=["ingest"])

MAX_UPLOAD_BYTES = 10 * 1024 * 1024


def _get_batch(db: Session, batch_id: int) -> ImportBatch:
    batch = db.get(ImportBatch, batch_id)
    if batch is None:
        raise HTTPException(404, "import batch not found")
    return batch


def _text_payload(source_type: str, text: str | None, file: UploadFile | None, file_bytes: bytes) -> str | bytes:
    if source_type == "pdf":
        if file is None and not file_bytes:
            raise HTTPException(400, "pdf upload required")
        return file_bytes
    if not text or not text.strip():
        raise HTTPException(400, "text is required")
    return text


@router.post("/ingest/text", status_code=201)
def ingest_text(body: dict, db: Session = Depends(get_db)):
    batch, meta = stage_drafts(db, "text", body.get("text", ""))
    return {"batch": batch_dto(db, batch), **meta}


@router.post("/ingest/markdown", status_code=201)
async def ingest_markdown(file: UploadFile | None = File(default=None), db: Session = Depends(get_db)):
    raw = await _read_upload(file)
    batch, meta = stage_drafts(db, "markdown", raw.decode("utf-8", errors="replace"))
    return {"batch": batch_dto(db, batch), **meta}


@router.post("/ingest/pdf", status_code=201)
async def ingest_pdf(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    raw = await file.read()
    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "file too large (max 10MB)")
    if not raw.startswith(b"%PDF"):
        raise HTTPException(400, "not a PDF file")
    batch, meta = stage_drafts(db, "pdf", raw)
    return {"batch": batch_dto(db, batch), **meta}


async def _read_upload(file: UploadFile | None) -> bytes:
    if file is None:
        raise HTTPException(400, "file required")
    raw = await file.read()
    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "file too large (max 10MB)")
    return raw


@router.get("/import-batches/{batch_id}")
def get_batch(batch_id: int, db: Session = Depends(get_db)):
    return batch_dto(db, _get_batch(db, batch_id))


@router.post("/import-batches/{batch_id}/answer")
def answer_round(batch_id: int, body: dict, db: Session = Depends(get_db)):
    batch = _get_batch(db, batch_id)
    if batch.status != "awaiting_interview":
        raise HTTPException(409, "batch is not awaiting interview answers")
    answers = body.get("answers")
    if not isinstance(answers, list):
        raise HTTPException(400, "answers array required")
    result = answer_questions(db, batch, answers)
    return {**result, "batch": batch_dto(db, batch)}


@router.post("/import-batches/{batch_id}/skip-interview")
def skip_round(batch_id: int, db: Session = Depends(get_db)):
    batch = _get_batch(db, batch_id)
    skip_interview(db, batch)
    return {"batch": batch_dto(db, batch)}


@router.post("/import-batches/{batch_id}/confirm")
def confirm(batch_id: int, body: dict | None = None, db: Session = Depends(get_db)):
    batch = _get_batch(db, batch_id)
    body = body or {}
    result = confirm_batch(
        db,
        batch,
        task_ids=body.get("taskIds"),
        accepted_dependencies=body.get("acceptedDependencies"),
        accepted_suggestions=body.get("acceptedSuggestions"),
    )
    return {**result, "batch": batch_dto(db, batch)}


@router.delete("/import-batches/{batch_id}")
def discard(batch_id: int, db: Session = Depends(get_db)):
    batch = _get_batch(db, batch_id)
    discard_batch(db, batch)
    return {"status": "discarded"}
