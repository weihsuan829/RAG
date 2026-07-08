# 前後端整合實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** React 前端接上 yarag FastAPI 後端：真實登入（JWT）、聊天串流（Cloudflare AI Search，附出處）、聊天記錄入庫、上傳直傳 R2。

**Architecture:** 後端擴充四模組（auth/chat/threads/uploads）＋ SQLite（SQLAlchemy）；聊天為兩段式：先打 AI Search `search` 取出處、再打 `chat/completions` 串流答案，以 SSE 推 `citations → delta → done` 事件。前端新增唯一服務層 `api.ts` 取代直連 OpenAI。

**Tech Stack:** FastAPI、SQLAlchemy 2.x、PyJWT、argon2-cffi、httpx、pytest；React 19 + TypeScript + Vite。

## Global Constraints

- 兩個 git repo：後端改動在 `/Users/weihsuan/RAG_new/yarag`（獨立 repo）內 commit；前端與腳本在 `/Users/weihsuan/RAG_new` commit。
- 後端所有指令在 `/Users/weihsuan/RAG_new/yarag` 下執行（`uv run ...`）；前端在 `/Users/weihsuan/RAG_new/frontend`（`npm run ...`）。
- 金鑰與 `.env` 永不進 git；`data.db` 不進 git。
- API 前綴 `/api/v1/`；除 `/auth/login` 外皆需 `Authorization: Bearer <token>`。
- 錯誤訊息使用者可讀（繁中）；登入失敗一律「帳號或密碼錯誤」。
- 上傳單檔上限 4MB（AI Search 索引限制）。
- TDD：先寫測試、看它失敗、再實作、再看它通過，然後 commit。
- 遵循 yarag 既有 ruff 設定（line-length 120）；commit 前跑 `uv run ruff check src tests`。

## 前置條件（Task 6 之前需就緒）

使用者提供三個值填入 `yarag/.env`：`CF_ACCOUNT_ID`（Cloudflare Account ID）、`CF_AI_SEARCH_INSTANCE`（AI Search 實例名稱）、`CF_API_TOKEN`（權限 AI Search: Run）。Task 1–5 不依賴真實值（測試用假值）。

---

### Task 1: 後端依賴與設定擴充

**Files:**
- Modify: `yarag/pyproject.toml`（dependencies）
- Modify: `yarag/src/yarag/config.py`
- Modify: `yarag/.env`（追加新值）
- Create: `yarag/tests/conftest.py`
- Test: `yarag/tests/test_config.py`

**Interfaces:**
- Produces: `settings.database_url: str`、`settings.jwt_secret: str`、`settings.jwt_expires_hours: int = 8`、`settings.cf_account_id: str`、`settings.cf_ai_search_instance: str`、`settings.cf_api_token: str`、`settings.cors_origins: str`（逗號分隔）。缺必填值時 import 即拋錯（啟動自檢）。

- [ ] **Step 1: 安裝依賴**

```bash
cd /Users/weihsuan/RAG_new/yarag
uv add "sqlalchemy>=2.0" "pyjwt>=2.10" "argon2-cffi>=23" "httpx>=0.28"
```

- [ ] **Step 2: 建立 conftest（測試環境變數，必須在任何 yarag import 之前生效）**

`tests/conftest.py`：

```python
import os

os.environ.setdefault("ENDPOINT_URL", "https://test.r2.example.com")
os.environ.setdefault("AWS_ACCESS_KEY_ID", "test-key")
os.environ.setdefault("AWS_SECRET_ACCESS_KEY", "test-secret")
os.environ.setdefault("DEFAULT_BUCKET", "test-bucket")
os.environ.setdefault("DATABASE_URL", "sqlite:///test.db")
os.environ.setdefault("JWT_SECRET", "test-jwt-secret")
os.environ.setdefault("CF_ACCOUNT_ID", "test-account")
os.environ.setdefault("CF_AI_SEARCH_INSTANCE", "test-instance")
os.environ.setdefault("CF_API_TOKEN", "test-cf-token")
```

- [ ] **Step 3: 寫失敗測試** `tests/test_config.py`：

```python
from yarag.config import settings


def test_settings_has_new_fields():
    assert settings.database_url == "sqlite:///test.db"
    assert settings.jwt_secret == "test-jwt-secret"
    assert settings.jwt_expires_hours == 8
    assert settings.cf_account_id == "test-account"
    assert settings.cf_ai_search_instance == "test-instance"
    assert settings.cf_api_token == "test-cf-token"
    assert "5173" in settings.cors_origins
```

- [ ] **Step 4: 跑測試確認失敗**：`uv run pytest tests/test_config.py -v` → FAIL（欄位不存在）

- [ ] **Step 5: 實作** `src/yarag/config.py` 的 `Settings` 增加欄位（沿用既有 `Field(init=False)` 寫法）：

```python
    database_url: str = "sqlite:///data.db"
    jwt_secret: str = Field(init=False)
    jwt_expires_hours: int = 8
    cf_account_id: str = Field(init=False)
    cf_ai_search_instance: str = Field(init=False)
    cf_api_token: str = Field(init=False)
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
```

- [ ] **Step 6: 跑測試確認通過**：`uv run pytest tests/test_config.py -v` → PASS

- [ ] **Step 7: 更新開發用 `.env`**（追加，真實 CF 值之後由使用者提供，先填佔位）：

```
DATABASE_URL="sqlite:///data.db"
JWT_SECRET="<執行 python3 -c 'import secrets;print(secrets.token_hex(32))' 產生>"
CF_ACCOUNT_ID="a6062760cf0cafc7c97afa8b9cac157f"
CF_AI_SEARCH_INSTANCE="<待使用者提供>"
CF_API_TOKEN="<待使用者提供>"
```

並在 `yarag/.gitignore` 確認含 `.env`（已有）、追加 `data.db` 與 `test.db`。

- [ ] **Step 8: Commit**

```bash
uv run ruff check src tests && git add -A && git commit -m "feat: extend settings for db/jwt/cloudflare"
```

---

### Task 2: 資料庫基礎與模型

**Files:**
- Create: `yarag/src/yarag/db.py`、`yarag/src/yarag/models.py`
- Modify: `yarag/tests/conftest.py`（加 db fixture）
- Test: `yarag/tests/test_models.py`

**Interfaces:**
- Produces: `db.Base`、`db.engine`、`db.SessionLocal`、`db.init_db() -> None`、`db.get_db()`（FastAPI dependency，yield Session）；`models.User(id:int, username:str, display_name:str, password_hash:str, is_active:bool=True, is_admin:bool=False, created_at)`、`models.Thread(id:str UUID, user_id:int, title:str, created_at, updated_at)`、`models.Message(id:int, thread_id:str, role:str, content:str, citations:str|None, created_at)`。

- [ ] **Step 1: 失敗測試** `tests/test_models.py`：

```python
from sqlalchemy import select

from yarag.db import Base, SessionLocal, engine, init_db
from yarag.models import Message, Thread, User


def setup_function():
    Base.metadata.drop_all(engine)
    init_db()


def test_create_user_thread_message():
    with SessionLocal() as db:
        user = User(username="alice", display_name="愛麗絲", password_hash="x")
        db.add(user)
        db.commit()
        thread = Thread(user_id=user.id, title="測試對話")
        db.add(thread)
        db.commit()
        assert len(thread.id) == 36  # UUID 自動產生
        msg = Message(thread_id=thread.id, role="user", content="哈囉")
        db.add(msg)
        db.commit()
        loaded = db.scalar(select(User).where(User.username == "alice"))
        assert loaded is not None and loaded.is_active and not loaded.is_admin
        assert db.scalar(select(Message).where(Message.thread_id == thread.id)).content == "哈囉"
```

- [ ] **Step 2: 確認失敗**：`uv run pytest tests/test_models.py -v` → FAIL（module 不存在）

