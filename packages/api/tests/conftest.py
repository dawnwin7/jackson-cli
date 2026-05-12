import os

os.environ.setdefault("JACKSON_TEST_MODE", "true")

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.repositories import mongodb


@pytest.fixture(autouse=True)
def reset_repo():
    mongodb.repository = mongodb.InMemoryRepository()
    yield
    mongodb.repository = mongodb.InMemoryRepository()


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as ac:
        yield ac
