FROM node:18.16.1-alpine as build

WORKDIR /app

EXPOSE 3000
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM node:18.16.1-alpine
WORKDIR /app
COPY package.json .

RUN npm install --only=production
COPY --from=build /app/dist ./dist
CMD ["node", "dist/main.js"]
