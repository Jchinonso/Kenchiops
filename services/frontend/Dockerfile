# Build stage
FROM node:20-alpine AS build

WORKDIR /app

# Accept API URL as build arg (empty = relative URLs proxied through nginx)
ARG VITE_API_URL=""
ENV VITE_API_URL=$VITE_API_URL

# Copy package files
COPY package.json ./

# Install dependencies
RUN npm install

# Copy source files
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM nginx:alpine

# Copy built assets
COPY --from=build /app/dist /usr/share/nginx/html

# Copy nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
