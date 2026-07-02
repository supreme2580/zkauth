FROM node:22-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
  curl \
  ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --production

COPY bin/install-bb.sh bin/
RUN bash bin/install-bb.sh && rm bin/install-bb.sh

COPY index.js .
COPY public/ public/

EXPOSE 3000

CMD ["node", "index.js"]
