FROM python:3
STOPSIGNAL SIGINT
ENV PYTHONUNBUFFERED=1 DJANGO_SETTINGS_MODULE=secretgraph.settings.docker
RUN useradd -Mr -G www-data secretgraph
RUN curl -fsSL https://deb.nodesource.com/setup_lts.x | bash -
RUN mkdir -p /var/secretgraph && chown secretgraph:secretgraph /var/secretgraph
RUN apt-get install -y nodejs && apt-get clean
COPY . /app
WORKDIR /app
RUN mkdir -p /app/static && chown -R secretgraph:www-data /app/static
RUN python -m pip install --no-cache .[server] hypercorn[h3] && python -m pip uninstall -y secretgraph
RUN npm install && npm run build
RUN python ./manage.py collectstatic --noinput
EXPOSE 8001
CMD ["./tools/start_docker.sh"]
