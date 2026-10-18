FROM node:22-slim
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY src ./src
# config.json et data/ sont montes en volume
VOLUME /app/data
CMD ["npm", "start"]