- [ ] **Step 3: 實作** `src/yarag/db.py`：

```python
from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from yarag.config import settings


class Base(DeclarativeBase):
    pass


_connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
engine = create_engine(settings.database_url, connect_args=_connect_args)
SessionLocal = sessionmaker(bind=engine, autoflush=False)


def init_db() -> None:
    from yarag import models  # noqa: F401  確保模型已註冊

    Base.metadata.create_all(engine)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

`src/yarag/models.py`：

```python
import uuid
from datetime import UTC, datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from yarag.db import Base


def _now() -> datetime:
    return datetime.now(UTC)


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    display_name: Mapped[str] = mapped_column(String(100))
    password_hash: Mapped[str] = mapped_column(String(200))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    threads = relationship("Thread", back_populates="user", cascade="all, delete-orphan")


class Thread(Base):
    __tablename__ = "threads"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    title: Mapped[str] = mapped_column(String(120))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)
    user = relationship("User", back_populates="threads")
    messages = relationship(
        "Message", back_populates="thread", cascade="all, delete-orphan", order_by="Message.id"
    )


class Message(Base):
    __tablename__ = "messages"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    thread_id: Mapped[str] = mapped_column(ForeignKey("threads.id"), index=True)
    role: Mapped[str] = mapped_column(String(10))
    content: Mapped[str] = mapped_column(Text)
    citations: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    thread = relationship("Thread", back_populates="messages")
```

- [ ] **Step 4: 確認通過**：`uv run pytest tests/test_models.py -v` → PASS
- [ ] **Step 5: Commit**：`uv run ruff check src tests && git add -A && git commit -m "feat: sqlalchemy models for users/threads/messages"`

---

### Task 3: 密碼雜湊與 JWT

**Files:**
- Create: `yarag/src/yarag/security.py`
- Test: `yarag/tests/test_security.py`

**Interfaces:**
- Produces: `hash_password(p:str)->str`、`verify_password(p:str, h:str)->bool`、`create_token(user_id:int)->str`、`decode_token(token:str)->int|None`（無效/過期回 None）。

- [ ] **Step 1: 失敗測試** `tests/test_security.py`：

```python
from datetime import UTC, datetime, timedelta

import jwt as pyjwt

from yarag.config import settings
from yarag.security import create_token, decode_token, hash_password, verify_password


def test_password_roundtrip():
    h = hash_password("secret123")
    assert h != "secret123"
    assert verify_password("secret123", h)
    assert not verify_password("wrong", h)


def test_token_roundtrip():
    assert decode_token(create_token(42)) == 42


def test_token_invalid_and_expired():
    assert decode_token("garbage") is None
    expired = pyjwt.encode(
        {"sub": "42", "exp": datetime.now(UTC) - timedelta(hours=1)},
        settings.jwt_secret,
        algorithm="HS256",
    )
    assert decode_token(expired) is None
```

- [ ] **Step 2: 確認失敗**：`uv run pytest tests/test_security.py -v` → FAIL
- [ ] **Step 3: 實作** `src/yarag/security.py`：

```python
from datetime import UTC, datetime, timedelta

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerificationError

from yarag.config import settings

_ph = PasswordHasher()


def hash_password(password: str) -> str:
    return _ph.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return _ph.verify(password_hash, password)
    except VerificationError:
        return False


def create_token(user_id: int) -> str:
    exp = datetime.now(UTC) + timedelta(hours=settings.jwt_expires_hours)
    return jwt.encode({"sub": str(user_id), "exp": exp}, settings.jwt_secret, algorithm="HS256")


def decode_token(token: str) -> int | None:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
        return int(payload["sub"])
    except (jwt.InvalidTokenError, KeyError, ValueError):
        return None
```

- [ ] **Step 4: 確認通過** → PASS；**Step 5: Commit** `git commit -m "feat: password hashing and jwt helpers"`

---

### Task 4: 登入 API 與建帳號腳本

**Files:**
- Create: `yarag/src/yarag/auth.py`、`yarag/src/yarag/create_user.py`
- Modify: `yarag/src/yarag/app.py`（掛 router；本 task 先最小掛載）、`yarag/pyproject.toml`（scripts）
- Modify: `yarag/tests/conftest.py`（加 client/user fixtures）
- Test: `yarag/tests/test_auth.py`

**Interfaces:**
- Produces: `auth.router`（`POST /api/v1/auth/login`、`GET /api/v1/auth/me`）；`auth.get_current_user`（FastAPI dependency → `models.User`，失敗拋 401）；CLI `uv run create-user <username> <display_name>`。
- Consumes: Task 2 的 `get_db`/`User`、Task 3 的全部函式。

- [ ] **Step 1: conftest 加 fixtures**（追加到 `tests/conftest.py` 底部）：

```python
import pytest
from fastapi.testclient import TestClient


@pytest.fixture()
def client():
    from yarag.app import app
    from yarag.db import Base, engine, init_db

    Base.metadata.drop_all(engine)
    init_db()
    with TestClient(app) as c:
        yield c


@pytest.fixture()
def make_user():
    from yarag.db import SessionLocal
    from yarag.models import User
    from yarag.security import hash_password

    def _make(username="alice", password="pw12345", display_name="愛麗絲", is_active=True):
        with SessionLocal() as db:
            u = User(
                username=username,
                display_name=display_name,
                password_hash=hash_password(password),
                is_active=is_active,
            )
            db.add(u)
            db.commit()
            return u.id

    return _make


@pytest.fixture()
def auth_headers(client, make_user):
    make_user()
    token = client.post(
        "/api/v1/auth/login", json={"username": "alice", "password": "pw12345"}
    ).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}
```

- [ ] **Step 2: 失敗測試** `tests/test_auth.py`：

```python
def test_login_success(client, make_user):
    make_user()
    r = client.post("/api/v1/auth/login", json={"username": "alice", "password": "pw12345"})
    assert r.status_code == 200
    body = r.json()
    assert body["access_token"] and body["display_name"] == "愛麗絲"


def test_login_wrong_password(client, make_user):
    make_user()
    r = client.post("/api/v1/auth/login", json={"username": "alice", "password": "nope"})
    assert r.status_code == 401
    assert r.json()["detail"] == "帳號或密碼錯誤"


def test_login_disabled_user_same_message(client, make_user):
    make_user(username="bob", is_active=False)
    r = client.post("/api/v1/auth/login", json={"username": "bob", "password": "pw12345"})
    assert r.status_code == 401
    assert r.json()["detail"] == "帳號或密碼錯誤"


def test_me_requires_token(client):
    assert client.get("/api/v1/auth/me").status_code == 401


def test_me_returns_user(client, auth_headers):
    r = client.get("/api/v1/auth/me", headers=auth_headers)
    assert r.status_code == 200
    assert r.json()["username"] == "alice"
```

- [ ] **Step 3: 確認失敗** → FAIL
- [ ] **Step 4: 實作** `src/yarag/auth.py`：

```python
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from yarag.db import get_db
from yarag.models import User
from yarag.security import create_token, decode_token, verify_password

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])
_bearer = HTTPBearer(auto_error=False)

_CRED_ERROR = HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="帳號或密碼錯誤")
_TOKEN_ERROR = HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="請先登入")


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    display_name: str


class MeResponse(BaseModel):
    username: str
    display_name: str


