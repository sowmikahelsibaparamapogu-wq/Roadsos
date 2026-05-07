# ── Build stage ──────────────────────────────────
FROM node:18-alpine AS builder

WORKDIR /app

COPY package.json ./
RUN npm install --legacy-peer-deps

COPY . .

# Build args passed from docker-compose
ARG REACT_APP_API_URL=https://roadsos-backend-9ch2.onrender.com
ARG REACT_APP_GOOGLE_MAPS_KEY=""
ENV REACT_APP_API_URL=$REACT_APP_API_URL
ENV REACT_APP_GOOGLE_MAPS_KEY=$REACT_APP_GOOGLE_MAPS_KEY

RUN npm run build

# ── Production stage (nginx) ─────────────────────
FROM nginx:alpine

COPY --from=builder /app/build /usr/share/nginx/html

# nginx config for React SPA routing
RUN echo 'server { \
  listen 80; \
  location / { \
    root /usr/share/nginx/html; \
    index index.html; \
    try_files $uri $uri/ /index.html; \
  } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
