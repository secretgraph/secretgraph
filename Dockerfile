FROM python:3
ENV PYTHONUNBUFFERED 1
WORKDIR /app
ADD . /app
RUN apt-get update && apt-get install nodejs npm curl -y
RUN npm install
RUN pip install .
RUN npm run build
