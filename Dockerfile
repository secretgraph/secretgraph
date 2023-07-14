FROM docker.io/node:latest as node_build
# needs extra directory for build, add sub directory as well
RUN mkdir -p /app/webpack_bundles
WORKDIR /app
COPY package.json package-lock.json tsconfig.json tsconfig-base.json webpack.config.js /app
COPY assets /app/assets
COPY js-packages /app/js-packages
RUN npm install && npm run build

FROM docker.io/python:3
ENV PYTHONUNBUFFERED=1 DJANGO_SETTINGS_MODULE=secretgraph.settings.docker POETRY_VIRTUALENVS_CREATE=false
RUN useradd -Mr -G www-data secretgraph
RUN mkdir -p /var/lib/secretgraph && chown secretgraph:secretgraph /var/lib/secretgraph
RUN mkdir -p /sockets && chown -R secretgraph:www-data /sockets
RUN mkdir -p /static && chown -R secretgraph:www-data /static
RUN mkdir -p /app
RUN python -m pip install --no-cache poetry hypercorn[h3,uvloop]
COPY manage.py poetry.lock pyproject.toml /app
COPY secretgraph /app/secretgraph
COPY tools /app/tools
WORKDIR /app
RUN poetry install --no-root --no-cache --compile --only main -E server -E proxy -E postgresql -E mysql
COPY --from=node_build /app/webpack_bundles /app/webpack_bundles
RUN python ./manage.py collectstatic --noinput
CMD ["./tools/start_docker.sh"]
