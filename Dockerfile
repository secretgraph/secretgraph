FROM docker.io/python:3
ENV PYTHONUNBUFFERED=1 DJANGO_SETTINGS_MODULE=secretgraph.settings.docker POETRY_VIRTUALENVS_CREATE=false
RUN useradd -Mr -G www-data secretgraph
RUN curl -fsSL https://deb.nodesource.com/setup_lts.x | bash -
RUN mkdir -p /var/lib/secretgraph && chown secretgraph:secretgraph /var/lib/secretgraph
RUN mkdir -p /sockets && chown -R secretgraph:www-data /sockets
RUN mkdir -p /static && chown -R secretgraph:www-data /static
RUN apt-get install -y nodejs && apt-get clean
RUN python -m pip install --no-cache poetry hypercorn[h3,uvloop]
COPY . /app
WORKDIR /app
RUN poetry install --no-root --no-cache --compile --only main -E server -E proxy -E postgresql -E mysql
RUN npm install && npm run build
RUN python ./manage.py collectstatic --noinput
CMD ["./tools/start_docker.sh"]