def get_current_user(
    cred: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> User:
    if cred is None:
        raise _TOKEN_ERROR
    user_id = decode_token(cred.credentials)
    if user_id is None:
        raise _TOKEN_ERROR
    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise _TOKEN_ERROR
    return user


@router.post("/login")
def login(req: LoginRequest, db: Session = Depends(get_db)) -> LoginResponse:
    user = db.scalar(select(User).where(User.username == req.username))
    if user is None or not user.is_active or not verify_password(req.password, user.password_hash):
        raise _CRED_ERROR
    return LoginResponse(access_token=create_token(user.id), display_name=user.display_name)


@router.get("/me")
def me(user: User = Depends(get_current_user)) -> MeResponse:
    return MeResponse(username=user.username, display_name=user.display_name)
```

`src/yarag/app.py` 在 `app = FastAPI()` 之後加：

```python
from yarag.auth import router as auth_router

app.include_router(auth_router)
```

`src/yarag/create_user.py`：

```python
import argparse
import getpass

from yarag.db import SessionLocal, init_db
from yarag.models import User
from yarag.security import hash_password


def main() -> None:
    parser = argparse.ArgumentParser(description="建立使用者帳號")
    parser.add_argument("username")
    parser.add_argument("display_name")
    args = parser.parse_args()
    password = getpass.getpass("密碼：")
    if len(password) < 8:
        raise SystemExit("密碼至少 8 個字元")
    init_db()
    with SessionLocal() as db:
        db.add(
            User(
                username=args.username,
                display_name=args.display_name,
                password_hash=hash_password(password),
            )
        )
        db.commit()
    print(f"已建立帳號 {args.username}")


if __name__ == "__main__":
    main()
```

`pyproject.toml` 的 `scripts` 區加一行：`scripts.create-user = "yarag.create_user:main"`（與既有 `scripts.dev` 並列）。

- [ ] **Step 5: 確認通過**：`uv run pytest tests/test_auth.py -v` → 全 PASS
- [ ] **Step 6: Commit** `git commit -m "feat: login api, current-user dependency, create-user cli"`

---

### Task 5: 對話記錄 API（含隔離測試）

**Files:**
- Create: `yarag/src/yarag/threads.py`
- Modify: `yarag/src/yarag/app.py`（掛 router）
- Test: `yarag/tests/test_threads.py`

**Interfaces:**
- Produces: `GET /api/v1/threads` → `[{id,title,updated_at,preview}]`（updated_at 新→舊）；`GET /api/v1/threads/{id}` → `{id,title,messages:[{id,role,content,citations,created_at}]}`（citations 為解析後的 JSON 陣列或 null）；`DELETE /api/v1/threads/{id}` → 204。他人或不存在的 thread 一律 404。
- Consumes: Task 4 `get_current_user`、Task 2 模型。

- [ ] **Step 1: 失敗測試** `tests/test_threads.py`：

```python
import json

from yarag.db import SessionLocal
from yarag.models import Message, Thread


def _seed_thread(user_id, title="議案詢問"):
    with SessionLocal() as db:
        t = Thread(user_id=user_id, title=title)
        db.add(t)
        db.commit()
        db.add(Message(thread_id=t.id, role="user", content="尖山國中案進度？"))
        db.add(
            Message(
                thread_id=t.id,
                role="assistant",
                content="辦理中",
                citations=json.dumps([{"doc_name": "33717.md", "snippet": "…", "similarity": 0.9}]),
            )
        )
        db.commit()
        return t.id


def test_list_only_own_threads(client, make_user, auth_headers):
    other_id = make_user(username="bob")
    _seed_thread(other_id)
    r = client.get("/api/v1/threads", headers=auth_headers)
    assert r.status_code == 200
    assert r.json() == []


def test_get_thread_with_citations(client, make_user, auth_headers):
    me = client.get("/api/v1/auth/me", headers=auth_headers)
    assert me.status_code == 200
    with SessionLocal() as db:
        from sqlalchemy import select

        from yarag.models import User

        uid = db.scalar(select(User.id).where(User.username == "alice"))
    tid = _seed_thread(uid)
    r = client.get(f"/api/v1/threads/{tid}", headers=auth_headers)
    assert r.status_code == 200
    msgs = r.json()["messages"]
    assert msgs[1]["citations"][0]["doc_name"] == "33717.md"


def test_cannot_read_others_thread(client, make_user, auth_headers):
    other_id = make_user(username="bob")
    tid = _seed_thread(other_id)
    assert client.get(f"/api/v1/threads/{tid}", headers=auth_headers).status_code == 404
    assert client.delete(f"/api/v1/threads/{tid}", headers=auth_headers).status_code == 404


def test_delete_own_thread(client, make_user, auth_headers):
    with SessionLocal() as db:
        from sqlalchemy import select

        from yarag.models import User

        uid = db.scalar(select(User.id).where(User.username == "alice"))
    tid = _seed_thread(uid)
    assert client.delete(f"/api/v1/threads/{tid}", headers=auth_headers).status_code == 204
    assert client.get(f"/api/v1/threads/{tid}", headers=auth_headers).status_code == 404
```

- [ ] **Step 2: 確認失敗** → FAIL
- [ ] **Step 3: 實作** `src/yarag/threads.py`：

```python
import json
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from yarag.auth import get_current_user
from yarag.db import get_db
from yarag.models import Message, Thread, User

router = APIRouter(prefix="/api/v1/threads", tags=["threads"])

_NOT_FOUND = HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="找不到對話")


class ThreadSummary(BaseModel):
    id: str
    title: str
    updated_at: datetime
    preview: str


class MessageOut(BaseModel):
    id: int
    role: str
    content: str
    citations: list[dict] | None
    created_at: datetime


class ThreadDetail(BaseModel):
    id: str
    title: str
    messages: list[MessageOut]


def _own_thread(thread_id: str, user: User, db: Session) -> Thread:
    thread = db.get(Thread, thread_id)
    if thread is None or thread.user_id != user.id:
        raise _NOT_FOUND
    return thread


