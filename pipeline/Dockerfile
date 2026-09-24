FROM python:3.12-slim
COPY --from=ghcr.io/astral-sh/uv:0.11 /uv /bin/uv

WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never

# Dependencies first so code changes don't reinstall them.
COPY pyproject.toml uv.lock .python-version ./
RUN uv sync --locked --no-dev --no-install-project

COPY src ./src
RUN uv sync --locked --no-dev

ENV PATH="/app/.venv/bin:$PATH"
# Bulk exports land in a volume mounted here; a new volume takes this directory's owner.
RUN mkdir -p /srv/exports && chown nobody /srv/exports
USER nobody
ENTRYPOINT ["python", "-m", "ixnos_data_pipeline"]
CMD ["khmdhs", "hourly"]
