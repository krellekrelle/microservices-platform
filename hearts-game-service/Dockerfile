FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install ALL dependencies (including devDependencies for Vue build)
RUN npm install

# Copy application code
COPY . .

# Build Vue.js application
RUN npm run build

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S heartsuser -u 1001

# Change ownership to non-root user
RUN chown -R heartsuser:nodejs /app
USER heartsuser

EXPOSE 3004

CMD ["npm", "start"]