@router.get("")
def list_threads(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> list[ThreadSummary]:
    threads = db.scalars(
        select(Thread).where(Thread.user_id == user.id).order_by(Thread.updated_at.desc())
    ).all()
    out = []
    for t in threads:
        last = t.messages[-1].content if t.messages else ""
        out.append(
            ThreadSummary(id=t.id, title=t.title, updated_at=t.updated_at, preview=last[:60])
        )
    return out


@router.get("/{thread_id}")
def get_thread(
    thread_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ThreadDetail:
    thread = _own_thread(thread_id, user, db)
    messages = [
        MessageOut(
            id=m.id,
            role=m.role,
            content=m.content,
            citations=json.loads(m.citations) if m.citations else None,
            created_at=m.created_at,
        )
        for m in thread.messages
    ]
    return ThreadDetail(id=thread.id, title=thread.title, messages=messages)


@router.delete("/{thread_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_thread(
    thread_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    db.delete(_own_thread(thread_id, user, db))
    db.commit()


__all__ = ["router", "Message"]
```

`app.py` 加：`from yarag.threads import router as threads_router` ＋ `app.include_router(threads_router)`。

- [ ] **Step 4: 確認通過** → PASS；**Step 5: Commit** `git commit -m "feat: thread history api with per-user isolation"`

---

### Task 6: Cloudflare AI Search 客戶端與煙霧腳本

**Files:**
- Create: `yarag/src/yarag/cloudflare.py`、`yarag/scripts/smoke_cloudflare.py`
- Test: `yarag/tests/test_cloudflare.py`

**Interfaces:**
- Produces: `async search(query: str) -> list[dict]`（每項 `{doc_name:str, snippet:str, similarity:float}`）；`async stream_chat(messages: list[dict]) -> AsyncIterator[str]`（逐段 yield 答案文字）。供 Task 7 消費。
- 端點：`https://api.cloudflare.com/client/v4/accounts/{cf_account_id}/ai-search/instances/{cf_ai_search_instance}` 下的 `/search` 與 `/chat/completions`（`stream: true`，OpenAI 相容 SSE）。

- [ ] **Step 1: 失敗測試** `tests/test_cloudflare.py`（monkeypatch httpx，不打真網路）：

```python
import httpx
import pytest

from yarag import cloudflare


class _FakeResponse:
    def __init__(self, payload):
        self._payload = payload

    def raise_for_status(self):
        return None

    def json(self):
        return self._payload


@pytest.mark.anyio
async def test_search_maps_citations(monkeypatch):
    payload = {
        "result": {
            "data": [
                {
                    "filename": "bills/33717.md",
                    "score": 0.87,
                    "content": [{"type": "text", "text": "尖山國中新建校舍…"}],
                }
            ]
        }
    }

    async def fake_post(self, url, **kwargs):
        assert "/search" in url
        return _FakeResponse(payload)

    monkeypatch.setattr(httpx.AsyncClient, "post", fake_post)
    citations = await cloudflare.search("尖山國中")
    assert citations == [
        {"doc_name": "bills/33717.md", "snippet": "尖山國中新建校舍…", "similarity": 0.87}
    ]


@pytest.mark.anyio
async def test_search_handles_missing_fields(monkeypatch):
    async def fake_post(self, url, **kwargs):
        return _FakeResponse({"result": {"data": [{}]}})

    monkeypatch.setattr(httpx.AsyncClient, "post", fake_post)
    citations = await cloudflare.search("x")
    assert citations[0]["doc_name"] == "未知文件"
    assert citations[0]["similarity"] == 0
```

並在 conftest.py 追加 anyio backend fixture：

```python
@pytest.fixture
def anyio_backend():
    return "asyncio"
```

- [ ] **Step 2: 確認失敗** → FAIL
- [ ] **Step 3: 實作** `src/yarag/cloudflare.py`：

```python
import json
from collections.abc import AsyncIterator

import httpx

from yarag.config import settings

_API = "https://api.cloudflare.com/client/v4/accounts/{account}/ai-search/instances/{instance}"


def _url(path: str) -> str:
    base = _API.format(account=settings.cf_account_id, instance=settings.cf_ai_search_instance)
    return base + path


def _headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {settings.cf_api_token}"}


def _snippet(chunk: dict) -> str:
    content = chunk.get("content")
    if isinstance(content, list) and content:
        first = content[0]
        text = first.get("text", "") if isinstance(first, dict) else str(first)
        return text[:200]
    return str(content or "")[:200]


async def search(query: str) -> list[dict]:
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            _url("/search"),
            headers=_headers(),
            json={"messages": [{"role": "user", "content": query}]},
        )
        resp.raise_for_status()
        body = resp.json()
    chunks = (body.get("result") or {}).get("data") or []
    return [
        {
            "doc_name": c.get("filename") or "未知文件",
            "snippet": _snippet(c),
            "similarity": c.get("score") or 0,
        }
        for c in chunks
    ]


async def stream_chat(messages: list[dict]) -> AsyncIterator[str]:
    async with httpx.AsyncClient(timeout=120) as client:
        async with client.stream(
            "POST",
            _url("/chat/completions"),
            headers=_headers(),
            json={"messages": messages, "stream": True},
        ) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if not line.startswith("data: "):
                    continue
                data = line[6:]
                if data == "[DONE]":
                    break
                try:
                    delta = json.loads(data)["choices"][0]["delta"].get("content") or ""
                except (KeyError, IndexError, json.JSONDecodeError):
                    continue
                if delta:
                    yield delta
```

- [ ] **Step 4: 確認通過** → PASS（若 anyio 未安裝：`uv add --dev anyio`；pytest 9 內建支援 `pytest.mark.anyio` 需 `anyio` 套件，httpx 已相依）
- [ ] **Step 5: 煙霧腳本** `scripts/smoke_cloudflare.py`（手動執行、需真實 CF 值）：

```python
"""對真實 Cloudflare AI Search 問一題。用法：uv run python scripts/smoke_cloudflare.py "尖山國中的提案進度？" """

import asyncio
import sys

from yarag import cloudflare


async def main() -> None:
    query = sys.argv[1] if len(sys.argv) > 1 else "尖山國中的提案進度？"
    print("=== 檢索出處 ===")
    for c in await cloudflare.search(query):
        print(f"- {c['doc_name']} (相似度 {c['similarity']:.2f}): {c['snippet'][:80]}")
    print("=== 串流答案 ===")
    async for delta in cloudflare.stream_chat([{"role": "user", "content": query}]):
        print(delta, end="", flush=True)
    print()


asyncio.run(main())
```

執行條件：`.env` 已填真實 `CF_AI_SEARCH_INSTANCE` 與 `CF_API_TOKEN`。**執行後把真實回應的欄位名與測試假資料比對，若 search 回應結構不同（如無 `filename`/`score`），修正 `search()` 的映射與測試。**

- [ ] **Step 6: Commit** `git commit -m "feat: cloudflare ai-search client with smoke script"`

---

### Task 7: 聊天 SSE API

**Files:**
- Create: `yarag/src/yarag/chat.py`
- Modify: `yarag/src/yarag/app.py`（掛 router）
- Test: `yarag/tests/test_chat.py`

**Interfaces:**
- Produces: `POST /api/v1/chat` body `{message:str, thread_id:str|null}` → SSE（`text/event-stream`），事件序：`citations`（JSON 陣列）→ 多個 `delta`（`{"text": "..."}`）→ `done`（`{"thread_id","message_id"}`）；例外時改推 `error`（`{"message":"系統暫時無法取得資料，請稍後再試"}`）。事件格式每則為 `event: <name>\ndata: <json>\n\n`。
- Consumes: Task 6 `cloudflare.search`/`cloudflare.stream_chat`（測試以 monkeypatch 替換）、Task 4/5 的認證與模型。

- [ ] **Step 1: 失敗測試** `tests/test_chat.py`：

```python
import json


def _parse_sse(text):
    events = []
    for block in text.strip().split("\n\n"):
        lines = block.split("\n")
        name = lines[0].removeprefix("event: ")
        data = json.loads(lines[1].removeprefix("data: "))
        events.append((name, data))
    return events


def _patch_cloudflare(monkeypatch, deltas=("你好", "，議案辦理中")):
    from yarag import chat

    async def fake_search(query):
        return [{"doc_name": "bills/33717.md", "snippet": "…", "similarity": 0.9}]

    async def fake_stream(messages):
        for d in deltas:
            yield d

    monkeypatch.setattr(chat.cloudflare, "search", fake_search)
    monkeypatch.setattr(chat.cloudflare, "stream_chat", fake_stream)


def test_chat_event_order_and_persistence(client, auth_headers, monkeypatch):
    _patch_cloudflare(monkeypatch)
    r = client.post(
        "/api/v1/chat", json={"message": "尖山國中進度？", "thread_id": None}, headers=auth_headers
    )
    assert r.status_code == 200
    events = _parse_sse(r.text)
    assert [e[0] for e in events] == ["citations", "delta", "delta", "done"]
    assert events[0][1][0]["doc_name"] == "bills/33717.md"
    tid = events[-1][1]["thread_id"]

    detail = client.get(f"/api/v1/threads/{tid}", headers=auth_headers).json()
    assert detail["title"] == "尖山國中進度？"
    assert [m["role"] for m in detail["messages"]] == ["user", "assistant"]
    assert detail["messages"][1]["content"] == "你好，議案辦理中"
    assert detail["messages"][1]["citations"][0]["doc_name"] == "bills/33717.md"


def test_chat_appends_to_existing_thread(client, auth_headers, monkeypatch):
    _patch_cloudflare(monkeypatch)
    first = client.post(
        "/api/v1/chat", json={"message": "第一問", "thread_id": None}, headers=auth_headers
    )
    tid = _parse_sse(first.text)[-1][1]["thread_id"]
    client.post("/api/v1/chat", json={"message": "第二問", "thread_id": tid}, headers=auth_headers)
    detail = client.get(f"/api/v1/threads/{tid}", headers=auth_headers).json()
    assert len(detail["messages"]) == 4


def test_chat_error_event_when_cloudflare_fails(client, auth_headers, monkeypatch):
    from yarag import chat

    async def boom(query):
        raise RuntimeError("cf down")

    monkeypatch.setattr(chat.cloudflare, "search", boom)
    r = client.post(
        "/api/v1/chat", json={"message": "問題", "thread_id": None}, headers=auth_headers
    )
    events = _parse_sse(r.text)
    assert events[-1][0] == "error"
    assert "稍後再試" in events[-1][1]["message"]


def test_chat_rejects_others_thread(client, make_user, auth_headers, monkeypatch):
    _patch_cloudflare(monkeypatch)
    from yarag.db import SessionLocal
    from yarag.models import Thread

    other_id = make_user(username="bob")
    with SessionLocal() as db:
        t = Thread(user_id=other_id, title="別人的")
        db.add(t)
        db.commit()
        tid = t.id
    r = client.post(
        "/api/v1/chat", json={"message": "偷看", "thread_id": tid}, headers=auth_headers
    )
    assert r.status_code == 404
```

- [ ] **Step 2: 確認失敗** → FAIL
- [ ] **Step 3: 實作** `src/yarag/chat.py`：

```python
import json
import logging

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from yarag import cloudflare
from yarag.auth import get_current_user
from yarag.db import get_db
from yarag.models import Message, Thread, User

router = APIRouter(prefix="/api/v1", tags=["chat"])
logger = logging.getLogger("uvicorn")

_HISTORY_LIMIT = 10


class ChatRequest(BaseModel):
    message: str
    thread_id: str | None = None


def _sse(event: str, data) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


@router.post("/chat")
async def chat(
    req: ChatRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> StreamingResponse:
    if req.thread_id:
        thread = db.get(Thread, req.thread_id)
        if thread is None or thread.user_id != user.id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="找不到對話")
    else:
        thread = Thread(user_id=user.id, title=req.message[:30])
        db.add(thread)

    history = [{"role": m.role, "content": m.content} for m in thread.messages[-_HISTORY_LIMIT:]]
    db.add(Message(thread_id=thread.id, role="user", content=req.message))
    db.commit()
    thread_id = thread.id

    async def generate():
        try:
            citations = await cloudflare.search(req.message)
            yield _sse("citations", citations)
            full_text = ""
            messages = [*history, {"role": "user", "content": req.message}]
            async for delta in cloudflare.stream_chat(messages):
                full_text += delta
                yield _sse("delta", {"text": delta})
            assistant = Message(
                thread_id=thread_id,
                role="assistant",
                content=full_text,
                citations=json.dumps(citations, ensure_ascii=False),
            )
            db.add(assistant)
            db.commit()
            yield _sse("done", {"thread_id": thread_id, "message_id": assistant.id})
        except Exception:
            logger.exception("chat stream failed", extra={"thread_id": thread_id})
            yield _sse("error", {"message": "系統暫時無法取得資料，請稍後再試"})

    return StreamingResponse(generate(), media_type="text/event-stream")
```

`app.py` 加：`from yarag.chat import router as chat_router` ＋ `app.include_router(chat_router)`。

- [ ] **Step 4: 確認通過**：`uv run pytest tests/test_chat.py -v` → 全 PASS
- [ ] **Step 5: Commit** `git commit -m "feat: chat sse endpoint (citations -> delta -> done)"`

---

### Task 8: 上傳改造與文件列表

**Files:**
- Create: `yarag/src/yarag/uploads.py`（自 app.py 搬移並擴充）
- Modify: `yarag/src/yarag/app.py`（移除舊 endpoint 與 s3_client，掛 router）、`yarag/src/yarag/schemas.py`
- Test: `yarag/tests/test_uploads.py`

**Interfaces:**
- Produces: `POST /api/v1/uploads`（需登入）body `{content_type, file_name, size_bytes}` → 201 `{key, upload_url, expires_in, required_headers}`；size>4MB → 400「檔案超過 4MB 上限」；不支援格式 → 400「不支援的檔案格式」。`GET /api/v1/documents` → `[{name, size_bytes, updated_at}]`。
- 白名單：`text/plain→.txt`、`text/markdown→.md`、`application/pdf→.pdf`、`application/vnd.openxmlformats-officedocument.wordprocessingml.document→.docx`、`application/vnd.openxmlformats-officedocument.spreadsheetml.sheet→.xlsx`。

- [ ] **Step 1: 失敗測試** `tests/test_uploads.py`（boto3 以 monkeypatch 替身）：

```python
import pytest


@pytest.fixture(autouse=True)
def fake_s3(monkeypatch):
    from yarag import uploads

    class _FakeS3:
        def generate_presigned_url(self, ClientMethod, Params, ExpiresIn):
            return f"https://fake.r2/{Params['Key']}"

        def get_paginator(self, name):
            class _P:
                def paginate(self, **kw):
                    return [
                        {
                            "Contents": [
                                {
                                    "Key": "bills/33717.md",
                                    "Size": 1234,
                                    "LastModified": __import__("datetime").datetime(2026, 7, 8),
                                }
                            ]
                        }
                    ]

            return _P()

    monkeypatch.setattr(uploads, "s3_client", _FakeS3())


def _req(content_type="application/pdf", size=1024):
    return {"content_type": content_type, "file_name": "test.pdf", "size_bytes": size}


def test_upload_requires_auth(client):
    assert client.post("/api/v1/uploads", json=_req()).status_code == 401


def test_upload_success(client, auth_headers):
    r = client.post("/api/v1/uploads", json=_req(), headers=auth_headers)
    assert r.status_code == 201
    assert r.json()["upload_url"].startswith("https://fake.r2/")


def test_upload_docx_allowed(client, auth_headers):
    ct = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    assert client.post("/api/v1/uploads", json=_req(ct), headers=auth_headers).status_code == 201


def test_upload_too_large(client, auth_headers):
    r = client.post("/api/v1/uploads", json=_req(size=5 * 1024 * 1024), headers=auth_headers)
    assert r.status_code == 400
    assert "4MB" in r.json()["detail"]


def test_upload_bad_type(client, auth_headers):
    r = client.post("/api/v1/uploads", json=_req("video/mp4"), headers=auth_headers)
    assert r.status_code == 400


def test_list_documents(client, auth_headers):
    r = client.get("/api/v1/documents", headers=auth_headers)
    assert r.status_code == 200
    assert r.json()[0]["name"] == "bills/33717.md"
```

- [ ] **Step 2: 確認失敗** → FAIL
- [ ] **Step 3: 實作** `src/yarag/uploads.py`（把 app.py 的 s3_client 與 endpoint 搬進來改）：

```python
import logging
import uuid
from datetime import UTC, datetime

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from yarag.auth import get_current_user
from yarag.config import settings
from yarag.models import User
from yarag.schemas import UploadResponse

router = APIRouter(prefix="/api/v1", tags=["uploads"])
logger = logging.getLogger("uvicorn")

MAX_UPLOAD_BYTES = 4 * 1024 * 1024
ALLOWED_CONTENT_TYPES = {
    "text/plain": ".txt",
    "text/markdown": ".md",
    "application/pdf": ".pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
}

s3_client = boto3.client(
    "s3",
    endpoint_url=settings.endpoint_url,
    aws_access_key_id=settings.aws_access_key_id,
    aws_secret_access_key=settings.aws_secret_access_key,
    region_name=settings.region_name,
    config=Config(signature_version="s3v4"),
)


class UploadRequest(BaseModel):
    content_type: str
    file_name: str
    size_bytes: int


class DocumentOut(BaseModel):
    name: str
    size_bytes: int
    updated_at: datetime


@router.post("/uploads", status_code=status.HTTP_201_CREATED)
def generate_upload_url(
    req: UploadRequest, user: User = Depends(get_current_user)
) -> UploadResponse:
    ext = ALLOWED_CONTENT_TYPES.get(req.content_type)
    if ext is None:
        raise HTTPException(status_code=400, detail="不支援的檔案格式")
    if req.size_bytes > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=400, detail="檔案超過 4MB 上限，系統無法索引")
    now = datetime.now(UTC)
    key = f"{now.strftime('%Y/%m/%d')}/{uuid.uuid4().hex}{ext}"
    try:
        upload_url = s3_client.generate_presigned_url(
            ClientMethod="put_object",
            Params={
                "Bucket": settings.default_bucket,
                "Key": key,
                "ContentType": req.content_type,
            },
            ExpiresIn=settings.default_expires_in,
        )
    except (BotoCoreError, ClientError) as e:
        logger.exception("presign failed", extra={"key": key})
        raise HTTPException(status_code=500, detail="無法產生上傳網址") from e
    return UploadResponse(
        key=key,
        upload_url=upload_url,
        expires_in=settings.default_expires_in,
        required_headers={"Content-Type": req.content_type},
    )


@router.get("/documents")
def list_documents(user: User = Depends(get_current_user)) -> list[DocumentOut]:
    paginator = s3_client.get_paginator("list_objects_v2")
    docs = []
    for page in paginator.paginate(Bucket=settings.default_bucket):
        for obj in page.get("Contents", []):
            docs.append(
                DocumentOut(
                    name=obj["Key"], size_bytes=obj["Size"], updated_at=obj["LastModified"]
                )
            )
    docs.sort(key=lambda d: d.updated_at, reverse=True)
    return docs
```

`schemas.py`：移除舊 `UploadRequest`（新版在 uploads.py），保留 `UploadResponse`；`app.py` 刪除 s3_client、ALLOWED_CONTENT_TYPES、generate_upload_url 與相關 import，加 `from yarag.uploads import router as uploads_router` ＋ `app.include_router(uploads_router)`。

- [ ] **Step 4: 確認全部測試通過**：`uv run pytest -v` → 全 PASS（含前面 task 的測試不能壞）
- [ ] **Step 5: Commit** `git commit -m "feat: authed uploads with size/type limits and documents list"`

---

### Task 9: 應用組裝（CORS、啟動建表）

**Files:**
- Modify: `yarag/src/yarag/app.py`
- Test: `yarag/tests/test_app.py`

**Interfaces:**
- Produces: 完整 app——CORS 允許 `settings.cors_origins`；lifespan 啟動時 `init_db()`。

- [ ] **Step 1: 失敗測試** `tests/test_app.py`：

```python
def test_cors_preflight(client):
    r = client.options(
        "/api/v1/auth/login",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "POST",
        },
    )
    assert r.status_code == 200
    assert r.headers["access-control-allow-origin"] == "http://localhost:5173"


def test_tables_created_on_startup(client):
    from sqlalchemy import inspect

    from yarag.db import engine

    assert {"users", "threads", "messages"} <= set(inspect(engine).get_table_names())
```

- [ ] **Step 2: 確認失敗** → FAIL（CORS header 不存在）
- [ ] **Step 3: 實作** `app.py` 最終形：

```python
import logging
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from yarag.auth import router as auth_router
from yarag.chat import router as chat_router
from yarag.config import settings
from yarag.db import init_db
from yarag.threads import router as threads_router
from yarag.uploads import router as uploads_router

logger = logging.getLogger("uvicorn")


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(auth_router)
app.include_router(chat_router)
app.include_router(threads_router)
app.include_router(uploads_router)


def main() -> None:
    uvicorn.run("yarag.app:app", reload=True)


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: 全測試通過** `uv run pytest -v` → PASS；手動啟動驗證：專案已有 launch 配置（port 8010），啟動後 `curl -s http://127.0.0.1:8010/docs` 應為 200
- [ ] **Step 5: Commit** `git commit -m "feat: assemble app with cors and db lifespan"`

---

### Task 10: 前端服務層 api.ts（刪 openaiService）

**Files:**
- Create: `frontend/src/edu-rag/services/api.ts`
- Delete: `frontend/src/edu-rag/services/openaiService.ts`（於 Task 12 改完 ChatWindow 後才刪，此 task 先建立新檔）
- Modify: `frontend/.env`（刪 `VITE_OPENAI_API_KEY`、加 `VITE_API_BASE_URL=http://127.0.0.1:8010`）

**Interfaces:**
- Produces（Task 11–13 消費）:
  - `getToken()/setToken(t)/clearToken()`
  - `login(username, password) -> Promise<{access_token, display_name}>`
  - `fetchMe() -> Promise<{username, display_name}>`
  - `listThreads() -> Promise<ThreadSummary[]>`（`{id,title,updated_at,preview}`）
  - `fetchThread(id) -> Promise<{id,title,messages:ApiMessage[]}>`
  - `deleteThreadApi(id) -> Promise<void>`
  - `streamChat(message, threadId, handlers)`：handlers = `{onCitations(citations), onUpdate(fullText), onDone({thread_id,message_id}), onError(err)}`；`onUpdate` 收累積全文（與舊 openaiService 相同語意，ChatWindow 改動最小）
  - `requestUploadUrl(file) -> Promise<{key, upload_url, required_headers}>`、`uploadToR2(file, res) -> Promise<void>`、`listDocuments() -> Promise<{name,size_bytes,updated_at}[]>`

- [ ] **Step 1: 實作 `api.ts`**：

```ts
const BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8010';

export const getToken = () => localStorage.getItem('auth_token');
export const setToken = (t: string) => localStorage.setItem('auth_token', t);
export const clearToken = () => localStorage.removeItem('auth_token');

const authHeaders = (): Record<string, string> => {
    const token = getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
};

const handleUnauthorized = () => {
    clearToken();
    window.location.href = '/login';
};

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const res = await fetch(`${BASE}${path}`, {
        ...options,
        headers: { 'Content-Type': 'application/json', ...authHeaders(), ...options.headers },
    });
    if (res.status === 401) {
        handleUnauthorized();
        throw new Error('unauthorized');
    }
    if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.detail ?? `HTTP ${res.status}`);
    }
    if (res.status === 204) return undefined as T;
    return res.json();
}

export interface Citation {
    doc_name: string;
    snippet: string;
    similarity: number;
}
export interface ThreadSummary {
    id: string;
    title: string;
    updated_at: string;
    preview: string;
}
export interface ApiMessage {
    id: number;
    role: 'user' | 'assistant';
    content: string;
    citations: Citation[] | null;
    created_at: string;
}

export const login = (username: string, password: string) =>
    request<{ access_token: string; display_name: string }>('/api/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
    });

export const fetchMe = () =>
    request<{ username: string; display_name: string }>('/api/v1/auth/me');

export const listThreads = () => request<ThreadSummary[]>('/api/v1/threads');
export const fetchThread = (id: string) =>
    request<{ id: string; title: string; messages: ApiMessage[] }>(`/api/v1/threads/${id}`);
export const deleteThreadApi = (id: string) =>
    request<void>(`/api/v1/threads/${id}`, { method: 'DELETE' });

export interface StreamHandlers {
    onCitations: (citations: Citation[]) => void;
    onUpdate: (fullText: string) => void;
    onDone: (meta: { thread_id: string; message_id: number }) => void;
    onError: (error: unknown) => void;
}

export async function streamChat(
    message: string,
    threadId: string | null,
    handlers: StreamHandlers,
) {
    try {
        const res = await fetch(`${BASE}/api/v1/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify({ message, thread_id: threadId }),
        });
        if (res.status === 401) {
            handleUnauthorized();
            return;
        }
        if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

        const reader = res.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';
        let fullText = '';

        const dispatch = (block: string) => {
            const eventLine = block.split('\n').find((l) => l.startsWith('event: '));
            const dataLine = block.split('\n').find((l) => l.startsWith('data: '));
            if (!eventLine || !dataLine) return;
            const event = eventLine.slice(7).trim();
            const data = JSON.parse(dataLine.slice(6));
            if (event === 'citations') handlers.onCitations(data);
            else if (event === 'delta') {
                fullText += data.text;
                handlers.onUpdate(fullText);
            } else if (event === 'done') handlers.onDone(data);
            else if (event === 'error') handlers.onError(new Error(data.message));
        };

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const blocks = buffer.split('\n\n');
            buffer = blocks.pop() ?? '';
            blocks.forEach(dispatch);
        }
    } catch (error) {
        handlers.onError(error);
    }
}

