import importlib.util
for name in ("psycopg", "psycopg2", "asyncpg"):
    print(name, bool(importlib.util.find_spec(name)))
