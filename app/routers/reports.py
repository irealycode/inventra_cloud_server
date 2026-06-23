"""Consolidated + per-store read-only reporting for an owner.

Always scoped to the authenticated owner's `customer_id` via `get_current_owner`
— an owner can never read another customer's data. Every endpoint accepts an
optional `store_id` to focus on a single branch (validated to belong to the
owner); omit it for an all-stores view. Only data the branches actually sync is
exposed (sales, products, stock movements, expenses, clients, employees, shifts).
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_owner
from app.models import (
    Client,
    Customer,
    Employee,
    Expense,
    Product,
    Sale,
    Shift,
    StockMovement,
    Store,
)

router = APIRouter(prefix="/api/v1/reports", tags=["reports"])

NOT_VOIDED = or_(Sale.status.is_(None), Sale.status != "voided")


# ---- helpers ----------------------------------------------------------------
def _store_map(db: Session, owner: Customer) -> dict[str, str]:
    rows = db.query(Store).filter(Store.customer_id == owner.customer_id).all()
    return {str(s.store_id): s.name for s in rows}


def _scope(store_map: dict[str, str], store_id: str | None) -> list[str]:
    if store_id:
        if store_id not in store_map:
            raise HTTPException(status_code=404, detail="store not found")
        return [store_id]
    return list(store_map.keys())


def _page(limit: int | None, offset: int | None) -> tuple[int, int]:
    return min(max(limit or 50, 1), 200), max(offset or 0, 0)


def _f(x) -> float | None:
    return float(x) if x is not None else None


def _date_filter(q, col, frm: str | None, to: str | None):
    if frm:
        q = q.filter(col >= frm)
    if to:
        q = q.filter(col <= f"{to} 23:59:59")
    return q


# ---- aggregate sales (powers the all-stores overview chart) -----------------
@router.get("/sales")
def sales_report(
    from_: str | None = Query(default=None, alias="from"),
    to: str | None = Query(default=None),
    store_id: str | None = Query(default=None),
    owner: Customer = Depends(get_current_owner),
    db: Session = Depends(get_db),
):
    smap = _store_map(db, owner)
    if not smap:
        return {"from": from_, "to": to, "total_revenue": 0.0, "total_sales": 0, "by_store": []}
    ids = _scope(smap, store_id)

    q = db.query(
        Sale.store_id,
        func.count().label("cnt"),
        func.coalesce(func.sum(Sale.total), 0).label("revenue"),
    ).filter(Sale.store_id.in_(ids), NOT_VOIDED)
    q = _date_filter(q, Sale.created_at, from_, to).group_by(Sale.store_id)

    by_store, total_rev, total_cnt, seen = [], 0.0, 0, set()
    for sid, cnt, rev in q.all():
        sid = str(sid)
        seen.add(sid)
        rev = _f(rev) or 0.0
        by_store.append({"store_id": sid, "store_name": smap.get(sid, sid), "sales_count": int(cnt), "revenue": rev})
        total_rev += rev
        total_cnt += int(cnt)
    for sid in ids:
        if sid not in seen:
            by_store.append({"store_id": sid, "store_name": smap.get(sid, sid), "sales_count": 0, "revenue": 0.0})
    by_store.sort(key=lambda r: r["revenue"], reverse=True)
    return {"from": from_, "to": to, "total_revenue": total_rev, "total_sales": total_cnt, "by_store": by_store}


# ---- overview KPIs ----------------------------------------------------------
@router.get("/overview")
def overview(
    from_: str | None = Query(default=None, alias="from"),
    to: str | None = Query(default=None),
    store_id: str | None = Query(default=None),
    owner: Customer = Depends(get_current_owner),
    db: Session = Depends(get_db),
):
    smap = _store_map(db, owner)
    ids = _scope(smap, store_id) if smap else []
    if not ids:
        return {
            "revenue": 0.0, "sales_count": 0, "expenses_total": 0.0,
            "product_count": 0, "client_count": 0, "employee_count": 0, "store_count": 0,
        }

    sq = db.query(
        func.count().label("cnt"),
        func.coalesce(func.sum(Sale.total), 0).label("rev"),
    ).filter(Sale.store_id.in_(ids), NOT_VOIDED)
    sq = _date_filter(sq, Sale.created_at, from_, to)
    cnt, rev = sq.one()

    eq = db.query(func.coalesce(func.sum(Expense.amount), 0)).filter(Expense.store_id.in_(ids))
    eq = _date_filter(eq, Expense.created_at, from_, to)
    expenses_total = eq.scalar()

    product_count = db.query(func.count()).filter(Product.store_id.in_(ids)).scalar()
    client_count = db.query(func.count()).filter(Client.store_id.in_(ids)).scalar()
    employee_count = db.query(func.count()).filter(Employee.store_id.in_(ids)).scalar()

    return {
        "revenue": _f(rev) or 0.0,
        "sales_count": int(cnt or 0),
        "expenses_total": _f(expenses_total) or 0.0,
        "product_count": int(product_count or 0),
        "client_count": int(client_count or 0),
        "employee_count": int(employee_count or 0),
        "store_count": len(ids),
    }


# ---- sales list -------------------------------------------------------------
@router.get("/sales-list")
def sales_list(
    from_: str | None = Query(default=None, alias="from"),
    to: str | None = Query(default=None),
    store_id: str | None = Query(default=None),
    limit: int | None = Query(default=50),
    offset: int | None = Query(default=0),
    owner: Customer = Depends(get_current_owner),
    db: Session = Depends(get_db),
):
    smap = _store_map(db, owner)
    ids = _scope(smap, store_id) if smap else []
    if not ids:
        return {"items": [], "total": 0, "limit": limit or 50, "offset": offset or 0}
    lim, off = _page(limit, offset)

    base = db.query(Sale).filter(Sale.store_id.in_(ids))
    base = _date_filter(base, Sale.created_at, from_, to)
    total = base.with_entities(func.count()).scalar()
    rows = base.order_by(Sale.created_at.desc(), Sale.local_id.desc()).limit(lim).offset(off).all()

    # cashier names (composite key (store_id, local_id))
    emp = {
        (str(e.store_id), e.local_id): (e.full_name or e.username)
        for e in db.query(Employee).filter(Employee.store_id.in_(ids)).all()
    }
    items = [
        {
            "store_id": str(s.store_id),
            "store_name": smap.get(str(s.store_id), ""),
            "local_id": s.local_id,
            "total": _f(s.total),
            "subtotal": _f(s.subtotal),
            "discount": _f(s.discount),
            "tax": _f(s.tax),
            "payment_method": s.payment_method,
            "status": s.status,
            "cashier_name": emp.get((str(s.store_id), s.cashier_local_id)),
            "created_at": s.created_at,
        }
        for s in rows
    ]
    return {"items": items, "total": int(total or 0), "limit": lim, "offset": off}


# ---- products ---------------------------------------------------------------
@router.get("/products")
def products(
    search: str | None = Query(default=None),
    store_id: str | None = Query(default=None),
    limit: int | None = Query(default=50),
    offset: int | None = Query(default=0),
    owner: Customer = Depends(get_current_owner),
    db: Session = Depends(get_db),
):
    smap = _store_map(db, owner)
    ids = _scope(smap, store_id) if smap else []
    if not ids:
        return {"items": [], "total": 0, "limit": limit or 50, "offset": offset or 0}
    lim, off = _page(limit, offset)

    base = db.query(Product).filter(Product.store_id.in_(ids))
    if search:
        like = f"%{search}%"
        base = base.filter(or_(Product.name.ilike(like), Product.sku.ilike(like), Product.barcode.ilike(like)))
    total = base.with_entities(func.count()).scalar()
    rows = base.order_by(Product.name.asc()).limit(lim).offset(off).all()
    items = [
        {
            "store_id": str(p.store_id),
            "store_name": smap.get(str(p.store_id), ""),
            "local_id": p.local_id,
            "name": p.name,
            "sku": p.sku,
            "barcode": p.barcode,
            "price": _f(p.price),
            "cost": _f(p.cost),
            "stock": _f(p.stock),
            "category": p.category,
        }
        for p in rows
    ]
    return {"items": items, "total": int(total or 0), "limit": lim, "offset": off}


# ---- stock movements --------------------------------------------------------
@router.get("/movements")
def movements(
    store_id: str | None = Query(default=None),
    limit: int | None = Query(default=50),
    offset: int | None = Query(default=0),
    owner: Customer = Depends(get_current_owner),
    db: Session = Depends(get_db),
):
    smap = _store_map(db, owner)
    ids = _scope(smap, store_id) if smap else []
    if not ids:
        return {"items": [], "total": 0, "limit": limit or 50, "offset": offset or 0}
    lim, off = _page(limit, offset)

    base = db.query(StockMovement).filter(StockMovement.store_id.in_(ids))
    total = base.with_entities(func.count()).scalar()
    rows = base.order_by(StockMovement.created_at.desc(), StockMovement.local_id.desc()).limit(lim).offset(off).all()
    items = [
        {
            "store_id": str(m.store_id),
            "store_name": smap.get(str(m.store_id), ""),
            "local_id": m.local_id,
            "product_name": (m.raw or {}).get("product_name") if isinstance(m.raw, dict) else None,
            "delta": _f(m.delta),
            "reason": m.reason,
            "note": m.note,
            "created_at": m.created_at,
        }
        for m in rows
    ]
    return {"items": items, "total": int(total or 0), "limit": lim, "offset": off}


# ---- expenses ---------------------------------------------------------------
@router.get("/expenses")
def expenses(
    from_: str | None = Query(default=None, alias="from"),
    to: str | None = Query(default=None),
    store_id: str | None = Query(default=None),
    limit: int | None = Query(default=50),
    offset: int | None = Query(default=0),
    owner: Customer = Depends(get_current_owner),
    db: Session = Depends(get_db),
):
    smap = _store_map(db, owner)
    ids = _scope(smap, store_id) if smap else []
    if not ids:
        return {"items": [], "total": 0, "total_amount": 0.0, "limit": limit or 50, "offset": offset or 0}
    lim, off = _page(limit, offset)

    base = db.query(Expense).filter(Expense.store_id.in_(ids))
    base = _date_filter(base, Expense.created_at, from_, to)
    total = base.with_entities(func.count()).scalar()
    total_amount = base.with_entities(func.coalesce(func.sum(Expense.amount), 0)).scalar()
    rows = base.order_by(Expense.created_at.desc(), Expense.local_id.desc()).limit(lim).offset(off).all()
    items = [
        {
            "store_id": str(x.store_id),
            "store_name": smap.get(str(x.store_id), ""),
            "local_id": x.local_id,
            "description": (x.raw or {}).get("note") if isinstance(x.raw, dict) else None,
            "category": x.category,
            "amount": _f(x.amount),
            "created_at": x.created_at,
        }
        for x in rows
    ]
    return {"items": items, "total": int(total or 0), "total_amount": _f(total_amount) or 0.0, "limit": lim, "offset": off}


# ---- clients ----------------------------------------------------------------
@router.get("/clients")
def clients(
    search: str | None = Query(default=None),
    store_id: str | None = Query(default=None),
    limit: int | None = Query(default=50),
    offset: int | None = Query(default=0),
    owner: Customer = Depends(get_current_owner),
    db: Session = Depends(get_db),
):
    smap = _store_map(db, owner)
    ids = _scope(smap, store_id) if smap else []
    if not ids:
        return {"items": [], "total": 0, "limit": limit or 50, "offset": offset or 0}
    lim, off = _page(limit, offset)

    base = db.query(Client).filter(Client.store_id.in_(ids))
    if search:
        like = f"%{search}%"
        base = base.filter(or_(Client.name.ilike(like), Client.phone.ilike(like), Client.email.ilike(like)))
    total = base.with_entities(func.count()).scalar()
    rows = base.order_by(Client.name.asc()).limit(lim).offset(off).all()
    items = [
        {
            "store_id": str(c.store_id),
            "store_name": smap.get(str(c.store_id), ""),
            "local_id": c.local_id,
            "name": c.name,
            "phone": c.phone,
            "email": c.email,
            "loyalty_points": _f(c.loyalty_points),
        }
        for c in rows
    ]
    return {"items": items, "total": int(total or 0), "limit": lim, "offset": off}


# ---- employees --------------------------------------------------------------
@router.get("/employees")
def employees(
    store_id: str | None = Query(default=None),
    owner: Customer = Depends(get_current_owner),
    db: Session = Depends(get_db),
):
    smap = _store_map(db, owner)
    ids = _scope(smap, store_id) if smap else []
    if not ids:
        return {"items": []}
    rows = (
        db.query(Employee)
        .filter(Employee.store_id.in_(ids))
        .order_by(Employee.full_name.asc())
        .all()
    )
    items = [
        {
            "store_id": str(e.store_id),
            "store_name": smap.get(str(e.store_id), ""),
            "local_id": e.local_id,
            "username": e.username,
            "full_name": e.full_name,
            "role": e.role,
            "active": bool(e.active),
        }
        for e in rows
    ]
    return {"items": items}


# ---- shifts -----------------------------------------------------------------
@router.get("/shifts")
def shifts(
    store_id: str | None = Query(default=None),
    limit: int | None = Query(default=50),
    offset: int | None = Query(default=0),
    owner: Customer = Depends(get_current_owner),
    db: Session = Depends(get_db),
):
    smap = _store_map(db, owner)
    ids = _scope(smap, store_id) if smap else []
    if not ids:
        return {"items": [], "total": 0, "limit": limit or 50, "offset": offset or 0}
    lim, off = _page(limit, offset)

    base = db.query(Shift).filter(Shift.store_id.in_(ids))
    total = base.with_entities(func.count()).scalar()
    rows = base.order_by(Shift.opened_at.desc(), Shift.local_id.desc()).limit(lim).offset(off).all()
    emp = {
        (str(e.store_id), e.local_id): (e.full_name or e.username)
        for e in db.query(Employee).filter(Employee.store_id.in_(ids)).all()
    }
    items = [
        {
            "store_id": str(s.store_id),
            "store_name": smap.get(str(s.store_id), ""),
            "local_id": s.local_id,
            "cashier_name": emp.get((str(s.store_id), s.cashier_local_id)),
            "opening_cash": _f(s.opening_cash),
            "closing_cash": _f(s.closing_cash),
            "opened_at": s.opened_at,
            "closed_at": s.closed_at,
        }
        for s in rows
    ]
    return {"items": items, "total": int(total or 0), "limit": lim, "offset": off}