export const requestUploadUrl = (file: File) =>
    request<{ key: string; upload_url: string; required_headers: Record<string, string> }>(
        '/api/v1/uploads',
        {
            method: 'POST',
            body: JSON.stringify({
                content_type: file.type || 'text/plain',
                file_name: file.name,
                size_bytes: file.size,
            }),
        },
    );

export async function uploadToR2(
    file: File,
    res: { upload_url: string; required_headers: Record<string, string> },
) {
    const put = await fetch(res.upload_url, {
        method: 'PUT',
        headers: res.required_headers,
        body: file,
    });
    if (!put.ok) throw new Error(`上傳失敗（HTTP ${put.status}）`);
}

export const listDocuments = () =>
    request<{ name: string; size_bytes: number; updated_at: string }[]>('/api/v1/documents');
```

- [ ] **Step 2: 更新 `frontend/.env`**：刪除 `VITE_OPENAI_API_KEY` 行，加入 `VITE_API_BASE_URL=http://127.0.0.1:8010`
- [ ] **Step 3: 驗證編譯**：`cd /Users/weihsuan/RAG_new/frontend && npm run build` → 成功（openaiService 尚在，無破壞）
- [ ] **Step 4: Commit**（在 `/Users/weihsuan/RAG_new`）：`git add frontend && git commit -m "feat: frontend api service layer for backend integration"`

