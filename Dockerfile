FROM docker.io/python:3
ENV PYTHONUNBUFFERED=1 DJANGO_SETTINGS_MODULE=secretgraph.settings.docker
RUN useradd -Mr -G www-data secretgraph
RUN curl -fsSL https://deb.nodesource.com/setup_lts.x | bash -
RUN mkdir -p /var/secretgraph && chown secretgraph:secretgraph /var/secretgraph
RUN apt-get install -y nodejs && apt-get clean
COPY . /app
WORKDIR /app
RUN mkdir -p /app/static && chown -R secretgraph:www-data /app/static
RUN mkdir -p /sockets && chown -R secretgraph:www-data /sockets
RUN python -m pip install --no-cache .[server] hypercorn[h3,uvloop] && python -m pip uninstall -y secretgraph
RUN npm install && npm run build
RUN python ./manage.py collectstatic --noinput
CMD ["./tools/start_docker.sh"]
