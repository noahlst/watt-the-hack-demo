FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies
RUN npm ci --omit=dev

# Copy application source code
COPY . .

# Expose port (Cloud Run sets PORT env var automatically, we read config.port in server.js)
EXPOSE 4000

# Start the application
CMD ["npm", "start"]