---

### Task 11: 登入頁與路由守衛接真

**Files:**
- Modify: `frontend/src/pages/LoginPage.tsx`（`handleLogin`，約 12–22 行）
- Modify: `frontend/src/App.tsx`（`/app/*` 守衛，約 220 行處）

**Interfaces:**
- Consumes: `api.login`、`api.fetchMe`、`api.setToken`、`api.getToken`、`api.clearToken`。

- [ ] **Step 1: LoginPage 改真登入**——把 `handleLogin` 的 `setTimeout` 模擬區塊整段換成：

```tsx
const [error, setError] = useState('');

const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
        const res = await login(email, password); // email 欄位當 username 用
        setToken(res.access_token);
        localStorage.setItem('display_name', res.display_name);
        navigate('/app/edu-rag/chat');
    } catch (err) {
        setError(err instanceof Error && err.message !== 'unauthorized' ? err.message : '帳號或密碼錯誤');
    } finally {
        setLoading(false);
    }
};
```

import 改為 `import { login, setToken } from '../edu-rag/services/api';`；表單下方加錯誤顯示（跟隨頁面既有樣式）：`{error && <p className="text-sm text-red-500 text-center mt-3">{error}</p>}`。

- [ ] **Step 2: App.tsx 守衛**——建立 `RequireAuth` 元件包住 `/app/*` route：

