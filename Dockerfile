FROM node:20-alpine

WORKDIR /app

COPY package.json ./
COPY server.js ./
COPY outputs ./outputs
COPY scripts ./scripts
COPY .env.example ./.env.example

EXPOSE 6199

CMD ["npm", "start"]
