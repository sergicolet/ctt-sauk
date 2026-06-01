# Cloud Run Job — ctt-batch
FROM node:20-slim AS build
WORKDIR /app
COPY package.json ./
RUN npm install
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist
# Cloud Run Job: ejecuta el batch y sale.
# (Para el servidor HTTP local: npm run serve)
CMD ["node", "dist/index.js"]

