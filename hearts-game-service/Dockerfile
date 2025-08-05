FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --only=production

# Copy application code
COPY . .

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S heartsuser -u 1001

# Change ownership to non-root user
RUN chown -R heartsuser:nodejs /app
USER heartsuser

EXPOSE 3004

CMD ["npm", "start"]
