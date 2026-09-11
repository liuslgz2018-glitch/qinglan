FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json server.mjs ./
COPY lib ./lib
COPY public ./public
RUN mkdir -p /app/data /app/backups
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4177 DATA_DIR=/app/data BACKUP_DIR=/app/backups
EXPOSE 4177
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD node -e "fetch('http://localhost:4177/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "server.mjs"]