```tsx
import { useEffect, useState } from 'react';
import { fetchMe, getToken } from './edu-rag/services/api';

const RequireAuth = ({ children }: { children: React.ReactNode }) => {
    const [status, setStatus] = useState<'checking' | 'ok'>('checking');
    const navigate = useNavigate();
    useEffect(() => {
        if (!getToken()) {
            navigate('/login', { replace: true });
            return;
        }
        fetchMe()
            .then(() => setStatus('ok'))
            .catch(() => navigate('/login', { replace: true }));
    }, [navigate]);
    if (status === 'checking') return null;
    return <>{children}</>;
};
```

`/app/*` 的 element 外層包 `<RequireAuth>…</RequireAuth>`（`RequireAuth` 需在 `<Router>` 內部使用 `useNavigate`，放在 `/app/*` 的 element 內層即可）。

- [ ] **Step 3: 驗證**：`npm run build` 通過；啟動前後端（launch 配置 backend/frontend），先 `cd yarag && uv run create-user demo 測試帳號` 建帳號，瀏覽器操作：未登入直接開 `/app/edu-rag/chat` 被導回 `/login`；錯誤密碼顯示「帳號或密碼錯誤」；正確帳密進入聊天頁。
- [ ] **Step 4: Commit**：`git add frontend && git commit -m "feat: real login and auth guard"`

---

### Task 12: 聊天頁接真（SSE、出處、對話記錄）

**Files:**
- Modify: `frontend/src/edu-rag/components/ChatWindow.tsx`（import 區、`settings` state 與兩個開關 UI 約 76–77 與 250–285 行、`handleSend` 內 `streamChatCompletion` 呼叫約 181–200 行）
- Modify: `frontend/src/edu-rag/pages/EduRagChatPage.tsx`（`MOCK_THREADS` 假資料、`useEffect` 假歷史、new/delete thread handlers）
- Delete: `frontend/src/edu-rag/services/openaiService.ts`

**Interfaces:**
- Consumes: `api.streamChat`、`api.listThreads`、`api.fetchThread`、`api.deleteThreadApi`；型別 `api.Citation`。
- 內部介面（兩檔之間）：`ChatWindow` 新增 props `activeThreadId: string | null` 與 `onThreadCreated: (threadId: string) => void`；出處映射：後端 `{doc_name,snippet,similarity}` → 前端既有 `Citation` 型別 `{id, docName, snippet, similarity}`（`id` 用索引字串，`page` 省略）。

- [ ] **Step 1: EduRagChatPage 接對話記錄**：
  - 移除 `MOCK_THREADS` import 與初始值：`useState(MOCK_THREADS)` → `useState<Thread[]>([])`
  - 加載入 effect：

```tsx
const refreshThreads = async () => {
    const list = await listThreads();
    setThreads(list.map(t => ({
        id: t.id,
        title: t.title,
        updatedAt: t.updated_at,
        preview: t.preview,
    })));
};
useEffect(() => { void refreshThreads(); }, []);
```

  - 切換對話的 effect（原本塞假歷史那段）改為：

```tsx
useEffect(() => {
    if (!activeThreadId) { setMessages([]); return; }
    setIsInitialLoading(true);
    fetchThread(activeThreadId)
        .then(detail => setMessages(detail.messages.map(m => ({
            id: String(m.id),
            role: m.role,
            content: m.content,
            timestamp: new Date(m.created_at).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' }),
            citations: m.citations?.map((c, i) => ({
                id: String(i),
                docName: c.doc_name,
                snippet: c.snippet,
                similarity: c.similarity,
            })),
        }))))
        .finally(() => setIsInitialLoading(false));
}, [activeThreadId]);
```

  - `handleNewThread`：改為 `setActiveThreadId(null); setMessages([]);`（新對話由後端在第一句時建立）；`activeThreadId` state 型別放寬為 `string | null`，初始 `null`
  - `handleDeleteThread`：呼叫 `await deleteThreadApi(id)` 後 `refreshThreads()`；若刪的是 active thread，`setActiveThreadId(null)`
  - `handleRenameThread`：後端無改名 API（spec 範圍外），移除改名 UI 掛載（傳 `undefined` 或移除 prop）
  - 傳給 ChatWindow：`activeThreadId={activeThreadId}`、`onThreadCreated={(tid) => { setActiveThreadId(tid); void refreshThreads(); }}`

