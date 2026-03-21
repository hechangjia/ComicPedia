# ============================================================
# Multi-stage Docker build for Comicpedia (Next.js 15 standalone)
# ============================================================

# --- Stage 1: Install dependencies ---
FROM node:20-alpine AS deps
WORKDIR /app

# better-sqlite3 native compilation dependencies
# 使用 Alpine 镜像源加速（解决国内 TLS 连接问题）
RUN sed -i 's|https://dl-cdn.alpinelinux.org|https://mirrors.aliyun.com|g' /etc/apk/repositories && \
    apk add --no-cache python3 make g++

COPY package.json package-lock.json* pnpm-lock.yaml* ./

# Detect package manager and install
RUN if [ -f pnpm-lock.yaml ]; then \
      corepack enable && pnpm install --frozen-lockfile; \
    elif [ -f package-lock.json ]; then \
      npm ci; \
    else \
      npm install; \
    fi

# --- Stage 2: Build application ---
FROM node:20-alpine AS builder
WORKDIR /app

# 展示模式构建参数（SHOWCASE_MODE=true 时隐藏创建/设置功能）
ARG SHOWCASE_MODE=false
ENV SHOWCASE_MODE=${SHOWCASE_MODE}

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1

RUN if [ -f pnpm-lock.yaml ]; then \
      corepack enable && pnpm build; \
    else \
      npm run build; \
    fi

# --- Stage 3: Production runtime ---
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=61323
ENV HOSTNAME="0.0.0.0"

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy standalone build output
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Create data directory for SQLite + images (mount as volume in production)
RUN mkdir -p /app/data && chown nextjs:nodejs /app/data

USER nextjs

EXPOSE 61323

# Health check: verify the HTTP server responds
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD node -e "const http=require('http');const r=http.get('http://localhost:61323/api/health',(res)=>{process.exit(res.statusCode===200?0:1)});r.on('error',()=>process.exit(1));r.setTimeout(5000,()=>{r.destroy();process.exit(1)})"

CMD ["node", "server.js"]
