# Dockerfile
# Use an official Node.js runtime as a parent image
FROM node:18-alpine

# Set the working directory in the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json (if exists) to the working directory
# This is done first to leverage Docker's caching, so npm install isn't run
# unnecessarily if only code changes.
COPY package*.json ./

# Install app dependencies
RUN npm install

# Copy the rest of the application code to the working directory
COPY . .

# Expose the port your app runs on
EXPOSE 3000

# Command to run the application
CMD [ "node", "server.js" ]