- [ ] **Step 2: ChatWindow 換引擎**：
  - `import { streamChatCompletion } from '../services/openaiService';` → `import { streamChat, type Citation as ApiCitation } from '../services/api';`
  - props 加 `activeThreadId: string | null; onThreadCreated: (tid: string) => void;`
  - 刪除 `settings` state（`onlyFromDocs`/`showReasoning`）與兩個開關的 UI 區塊（約 250–285 行的兩個 toggle）；刪除 `<thought>` 解析相關的 `parseContent` 若僅服務思維鏈（若同時處理 markdown 則保留 markdown 部分）
  - `handleSend` 中 `await streamChatCompletion(chatHistory, {...})` 整段換成：

```tsx
await streamChat(text, activeThreadId, {
    onCitations: (citations: ApiCitation[]) => {
        onUpdateMessage(assistantId, '', citations.map((c, i) => ({
            id: String(i),
            docName: c.doc_name,
            snippet: c.snippet,
            similarity: c.similarity,
        })));
    },
    onUpdate: (fullText) => onUpdateMessage(assistantId, fullText),
    onDone: ({ thread_id }) => {
        if (!activeThreadId) onThreadCreated(thread_id);
    },
    onError: () => onUpdateMessage(assistantId, '⚠️ 系統暫時無法取得資料，請稍後再試'),
});
```

  - `onUpdateMessage` 若現行簽名不含 citations，擴充為 `(id: string, content: string, citations?: Citation[])`，實作處合併：content 為空字串時只更新 citations。（執行者：先讀 ChatWindow/ChatPage 中 `onUpdateMessage` 的實際定義再調整，保持既有呼叫相容。）

- [ ] **Step 3: 刪除 openaiService.ts**，全域搜尋 `openaiService` 與 `VITE_OPENAI_API_KEY` 確認零引用
- [ ] **Step 4: 驗證**：`npm run build` 通過；開兩個服務實測：登入 → 問「尖山國中新建校舍的提案進度？」→ 依序看到出處卡片、打字機答案；重新整理後對話還在列表；開新對話再問一題會出現第二個 thread。（此步需要 Task 6 前置條件已就緒、真實 CF 值已填。）
- [ ] **Step 5: Commit**：`git add -A frontend && git commit -m "feat: chat page wired to backend sse with citations and history"`

---

### Task 13: 上傳頁與文件頁接真

**Files:**
- Modify: `frontend/src/edu-rag/pages/EduRagUploadPage.tsx`（`handleFileChange` 與假的 `setTimeout` 流程，約 33–51 行）
- Modify: `frontend/src/edu-rag/pages/EduRagDocsPage.tsx`（`SYSTEM_DOCS` 假資料）
- Modify: `frontend/src/edu-rag/pages/EduRagDocDetailPage.tsx`（改為僅顯示基本資訊）

**Interfaces:**
- Consumes: `api.requestUploadUrl`、`api.uploadToR2`、`api.listDocuments`。

- [ ] **Step 1: UploadPage 真上傳**——`handleFileChange` 內對每個檔案的處理改為：

```tsx
const ALLOWED = new Set([
    'text/plain', 'text/markdown', 'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);
const MAX_BYTES = 4 * 1024 * 1024;

const processFile = async (file: File, itemId: string) => {
    if (!ALLOWED.has(file.type)) {
        await updateStatus(itemId, 'error', '不支援的檔案格式（限 PDF、Word、Excel、文字檔）');
        return;
    }
    if (file.size > MAX_BYTES) {
        await updateStatus(itemId, 'error', '檔案超過 4MB 上限');
        return;
    }
    try {
        const res = await requestUploadUrl(file);
        await updateStatus(itemId, 'parsing'); // 顯示為「上傳中」
        await uploadToR2(file, res);
        await updateStatus(itemId, 'completed'); // 顯示為「已上傳，索引處理中」
    } catch (err) {
        await updateStatus(itemId, 'error', err instanceof Error ? err.message : '上傳失敗');
    }
};
```

移除兩個 `setTimeout` 假進度；`UploadStatus` 型別加 `'error'`；狀態文案：`parsing` 顯示「上傳中」、`completed` 顯示「已上傳，索引處理中」。（執行者：`updateStatus` 現行簽名見 uploadStore.ts，如無 error message 參數則擴充 `UploadRecord` 加 `errorMessage?: string`。）

- [ ] **Step 2: DocsPage 接真**——移除 `SYSTEM_DOCS` import，改：

```tsx
const [docs, setDocs] = useState<{ name: string; size_bytes: number; updated_at: string }[]>([]);
useEffect(() => { listDocuments().then(setDocs).catch(() => setDocs([])); }, []);
```

列表欄位映射：名稱=`name`（去掉路徑前綴顯示檔名）、大小=`(size_bytes/1024).toFixed(0)+' KB'`、時間=`new Date(updated_at).toLocaleDateString('zh-TW')`；狀態欄一律顯示「已索引」。DocDetailPage 移除 `MOCK_CHUNKS` 相關區塊，僅顯示名稱/大小/時間。

- [ ] **Step 3: 驗證**：`npm run build`；實測：上傳一個 <4MB 的 PDF → 狀態走到「已上傳，索引處理中」→ R2 後台看得到檔案；上傳 5MB 檔被前端擋下；文件頁列出 bills/ 的 303 筆＋剛上傳的檔案。
- [ ] **Step 4: Commit**：`git add frontend && git commit -m "feat: real upload flow and documents list"`

---

### Task 14: 端對端驗收

**Files:** 無新檔（人工驗收＋煙霧腳本）

- [ ] **Step 1: 全自動測試最後確認**：`cd yarag && uv run pytest -v` 全 PASS、`uv run ruff check src tests` 乾淨、`cd ../frontend && npm run build` 成功
- [ ] **Step 2: 煙霧測試**：`cd yarag && uv run python scripts/smoke_cloudflare.py "尖山國中的提案進度？"` → 出處含 `bills/33717.md`、答案提及新建校舍／可行性評估
- [ ] **Step 3: 人工驗收清單**（瀏覽器逐項）：
  1. 建兩個帳號：`uv run create-user user_a 甲同仁`、`uv run create-user user_b 乙同仁`
  2. 未登入開 `/app/edu-rag/chat` → 被導回登入頁
  3. 錯誤密碼 → 「帳號或密碼錯誤」
  4. user_a 登入 → 問「尖山國中新建校舍的提案進度？」→ 先出處後答案，內容與議案 33717 相符
  5. 追問一句（同 thread）→ 記錄變四則
  6. 重新整理 → 對話列表與內容還在
  7. 上傳一份 <4MB PDF → 「已上傳，索引處理中」；>4MB 被擋
  8. 文件頁看到 bills/ 檔案與新上傳檔
  9. 登出（清 localStorage）→ user_b 登入 → 看不到 user_a 的任何對話
  10. token 竄改（localStorage 改亂）→ 任一操作被導回登入頁
- [ ] **Step 4: 結案 commit 與記錄**：驗收結果記入 `docs/superpowers/plans/` 本檔尾註（通過/發現問題），前後端各自 commit 收尾

---

## Self-Review 紀錄

- Spec 覆蓋：登入（T4/T11）、聊天含出處與入庫（T6/T7/T12）、對話隔離（T5/T7 測試）、上傳限制與白名單（T8/T13）、文件列表（T8/T13）、CORS 與啟動自檢（T1/T9）、帳號預建 CLI（T4）、煙霧測試（T6/T14）、端對端清單（T14）——全數對應。
- 型別一致性：`get_current_user`、`streamChat` handlers、citations 欄位（後端 `doc_name/snippet/similarity` ↔ 前端映射 `docName/snippet/similarity`）已在各 task 的 Interfaces 區塊統一。
- 已知不確定點（非 placeholder，為外部依賴）：Cloudflare `search` 回應的實際欄位名以 Task 6 Step 5 煙霧腳本驗證後校正；前端 `onUpdateMessage`/`updateStatus` 實際簽名以現場檔案為準（task 內已載明調整方式）。
