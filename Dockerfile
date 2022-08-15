FROM python:3
ENV PYTHONUNBUFFERED 1
RUN useradd -Mr -G www-data secretgraph
ADD . /app
WORKDIR /app
RUN apt-get update && apt-get install nodejs npm curl -y
RUN npm install
RUN pip install . hypercorn[h3]
RUN npm run build
CMD ["./tools/start.sh"]
