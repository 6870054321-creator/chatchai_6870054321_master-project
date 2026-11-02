FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY src ./src
COPY data/linksets.json ./data/linksets.json
ENV PORT=8080
EXPOSE 8080
USER node
CMD ["node", "src/server.js"]
