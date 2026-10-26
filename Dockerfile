# ============================================
# Build Stage
# ============================================
# 2026-10-27: Node.js 2026-10-21 보안 릴리스(CVE-2026-111497 Brotli RCE 등) 반영 최소 버전으로 고정.
# express.json()이 Content-Encoding: br 본문을 풀기 때문에 22.23.4 미만이면 인증 없이 도달 가능하다. 내릴 때는 패치 버전 확인 후에만.
FROM node:22.23.4-alpine AS builder

# Set working directory
WORKDIR /usr/src/app

# Copy package files
COPY backend/package*.json ./

# Install ALL dependencies (including devDependencies for build)
RUN npm ci

# Copy source code
COPY backend/ .

# Build TypeScript code in production mode
ENV NODE_ENV=production
RUN npm run build:prod

# ============================================
# Production Stage
# ============================================
FROM node:22.23.4-alpine AS production

# Set production environment
ENV NODE_ENV=production

# Set working directory
WORKDIR /usr/src/app

# Copy package files
COPY backend/package*.json ./

# Install ONLY production dependencies
RUN npm ci --omit=dev

# Copy built files from builder stage
COPY --from=builder /usr/src/app/dist ./dist

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Run the app in production mode
CMD [ "node", "dist/server.js" ]
