FROM node:24-bookworm-slim

WORKDIR /app

RUN npm install --global @expo/ngrok@^4.1.0

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

EXPOSE 8081
CMD ["npm", "start", "--", "--tunnel", "--go"]
